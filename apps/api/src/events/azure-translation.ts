import { loadTranslationEnv } from "@event-platform/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { richDescriptionBody, wrapRichDescription, type EventLocale } from "@event-platform/shared-types";
import type { TranslationConfig, TranslationProvider } from "./translation-provider.js";

const MAX_CHARACTERS = 50_000;
const MAX_ITEMS = 1_000;
const MAX_RESPONSE_BYTES = 1_048_576;
function unavailable(code: string): never { throw new ServiceUnavailableException({ code }); }

/** Azure Text Translation v3, using a server-only global or regional resource key. */
export class AzureTranslation implements TranslationProvider {
  readonly cacheNamespace = "azure-v3:text";
  constructor(readonly config: TranslationConfig = loadTranslationEnv(), private readonly request: typeof fetch = fetch) {}
  get configured() { return !!this.config.AZURE_TRANSLATOR_KEY; }

  async translate(texts: string[], source: EventLocale, target: EventLocale): Promise<string[]> {
    if (!this.configured) unavailable("TRANSLATION_NOT_CONFIGURED");
    if (source === target) throw new Error("TRANSLATION_SAME_LOCALE");
    const result = texts.map(() => "");
    for (const format of ["plain", "html"] as const) {
      const rows = texts.flatMap((text, index) => {
        const body = richDescriptionBody(text);
        // Azure requires HTML to be a complete element, including multi-paragraph descriptions.
        return (body === null ? "plain" : "html") === format
          ? [{ index, text: body === null ? text : `<div>${body}</div>` }] : [];
      });
      let offset = 0;
      while (offset < rows.length) {
        const batch: typeof rows = [];
        let characters = 0;
        while (offset < rows.length && batch.length < MAX_ITEMS) {
          const row = rows[offset]!;
          if (row.text.length > MAX_CHARACTERS) unavailable("TRANSLATION_INPUT_TOO_LONG");
          if (characters + row.text.length > MAX_CHARACTERS) break;
          batch.push(row); characters += row.text.length; offset++;
        }
        const translated = await this.chunk(batch.map(row => row.text), source, target, format);
        batch.forEach((row, index) => {
          const text = translated[index]!;
          const html = text.startsWith("<div>") && text.endsWith("</div>") ? text.slice(5, -6) : text;
          result[row.index] = format === "html" ? wrapRichDescription(html) : text;
        });
      }
    }
    return result;
  }

  private async chunk(texts: string[], source: EventLocale, target: EventLocale, format: "plain" | "html"): Promise<string[]> {
    const url = new URL("https://api.cognitive.microsofttranslator.com/translate");
    url.search = new URLSearchParams({ "api-version": "3.0", from: source, to: target, textType: format }).toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=UTF-8",
      "Ocp-Apim-Subscription-Key": this.config.AZURE_TRANSLATOR_KEY!,
    };
    if (this.config.AZURE_TRANSLATOR_REGION !== "global") headers["Ocp-Apim-Subscription-Region"] = this.config.AZURE_TRANSLATOR_REGION;
    for (let attempt = 0; attempt <= this.config.TRANSLATION_RETRIES; attempt++) {
      try {
        const response = await this.request(url, {
          method: "POST", headers, body: JSON.stringify(texts.map(Text => ({ Text }))),
          signal: AbortSignal.timeout(this.config.TRANSLATION_TIMEOUT_MS),
        });
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < this.config.TRANSLATION_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1))); continue;
          }
          unavailable("TRANSLATION_PROVIDER_UNAVAILABLE");
        }
        if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) unavailable("TRANSLATION_INVALID_RESPONSE");
        const payload = await response.text();
        if (Buffer.byteLength(payload) > MAX_RESPONSE_BYTES) unavailable("TRANSLATION_INVALID_RESPONSE");
        let rows: unknown;
        try { rows = JSON.parse(payload); } catch { unavailable("TRANSLATION_INVALID_RESPONSE"); }
        if (!Array.isArray(rows) || rows.length !== texts.length) unavailable("TRANSLATION_INVALID_RESPONSE");
        return rows.map(row => {
          const translations = row?.translations;
          if (!Array.isArray(translations) || translations.length !== 1 || translations[0]?.to !== target
            || typeof translations[0]?.text !== "string" || translations[0].text.length > 640_000) unavailable("TRANSLATION_INVALID_RESPONSE");
          // Azure plain text is already decoded; decoding again would change literal entity text.
          return translations[0].text;
        });
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        if (attempt < this.config.TRANSLATION_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1))); continue;
        }
        unavailable(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
          ? "TRANSLATION_TIMEOUT" : "TRANSLATION_PROVIDER_UNAVAILABLE");
      }
    }
    return unavailable("TRANSLATION_PROVIDER_UNAVAILABLE");
  }
}
