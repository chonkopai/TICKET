import type { HttpGeocodeObject } from "../../../../lib/yandex-maps";

function coordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(item => typeof item === "number" && Number.isFinite(item)) && Math.abs(value[0]) <= 90 && Math.abs(value[1]) <= 180;
}
const failure = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** The separate HTTP Geocoder key stays on the server. SDK coordinates are latitude/longitude. */
export async function POST(request: Request) {
  const key = process.env.YANDEX_GEOCODER_API_KEY?.trim();
  if (!key) return failure("GEOCODE_NOT_CONFIGURED", 503);
  let body: { query?: unknown; options?: { results?: unknown; kind?: unknown; locale?: unknown; boundedBy?: unknown; strictBounds?: unknown } };
  try { const text = await request.text(); if (text.length > 4096) return failure("GEOCODE_INVALID_REQUEST", 400); body = JSON.parse(text); }
  catch { return failure("GEOCODE_INVALID_REQUEST", 400); }
  if (!body || typeof body !== "object") return failure("GEOCODE_INVALID_REQUEST", 400);
  const query = body.query, options = body.options ?? {}, results = options.results ?? 10;
  if (!(typeof query === "string" && query.trim() && query.length <= 500) && !coordinate(query)) return failure("GEOCODE_INVALID_REQUEST", 400);
  if (typeof results !== "number" || !Number.isInteger(results) || results < 1 || results > 10) return failure("GEOCODE_INVALID_REQUEST", 400);
  if (options.kind !== undefined && !["house", "street", "metro", "district", "locality"].includes(String(options.kind))) return failure("GEOCODE_INVALID_REQUEST", 400);
  const url = new URL("https://geocode-maps.yandex.ru/v1/");
  url.searchParams.set("apikey", key);
  url.searchParams.set("geocode", coordinate(query) ? `${query[1]},${query[0]}` : String(query).trim());
  url.searchParams.set("lang", options.locale === "en" ? "en_US" : "ru_RU");
  url.searchParams.set("format", "json"); url.searchParams.set("results", String(results));
  if (options.kind) url.searchParams.set("kind", String(options.kind));
  if (options.boundedBy !== undefined) {
    if (!Array.isArray(options.boundedBy) || options.boundedBy.length !== 2 || !options.boundedBy.every(coordinate)) return failure("GEOCODE_INVALID_REQUEST", 400);
    url.searchParams.set("bbox", options.boundedBy.map(point => `${point[1]},${point[0]}`).join("~"));
    if (options.strictBounds === true) url.searchParams.set("rspn", "1");
  }
  try {
    // Identify this website for keys restricted by HTTP Referer. Never forward an arbitrary client header.
    const referer = `${new URL(process.env.WEB_ORIGIN ?? request.url).origin}/`;
    const response = await fetch(url, { headers: { Referer: referer }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return failure("GEOCODE_PROVIDER_UNAVAILABLE", response.status === 429 ? 429 : 502);
    const data = await response.json() as { response: { GeoObjectCollection: { featureMember: { GeoObject: HttpGeocodeObject }[] } } };
    const places = data.response.GeoObjectCollection.featureMember.map(item => item.GeoObject);
    return Response.json({ places }, { headers: { "Cache-Control": "no-store" } });
  } catch { return failure("GEOCODE_PROVIDER_UNAVAILABLE", 502); }
}
