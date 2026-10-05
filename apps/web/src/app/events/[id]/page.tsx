import type { Metadata } from "next";
import { headers } from "next/headers";
import type { PublicEvent } from "@event-platform/shared-types";
import { isLocale, localeUrl } from "../../../lib/locale";
import PublicEventClient from "./event-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const requestHeaders = await headers();
  const value = requestHeaders.get("x-ticket-locale");
  const locale = isLocale(value) ? value : "ru";
  const path = requestHeaders.get("x-ticket-path") ?? `/events/${id}`;
  const alternates = { languages: {
    ru: localeUrl(path, "ru"),
    kk: localeUrl(path, "kk"),
    en: localeUrl(path, "en"),
    "x-default": localeUrl(path, "ru"),
  } };
  try {
    const response = await fetch(`${API_URL}/events/${encodeURIComponent(id)}?locale=${locale}`, {
      cache: "no-store", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { alternates };
    const event = await response.json() as PublicEvent;
    const fallback = event.contentLocale && event.contentLocale !== locale ? ` [${event.contentLocale.toUpperCase()}]` : "";
    return {
      title: `${event.title}${fallback} | TICKET`,
      description: event.announcement ?? event.description ?? undefined,
      alternates,
      openGraph: { title: `${event.title}${fallback}`, description: event.announcement ?? undefined, images: event.posterUrl ? [new URL(event.posterUrl,API_URL).toString()] : [] },
    };
  } catch {
    return { alternates };
  }
}

export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicEventClient id={id} />;
}
