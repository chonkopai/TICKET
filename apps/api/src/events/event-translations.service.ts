import type { PrismaClient } from "@event-platform/database";
import { EVENT_LOCALES, type EventLocale, type EventLocalizedContent, type EventTranslation } from "@event-platform/shared-types";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { eventContent, eventContentHash, TRANSLATABLE_EVENT_FIELDS } from "./event-translation-content.js";

const FIELDS = TRANSLATABLE_EVENT_FIELDS;
const REQUIRED = new Set<string>(["title", "venueName", "address"]);
const LIMITS: Record<(typeof FIELDS)[number], number> = {
  title: 200, venueName: 200, address: 500, announcement: 2_000,
  description: 20_000, program: 20_000, rules: 20_000, visitTerms: 20_000,
  cancellationTerms: 20_000, depositTerms: 20_000, extraConditions: 20_000,
};

function isLocale(value: string): value is EventLocale {
  return EVENT_LOCALES.some((locale) => locale === value);
}

function validateContent(value: unknown): EventLocalizedContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Invalid translated content");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((field) => !FIELDS.includes(field as (typeof FIELDS)[number]))) {
    throw new BadRequestException("Unknown translated content field");
  }
  const result: Record<string, string | null> = {};
  for (const field of FIELDS) {
    const text = input[field];
    if (typeof text !== "string" && text !== null) throw new BadRequestException(`Invalid ${field}`);
    if (REQUIRED.has(field) && (!text || !text.trim())) throw new BadRequestException(`Missing ${field}`);
    if (typeof text === "string" && text.length > LIMITS[field]) throw new BadRequestException(`${field} is too long`);
    result[field] = text;
  }
  return result as unknown as EventLocalizedContent;
}

@Injectable()
export class EventTranslationsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: PrismaClient) {}

  private async owned(eventId: string, organizerId: string, admin: boolean) {
    const event = await this.database.event.findFirst({ where: admin ? { id: eventId } : { id: eventId, organizerId } });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    return event;
  }

  async list(eventId: string, organizerId: string, admin = false): Promise<{ sourceLocale: EventLocale; translations: EventTranslation[] }> {
    const event = await this.owned(eventId, organizerId, admin);
    const sourceLocale = event.sourceLocale as EventLocale;
    const source = eventContent(event);
    const hash = eventContentHash(source);
    const rows = await this.database.eventTranslation.findMany({ where: { eventId } });
    return {
      sourceLocale,
      translations: EVENT_LOCALES.map((locale): EventTranslation | null => {
        if (locale === sourceLocale) return { ...source, locale, status: "source" as const, translatedFrom: null, updatedAt: event.updatedAt.toISOString() };
        const row = rows.find((item) => item.locale === locale);
        if (!row) return null;
        const content = Object.fromEntries(FIELDS.map((field) => [field, row[field]])) as unknown as EventLocalizedContent;
        return {
          ...content, locale, translatedFrom: row.translatedFrom as EventLocale | null,
          status: row.origin === "manual" ? "manual" as const : row.sourceHash === hash ? "machine" as const : "stale" as const,
          updatedAt: row.updatedAt.toISOString(),
        };
      }).filter((item): item is EventTranslation => item !== null),
    };
  }

  async save(eventId: string, organizerId: string, locale: string, body: unknown, admin = false): Promise<EventTranslation> {
    if (!isLocale(locale)) throw new BadRequestException("Unsupported language");
    const event = await this.owned(eventId, organizerId, admin);
    if (locale === event.sourceLocale) throw new BadRequestException("Edit the source language through the event editor");
    const content = validateContent(body);
    const row = await this.database.eventTranslation.upsert({
      where: { eventId_locale: { eventId, locale } },
      create: { eventId, locale, ...content, origin: "manual", translatedFrom: null, sourceHash: null },
      update: { ...content, origin: "manual", translatedFrom: null, sourceHash: null },
    });
    return { ...content, locale, status: "manual", translatedFrom: null, updatedAt: row.updatedAt.toISOString() };
  }

  async translate(eventId: string, organizerId: string, overwriteManual = false, admin = false, targetLocale?: EventLocale): Promise<{
    results: Array<{ locale: EventLocale; status: "translated" | "skipped" | "failed"; error?: string }>;
  }> {
    const event = await this.owned(eventId, organizerId, admin);
    const sourceLocale = event.sourceLocale as EventLocale;
    if (!isLocale(sourceLocale)) throw new BadRequestException("Unsupported source language");
    if (targetLocale === sourceLocale) throw new BadRequestException("Target language must differ from source language");
    const source = eventContent(event);
    const hash = eventContentHash(source);
    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) throw new ServiceUnavailableException({ code: "TRANSLATION_NOT_CONFIGURED", message: "Translation provider is not configured" });
    const results = await Promise.all(EVENT_LOCALES.filter((locale) => locale !== sourceLocale && (!targetLocale || locale === targetLocale)).map(async (locale) => {
      try {
        const existing = await this.database.eventTranslation.findUnique({ where: { eventId_locale: { eventId, locale } } });
        if (existing?.origin === "manual" && !overwriteManual) return { locale, status: "skipped" as const };
        if (existing?.origin === "machine" && existing.sourceHash === hash) return { locale, status: "skipped" as const };
        const fields = FIELDS.filter((field) => source[field]);
        const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: fields.map((field) => source[field]), source: sourceLocale, target: locale, format: "text" }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Translation provider returned HTTP ${response.status}`);
        const data = await response.json() as { data?: { translations?: Array<{ translatedText?: string }> } };
        const translated = data.data?.translations;
        if (!translated || translated.length !== fields.length || translated.some((item) => typeof item.translatedText !== "string")) {
          throw new Error("Translation provider returned incomplete content");
        }
        const content = { ...source };
        fields.forEach((field, index) => { content[field] = decodeEntities(translated[index]!.translatedText!) as never; });
        await this.database.$transaction(async (tx) => {
          const current = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
          if (eventContentHash(eventContent(current)) !== hash || current.sourceLocale !== sourceLocale) {
            throw new ConflictException("Source changed during translation; retry");
          }
          const latest = await tx.eventTranslation.findUnique({ where: { eventId_locale: { eventId, locale } } });
          if (latest?.origin === "manual" && !overwriteManual) throw new ConflictException("Translation was edited during translation");
          if (latest?.origin === "manual" && latest.updatedAt.getTime() !== existing?.updatedAt.getTime()) {
            throw new ConflictException("A manual translation changed while translation was running");
          }
          await tx.eventTranslation.upsert({
            where: { eventId_locale: { eventId, locale } },
            create: { eventId, locale, ...content, origin: "machine", translatedFrom: sourceLocale, sourceHash: hash },
            update: { ...content, origin: "machine", translatedFrom: sourceLocale, sourceHash: hash },
          });
        });
        return { locale, status: "translated" as const };
      } catch (error) {
        return { locale, status: "failed" as const, error: error instanceof Error ? error.message : "Translation failed" };
      }
    }));
    return { results };
  }
}

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|#39);/gi, (match, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
    if (named[entity]) return named[entity];
    const code = entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : entity.startsWith("#") ? Number.parseInt(entity.slice(1), 10) : NaN;
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}
