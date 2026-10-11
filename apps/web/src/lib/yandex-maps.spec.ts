import assert from "node:assert/strict";
import { test } from "node:test";
import { cityAddressQuery, geocodeAddress, loadYandexMaps, type YandexMaps } from "./yandex-maps";
import { cityMapCenter } from "./city-map-centers";
import { majorCityOptions } from "@event-platform/shared-types";

test("map loading recovers after a network failure and concurrent pickers share one ready SDK", async () => {
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  const scripts: HTMLScriptElement[] = [], timers = new Set<ReturnType<typeof setTimeout>>();
  const fakeWindow = {
    ymaps: undefined as YandexMaps | undefined,
    setTimeout(callback: () => void, delay: number) { const timer = setTimeout(callback, delay); timers.add(timer); return timer; },
  };
  globalThis.window = fakeWindow as unknown as Window & typeof globalThis;
  globalThis.document = {
    createElement() { return { remove() {}, onload: null, onerror: null } as unknown as HTMLScriptElement; },
    head: { append(script: HTMLScriptElement) { scripts.push(script); } },
  } as unknown as Document;
  try {
    const failed = loadYandexMaps("test-browser-key", "ru");
    scripts[0]!.onerror!(new Event("error"));
    await assert.rejects(failed, /MAP_LOAD_FAILED/);
    const first = loadYandexMaps("test-browser-key", "en"), second = loadYandexMaps("test-browser-key", "en");
    assert.equal(first, second); assert.equal(scripts.length, 2);
    const url = new URL(scripts[1]!.src); assert.equal(url.origin, "https://api-maps.yandex.ru"); assert.equal(url.searchParams.get("lang"), "en_US");
    let ready: (() => void) | undefined;
    fakeWindow.ymaps = { ready(callback: () => void) { ready = callback; } } as YandexMaps;
    scripts[1]!.onload!(new Event("load"));
    assert.ok(ready); ready();
    assert.equal(await first, fakeWindow.ymaps); assert.equal(await second, fakeWindow.ymaps);
    assert.equal(await loadYandexMaps("test-browser-key", "en"), fakeWindow.ymaps);
    assert.equal(scripts.length, 2);
  } finally {
    for (const timer of timers) clearTimeout(timer);
    globalThis.window = originalWindow; globalThis.document = originalDocument;
  }
});
test("address search includes the selected city and country, including custom city text", () => {
  assert.equal(cityAddressQuery(" Алматы ", "KZ", "ru", " Абая, 10 "), "Казахстан, Алматы, Абая, 10");
  assert.equal(cityAddressQuery("Custom City", "GB", "en"), "United Kingdom, Custom City");
  assert.equal(cityAddressQuery("", null, "en", "Oxford Street"), "Oxford Street");
});

test("every selectable city has a country-specific offline center in all content languages", () => {
  for (const country of ["KZ", "UZ", "RU", "AE"]) for (const locale of ["ru", "en", "kk"] as const) {
    for (const city of majorCityOptions(country, locale)) {
      const center = cityMapCenter(city.value, country);
      assert.ok(center, `${country}: ${city.value}`);
      assert.ok(Math.abs(center[0]) <= 90 && Math.abs(center[1]) <= 180);
    }
  }
  assert.deepEqual(cityMapCenter(" Алматы ", "KZ"), [43.25249, 76.9115]);
  assert.deepEqual(cityMapCenter("Almaty", "KZ"), cityMapCenter("Алматы", "KZ"));
  assert.equal(cityMapCenter("Алматы", "RU"), undefined);
  assert.equal(cityMapCenter("Custom City", "KZ"), undefined);
});

test("failed address lookups reject without making the loaded map unavailable", async () => {
  const maps = { geocode() { throw new Error("LOOKUP_BLOCKED"); } } as unknown as YandexMaps;
  await assert.rejects(geocodeAddress(maps, "Казахстан, Алматы"), /LOOKUP_BLOCKED/);
  const objects = { get: () => undefined, getLength: () => 0 };
  maps.geocode = () => Promise.resolve({ geoObjects: objects });
  assert.equal((await geocodeAddress(maps, "Казахстан, Алматы")).geoObjects.getLength(), 0);
});

test("separate Geocoder connection uses the local endpoint and adapts HTTP coordinate order", async t => {
  const previous = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_ENABLED;
  process.env.NEXT_PUBLIC_YANDEX_GEOCODER_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.NEXT_PUBLIC_YANDEX_GEOCODER_ENABLED; else process.env.NEXT_PUBLIC_YANDEX_GEOCODER_ENABLED = previous; });
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/address/geocode");
    assert.deepEqual(JSON.parse(String(options.body)).query, [43.25, 76.91]);
    assert.equal(String(options.body).includes("apikey"), false);
    return Response.json({ places: [{ name: "Abay 10", Point: { pos: "76.91 43.25" }, metaDataProperty: { GeocoderMetaData: { text: "Kazakhstan, Almaty, Abay 10", kind: "house", Address: { country_code: "KZ", Components: [{ kind: "locality", name: "Almaty" }] } } } }] });
  });
  const maps = { geocode() { throw new Error("Old SDK geocoder must not be used"); } } as unknown as YandexMaps;
  const result = await geocodeAddress(maps, [43.25, 76.91], { results: 1, kind: "house" });
  const place = result.geoObjects.get(0)!;
  assert.deepEqual(place.geometry.getCoordinates(), [43.25, 76.91]);
  assert.equal(place.getCountryCode!(), "KZ"); assert.deepEqual(place.getLocalities!(), ["Almaty"]);
  assert.equal(place.getAddressLine(), "Kazakhstan, Almaty, Abay 10");
});
