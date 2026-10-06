import { ConflictException } from "@nestjs/common";
import { loadTranslationEnv } from "@event-platform/config";
import { newEventCreationDraft, wrapRichDescription, type CreationDraftResponse, type EventCreationDraftV2 } from "@event-platform/shared-types";
import { describe, expect, it, vi } from "vitest";
import type { TranslationProvider } from "../events/translation-provider.js";
import type { CreationDraftsService } from "./creation-drafts.service.js";
import { trackDraftLocales, type AppliedTranslation } from "./draft-locales.js";
import { DraftTranslationsService } from "./draft-translations.service.js";

function fixture(output: string[] | Promise<string[]>) {
  const aggregate = newEventCreationDraft("00000000-0000-4000-8000-000000000002", "en");
  aggregate.content.en = { title: "Music concert", description: wrapRichDescription("<h1>Programme</h1><p><strong>Live music</strong></p>") };
  aggregate.content.ru = { title: "Existing manual title", description: "Existing description", address: "No source address" };
  const original: CreationDraftResponse = { id: "00000000-0000-4000-8000-000000000001", revision: 1, state: "active", aggregate, expiresAt: "2026-12-01T00:00:00Z", owned: false, csrfToken: "test-csrf", resultEventId: null };
  let saved = structuredClone(original);
  const mutate = vi.fn(async (_id: string, _access: unknown, revision: number, change: (draft: EventCreationDraftV2) => EventCreationDraftV2, origin: "manual" | "machine", translated?: AppliedTranslation) => {
    if (revision !== saved.revision) throw new ConflictException({ code: "DRAFT_REVISION_CONFLICT" });
    saved = { ...saved, revision: revision + 1, aggregate: trackDraftLocales(saved.aggregate, change(structuredClone(saved.aggregate)), origin, translated) };
    return structuredClone(saved);
  });
  const store = {
    database: { $transaction: async (read: (tx: unknown) => Promise<unknown>) => read({}), draftTranslationCache: { findMany: vi.fn(async () => []), upsert: vi.fn(async () => ({})) } },
    locked: vi.fn(async () => structuredClone(saved)), present: (row: CreationDraftResponse) => row, quota: vi.fn(async () => {}), mutate,
  };
  const provider: TranslationProvider = { config: loadTranslationEnv({}), configured: true, cacheNamespace: "test", translate: vi.fn(async () => output) };
  return { original, mutate, provider, service: new DraftTranslationsService(store as unknown as CreationDraftsService, provider), saved: () => saved, edit: () => { saved.revision++; } };
}

describe("one-click draft translation", () => {
  it("replaces manual target fields and preserves formatting, source, and shared fields", async () => {
    const description = wrapRichDescription("<h1>Программа</h1><p><strong>Живая музыка</strong></p>"), f = fixture(["Музыкальный концерт", description]);
    const result = await f.service.translate(f.original.id, {}, 1, "ru");
    expect(result.translated).toBe(2);
    expect(result.draft.aggregate.content.ru).toEqual({ title: "Музыкальный концерт", description, address: "No source address" });
    expect(result.draft.aggregate.content.en).toEqual(f.original.aggregate.content.en);
    expect(result.draft.aggregate.classification).toEqual(f.original.aggregate.classification);
    expect(result.draft.aggregate.sourceLocale).toBe("en");
    expect(f.mutate).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("proposals");
  });
  it("refreshes stale translations even when the translated words stay identical", async () => {
    const f = fixture(["Existing manual title", "Existing description"]);
    f.saved().aggregate.metadata.ru = { title: { origin: "manual", sourceHash: null, reviewed: false, stale: true, revision: 3 } };
    const result = await f.service.translate(f.original.id, {}, 1, "ru");
    expect(result.draft.aggregate.metadata.ru?.title).toMatchObject({ origin: "machine", stale: false, revision: 4 });
    expect(result.draft.aggregate.metadata.ru?.title?.sourceHash).toBeTruthy();
  });
  it("rejects overlength translation atomically without cutting text or partially replacing fields", async () => {
    const f = fixture(["👩‍👩‍👧‍👧".repeat(101), "Valid description"]);
    await expect(f.service.translate(f.original.id, {}, 1, "ru")).rejects.toMatchObject({ status: 400, response: { code: "TRANSLATION_TOO_LONG" } });
    expect(f.saved()).toEqual(f.original);
    expect(f.mutate).not.toHaveBeenCalled();
  });
  it("does not overwrite changes made while the provider was running", async () => {
    let release!: (texts: string[]) => void, started!: () => void;
    const output = new Promise<string[]>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; }), f = fixture(output);
    f.provider.translate = vi.fn(async () => { started(); return output; });
    const pending = f.service.translate(f.original.id, {}, 1, "ru");
    await ready; f.edit(); release(["Translated", "Translated description"]);
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(f.saved().aggregate.content.ru).toEqual(f.original.aggregate.content.ru);
  });
});
