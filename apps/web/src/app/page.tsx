"use client";
import { CatalogLocationPicker } from "../components/catalog-location-picker";
import { PublicFramedAsset } from "../components/public-event-media";

import { INTL_LOCALES, localeFromBrowser } from "../lib/locale";

import { EVENT_CATEGORIES, type EventCategory, type EventLocale, type PublicEventSummary } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AfishaCalendar } from "../components/afisha-calendar";
import { DateStrip } from "../components/date-strip";
import { PromotionCarousel } from "../components/promotion-carousel";
import { AgeRestrictionBadge } from "../components/age-restriction-badge";
import { FavoriteButton } from "../components/favorite-button";
import { OptionPicker } from "../components/option-picker";
import { useDisplayCurrency } from "../components/currency-provider";
import { ErrorState } from "../components/ui";
import { CATALOG_CITY_SELECTED, CATALOG_QUERY_UPDATED, CATALOG_SEARCH_SUBMITTED } from "../lib/catalog-query-events";
import { fetchPublicEvents, type PublicEventsQuery } from "../lib/public-events";
import { useLocale } from "../components/locale-provider";
import { HOME_COPY } from "./home-copy";
import { formatCatalogPrice as formatPrice } from "../lib/catalog-event-price";
import { ContentLanguageNote } from "../components/content-language-note";
import { cityName, countryName } from "../lib/countries";
import { clearCatalogLocation, validCountryCode } from "../lib/catalog-location";

function useHomeCopy() { return HOME_COPY[useLocale()]; }

const CITY_HEADING_NAMES: Record<string, string> = { Алматы: "Алматы", Астана: "Астане", Шымкент: "Шымкенте", Москва: "Москве" };
const PAGE_SIZE = 18;

const DEFAULT_QUERY: PublicEventsQuery = { sort: "soonest" };

function readPage(): number {
  const raw = new URLSearchParams(window.location.search).get("page");
  return raw && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : 1;
}

function readHomeQuery(): PublicEventsQuery {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const datePreset = params.get("datePreset");
  const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  const free = params.get("free") === "true";
  const price = (value: string | null) => value !== null && /^\d+$/.test(value) && Number(value) <= 1_000_000 ? Number(value) : undefined;
  return {
    countryCode: validCountryCode(params.get("countryCode")) ?? undefined,
    city: params.get("city")?.trim() || undefined,
    sort: params.get("sort") === "recent" ? "recent" : params.get("sort") === "popular" ? "popular" : "soonest",
    timeOfDay: (["morning", "day", "evening", "night"] as const).find(value => value === params.get("timeOfDay")),
    search: params.get("search")?.trim() || undefined,
    category: EVENT_CATEGORIES.includes(category as EventCategory) ? category! : undefined,
    datePreset: datePreset === "today" || datePreset === "weekend" ? datePreset : undefined,
    from: date(params.get("from")),
    to: date(params.get("to")),
    free: free || undefined,
    minPrice: price(params.get("minPrice")),
    maxPrice: price(params.get("maxPrice")),
  };
}

function hasActiveFilters(query: PublicEventsQuery): boolean {
  return Boolean(query.timeOfDay || query.search || query.category || query.datePreset || query.from || query.to || query.free || query.minPrice !== undefined || query.maxPrice !== undefined || query.countryCode || query.city);
}

function queryUrl(query: PublicEventsQuery): string {
  const params = new URLSearchParams(window.location.search);
  for (const key of ["countryCode", "city", "timeOfDay", "sort", "search", "category", "datePreset", "from", "to", "free", "minPrice", "maxPrice", "page"]) params.delete(key);
  params.set("lang", localeFromBrowser());
  if (query.countryCode) params.set("countryCode", query.countryCode);
  if (query.city) params.set("city", query.city);
  if (query.sort && query.sort !== "soonest") params.set("sort", query.sort);
  for (const key of ["timeOfDay", "search", "category", "datePreset", "from", "to"] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  if (query.free) params.set("free", "true");
  if (query.minPrice !== undefined) params.set("minPrice", String(query.minPrice));
  if (query.maxPrice !== undefined) params.set("maxPrice", String(query.maxPrice));
  return params.size ? `/?${params.toString()}` : "/";
}

function pageUrl(query: PublicEventsQuery, page: number): string {
  const url = new URL(queryUrl(query), window.location.origin);
  if (page > 1) url.searchParams.set("page", String(page));
  return `${url.pathname}${url.search}`;
}

export default function HomePage() {
  const locale = useLocale();
  const copy = useHomeCopy();
  const [query, setQuery] = useState<PublicEventsQuery>(DEFAULT_QUERY);
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState<PublicEventSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [matchingTotal, setMatchingTotal] = useState(0);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageNavigationPending = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const restore = () => {
      const next = readHomeQuery();
      pageNavigationPending.current = false;
      setQuery(next);
      setPage(readPage());
      setTotal(0);
    };
    restore();
    setReady(true);
    window.addEventListener("popstate", restore);
    window.addEventListener(CATALOG_CITY_SELECTED, restore);
    window.addEventListener(CATALOG_SEARCH_SUBMITTED, restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener(CATALOG_CITY_SELECTED, restore);
      window.removeEventListener(CATALOG_SEARCH_SUBMITTED, restore);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void fetchPublicEvents({ countryCode: query.countryCode, city: query.city, page: 1, limit: 1, sort: "recent" })
      .then((result) => { if (active) setAllTotal(result.total); })
      .catch(() => { if (active) setAllTotal(null); });
    return () => { active = false; };
  }, [query.countryCode, query.city, ready]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setLoading(true);
    setError(false);
    setEvents(null);
    void fetchPublicEvents({ ...query, includeRemaining: true, page, limit: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          window.history.replaceState(null, "", pageUrl(query, lastPage));
          return;
        }
        setEvents(result.items);
        setTotal(result.total);
        setMatchingTotal(result.matchingTotal ?? result.total);
        if (pageNavigationPending.current) {
          pageNavigationPending.current = false;
          requestAnimationFrame(() => document.getElementById("catalog-results")?.scrollIntoView({ block: "start" }));
        }
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, page, ready, retry]);

  function update(next: Partial<PublicEventsQuery>) {
    const changed = { ...query, ...next };
    pageNavigationPending.current = false;
    setQuery(changed);
    setPage(1);
    setTotal(0);
    window.history.pushState(null, "", queryUrl(changed));
    window.dispatchEvent(new Event(CATALOG_QUERY_UPDATED));
  }

  function changePage(next: number) {
    if (next === page || loading || next < 1 || next > Math.ceil(total / PAGE_SIZE)) return;
    pageNavigationPending.current = true;
    setPage(next);
    window.history.pushState(null, "", pageUrl(query, next));
  }

  function reset() {
    clearCatalogLocation();
    update({ ...DEFAULT_QUERY, countryCode: undefined, city: undefined, timeOfDay: undefined, search: undefined, category: undefined, datePreset: undefined, from: undefined, to: undefined, free: undefined, minPrice: undefined, maxPrice: undefined });
  }

  const filtered = hasActiveFilters(query);
  const matchingOnPage = Math.max(0, Math.min(events?.length ?? 0, matchingTotal - (page - 1) * PAGE_SIZE));
  const catalog = events?.slice(0, matchingOnPage) ?? [];
  const remaining = events?.slice(matchingOnPage) ?? [];
  const city = query.city;
  const countryCode = query.countryCode;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return <main className="ticket-catalog min-h-screen bg-[#fafbff] dark:bg-ticket-bg text-[#111827] dark:text-ticket-text">
    <section className="relative px-4 pb-7 pt-1 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <CategoryStrip category={query.category as EventCategory | undefined} total={matchingTotal} allTotal={allTotal ?? undefined} onSelect={(category) => update({ category })} />
        <div className="pb-2 pt-5 text-center">
          <div><h1 className="ticket-catalog-heading mx-auto max-w-4xl text-[2rem] font-extrabold leading-[1.15] tracking-[-0.03em] sm:text-5xl">{city ? `${copy.headingCity} ${locale === "ru" ? CITY_HEADING_NAMES[city] ?? city : cityName(city, locale)}` : countryCode ? `${copy.heading} — ${countryName(countryCode, locale)}` : copy.heading}</h1></div>
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-1.5"><AfishaCalendar iconOnly from={query.from} onChange={(from, to) => update({ from, to, datePreset: undefined })} to={query.to} /><DateStrip from={query.from} onSelect={date => update({ from: date, to: date, datePreset: undefined })} to={query.to} todaySelected={query.datePreset === "today"} /></div>
        <TimeOfDayFilters value={query.timeOfDay} onChange={timeOfDay => update({ timeOfDay })} />
        <PromotionCarousel />
        <CatalogFilters query={query} onUpdate={update} onReset={reset} />
      </div>
    </section>
    <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
      {error ? <div className="mt-5"><ErrorState message={copy.loadFailed} onRetry={() => setRetry((value) => value + 1)} /></div> : null}
      {!events && !error ? <HomeSkeleton /> : null}
      {events && !error ? <>
        <section className="mt-6 scroll-mt-6" aria-live="polite" id="catalog-results">
          {catalog.length || page === 1 ? <><div className="flex items-center gap-2"><h2 className="text-xl font-bold tracking-tight">{filtered ? copy.results : copy.current}</h2><span className="rounded-full bg-slate-200 dark:bg-ticket-raised px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-ticket-muted">{matchingTotal}</span></div>
            {catalog.length ? <div className="ticket-event-grid mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{catalog.map((event, index) => <CatalogEventCard event={event} index={(page - 1) * PAGE_SIZE + index + 1} key={event.id} />)}</div> : <p className="mt-5 text-sm text-slate-600 dark:text-ticket-muted">{copy.emptyResults}</p>}</> : null}
          {remaining.length ? <><h2 className="mt-8 text-xl font-bold tracking-tight">{copy.otherEvents}</h2><div className="ticket-event-grid mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{remaining.map((event, index) => <CatalogEventCard event={event} index={(page - 1) * PAGE_SIZE + matchingOnPage + index + 1} key={event.id} />)}</div></> : null}
          {pageCount > 1 ? <CatalogPagination page={page} pageCount={pageCount} onChange={changePage} /> : null}
        </section>
      </> : null}
    </div>
    <HomeFooter />
  </main>;
}

function CategoryStrip({ category, total, allTotal, onSelect }: { category: EventCategory | undefined; total: number; allTotal: number | undefined; onSelect: (category: EventCategory | undefined) => void }) {
  const copy = useHomeCopy();
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      const canScroll = delta > 0 ? element.scrollLeft < element.scrollWidth - element.clientWidth - 1 : element.scrollLeft > 0;
      if (canScroll) { event.preventDefault(); element.scrollLeft += delta; }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  return <nav ref={row} aria-label={copy.categoriesLabel} className="ticket-category-strip mt-2 flex w-full gap-2 overflow-x-auto overscroll-x-contain px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)" }}>
    <CategoryButton active={!category} count={allTotal} onClick={() => onSelect(undefined)} />
    {EVENT_CATEGORIES.map(item => <CategoryButton key={item} category={item} active={category === item} count={category === item ? total : undefined} onClick={() => onSelect(item)} />)}
  </nav>;
}

function CategoryButton({ category, active, onClick, count }: { category?: EventCategory; active: boolean; onClick: () => void; count?: number | undefined }) {
  const copy = useHomeCopy();
  return <button aria-pressed={active} className={`ticket-category-button inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent ${active ? "bg-violet-100/70 dark:bg-ticket-accent-soft/70 text-[#6320ee] dark:text-ticket-accent" : "bg-transparent text-black dark:text-ticket-text hover:bg-slate-100 dark:hover:bg-ticket-raised"}`} onClick={onClick} type="button">
    {category ? <CategoryIcon category={category} /> : <GridIcon />}<span className="ticket-category-label">{category ? copy.categories[category] : copy.all}</span>
    {count !== undefined ? <span className="text-xs font-medium opacity-65">{count}</span> : null}
  </button>;
}

function CatalogPagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  const copy = useHomeCopy();
  const visible = [...new Set([1, pageCount, page - 2, page - 1, page, page + 1, page + 2].filter((value) => value >= 1 && value <= pageCount))].sort((left, right) => left - right);
  const buttonClass = "grid min-h-10 min-w-10 place-items-center rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent disabled:opacity-40";
  return <nav aria-label={copy.pageLabel} className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
    <button aria-label={copy.previousPage} className={`${buttonClass} text-slate-600 dark:text-ticket-muted hover:bg-violet-50 dark:hover:bg-ticket-accent-soft`} disabled={page === 1} onClick={() => onChange(page - 1)} type="button">‹ {copy.previousPage}</button>
    {visible.map((number, index) => <span className="contents" key={number}>{index > 0 && number - visible[index - 1]! > 1 ? <span aria-hidden="true" className="px-1 text-slate-400 dark:text-ticket-dim">…</span> : null}<button aria-current={number === page ? "page" : undefined} aria-label={`${copy.pageLabel} ${number}`} className={`${buttonClass} ${number === page ? "bg-[#6320ee] dark:bg-ticket-primary text-white" : "text-slate-700 dark:text-ticket-muted hover:bg-violet-50 dark:hover:bg-ticket-accent-soft hover:text-violet-700 dark:hover:text-ticket-accent"}`} onClick={() => onChange(number)} type="button">{number}</button></span>)}
    <button aria-label={copy.nextPage} className={`${buttonClass} text-slate-600 dark:text-ticket-muted hover:bg-violet-50 dark:hover:bg-ticket-accent-soft`} disabled={page === pageCount} onClick={() => onChange(page + 1)} type="button">{copy.nextPage} ›</button>
  </nav>;
}

const CATEGORY_PATHS: Record<EventCategory, string[]> = {
  music: ["M9 18V5l11-2v13", "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0", "M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
  nightlife: ["M4 3h16l-8 9-8-9Z", "M12 12v9", "M8 21h8"],
  festival: ["M3 20h18L12 4 3 20Z", "m8 20 4-7 4 7", "M12 4V2h5"],
  comedy: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M8 9h.01M16 9h.01", "M8 14a4 4 0 0 0 8 0"],
  theatre: ["M4 4c4 2 8 2 12 0v6c0 4-3 7-6 8-3-1-6-4-6-8V4Z", "M7 9h1M12 9h1", "M7 13c2 2 4 2 6 0", "m18 8 3-1v8c0 3-2 5-5 6"],
  business: ["M8 7V4h8v3", "M3 7h18v13H3V7Z", "M3 12c6 3 12 3 18 0", "M12 12v3"],
  education: ["m2 9 10-5 10 5-10 5L2 9Z", "M6 12v6c4 3 8 3 12 0v-6", "M22 9v8"],
  workshop: ["m14 4 6 6", "m3 21 3-1L20 6a2 2 0 0 0-3-3L3 17v4Z"],
  sport: ["M7 3h10v7a5 5 0 0 1-10 0V3Z", "M7 5H3v3a4 4 0 0 0 4 4", "M17 5h4v3a4 4 0 0 1-4 4", "M12 15v6M8 21h8"],
  family: ["M10 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0", "M2 21v-3a5 5 0 0 1 10 0v3", "M20 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0", "M15 21v-2a4 4 0 0 1 7 0v2"],
  children: ["M9 3h6v6H9z", "M5 21v-6a7 7 0 0 1 14 0v6"],
  adults: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M8 9v6M15 9v6M12 12h6"],
  cinema: ["M3 5h18v14H3z", "m10 9 5 3-5 3V9Z"],
  exhibitions: ["m3 9 9-6 9 6H3ZM5 10v9M12 10v9M19 10v9M3 21h18"],
  excursions: ["m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"],
  food: ["M4 3v6a3 3 0 0 0 6 0V3", "M7 3v18", "M20 3c-3 2-4 5-4 9h4V3Zm0 9v9"],
  other: ["M5 5h4v4H5Z", "M15 5h4v4h-4Z", "M5 15h4v4H5Z", "M15 15h4v4h-4Z"],
};
function CategoryIcon({ category }: { category: EventCategory }) { return <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{CATEGORY_PATHS[category].map((path, index) => <path key={index} d={path} />)}</svg>; }

function CatalogFilters({ query, onUpdate, onReset }: { query: PublicEventsQuery; onUpdate: (next: Partial<PublicEventsQuery>) => void; onReset: () => void }) {
  const locale = useLocale(), copy = HOME_COPY[locale];
  const shortSort = ({ ru: ["Популярные", "Новые"], en: ["Popular", "Newest"], kk: ["Танымал", "Жаңа"] } as const)[locale];
  const { currency, rates, setCurrency, formatWholeKzt } = useDisplayCurrency();
  const currencyOptions = [{ value: "KZT", label: "KZT ₸" }, { value: "RUB", label: "RUB ₽", disabled: !rates }, { value: "USD", label: "USD $", disabled: !rates }];
  const chipClassName = "max-w-full rounded-lg border border-violet-100 dark:border-ticket-accent bg-white dark:bg-ticket-surface px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-ticket-muted";
  return <section className="mt-5 w-full" aria-label={copy.filters}>
    <div className="w-full py-1">
      <div className="ticket-catalog-filter-row mt-2 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200/80 dark:border-ticket-border pt-2">
        <div className="ticket-catalog-filter-primary flex min-w-0 flex-wrap items-center gap-2">
          <button aria-pressed={query.free === true} className={`min-h-10 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent ${query.free ? "bg-violet-600 dark:bg-ticket-primary text-white" : "bg-slate-100 dark:bg-ticket-raised text-slate-700 dark:text-ticket-muted hover:bg-violet-50 dark:hover:bg-ticket-accent-soft hover:text-violet-700 dark:hover:text-ticket-accent"}`} onClick={() => onUpdate({ free: query.free ? undefined : true, minPrice: undefined, maxPrice: undefined })} type="button">{copy.free}</button>
          <PriceRange query={query} onUpdate={onUpdate} />
          <div title={rates ? `${copy.exchangeRates} ${rates.asOf}. ${copy.paymentCurrency}` : copy.loadingRates}>
            <OptionPicker appearance="bare" icon={<CurrencyIcon />} label={copy.currency} value={currency} options={currencyOptions} onChange={(value) => setCurrency(value as "KZT" | "RUB" | "USD")} />
          </div>
          <div aria-label={copy.appliedFilters} className="ticket-catalog-applied flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-violet-800 dark:text-ticket-accent">{copy.applied}</span>
            <CatalogLocationPicker appearance="filter" />
            <span className={chipClassName}>{query.category ? copy.categories[query.category as EventCategory] : copy.allEvents}</span>
            {query.search ? <span className={`${chipClassName} truncate`}>{copy.searchTerm} {query.search}</span> : null}
            {query.datePreset ? <span className={chipClassName}>{query.datePreset === "today" ? copy.today : copy.weekend}</span> : null}
            {query.from ? <span className={chipClassName}>{query.from}{query.to ? ` — ${query.to}` : ` ${copy.andLater}`}</span> : null}
            {query.free ? <span className={chipClassName}>{copy.freeEvents}</span> : null}
            {query.minPrice !== undefined || query.maxPrice !== undefined ? <span className={chipClassName}>{copy.price} {formatWholeKzt(query.minPrice ?? 0)}–{query.maxPrice === undefined ? "∞" : formatWholeKzt(query.maxPrice)}</span> : null}
            <button className="min-h-9 rounded-lg px-2 font-semibold text-violet-800 dark:text-ticket-accent transition hover:bg-violet-100 dark:hover:bg-ticket-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent" onClick={onReset} type="button">{copy.clearAll}</button>
          </div>
        </div>
        <div className="ticket-catalog-sort ml-auto flex items-center gap-1 text-slate-500 dark:text-ticket-muted"><SortIcon /><OptionPicker appearance="borderless" className="w-[185px]" label={copy.sort} value={query.sort ?? "soonest"} options={[{ value: "soonest", label: copy.soonest }, { value: "popular", label: copy.popular, compactLabel: shortSort[0] }, { value: "recent", label: copy.recent, compactLabel: shortSort[1] }]} onChange={(value) => onUpdate({ sort: value as "popular" | "recent" | "soonest" })} /></div>
      </div>
    </div>
  </section>;
}

const PRICE_LIMIT = 1_000_000;
const PRICE_RANGE_STEPS = 1000;
const PRICE_RANGE_CURVE = 5;

function positionToPrice(position: number): number {
  const fraction = Math.min(PRICE_RANGE_STEPS, Math.max(0, position)) / PRICE_RANGE_STEPS;
  return Math.round(PRICE_LIMIT * Math.expm1(PRICE_RANGE_CURVE * fraction) / Math.expm1(PRICE_RANGE_CURVE) / 10) * 10;
}

function priceToPosition(price: number): number {
  const fraction = Math.min(PRICE_LIMIT, Math.max(0, price)) / PRICE_LIMIT;
  return Math.round(Math.log1p(fraction * Math.expm1(PRICE_RANGE_CURVE)) / PRICE_RANGE_CURVE * PRICE_RANGE_STEPS);
}

function PriceRange({ query, onUpdate }: { query: PublicEventsQuery; onUpdate: (next: Partial<PublicEventsQuery>) => void }) {
  const copy = useHomeCopy();
  const { formatWholeKzt } = useDisplayCurrency();
  const [min, setMin] = useState(query.minPrice ?? 0);
  const [max, setMax] = useState(query.maxPrice ?? PRICE_LIMIT);
  const minPosition = priceToPosition(min);
  const maxPosition = priceToPosition(max);

  useEffect(() => { setMin(query.minPrice ?? 0); setMax(query.maxPrice ?? PRICE_LIMIT); }, [query.minPrice, query.maxPrice]);

  const commit = (low: number, high: number) => onUpdate({
    minPrice: low === 0 ? undefined : low,
    maxPrice: high === PRICE_LIMIT ? undefined : high,
    free: undefined,
  });
  const minimumFromInput = (position: number) => Math.min(positionToPrice(position), max);
  const maximumFromInput = (position: number) => Math.max(positionToPrice(position), min);

  return <div aria-label={copy.priceRange} className="w-[154px] shrink-0 rounded-xl bg-slate-50 dark:bg-ticket-bg px-2 py-1.5" role="group">
    <div className="flex items-center justify-between gap-1 text-[10px] font-semibold tabular-nums text-slate-600 dark:text-ticket-muted"><span>{formatWholeKzt(min)}</span><span>{formatWholeKzt(max)}</span></div>
    <div className="relative h-7">
      <div aria-hidden="true" className="absolute inset-x-[9px] top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-ticket-raised"><div className="absolute h-full rounded-full bg-violet-600 dark:bg-ticket-primary" style={{ left: `${minPosition / PRICE_RANGE_STEPS * 100}%`, width: `${(maxPosition - minPosition) / PRICE_RANGE_STEPS * 100}%` }} /></div>
      <input aria-label={copy.minPrice} aria-valuetext={formatWholeKzt(min)} className="price-range-input absolute inset-0 h-7 w-full" max={maxPosition} min={0} onChange={(event) => setMin(minimumFromInput(Number(event.currentTarget.value)))} onKeyUp={(event) => commit(minimumFromInput(Number(event.currentTarget.value)), max)} onPointerUp={(event) => commit(minimumFromInput(Number(event.currentTarget.value)), max)} step={1} style={{ zIndex: minPosition > PRICE_RANGE_STEPS - 50 ? 3 : 2 }} type="range" value={minPosition} />
      <input aria-label={copy.maxPrice} aria-valuetext={formatWholeKzt(max)} className="price-range-input absolute inset-0 h-7 w-full" max={PRICE_RANGE_STEPS} min={minPosition} onChange={(event) => setMax(maximumFromInput(Number(event.currentTarget.value)))} onKeyUp={(event) => commit(min, maximumFromInput(Number(event.currentTarget.value)))} onPointerUp={(event) => commit(min, maximumFromInput(Number(event.currentTarget.value)))} step={1} style={{ zIndex: 2 }} type="range" value={maxPosition} />
    </div>
  </div>;
}

function CatalogEventCard({ event, index }: { event: PublicEventSummary; index: number }) {
  const copy = useHomeCopy();
  const locale = useLocale();
  const { formatMoney } = useDisplayCurrency();
  return <article className="ticket-event-card group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-ticket-border bg-white dark:bg-ticket-surface shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-lg">
    <Link className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent" href={`/events/${event.id}`} target="_blank" rel="noopener noreferrer">
      <div className="relative aspect-video overflow-hidden bg-slate-200 dark:bg-ticket-raised">
        {event.media?.find(asset => asset.isCard) ? <PublicFramedAsset asset={event.media.find(asset => asset.isCard)!} className="h-full w-full" /> : <PosterImage alt="" fallbackIndex={index} src={event.posterUrl} />}
      </div>
      <div className="ticket-event-card-body flex flex-1 flex-col justify-between gap-3 p-4">
        <div>
          <div className="ticket-event-card-meta flex items-start justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-ticket-accent"><CalendarIcon />{formatEventDate(event, locale)}</p>
            <span className="max-w-[45%] shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-ticket-muted">{copy.categories[event.category]}</span>
          </div>
          <h3 className="mt-1.5 line-clamp-2 text-sm font-bold leading-5 transition group-hover:text-violet-700 dark:group-hover:text-ticket-accent">{event.title}</h3>
          <ContentLanguageNote contentLocale={event.contentLocale} />
          <p className="ticket-event-card-location mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-ticket-muted"><PinIcon /><span className="truncate">{event.address}</span><span aria-hidden="true" className="mx-1 shrink-0">|</span><AgeRestrictionBadge age={event.ageRestriction} inline /></p>
        </div>
        <div className="ticket-event-card-price flex items-end justify-between gap-2 border-t border-slate-100 dark:border-ticket-border pt-2">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-ticket-dim">{copy.cost}</p><p className="mt-0.5 text-sm font-bold">{formatPrice(event, formatMoney, locale)}</p></div>
          <span className="rounded-full bg-violet-50 dark:bg-ticket-accent-soft px-3 py-1 text-xs font-semibold text-violet-700 dark:text-ticket-accent transition group-hover:bg-violet-600 dark:group-hover:bg-ticket-primary-hover group-hover:text-white">{copy.buyTicket}</span>
        </div>
      </div>
    </Link>
    <FavoriteButton eventId={event.id} compact />
  </article>;
}


function PosterImage({src,alt,position}:{src:string|null;fallbackIndex:number;alt:string;position?:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img alt={alt} className="absolute inset-0 h-full w-full object-cover" onError={()=>setFailed(true)} src={src} style={position?{objectPosition:position}:undefined}/>:<div className="absolute inset-0 bg-gradient-to-br from-violet-100 dark:from-ticket-accent-soft to-slate-200 dark:to-ticket-raised"/>;}

function HomeSkeleton() { const copy = useHomeCopy(); return <div aria-label={copy.loadingEvents} className="ticket-catalog-skeleton space-y-6"><div className="h-[390px] animate-pulse rounded-2xl bg-[#e2e8f8] dark:bg-ticket-raised" /><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-80 animate-pulse rounded-xl bg-[#e2e8f8] dark:bg-ticket-raised" key={index} />)}</div></div>; }
function HomeFooter() { const copy = useHomeCopy(); return <footer className="mt-14 border-t border-slate-200 dark:border-ticket-border bg-white dark:bg-ticket-surface"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-8 text-xs text-slate-500 dark:text-ticket-muted sm:px-6 md:flex-row md:items-center lg:px-8"><div className="flex flex-wrap items-center gap-3"><Link className="text-lg font-extrabold tracking-tight text-[#6320ee] dark:text-ticket-accent" href="/">TICKET</Link><span className="text-slate-300">|</span><span>© {new Date().getFullYear()} {copy.footerTagline}</span></div><nav aria-label={copy.footerLinks} className="flex flex-wrap gap-x-6 gap-y-2"><Link className="hover:text-violet-700 dark:hover:text-ticket-accent" href="/organizer/events">{copy.forOrganizers}</Link><Link className="hover:text-violet-700 dark:hover:text-ticket-accent" href="/favorites">{copy.favorites}</Link></nav></div></footer>; }

function formatEventDate(event: PublicEventSummary, locale: EventLocale): string { const date = new Date(`${event.date}T00:00:00Z`); const formatted = new Intl.DateTimeFormat(INTL_LOCALES[locale], { day: "numeric", month: "long", timeZone: "UTC" }).format(date); return `${formatted}, ${event.time.slice(0, 5)}`; }

function SortIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24"><path d="M4 6h16M4 12h11M4 18h6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /><path d="m17 15 3 3 3-3M20 10v8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>; }
function CurrencyIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-violet-600 dark:text-ticket-accent" fill="none" viewBox="0 0 24 24"><circle cx="10" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M10 8v8m-2-6h4m-4 4h4M16 5.5a7 7 0 0 1 0 13" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>; }
function GridIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="7" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /><rect x="11" y="11" width="7" height="7" rx="1.5" /></svg>; }
function PinIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#713dcc] dark:text-ticket-accent" fill="none" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2"/></svg>; }
function CalendarIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#713dcc] dark:text-ticket-accent" fill="none" viewBox="0 0 24 24"><rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5"/><path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>; }

function TimeOfDayFilters({ value, onChange }: { value: PublicEventsQuery["timeOfDay"]; onChange: (value: PublicEventsQuery["timeOfDay"]) => void }) {
  const locale = useLocale();
  const labels = { ru: ["Утро", "День", "Вечер", "Ночь"], kk: ["Таң", "Күндіз", "Кеш", "Түн"], en: ["Morning", "Day", "Evening", "Night"] }[locale];
  return <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={{ ru: "Время начала события", kk: "Іс-шараның басталу уақыты", en: "Event start time" }[locale]}>{(["morning", "day", "evening", "night"] as const).map((period, index) => <button key={period} type="button" aria-pressed={value === period} title={["06:00–11:59", "12:00–17:59", "18:00–23:59", "00:00–05:59"][index]} className={`min-h-10 rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${value === period ? "bg-violet-600 text-white dark:bg-ticket-primary" : "bg-white text-slate-700 border border-slate-200 dark:bg-ticket-surface dark:border-ticket-border dark:text-ticket-text"}`} onClick={() => onChange(value === period ? undefined : period)}>{labels[index]}</button>)}</div>;
}
