import { describe, expect, it, vi } from "vitest";
import { loadTranslationEnv } from "@event-platform/config";
import { EVENT_LOCALES, richDescriptionBody, wrapRichDescription } from "@event-platform/shared-types";
import { AzureTranslation } from "./azure-translation.js";
import { createTranslationProvider } from "./translation-provider.js";

const config = (overrides: NodeJS.ProcessEnv = {}) => loadTranslationEnv({ TRANSLATION_PROVIDER: "azure", AZURE_TRANSLATOR_KEY: "test-only-key", TRANSLATION_RETRIES: "0", ...overrides });
const response = (texts: string[], to = "ru") => new Response(JSON.stringify(texts.map(text => ({ translations: [{ text, to }] }))));

describe("Azure Translator", () => {
  for (const source of EVENT_LOCALES) for (const target of EVENT_LOCALES) if (source !== target) {
    it(`sends ${source} → ${target} with server-only header authentication`, async () => {
      const request = vi.fn<typeof fetch>(async (url, init) => {
        expect(String(url)).not.toContain("test-only-key");
        expect(new URL(String(url)).searchParams.get("from")).toBe(source);
        expect(new URL(String(url)).searchParams.get("to")).toBe(target);
        expect(new Headers(init!.headers).get("Ocp-Apim-Subscription-Key")).toBe("test-only-key");
        expect(new Headers(init!.headers).has("Ocp-Apim-Subscription-Region")).toBe(false);
        expect(JSON.parse(init!.body as string)).toEqual([{ Text: "Concert" }]);
        return response(["Translated"], target);
      });
      expect(await new AzureTranslation(config(), request).translate(["Concert"], source, target)).toEqual(["Translated"]);
    });
  }
  it("uses the selected regional resource and preserves literal plain-text entities", async () => {
    const request = vi.fn<typeof fetch>(async (_, init) => {
      expect(new Headers(init!.headers).get("Ocp-Apim-Subscription-Region")).toBe("eastus");
      return response(["Title &amp; literal"]);
    });
    expect(await new AzureTranslation(config({ AZURE_TRANSLATOR_REGION: "eastus" }), request).translate(["Title"], "en", "ru")).toEqual(["Title &amp; literal"]);
  });
  it("preserves formatted descriptions and input order across mixed batches", async () => {
    const request = vi.fn<typeof fetch>(async (url, init) => {
      const html = new URL(String(url)).searchParams.get("textType") === "html";
      if (html) {
        expect(JSON.parse(init!.body as string)).toEqual([{ Text: '<div><h1>Programme</h1><p><strong>Guests</strong></p></div>' }]);
        return response(['<div><h1>Программа</h1><p><strong>Гости</strong></p></div>']);
      }
      return response(["Название & место", "Адрес"]);
    });
    const output = await new AzureTranslation(config(), request).translate(["Title & venue", wrapRichDescription('<h1>Programme</h1><p><strong>Guests</strong></p>'), "Address"], "en", "ru");
    expect(output[0]).toBe("Название & место");
    expect(richDescriptionBody(output[1]!)).toBe('<h1>Программа</h1><p><strong>Гости</strong></p>');
    expect(output[2]).toBe("Адрес");
  });
  it("batches both character and array limits without losing strings", async () => {
    const request = vi.fn<typeof fetch>(async (_, init) => {
      const rows: { Text: string }[] = JSON.parse(init!.body as string);
      expect(rows.length).toBeLessThanOrEqual(1000);
      expect(rows.reduce((sum, row) => sum + row.Text.length, 0)).toBeLessThanOrEqual(50000);
      return response(rows.map(row => row.Text));
    });
    const texts = [...Array.from({ length: 1001 }, (_, i) => `text ${i}`), "a".repeat(30000), "b".repeat(30000)];
    expect(await new AzureTranslation(config(), request).translate(texts, "en", "ru")).toEqual(texts);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("retries temporary errors but never authentication or malformed responses", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(response(["Hello"]));
    await new AzureTranslation(config({ TRANSLATION_RETRIES: "1" }), request).translate(["Hello"], "en", "ru");
    expect(request).toHaveBeenCalledTimes(2);
    const denied = vi.fn<typeof fetch>(async () => new Response("private provider error", { status: 401 }));
    await expect(new AzureTranslation(config({ TRANSLATION_RETRIES: "2" }), denied).translate(["Hello"], "en", "ru")).rejects.toMatchObject({ response: { code: "TRANSLATION_PROVIDER_UNAVAILABLE" } });
    expect(denied).toHaveBeenCalledTimes(1);
    for (const bad of [() => response([]), () => response(["Hello"], "kk"), () => new Response("invalid JSON"), () => new Response("x".repeat(1048577))]) {
      await expect(new AzureTranslation(config(), async () => bad()).translate(["Hello"], "en", "ru")).rejects.toMatchObject({ response: { code: "TRANSLATION_INVALID_RESPONSE" } });
    }
  });
  it("bounds timeouts and sanitizes network errors", async () => {
    const pending: typeof fetch = async (_, init) => new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }));
    await expect(new AzureTranslation(config({ TRANSLATION_TIMEOUT_MS: "1000" }), pending).translate(["Hello"], "en", "ru")).rejects.toMatchObject({ response: { code: "TRANSLATION_TIMEOUT" } });
    await expect(new AzureTranslation(config(), async () => { throw new Error("private key in error"); }).translate(["Hello"], "en", "ru")).rejects.toMatchObject({ response: { code: "TRANSLATION_PROVIDER_UNAVAILABLE" } });
  });
  it("requires Azure credentials without silently falling back to Google", async () => {
    const provider = createTranslationProvider(config({ AZURE_TRANSLATOR_KEY: "", GOOGLE_TRANSLATE_API_KEY: "google-key" }));
    expect(provider).toBeInstanceOf(AzureTranslation);
    expect(provider.configured).toBe(false);
    await expect(provider.translate(["Hello"], "en", "ru")).rejects.toMatchObject({ response: { code: "TRANSLATION_NOT_CONFIGURED" } });
    const google = createTranslationProvider(loadTranslationEnv({ GOOGLE_TRANSLATE_API_KEY: "google-key" }));
    expect(google.cacheNamespace).not.toBe(provider.cacheNamespace);
  });
});
