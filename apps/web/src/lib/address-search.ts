import { cityAliases, localizedCityName, type EventLocale } from "@event-platform/shared-types";
import { cityMapCenter } from "./city-map-centers";
import { cityAddressQuery, geocodeAddress, type MapCoordinates, type YandexAddress, type YandexMaps } from "./yandex-maps";

export interface AddressSuggestion {
  id: string;
  title: string;
  subtitle: string;
  address: string;
  city: string;
  countryCode: string;
  coordinates?: MapCoordinates;
}
export interface AddressSearchResult { local: AddressSuggestion[]; other: AddressSuggestion[] }
interface SearchContext { city: string; country: string; locale: EventLocale; query: string; signal: AbortSignal }
interface GeocoderMetadata { GeocoderMetaData?: { kind?: string; Address?: { country_code?: string; Components?: { kind: string; name: string }[] } } }
interface SuggestResponse { results?: { title?: { text?: string }; subtitle?: { text?: string }; tags?: string[]; address?: { formatted_address?: string; component?: { name: string; kind: string[] }[] }; uri?: string }[] }

const normalize = (text: string) => text.trim().normalize("NFKC").toLocaleLowerCase().replace(/ё/g, "е");
export function sameAddressCity(left: string, right: string, country: string): boolean {
  const aliases = cityAliases(left, country).map(normalize);
  return cityAliases(right, country).some(alias => aliases.includes(normalize(alias)));
}
export function addressFromGeocoder(place: YandexAddress): AddressSuggestion {
  const metadata = place.properties?.get("metaDataProperty") as GeocoderMetadata | undefined;
  const address = place.getAddressLine();
  const city = place.getLocalities?.()[0] ?? metadata?.GeocoderMetaData?.Address?.Components?.find(component => component.kind === "locality")?.name ?? "";
  return {
    id: address, title: String(place.properties?.get("name") ?? address), subtitle: address,
    address, city, countryCode: (place.getCountryCode?.() ?? metadata?.GeocoderMetaData?.Address?.country_code ?? "").toUpperCase(),
    coordinates: place.geometry.getCoordinates(),
  };
}

function eligible(items: AddressSuggestion[], context: SearchContext): AddressSuggestion[] {
  const unique = new Set<string>();
  return items.filter(item => {
    if (item.countryCode !== context.country || !item.city || !item.address.trim()) return false;
    const identity = normalize(item.address);
    if (unique.has(identity)) return false;
    unique.add(identity); return true;
  }).map(item => ({ ...item, city: localizedCityName(item.city, context.locale, context.country) }));
}

async function suggest(key: string, context: SearchContext, local: boolean): Promise<AddressSuggestion[]> {
  const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
  const center = cityMapCenter(context.city, context.country);
  const params = { apikey: key, text: local ? cityAddressQuery(context.city, context.country, context.locale, context.query) : context.query, countries: context.country, lang: context.locale === "kk" ? "ru" : context.locale, results: "10", types: "biz,house,street", print_address: "1", org_address_kind: "house", highlight: "0", attrs: "uri" };
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  if (local && center) {
    url.searchParams.set("ll", `${center[1]},${center[0]}`);
    url.searchParams.set("spn", "0.6,0.6");
    // The rectangle biases the search; locality metadata below enforces the actual city.
  }
  const response = await fetch(url, { signal: AbortSignal.any([context.signal, AbortSignal.timeout(10000)]) });
  if (!response.ok) throw new Error(`ADDRESS_SUGGEST_${response.status}`);
  const body = await response.json() as SuggestResponse;
  return eligible((body.results ?? []).flatMap(item => {
    const city = item.address?.component?.find(component => component.kind.some(kind => kind.toLowerCase() === "locality"))?.name;
    const address = item.address?.formatted_address;
    const title = item.title?.text;
    if (!city || !address || !title) return [];
    // countries is enforced by the provider, including organization suggestions.
    const text = item.tags?.includes("business") ? `${title}, ${address}` : address;
    return [{ id: item.uri ?? text, title, subtitle: item.subtitle?.text ?? address, address: text, city, countryCode: context.country }];
  }), context);
}

/** Query another city's results only after the selected city has no matches. */
export async function searchAddressSuggestions(context: SearchContext, provider: { suggestKey?: string; maps?: YandexMaps }): Promise<AddressSearchResult> {
  context.signal.throwIfAborted();
  async function lookup(local: boolean) {
    if (provider.suggestKey) return suggest(provider.suggestKey, context, local);
    if (!provider.maps) throw new Error("ADDRESS_SEARCH_UNAVAILABLE");
    const result = await geocodeAddress(provider.maps, cityAddressQuery(local ? context.city : "", context.country, context.locale, context.query), { results: 10, locale: context.locale });
    context.signal.throwIfAborted();
    const places = Array.from({ length: result.geoObjects.getLength() }, (_, index) => result.geoObjects.get(index)!).filter(Boolean);
    return eligible(places.filter(place => {
      const metadata = place.properties?.get("metaDataProperty") as GeocoderMetadata | undefined;
      return ["house", "street", "premise"].includes(metadata?.GeocoderMetaData?.kind ?? "");
    }).map(addressFromGeocoder), context);
  }
  const local = (await lookup(true)).filter(item => sameAddressCity(item.city, context.city, context.country));
  if (local.length) return { local, other: [] };
  context.signal.throwIfAborted();
  const countryResults = await lookup(false);
  // If the wider search discovers city matches, they still take priority.
  const foundLocal = countryResults.filter(item => sameAddressCity(item.city, context.city, context.country));
  return { local: foundLocal, other: foundLocal.length ? [] : countryResults.filter(item => !sameAddressCity(item.city, context.city, context.country)) };
}
