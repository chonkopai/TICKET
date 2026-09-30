import type { EventLocale } from "@event-platform/shared-types";

export const LOCALES = ["ru", "kk", "en"] as const satisfies readonly EventLocale[];
export const DEFAULT_LOCALE: EventLocale = "ru";

export function isLocale(value: unknown): value is EventLocale {
  return typeof value === "string" && LOCALES.some((locale) => locale === value);
}

export function localeFromBrowser(): EventLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const value = new URLSearchParams(window.location.search).get("lang");
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeUrl(href: string, locale: EventLocale): string {
  const url = new URL(href, "https://ticket.local");
  url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

export const INTL_LOCALES: Record<EventLocale, string> = {
  ru: "ru-KZ",
  kk: "kk-KZ",
  en: "en-KZ",
};
