export type MapCoordinates = [number, number];
export interface YandexAddress {
  geometry: { getCoordinates(): MapCoordinates };
  getAddressLine(): string;
  getLocalities?(): string[];
  getCountryCode?(): string;
  properties?: { get(key: string): unknown };
}
interface GeoCollection { get(index: number): YandexAddress | undefined; getLength(): number }
export interface GeocodeResult { geoObjects: GeoCollection }
export interface HttpGeocodeObject {
  name: string;
  Point: { pos: string };
  metaDataProperty: { GeocoderMetaData: { text: string; kind: string; Address: { country_code: string; Components: { kind: string; name: string }[] } } };
}
export interface YandexMap {
  destroy(): void;
  setCenter(coords: MapCoordinates, zoom?: number): PromiseLike<unknown>;
  getBounds(): MapCoordinates[];
  events: { add(name: "click", callback: (event: { get(key: "coords"): MapCoordinates }) => void): void };
  geoObjects: { removeAll(): void; add(object: unknown): void };
}
export interface YandexMaps {
  ready(callback: () => void): void;
  Map: new (element: HTMLElement, state: { center: MapCoordinates; zoom: number; controls: string[] }) => YandexMap;
  Placemark: new (coords: MapCoordinates, properties: Record<string, unknown>, options: Record<string, unknown>) => unknown;
  geocode(request: string | MapCoordinates, options?: { results?: number; kind?: string; boundedBy?: MapCoordinates[]; strictBounds?: boolean; locale?: string }): PromiseLike<GeocodeResult>;
}
declare global { interface Window { ymaps?: YandexMaps } }
let loading: Promise<YandexMaps> | undefined;

/** Loaded on demand for address suggestions or the map; the browser key is referrer restricted. */
export function loadYandexMaps(key: string, locale: string): Promise<YandexMaps> {
  if (loading) return loading;
  loading = new Promise<YandexMaps>((resolve, reject) => {
    let script: HTMLScriptElement | undefined;
    const timeout = window.setTimeout(() => { script?.remove(); reject(new Error("MAP_LOAD_TIMEOUT")); }, 20000);
    const ready = () => {
      if (!window.ymaps) { clearTimeout(timeout); reject(new Error("MAP_LOAD_FAILED")); return; }
      window.ymaps.ready(() => { clearTimeout(timeout); resolve(window.ymaps!); });
    };
    if (window.ymaps) { ready(); return; }
    script = document.createElement("script");
    const url = new URL("https://api-maps.yandex.ru/2.1/");
    url.searchParams.set("apikey", key); url.searchParams.set("lang", locale === "en" ? "en_US" : "ru_RU");
    script.src = url.toString(); script.async = true;
    script.onload = ready;
    script.onerror = () => { clearTimeout(timeout); script?.remove(); reject(new Error("MAP_LOAD_FAILED")); };
    document.head.append(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export function cityAddressQuery(city: string, country: string | null, locale: string, address = "") {
  const countryName = country ? new Intl.DisplayNames([locale], { type: "region" }).of(country) : "";
  return [countryName, city.trim(), address.trim()].filter(Boolean).join(", ");
}

/** A stalled lookup must not leave the address picker busy indefinitely. */
export function geocodeAddress(maps: YandexMaps, query: string | MapCoordinates, options?: Parameters<YandexMaps["geocode"]>[1]): Promise<GeocodeResult> {
  if (process.env.NEXT_PUBLIC_YANDEX_GEOCODER_ENABLED === "true") return httpGeocodeAddress(query, options);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("GEOCODE_TIMEOUT")), 10000);
    Promise.resolve().then(() => maps.geocode(query, options)).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function httpGeocodeAddress(query: string | MapCoordinates, options?: Parameters<YandexMaps["geocode"]>[1]): Promise<GeocodeResult> {
  const response = await fetch("/api/address/geocode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, options }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`GEOCODE_HTTP_${response.status}`);
  const { places } = await response.json() as { places: HttpGeocodeObject[] };
  const objects: YandexAddress[] = places.map(place => ({
    geometry: { getCoordinates: () => { const [longitude, latitude] = place.Point.pos.split(" ").map(Number); return [latitude!, longitude!]; } },
    getAddressLine: () => place.metaDataProperty.GeocoderMetaData.text,
    getCountryCode: () => place.metaDataProperty.GeocoderMetaData.Address.country_code,
    getLocalities: () => place.metaDataProperty.GeocoderMetaData.Address.Components.filter(part => part.kind === "locality").map(part => part.name),
    properties: { get: name => name === "name" ? place.name : name === "metaDataProperty" ? place.metaDataProperty : undefined },
  }));
  return { geoObjects: { get: index => objects[index], getLength: () => objects.length } };
}
