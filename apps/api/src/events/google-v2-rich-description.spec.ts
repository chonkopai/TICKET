import { describe, expect, it, vi } from "vitest";
import { loadTranslationEnv } from "@event-platform/config";
import { wrapRichDescription } from "@event-platform/shared-types";
import { GoogleV2Translation } from "./google-v2-translation.js";

describe("formatted description translation", () => {
  it("preserves format, text entities and input order in mixed batches", async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const translated = body.format === "html" ? ['<h1>Программа</h1><p><strong>Гости</strong> &lt;literal&gt;</p>'] : ["Название &amp; место", "Адрес"];
      if (body.format === "html") expect(body.q).toEqual(['<h1>Programme</h1><p><strong>Guests</strong> &lt;literal&gt;</p>']);
      else expect(body.q).toEqual(["Title & venue", "Address"]);
      return new Response(JSON.stringify({ data: { translations: translated.map(translatedText => ({ translatedText })) } }));
    });
    const translator = new GoogleV2Translation(loadTranslationEnv({ GOOGLE_TRANSLATE_API_KEY: "test-only", TRANSLATION_RETRIES: "0" }), request);
    const output = await translator.translate(["Title & venue", wrapRichDescription('<h1>Programme</h1><p><strong>Guests</strong> &lt;literal&gt;</p>'), "Address"], "en", "ru");
    expect(output).toEqual(["Название & место", wrapRichDescription('<h1>Программа</h1><p><strong>Гости</strong> &lt;literal&gt;</p>'), "Адрес"]);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
