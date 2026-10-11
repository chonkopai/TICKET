import assert from "node:assert/strict";
import { test } from "node:test";
import { addressFromGeocoder, sameAddressCity, searchAddressSuggestions } from "./address-search";
import type { YandexAddress, YandexMaps } from "./yandex-maps";

const context = () => ({ city: "Almaty", country: "KZ", locale: "en" as const, query: "Abay", signal: new AbortController().signal });
function place(city: string, country = "KZ", kind = "house"): YandexAddress {
  return { geometry: { getCoordinates: () => [43.25, 76.91] }, getAddressLine: () => `${country}, ${city}, Abay 10`, getLocalities: () => [city], getCountryCode: () => country, properties: { get: name => name === "name" ? "Abay 10" : { GeocoderMetaData: { kind } } } };
}
const collection = (items: YandexAddress[]) => ({ geoObjects: { get: (index: number) => items[index], getLength: () => items.length } });

test("city matching uses country-specific aliases rather than a substring", () => {
  assert.equal(sameAddressCity("Алматы", "Almaty", "KZ"), true);
  assert.equal(sameAddressCity(" Almaty ", "ALMATY", "KZ"), true);
  assert.equal(sameAddressCity("New Almaty", "Almaty", "KZ"), false);
  assert.equal(sameAddressCity("Алматы", "Almaty", "RU"), false);
});
test("local results exclude other countries and broad city matches; no country-wide request is made", async () => {
  const queries: string[] = [];
  const maps = { geocode: async (query: string) => { queries.push(query); return collection([place("Алматы"), place("Москва", "RU"), place("Алматы", "KZ", "locality"), place("Астана")]); } } as unknown as YandexMaps;
  const found = await searchAddressSuggestions(context(), { maps });
  assert.equal(queries.length, 1); assert.match(queries[0]!, /Kazakhstan, Almaty, Abay/);
  assert.equal(found.local.length, 1); assert.equal(found.local[0]!.city, "Almaty"); assert.deepEqual(found.other, []);
});
test("country fallback returns other cities only in the selected country and deduplicates addresses", async () => {
  let requests = 0;
  const maps = { geocode: async () => collection(++requests === 1 ? [] : [place("Астана"), place("Астана"), place("Москва", "RU")]) } as unknown as YandexMaps;
  const found = await searchAddressSuggestions(context(), { maps });
  assert.equal(requests, 2); assert.deepEqual(found.local, []); assert.equal(found.other.length, 1); assert.equal(found.other[0]!.city, "Astana");
});
test("quota failures are surfaced, not reported as an empty city", async () => {
  let requests = 0;
  const maps = { geocode() { requests++; throw new Error("limited"); } } as unknown as YandexMaps;
  await assert.rejects(searchAddressSuggestions(context(), { maps }), /limited/); assert.equal(requests, 1);
});
test("an aborted search cannot expand into another city's results", async () => {
  const controller = new AbortController(); let requests = 0;
  const maps = { geocode: async () => { requests++; controller.abort(); return collection([]); } } as unknown as YandexMaps;
  await assert.rejects(searchAddressSuggestions({ ...context(), signal: controller.signal }, { maps }), /abort/i); assert.equal(requests, 1);
});
test("Geosuggest requests addresses and venues with a country restriction and preserves the venue name", async t => {
  const urls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    urls.push(url);
    return new Response(JSON.stringify({ results: [{ title: { text: "City Hall" }, subtitle: { text: "Abay 10, Almaty" }, tags: ["business"], address: { formatted_address: "Kazakhstan, Almaty, Abay 10", component: [{ name: "Алматы", kind: ["LOCALITY"] }] }, uri: "ymaps://city-hall" }] }), { status: 200 });
  });
  const found = await searchAddressSuggestions(context(), { suggestKey: "test-key" });
  assert.equal(urls.length, 1); assert.equal(urls[0]!.searchParams.get("countries"), "KZ"); assert.equal(urls[0]!.searchParams.get("types"), "biz,house,street");
  assert.equal(urls[0]!.searchParams.get("ll"), "76.9115,43.25249"); assert.match(found.local[0]!.address, /^City Hall, /); assert.equal(found.local[0]!.city, "Almaty");
});
test("reverse lookup extracts structured country and city from metadata", () => {
  const result = addressFromGeocoder({ geometry: { getCoordinates: () => [51.1, 71.4] }, getAddressLine: () => "Kazakhstan, Astana, Street 1", properties: { get: () => ({ GeocoderMetaData: { Address: { country_code: "kz", Components: [{ kind: "locality", name: "Astana" }] } } }) } });
  assert.equal(result.city, "Astana"); assert.equal(result.countryCode, "KZ"); assert.deepEqual(result.coordinates, [51.1, 71.4]);
});
