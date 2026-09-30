import { afterEach, describe, expect, it, vi } from "vitest";
import { EventTranslationsService } from "./event-translations.service.js";

const source = {
  id: "2f293d11-1c18-4c93-b72f-22536be5d6f6",
  organizerId: "bbad9ee6-1e14-4d50-b8bb-57a2bd924155",
  sourceLocale: "ru",
  title: "Встреча",
  venueName: "Зал",
  address: "Алматы",
  announcement: null,
  description: "Описание",
  program: null,
  rules: null,
  visitTerms: null,
  cancellationTerms: "Возврат за день",
  depositTerms: null,
  extraConditions: null,
  updatedAt: new Date("2026-09-29T00:00:00Z"),
};

function database(event = source) {
  const row = { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ updatedAt: new Date() }) };
  const events = { findFirst: vi.fn().mockResolvedValue(event), findUniqueOrThrow: vi.fn().mockResolvedValue(event) };
  const tx = { event: events, eventTranslation: row };
  return { event: events, eventTranslation: row, $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_TRANSLATE_API_KEY;
});

describe("event translations", () => {
  it("serves the source language and rejects editing it through translation storage", async () => {
    const db = database();
    const service = new EventTranslationsService(db as never);
    const result = await service.list(source.id, source.organizerId);
    expect(result.sourceLocale).toBe("ru");
    expect(result.translations).toMatchObject([{ locale: "ru", status: "source", title: "Встреча" }]);
    await expect(service.save(source.id, source.organizerId, "ru", source)).rejects.toThrow();
    expect(db.eventTranslation.upsert).not.toHaveBeenCalled();
  });

  it("does not replace a manual translation without confirmation", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "test-key";
    const db = database();
    db.eventTranslation.findUnique.mockResolvedValue({ origin: "manual", updatedAt: new Date() } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new EventTranslationsService(db as never);
    const result = await service.translate(source.id, source.organizerId);
    expect(result.results).toEqual([
      { locale: "kk", status: "skipped" },
      { locale: "en", status: "skipped" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("translates only the requested target so the client can report progress", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "test-key";
    const db = database();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { translations: [
      { translatedText: "Meeting" }, { translatedText: "Hall" }, { translatedText: "Almaty" },
      { translatedText: "Description" }, { translatedText: "Refund one day before" },
    ] } }) });
    vi.stubGlobal("fetch", fetchMock);
    const service = new EventTranslationsService(db as never);
    const result = await service.translate(source.id, source.organizerId, false, false, "en");
    expect(result.results).toEqual([{ locale: "en", status: "translated" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.eventTranslation.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects a generated result when the source changes during the provider call", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "test-key";
    const db = database();
    const fetchMock = vi.fn().mockImplementation(async () => {
      db.event.findUniqueOrThrow.mockResolvedValue({ ...source, title: "Изменено" } as never);
      return { ok: true, json: async () => ({ data: { translations: [
        { translatedText: "Meeting" }, { translatedText: "Hall" }, { translatedText: "Almaty" },
        { translatedText: "Description" }, { translatedText: "Refund one day before" },
      ] } }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new EventTranslationsService(db as never);
    const result = await service.translate(source.id, source.organizerId);
    expect(result.results.every((item) => item.status === "failed")).toBe(true);
    expect(db.eventTranslation.upsert).not.toHaveBeenCalled();
  });
});
