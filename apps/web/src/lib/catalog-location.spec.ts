import assert from "node:assert/strict";
import { test } from "node:test";
import { countryForCity, clearCatalogLocation, lookupCatalogLocation, rememberCatalogLocation, savedCatalogLocation } from "./catalog-location";

test("city detection accepts complete city data and falls back on errors or incomplete results", async () => {
  const request = (value: unknown, status = 200) => (async () => Response.json(value, { status })) as typeof fetch;
  assert.deepEqual(await lookupCatalogLocation(request({ success: true, country_code: "KZ", city: " Almaty " })), { countryCode: "KZ", city: "Almaty" });
  for (const value of [{ success: false }, { success: true, country_code: "XX", city: "Unknown" }, { success: true, country_code: "KZ", city: "" }]) assert.equal(await lookupCatalogLocation(request(value)), null);
  assert.equal(await lookupCatalogLocation(request({}, 429)), null);
  assert.equal(await lookupCatalogLocation((async () => { throw new Error("offline"); }) as typeof fetch), null);
});

test("manual location and All countries persist; automatic locations expire", () => {
  const values = new Map<string, string>();
  const previous = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } } });
  try {
    rememberCatalogLocation({ countryCode: "KZ", city: "Almaty" });
    assert.deepEqual(savedCatalogLocation(), { countryCode: "KZ", city: "Almaty" });
    clearCatalogLocation();
    assert.deepEqual(savedCatalogLocation(), { countryCode: "", city: "" });
    rememberCatalogLocation({ countryCode: "AE", city: "Dubai" }, true);
    const value = JSON.parse(values.get("ticket:catalog-location")!);
    assert.ok(value.expiresAt > Date.now());
    values.set("ticket:catalog-location", JSON.stringify({ ...value, expiresAt: Date.now() - 1 }));
    assert.equal(savedCatalogLocation(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", { configurable: true, value: previous });
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("saved city country resolves aliases without assuming Kazakhstan", () => {
  assert.equal(countryForCity("Москва"), "RU"); assert.equal(countryForCity("Moscow"), "RU"); assert.equal(countryForCity("Astana"), "KZ"); assert.equal(countryForCity("Dubai"), "AE"); assert.equal(countryForCity("Unknown city"), null);
});
