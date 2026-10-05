import { COUNTRY_CODES } from "@event-platform/shared-types";

const STORAGE_KEY = "ticket:catalog-location";

export interface CatalogLocation { countryCode: string; city: string }

export function validCountryCode(value: string | null): string | null {
  return value && (COUNTRY_CODES as readonly string[]).includes(value) ? value : null;
}

export function savedCatalogLocation(): CatalogLocation | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as (Partial<CatalogLocation> & { expiresAt?: number }) | null;
    if (value?.expiresAt && value.expiresAt < Date.now()) return null;
    if (value?.countryCode === "" && value.city === "") return { countryCode: "", city: "" };
    const countryCode = validCountryCode(value?.countryCode ?? null);
    return value && countryCode && typeof value.city === "string"
      ? { countryCode, city: value.city }
      : null;
  } catch { return null; }
}

export function rememberCatalogLocation(location: CatalogLocation, automatic = false): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...location, ...(automatic ? { expiresAt: Date.now() + 24 * 60 * 60 * 1000 } : {}) })); } catch { /* Storage can be unavailable. */ }
}

export function clearCatalogLocation(): void {
  rememberCatalogLocation({ countryCode: "", city: "" });
}

let detection: Promise<CatalogLocation | null> | undefined;
export function detectCatalogLocation(): Promise<CatalogLocation | null> {
  // One approximate IP lookup per page session; never request precise GPS coordinates.
  return detection ??= lookupCatalogLocation();
}

export async function lookupCatalogLocation(request: typeof fetch = fetch): Promise<CatalogLocation | null> {
  try {
    const response = await request("https://ipwho.is/?fields=success,country_code,city", { signal: AbortSignal.timeout(5000), credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) return null;
    const value = await response.json() as { success?: boolean; country_code?: string; city?: string };
    const countryCode = validCountryCode(value.country_code ?? null);
    const city = typeof value.city === "string" ? value.city.trim().slice(0, 80) : "";
    return value.success && countryCode && city ? { countryCode, city } : null;
  } catch { return null; }
}
