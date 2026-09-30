import { COUNTRY_CODES } from "@event-platform/shared-types";

const STORAGE_KEY = "ticket:catalog-location";

export interface CatalogLocation { countryCode: string; city: string }

export function validCountryCode(value: string | null): string | null {
  return value && (COUNTRY_CODES as readonly string[]).includes(value) ? value : null;
}

export function savedCatalogLocation(): CatalogLocation | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<CatalogLocation> | null;
    const countryCode = validCountryCode(value?.countryCode ?? null);
    return value && countryCode && typeof value.city === "string"
      ? { countryCode, city: value.city }
      : null;
  } catch { return null; }
}

export function rememberCatalogLocation(location: CatalogLocation): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location)); } catch { /* Storage can be unavailable. */ }
}
