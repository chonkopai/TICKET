import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { POST } from "./route";
const request = (body: unknown) => new Request("http://localhost:3000/api/address/geocode", { method: "POST", body: JSON.stringify(body) });
function configure(t: TestContext) {
  const previous = process.env.YANDEX_GEOCODER_API_KEY;
  const previousOrigin = process.env.WEB_ORIGIN;
  process.env.YANDEX_GEOCODER_API_KEY = "private-test-geocoder-key";
  process.env.WEB_ORIGIN = "https://preview.ticket.example";
  t.after(() => { if (previous === undefined) delete process.env.YANDEX_GEOCODER_API_KEY; else process.env.YANDEX_GEOCODER_API_KEY = previous; });
  t.after(() => { if (previousOrigin === undefined) delete process.env.WEB_ORIGIN; else process.env.WEB_ORIGIN = previousOrigin; });
}
test("reverse lookup swaps SDK coordinates for HTTP order and never returns the key", async t => {
  configure(t);
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.equal(url.origin, "https://geocode-maps.yandex.ru"); assert.equal(url.searchParams.get("geocode"), "76.91,43.25");
    assert.equal(url.searchParams.get("apikey"), "private-test-geocoder-key"); assert.equal(url.searchParams.get("kind"), "house");
    return Response.json({ response: { GeoObjectCollection: { featureMember: [] } } });
  });
  const response = await POST(request({ query: [43.25, 76.91], options: { kind: "house", results: 1 } }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { places: [] });
});
test("forward lookup preserves text and translates bounds and response language", async t => {
  configure(t);
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.equal(url.searchParams.get("geocode"), "Kazakhstan, Almaty, Abay 10"); assert.equal(url.searchParams.get("lang"), "en_US");
    assert.equal(url.searchParams.get("bbox"), "76,43~77,44"); assert.equal(url.searchParams.get("rspn"), "1");
    return Response.json({ response: { GeoObjectCollection: { featureMember: [] } } });
  });
  assert.equal((await POST(request({ query: "Kazakhstan, Almaty, Abay 10", options: { locale: "en", boundedBy: [[43, 76], [44, 77]], strictBounds: true } }))).status, 200);
});
test("malformed coordinates and excessive result counts never call the provider", async t => {
  configure(t); t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected provider call"); });
  for (const body of [{ query: [100, 76] }, { query: [43, 200] }, { query: "" }, { query: "x", options: { results: 50 } }, { query: "x", options: { boundedBy: [[43, 76]] } }]) assert.equal((await POST(request(body))).status, 400);
});
test("provider errors do not leak credential-bearing URLs or messages", async t => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => new Response("private-test-geocoder-key", { status: 403 }));
  const response = await POST(request({ query: "Almaty" })); assert.equal(response.status, 502); assert.equal((await response.text()).includes("private-test-geocoder-key"), false);
});
test("HTTP Referer restrictions use the configured website origin instead of a caller's header", async t => {
  configure(t);
  t.mock.method(globalThis, "fetch", async (_url: URL, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("referer"), "https://preview.ticket.example/");
    return Response.json({ response: { GeoObjectCollection: { featureMember: [] } } });
  });
  const incoming = new Request("http://localhost:3000/api/address/geocode", { method: "POST", headers: { referer: "https://unrelated.example/" }, body: JSON.stringify({ query: "Almaty" }) });
  assert.equal((await POST(incoming)).status, 200);
});
