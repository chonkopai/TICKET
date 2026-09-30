"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CATALOG_CITY_SELECTED, CATALOG_QUERY_UPDATED } from "../lib/catalog-query-events";
import { COUNTRY_CODES, cityName, countryName } from "../lib/countries";
import { rememberCatalogLocation, savedCatalogLocation, validCountryCode } from "../lib/catalog-location";
import { useLocale } from "./locale-provider";
import { NAV_COPY } from "./navbar-copy";

type LocationGroup = { countryCode: string; cities: string[] };
const DEFAULT_COUNTRY = "KZ";
const DEFAULT_CITY = "Алматы";
const FEATURED_COUNTRIES = ["KZ", "RU", "UZ", "KG", "TR", "AE", "GB", "US"] as const;

function readSelection(): { countryCode: string; city: string } {
  const params = new URLSearchParams(window.location.search);
  const saved = !params.has("countryCode") && !params.has("city") ? savedCatalogLocation() : null;
  return {
    countryCode: validCountryCode(params.get("countryCode")) ?? saved?.countryCode ?? DEFAULT_COUNTRY,
    city: params.has("city") ? params.get("city") ?? "" : saved?.city ?? (params.has("countryCode") ? "" : DEFAULT_CITY),
  };
}

export function CatalogLocationPicker() {
  const locale = useLocale();
  const copy = NAV_COPY[locale];
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState({ countryCode: DEFAULT_COUNTRY, city: DEFAULT_CITY });
  const [draftCountry, setDraftCountry] = useState(DEFAULT_COUNTRY);
  const [step, setStep] = useState<"country" | "city">("country");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [locations, setLocations] = useState<LocationGroup[]>([]);
  const [locationsStatus, setLocationsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const sync = () => {
      const next = readSelection();
      setSelection(next);
      const params = new URLSearchParams(window.location.search);
      if (params.has("countryCode") || params.has("city")) rememberCatalogLocation(next);
      else {
        const saved = savedCatalogLocation();
        if (saved && (saved.countryCode !== DEFAULT_COUNTRY || saved.city !== DEFAULT_CITY)) {
          const url = new URL(window.location.href);
          if (saved.countryCode !== DEFAULT_COUNTRY) url.searchParams.set("countryCode", saved.countryCode);
          url.searchParams.set("city", saved.city);
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener(CATALOG_QUERY_UPDATED, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(CATALOG_QUERY_UPDATED, sync);
    };
  }, []);

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

  const countries = useMemo(() => [selection.countryCode, ...FEATURED_COUNTRIES, ...[...COUNTRY_CODES].sort((left, right) => countryName(left, locale).localeCompare(countryName(right, locale), locale))].filter((code, index, all) => all.indexOf(code) === index), [locale, selection.countryCode]);
  const matchingCountries = countries.filter((code) => `${countryName(code, locale)} ${code}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
  const publishedCities = locations.find((group) => group.countryCode === draftCountry)?.cities ?? [];
  const cities = [...new Set([...publishedCities, ...(selection.countryCode === draftCountry && selection.city ? [selection.city] : [])])]
    .filter((city) => cityName(city, locale).toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))
    .sort((left, right) => cityName(left, locale).localeCompare(cityName(right, locale), locale));

  function commit(countryCode: string, city: string) {
    const url = new URL(window.location.href);
    if (countryCode === DEFAULT_COUNTRY) url.searchParams.delete("countryCode");
    else url.searchParams.set("countryCode", countryCode);
    if (countryCode === DEFAULT_COUNTRY && city === DEFAULT_CITY) url.searchParams.delete("city");
    else url.searchParams.set("city", city);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    rememberCatalogLocation({ countryCode, city });
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

  const selectionLabel = selection.city ? cityName(selection.city, locale) : `${countryName(selection.countryCode, locale)} · ${copy.allCities}`;
  return <div className="relative min-w-0" ref={root}>
    <button aria-expanded={open} aria-haspopup="dialog" aria-label={`${copy.location}: ${countryName(selection.countryCode, locale)}, ${selection.city ? cityName(selection.city, locale) : copy.allCities}`} className="inline-flex min-h-10 max-w-[120px] items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-slate-700 transition hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:max-w-[180px]" onClick={openPicker} type="button">
      <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-violet-600" fill="none" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" /></svg>
      <span className="truncate">{selectionLabel}</span><span aria-hidden="true" className="text-xs">⌄</span>
    </button>
    {open ? <div aria-label={copy.location} className="fixed left-3 right-3 top-16 z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[360px]" role="dialog">
      <div className="mb-3 flex items-center gap-2">
        {step === "city" ? <button aria-label={copy.backToCountries} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => { setStep("country"); setSearch(""); }} type="button">←</button> : null}
        <div><p className="text-sm font-bold text-slate-900">{step === "country" ? copy.chooseCountry : copy.chooseCity}</p>{step === "city" ? <p className="text-xs text-slate-500">{countryName(draftCountry, locale)}</p> : null}</div>
      </div>
      <input aria-label={step === "country" ? copy.searchCountry : copy.searchCity} className="mb-2 min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" onChange={(event) => setSearch(event.currentTarget.value)} placeholder={step === "country" ? copy.searchCountry : copy.searchCity} ref={searchRef} type="search" value={search} />
      <div className="max-h-[min(48vh,320px)] overflow-y-auto overscroll-contain">
        {step === "country" ? matchingCountries.map((code) => <button aria-pressed={code === selection.countryCode} className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" key={code} onClick={() => { setDraftCountry(code); setStep("city"); setSearch(""); }} type="button"><span>{countryName(code, locale)}</span><span className="text-xs text-slate-400">{code}</span></button>) : <>
          <button aria-pressed={selection.countryCode === draftCountry && selection.city === ""} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => commit(draftCountry, "")} type="button">{copy.allCities}</button>
          {cities.map((city) => <button aria-pressed={selection.countryCode === draftCountry && selection.city === city} className="min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" key={city} onClick={() => commit(draftCountry, city)} type="button">{cityName(city, locale)}</button>)}
          {locationsStatus === "loading" ? <p className="px-3 py-2 text-xs text-slate-500">{copy.loadingCities}</p> : null}
          {locationsStatus === "error" ? <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500"><span>{copy.citiesUnavailable}</span><button className="font-semibold text-violet-700" onClick={() => setRetry((value) => value + 1)} type="button">{copy.retry}</button></div> : null}
          {locationsStatus === "ready" && !publishedCities.length ? <p className="px-3 py-2 text-xs text-slate-500">{copy.noCities}</p> : null}
        </>}
        {(step === "country" && !matchingCountries.length) || (step === "city" && publishedCities.length > 0 && !cities.length) ? <p className="px-3 py-2 text-xs text-slate-500">{copy.noMatches}</p> : null}
      </div>
    </div> : null}
  </div>;
}
