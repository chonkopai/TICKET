"use client";

import { catalogCityOptions } from "@event-platform/shared-types";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CATALOG_CITY_SELECTED, CATALOG_QUERY_UPDATED } from "../lib/catalog-query-events";
import { COUNTRY_CODES, cityName, countryName } from "../lib/countries";
import { clearCatalogLocation, detectCatalogLocation, rememberCatalogLocation, savedCatalogLocation, validCountryCode } from "../lib/catalog-location";
import { useLocale } from "./locale-provider";
import { NAV_COPY } from "./navbar-copy";

type LocationGroup = { countryCode: string; cities: string[] };
const FEATURED_COUNTRIES = ["KZ", "RU", "UZ", "KG", "TR", "AE", "GB", "US"] as const;

function readSelection(): { countryCode: string; city: string } {
  const onCatalog = window.location.pathname === "/";
  const params = new URLSearchParams(onCatalog ? window.location.search : "");
  const saved = params.has("countryCode") || params.has("city") ? null : savedCatalogLocation();
  return {
    countryCode: validCountryCode(params.get("countryCode")) ?? saved?.countryCode ?? "",
    city: params.has("city") ? params.get("city") ?? "" : saved?.city ?? "",
  };
}

export function CatalogLocationPicker({ onDark = false, appearance = "navbar" }: { onDark?: boolean; appearance?: "navbar" | "filter" }) {
  const locale = useLocale();
  const pathname = usePathname();
  const copy = NAV_COPY[locale];
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState({ countryCode: "", city: "" });
  const [draftCountry, setDraftCountry] = useState("");
  const [step, setStep] = useState<"country" | "city">("country");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [locations, setLocations] = useState<LocationGroup[]>([]);
  const [locationsStatus, setLocationsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const sync = () => {
      const next = readSelection();
      setSelection(next);
      const params = new URLSearchParams(window.location.pathname === "/" ? window.location.search : "");
      if (params.has("countryCode") || params.has("city")) {
        const saved = savedCatalogLocation();
        if (next.countryCode && (saved?.countryCode !== next.countryCode || saved.city !== next.city)) rememberCatalogLocation(next);
        else if (!next.countryCode) clearCatalogLocation();
      }
    };
    setOpen(false);
    sync();
    const params = new URLSearchParams(window.location.pathname === "/" ? window.location.search : "");
    if (!params.has("countryCode") && !params.has("city")) {
      const saved = savedCatalogLocation();
      if (saved?.countryCode) commit(saved.countryCode, saved.city, true);
      else if (!saved) void detectCatalogLocation().then((detected) => {
        if (!active || !detected || savedCatalogLocation()) return;
        const current = new URLSearchParams(window.location.search);
        if (current.has("countryCode") || current.has("city")) return;
        commit(detected.countryCode, detected.city, true);
      });
    }
    window.addEventListener("popstate", sync);
    window.addEventListener(CATALOG_QUERY_UPDATED, sync);
    window.addEventListener(CATALOG_CITY_SELECTED, sync);
    return () => {
      active = false;
      window.removeEventListener("popstate", sync);
      window.removeEventListener(CATALOG_QUERY_UPDATED, sync);
      window.removeEventListener(CATALOG_CITY_SELECTED, sync);
    };
  }, [pathname]);

  useEffect(() => {
    let active = true;
    setLocationsStatus("loading");
    void fetch("/api/events/locations", { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() as Promise<LocationGroup[]> : Promise.reject(new Error("LOCATIONS_UNAVAILABLE")))
      .then((groups) => { if (active && Array.isArray(groups)) { setLocations(groups); setLocationsStatus("ready"); } })
      .catch(() => { if (active) setLocationsStatus("error"); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, step]);

  const countries = useMemo(() => [selection.countryCode, ...FEATURED_COUNTRIES, ...[...COUNTRY_CODES].sort((left, right) => countryName(left, locale).localeCompare(countryName(right, locale), locale))].filter((code, index, all) => Boolean(code) && all.indexOf(code) === index), [locale, selection.countryCode]);
  const matchingCountries = countries.filter((code) => `${countryName(code, locale)} ${code}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
  const publishedCities = locations.find((group) => group.countryCode === draftCountry)?.cities ?? [];
  const availableCities = catalogCityOptions(draftCountry, locale, [
    ...publishedCities,
    ...(selection.countryCode === draftCountry && selection.city ? [selection.city] : []),
  ]);
  const cities = availableCities.filter((city) => `${city.label} ${city.keywords}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));

  function commit(countryCode: string, city: string, automatic = false) {
    if (window.location.pathname === "/") {
      const url = new URL(window.location.href);
      if (countryCode) url.searchParams.set("countryCode", countryCode);
      else url.searchParams.delete("countryCode");
      if (city) url.searchParams.set("city", city);
      else url.searchParams.delete("city");
      url.searchParams.delete("page");
      window.history[automatic ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (countryCode && (!automatic || !savedCatalogLocation())) rememberCatalogLocation({ countryCode, city }, automatic);
    else if (!countryCode) clearCatalogLocation();
    setSelection({ countryCode, city });
    setOpen(false);
    window.dispatchEvent(new Event(CATALOG_CITY_SELECTED));
  }

  function openPicker() {
    setDraftCountry(selection.countryCode);
    setStep("country");
    setSearch("");
    setOpen((current) => !current);
  }

  const selectionLabel = appearance === "filter" && selection.countryCode ? `${countryName(selection.countryCode, locale)} · ${selection.city ? cityName(selection.city, locale) : copy.allCities}` : selection.city ? cityName(selection.city, locale) : selection.countryCode ? countryName(selection.countryCode, locale) : copy.allCountries;
  return <div className="relative min-w-0" ref={root}>
    <button aria-expanded={open} aria-haspopup="dialog" aria-label={`${copy.location}: ${selectionLabel}`} className={appearance === "filter" ? "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-violet-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-ticket-accent dark:bg-ticket-surface dark:text-ticket-muted" : `inline-flex min-h-10 max-w-[120px] items-center gap-1.5 rounded-full px-1 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent sm:max-w-[180px] ${onDark ? "text-white hover:text-white/75" : "text-slate-700 dark:text-ticket-muted hover:text-violet-700 dark:hover:text-ticket-accent"}`} onClick={openPicker} type="button">
      {appearance === "navbar" ? <svg aria-hidden="true" className={`h-4 w-4 shrink-0 ${onDark ? "text-white" : "text-violet-600 dark:text-ticket-accent"}`} fill="none" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" /></svg> : null}
      <span className="ticket-location-label truncate">{selectionLabel}</span><svg aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    {open ? <div aria-label={copy.location} className="fixed left-3 right-3 top-16 z-50 rounded-2xl border border-slate-200 dark:border-ticket-border bg-white dark:bg-ticket-surface p-3 shadow-xl sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[360px]" role="dialog">
      <div className="mb-3 flex items-center gap-2">
        {step === "city" ? <button aria-label={copy.backToCountries} className="rounded-lg p-2 text-slate-600 dark:text-ticket-muted hover:bg-slate-100 dark:hover:bg-ticket-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent" onClick={() => { setStep("country"); setSearch(""); }} type="button">←</button> : null}
        <div><p className="text-sm font-bold text-slate-900 dark:text-ticket-text">{step === "country" ? copy.chooseCountry : copy.chooseCity}</p>{step === "city" ? <p className="text-xs text-slate-500 dark:text-ticket-muted">{countryName(draftCountry, locale)}</p> : null}</div>
      </div>
      <input aria-label={step === "country" ? copy.searchCountry : copy.searchCity} className="mb-2 min-h-10 w-full rounded-xl border border-slate-200 dark:border-ticket-border bg-slate-50 dark:bg-ticket-bg px-3 text-sm outline-none focus:border-violet-500 dark:focus:border-ticket-accent focus:ring-2 focus:ring-violet-100 dark:focus:ring-ticket-accent" onChange={(event) => setSearch(event.currentTarget.value)} placeholder={step === "country" ? copy.searchCountry : copy.searchCity} ref={searchRef} type="search" value={search} />
      <div className="max-h-[min(48vh,320px)] overflow-y-auto overscroll-contain">
        {step === "country" ? <>{copy.allCountries.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)) ? <button aria-pressed={!selection.countryCode} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-semibold text-violet-700 dark:text-ticket-accent hover:bg-violet-50 dark:hover:bg-ticket-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent" onClick={() => commit("", "")} type="button">{copy.allCountries}</button> : null}{matchingCountries.map((code) => <button aria-pressed={code === selection.countryCode} className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-violet-50 dark:hover:bg-ticket-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent" key={code} onClick={() => { setDraftCountry(code); setStep("city"); setSearch(""); }} type="button"><span>{countryName(code, locale)}</span><span className="text-xs text-slate-400 dark:text-ticket-dim">{code}</span></button>)}</> : <>
          <button aria-pressed={selection.countryCode === draftCountry && selection.city === ""} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-semibold text-violet-700 dark:text-ticket-accent hover:bg-violet-50 dark:hover:bg-ticket-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent" onClick={() => commit(draftCountry, "")} type="button">{copy.allCities} · {countryName(draftCountry, locale)}</button>
          {cities.map((city) => <button aria-pressed={selection.countryCode === draftCountry && cityName(selection.city, locale) === city.label} className="min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-violet-50 dark:hover:bg-ticket-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent" key={city.value} onClick={() => commit(draftCountry, city.value)} type="button">{city.label}</button>)}
          {locationsStatus === "loading" ? <p className="px-3 py-2 text-xs text-slate-500 dark:text-ticket-muted">{copy.loadingCities}</p> : null}
          {locationsStatus === "error" ? <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500 dark:text-ticket-muted"><span>{copy.citiesUnavailable}</span><button className="font-semibold text-violet-700 dark:text-ticket-accent" onClick={() => setRetry((value) => value + 1)} type="button">{copy.retry}</button></div> : null}
          {locationsStatus === "ready" && !availableCities.length ? <p className="px-3 py-2 text-xs text-slate-500 dark:text-ticket-muted">{copy.noCities}</p> : null}
        </>}
        {(step === "country" && !matchingCountries.length && !copy.allCountries.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale))) || (step === "city" && availableCities.length > 0 && !cities.length) ? <p className="px-3 py-2 text-xs text-slate-500 dark:text-ticket-muted">{copy.noMatches}</p> : null}
      </div>
    </div> : null}
  </div>;
}
