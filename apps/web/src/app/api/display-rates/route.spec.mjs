import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route.ts";

test("reads USD and RUB rates per unit from the National Bank feed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<rss><channel><item><title>USD</title><pubDate>29.09.26</pubDate><description>440</description><quant>1</quant></item><item><title>RUB</title><pubDate>29.09.26</pubDate><description>52</description><quant>10</quant></item></channel></rss>');
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { asOf: "29.09.26", kztPerRub: 5.2, kztPerUsd: 440 });
  } finally { globalThis.fetch = originalFetch; }
});

test("does not serve guessed rates when the feed fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
  try { assert.equal((await GET()).status, 503); }
  finally { globalThis.fetch = originalFetch; }
});
