"use client";

import { INTL_LOCALES, localeFromBrowser } from "../lib/locale";

import { EVENT_CATEGORIES, type EventCategory, type EventLocale, type PublicEventSummary } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AfishaCalendar } from "../components/afisha-calendar";
import { DateStrip } from "../components/date-strip";
import { AgeRestrictionBadge } from "../components/age-restriction-badge";
import { FavoriteButton } from "../components/favorite-button";
import { OptionPicker } from "../components/option-picker";
import { useDisplayCurrency } from "../components/currency-provider";
import { ErrorState } from "../components/ui";
import { CATALOG_CITY_SELECTED, CATALOG_QUERY_UPDATED, CATALOG_SEARCH_SUBMITTED } from "../lib/catalog-query-events";
import { fetchPublicEvents, type PublicEventsQuery } from "../lib/public-events";
import { useLocale } from "../components/locale-provider";
import { HOME_COPY } from "./home-copy";
import { ContentLanguageNote } from "../components/content-language-note";
import { cityName, countryName } from "../lib/countries";
import { clearCatalogLocation, validCountryCode } from "../lib/catalog-location";

function useHomeCopy() { return HOME_COPY[useLocale()]; }

const CITY_HEADING_NAMES: Record<string, string> = { Алматы: "Алматы", Астана: "Астане", Шымкент: "Шымкенте" };
const PAGE_SIZE = 18;
const FEATURED_COUNT = 6;
const REFERENCE_POSTERS = Array.from({ length: 9 }, (_, index) => `/reference-events/event-${index + 1}.jpg`);
const DEFAULT_QUERY: PublicEventsQuery = { sort: "popular" };

function readPage(): number {
  const raw = new URLSearchParams(window.location.search).get("page");
  return raw && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : 1;
}

function readHomeQuery(): PublicEventsQuery {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const datePreset = params.get("datePreset");
  const paymentMode = params.get("paymentMode");
  const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  const free = params.get("free") === "true";
  const price = (value: string | null) => value !== null && /^\d+$/.test(value) && Number(value) <= 1_000_000 ? Number(value) : undefined;
  return {
    countryCode: validCountryCode(params.get("countryCode")) ?? undefined,
    city: params.get("city")?.trim() || undefined,
    sort: params.get("sort") === "recent" ? "recent" : "popular",
    search: params.get("search")?.trim() || undefined,
    category: EVENT_CATEGORIES.includes(category as EventCategory) ? category! : undefined,
    datePreset: datePreset === "today" || datePreset === "weekend" ? datePreset : undefined,
    from: date(params.get("from")),
    to: date(params.get("to")),
    free: free || undefined,
    minPrice: price(params.get("minPrice")),
    maxPrice: price(params.get("maxPrice")),
    paymentMode: !free && (paymentMode === "deposit" || paymentMode === "full_payment") ? paymentMode : undefined,
  };
}

function hasActiveFilters(query: PublicEventsQuery): boolean {
  return Boolean(query.search || query.category || query.datePreset || query.from || query.to || query.free || query.paymentMode || query.minPrice !== undefined || query.maxPrice !== undefined || query.countryCode || query.city || query.sort === "recent");
}

function queryUrl(query: PublicEventsQuery): string {
  const params = new URLSearchParams(window.location.search);
  for (const key of ["countryCode", "city", "sort", "search", "category", "datePreset", "from", "to", "paymentMode", "free", "minPrice", "maxPrice", "page"]) params.delete(key);
  params.set("lang", localeFromBrowser());
  if (query.countryCode) params.set("countryCode", query.countryCode);
  if (query.city) params.set("city", query.city);
  if (query.sort === "recent") params.set("sort", "recent");
  for (const key of ["search", "category", "datePreset", "from", "to", "paymentMode"] as const) {
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
    void fetchPublicEvents({ ...query, page, limit: PAGE_SIZE })
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
    update({ ...DEFAULT_QUERY, countryCode: undefined, city: undefined, search: undefined, category: undefined, datePreset: undefined, from: undefined, to: undefined, free: undefined, paymentMode: undefined, minPrice: undefined, maxPrice: undefined });
  }

  const filtered = hasActiveFilters(query);
  const featured = !filtered && page === 1 ? events?.slice(0, FEATURED_COUNT) ?? [] : [];
  const catalog = events?.slice(featured.length) ?? [];
  const city = query.city;
  const countryCode = query.countryCode;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return <main className="min-h-screen bg-[#fafbff] text-[#111827]">
    <section className="relative px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 border-b border-slate-200/80 pb-5 md:flex-row md:items-end md:justify-between">
          <div><h1 className="max-w-4xl text-[2rem] font-extrabold leading-[1.15] tracking-[-0.03em] sm:text-5xl">{city ? `${copy.headingCity} ${locale === "ru" ? CITY_HEADING_NAMES[city] ?? city : cityName(city, locale)}${countryCode ? ` · ${countryName(countryCode, locale)}` : ""}` : countryCode ? `${copy.heading} — ${countryName(countryCode, locale)}` : copy.heading}</h1></div>
        </div>
        <CategoryStrip category={query.category as EventCategory | undefined} total={total} allTotal={allTotal ?? undefined} onSelect={(category) => update({ category })} />
        <CatalogFilters query={query} onUpdate={update} onReset={reset} />
      </div>
    </section>
    <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
      {error ? <div className="mt-5"><ErrorState message={copy.loadFailed} onRetry={() => setRetry((value) => value + 1)} /></div> : null}
      {!events && !error ? <HomeSkeleton /> : null}
      {events && !error ? <>
        {featured.length ? <FeaturedCarousel events={featured} /> : null}
        <section className="mt-6 scroll-mt-6" aria-live="polite" id="catalog-results"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="text-xl font-bold tracking-tight">{filtered ? copy.results : copy.current}</h2><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">{total}</span></div></div>
          {catalog.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{catalog.map((event, index) => <CatalogEventCard event={event} index={(page - 1) * PAGE_SIZE + featured.length + index + 1} key={event.id} />)}</div> : featured.length ? null : <p className="mt-5 rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">{copy.emptyResults}</p>}
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
  return <nav ref={row} aria-label={copy.categoriesLabel} className="mt-5 flex w-full gap-2 overflow-x-auto overscroll-x-contain px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)" }}>
    <CategoryButton active={!category} count={allTotal} onClick={() => onSelect(undefined)} />
    {EVENT_CATEGORIES.map(item => <CategoryButton key={item} category={item} active={category === item} count={category === item ? total : undefined} onClick={() => onSelect(item)} />)}
  </nav>;
}

function CategoryButton({ category, active, onClick, count }: { category?: EventCategory; active: boolean; onClick: () => void; count?: number | undefined }) {
  const copy = useHomeCopy();
  return <button aria-pressed={active} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 ${active ? "bg-violet-100/70 text-[#6320ee]" : "bg-transparent text-black hover:bg-slate-100"}`} onClick={onClick} type="button">
    {category ? <CategoryIcon category={category} /> : <GridIcon />}{category ? copy.categories[category] : copy.all}
    {count !== undefined ? <span className="text-xs font-medium opacity-65">{count}</span> : null}
  </button>;
}

function CatalogPagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  const copy = useHomeCopy();
  const visible = [...new Set([1, pageCount, page - 2, page - 1, page, page + 1, page + 2].filter((value) => value >= 1 && value <= pageCount))].sort((left, right) => left - right);
  const buttonClass = "grid min-h-10 min-w-10 place-items-center rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40";
  return <nav aria-label={copy.pageLabel} className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
    <button aria-label={copy.previousPage} className={`${buttonClass} text-slate-600 hover:bg-violet-50`} disabled={page === 1} onClick={() => onChange(page - 1)} type="button">‹</button>
    {visible.map((number, index) => <span className="contents" key={number}>{index > 0 && number - visible[index - 1]! > 1 ? <span aria-hidden="true" className="px-1 text-slate-400">…</span> : null}<button aria-current={number === page ? "page" : undefined} aria-label={`${copy.pageLabel} ${number}`} className={`${buttonClass} ${number === page ? "bg-[#6320ee] text-white" : "text-slate-700 hover:bg-violet-50 hover:text-violet-700"}`} onClick={() => onChange(number)} type="button">{number}</button></span>)}
    <button aria-label={copy.nextPage} className={`${buttonClass} text-slate-600 hover:bg-violet-50`} disabled={page === pageCount} onClick={() => onChange(page + 1)} type="button">›</button>
  </nav>;
}

const CATEGORY_PATHS: Record<EventCategory, string> = {
  music: "M9 18V5l11-2v13M9 7l11-2M9 18c0 1.7-1.6 3-3.5 3S2 19.7 2 18s1.6-3 3.5-3S9 16.3 9 18Zm11-2c0 1.7-1.6 3-3.5 3S13 17.7 13 16s1.6-3 3.5-3S20 14.3 20 16Z",
  nightlife: "M4 3h16l-8 9-8-9Zm8 9v9m-4 0h8M7 6h10",
  festival: "M3 20h18M5 20V11l7-7 7 7v9M3 11h18M9 20v-6h6v6M12 4V1l5 1-5 2",
  comedy: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 9h.01M16 9h.01M7 14c2 5 8 5 10 0H7Z",
  theatre: "M3 3c4 2 8 2 12 0v7c0 4-3 7-6 8-3-1-6-4-6-8V3Zm3 5h1m4 0h1m-6 5c2 2 4 2 6 0M16 7l5-1v9c0 3-2 6-5 7-2-1-3-2-4-4m5-7h1m-2 5h2",
  business: "M8 7V4h8v3M3 7h18v14H3V7Zm0 6c6 3 12 3 18 0M10 13h4v4h-4v-4Z",
  education: "m2 9 10-5 10 5-10 5L2 9Zm4 3v6c4 3 8 3 12 0v-6m4-3v8",
  workshop: "M14 3a6 6 0 0 0-7 8L2 16a3 3 0 0 0 4 4l5-5a6 6 0 0 0 8-7l-4 4-3-3 4-4-2-2Z",
  sport: "M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v6m-4 0h8",
  family: "M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 21v-5a4 4 0 0 1 5-4m15 9v-5a4 4 0 0 0-5-4m-3 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-6 6a4 4 0 0 1 8 0",
  food: "M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 3c-4 2-5 6-5 10h5m0-10v18",
  other: "M5 5h4v4H5V5Zm10 0h4v4h-4V5ZM5 15h4v4H5v-4Zm10 0h4v4h-4v-4Z",
};
function CategoryIcon({ category }: { category: EventCategory }) { return <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={CATEGORY_PATHS[category]} /></svg>; }

function FeaturedCarousel({ events }: { events: PublicEventSummary[] }) {
  const copy = useHomeCopy();
  const viewport = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef(0);
  const [active, setActive] = useState(0);
  const eventIds = events.map((event) => event.id).join(",");

  useEffect(() => {
    const element = viewport.current;
    if (!element || events.length < 2) return;
    const align = () => {
      const first = element.children[0] as HTMLElement | undefined;
      const second = element.children[1] as HTMLElement | undefined;
      if (first && second) element.scrollLeft = (second.offsetLeft - first.offsetLeft) * (current.current + 1);
    };
    current.current = 0;
    setActive(0);
    align();
    const observer = new ResizeObserver(align);
    observer.observe(element);
    return () => { observer.disconnect(); if (timer.current) clearTimeout(timer.current); };
  }, [eventIds, events.length]);

  if (events.length === 1) return <div className="mt-4"><FeaturedEvent event={events[0]!} /></div>;
  const slides = [events.at(-1)!, ...events, events[0]!];
  const step = () => {
    const element = viewport.current;
    const first = element?.children[0] as HTMLElement | undefined;
    const second = element?.children[1] as HTMLElement | undefined;
    return first && second ? second.offsetLeft - first.offsetLeft : 0;
  };
  const settle = () => {
    const element = viewport.current;
    const width = step();
    if (!element || !width) return;
    let position = Math.max(0, Math.min(events.length + 1, Math.round(element.scrollLeft / width)));
    if (position === 0) { position = events.length; element.scrollLeft = position * width; }
    if (position === events.length + 1) { position = 1; element.scrollLeft = width; }
    current.current = position - 1;
    setActive(current.current);
  };
  const move = (direction: -1 | 1) => {
    const element = viewport.current;
    const width = step();
    if (!element || !width) return;
    const position = Math.max(0, Math.min(events.length + 1, Math.round(element.scrollLeft / width) + direction));
    element.scrollTo({ left: position * width, behavior: "smooth" });
  };
  return <section aria-label={copy.editorsChoice} className="group/carousel relative mt-4 [--carousel-peek:2rem] sm:[--carousel-peek:3.5rem] lg:[--carousel-peek:5rem]">
    <div ref={viewport} aria-label={`${copy.featuredList}. ${copy.featuredHint}`} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[var(--carousel-peek)] [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden" onScroll={() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(settle, 120); }}>
      {slides.map((event, index) => <div aria-hidden={index === 0 || index === slides.length - 1 ? true : undefined} className="w-full shrink-0 snap-center" inert={index === 0 || index === slides.length - 1} key={`${event.id}-${index}`}><FeaturedEvent event={event} /></div>)}
    </div>
    <button aria-label={copy.previousEvent} className="pointer-events-none absolute left-1 top-1/2 z-20 grid size-14 -translate-y-1/2 place-items-center bg-transparent text-white opacity-0 transition duration-200 hover:scale-110 focus-visible:pointer-events-auto focus-visible:scale-110 focus-visible:opacity-100 focus-visible:outline-none group-hover/carousel:pointer-events-auto group-hover/carousel:opacity-100 sm:left-3" onClick={() => move(-1)} type="button"><CarouselChevron direction="left" /></button>
    <button aria-label={copy.nextEvent} className="pointer-events-none absolute right-1 top-1/2 z-20 grid size-14 -translate-y-1/2 place-items-center bg-transparent text-white opacity-0 transition duration-200 hover:scale-110 focus-visible:pointer-events-auto focus-visible:scale-110 focus-visible:opacity-100 focus-visible:outline-none group-hover/carousel:pointer-events-auto group-hover/carousel:opacity-100 sm:right-3" onClick={() => move(1)} type="button"><CarouselChevron direction="right" /></button>
    <span aria-live="polite" className="sr-only">{copy.event} {active + 1} {copy.of} {events.length}</span>
  </section>;
}

function FeaturedEvent({ event }: { event: PublicEventSummary }) {
  const copy = useHomeCopy();
  const locale = useLocale();
  const { formatMoney } = useDisplayCurrency();
  return <article className="relative isolate h-full overflow-hidden rounded-2xl bg-[#0b0d12] text-white shadow-[0_10px_25px_-5px_rgba(15,23,42,0.16)]">
    <div className="absolute inset-y-0 left-[42%] w-[68%]" aria-hidden="true"><PosterImage alt="" fallbackIndex={0} position="center 25%" src={event.posterUrl} /><div className="absolute inset-0 bg-black/10" /></div>
    <div className="absolute inset-0 bg-[linear-gradient(90deg,#0b0d12_0%,rgba(11,13,18,0.95)_58%,rgba(11,13,18,0.35)_100%)] sm:bg-[linear-gradient(90deg,#0b0d12_0%,#0b0d12_38%,rgba(11,13,18,0.96)_43%,rgba(11,13,18,0.52)_51%,rgba(11,13,18,0.08)_62%,rgba(11,13,18,0.03)_100%)]" aria-hidden="true" />
    <div className="relative z-[1] flex min-h-[350px] max-w-[720px] flex-col justify-between p-6 sm:p-9 lg:p-10"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#6320ee] px-3 py-1 text-[10px] font-bold uppercase tracking-wide">{copy.editorsChoice}</span><AvailabilityBadge status={event.saleStatus} /><span className="text-[11px] font-medium uppercase tracking-wide text-slate-300">{copy.categories[event.category]}</span></div><h2 className="mt-4 text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl">{event.title}</h2><ContentLanguageNote contentLocale={event.contentLocale} />{event.announcement ? <p className="mt-3 max-w-lg text-sm leading-6 text-slate-100">{event.announcement}</p> : null}</div><div className="mt-6 border-t border-white/10 pt-5"><p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium"><span className="inline-flex items-center gap-1.5"><CalendarIcon />{formatEventDate(event, locale)}</span><span className="inline-flex items-center gap-1.5"><PinIcon />{event.venueName}</span></p><div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] uppercase tracking-wide text-slate-300">{event.paymentMode === "deposit" ? copy.deposit : copy.tickets}</p><p className="mt-1 text-2xl font-extrabold leading-tight">{formatPrice(event, formatMoney, locale)}</p></div><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#6320ee] px-7 text-sm font-semibold text-white shadow-[0_10px_25px_-5px_rgba(99,32,238,0.3)] transition hover:bg-[#4f16c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" href={`/events/${event.id}`}>{copy.tickets}</Link></div></div></div><AgeRestrictionBadge age={event.ageRestriction} className="absolute bottom-4 right-4 z-[2]" /><FavoriteButton eventId={event.id} />
  </article>;
}

function CatalogFilters({ query, onUpdate, onReset }: { query: PublicEventsQuery; onUpdate: (next: Partial<PublicEventsQuery>) => void; onReset: () => void }) {
  const copy = useHomeCopy();
  const locale = useLocale();
  const { currency, rates, setCurrency, formatWholeKzt } = useDisplayCurrency();
  const currencyOptions = [{ value: "KZT", label: "KZT ₸" }, { value: "RUB", label: "RUB ₽", disabled: !rates }, { value: "USD", label: "USD $", disabled: !rates }];
  const chipClassName = "max-w-full rounded-lg border border-violet-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-700";
  return <section className="mt-5 w-full" aria-label={copy.filters}>
    <div className="w-full py-1">
      <div className="flex min-w-0 w-full items-center gap-1.5">
        <AfishaCalendar iconOnly from={query.from} onChange={(from, to) => onUpdate({ from, to, datePreset: undefined })} to={query.to} />
        <DateStrip from={query.from} onSelect={(date) => onUpdate({ from: date, to: date, datePreset: undefined })} to={query.to} todaySelected={query.datePreset === "today"} />
      </div>
      <div className="mt-2 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200/80 pt-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button aria-pressed={query.free === true} className={`min-h-10 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${query.free ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-violet-50 hover:text-violet-700"}`} onClick={() => onUpdate({ free: query.free ? undefined : true, minPrice: undefined, maxPrice: undefined, paymentMode: undefined })} type="button">{copy.free}</button>
          <PriceRange query={query} onUpdate={onUpdate} />
          <div title={rates ? `${copy.exchangeRates} ${rates.asOf}. ${copy.paymentCurrency}` : copy.loadingRates}>
            <OptionPicker appearance="bare" icon={<CurrencyIcon />} label={copy.currency} value={currency} options={currencyOptions} onChange={(value) => setCurrency(value as "KZT" | "RUB" | "USD")} />
          </div>
          <div aria-label={copy.appliedFilters} className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-violet-800">{copy.applied}</span>
            <span className={chipClassName}>{query.countryCode ? `${countryName(query.countryCode, locale)} · ${query.city ? cityName(query.city, locale) : copy.allCities}` : copy.allCountries}</span>
            <span className={chipClassName}>{query.category ? copy.categories[query.category as EventCategory] : copy.allEvents}</span>
            {query.search ? <span className={`${chipClassName} truncate`}>{copy.searchTerm} {query.search}</span> : null}
            {query.datePreset ? <span className={chipClassName}>{query.datePreset === "today" ? copy.today : copy.weekend}</span> : null}
            {query.from ? <span className={chipClassName}>{query.from}{query.to ? ` — ${query.to}` : ` ${copy.andLater}`}</span> : null}
            {query.free ? <span className={chipClassName}>{copy.freeEvents}</span> : null}
            {query.minPrice !== undefined || query.maxPrice !== undefined ? <span className={chipClassName}>{copy.price} {formatWholeKzt(query.minPrice ?? 0)}–{query.maxPrice === undefined ? "∞" : formatWholeKzt(query.maxPrice)}</span> : null}
            <button className="min-h-9 rounded-lg px-2 font-semibold text-violet-800 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={onReset} type="button">{copy.clearAll}</button>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1 text-slate-500"><SortIcon /><OptionPicker appearance="borderless" className="w-[185px]" label={copy.sort} value={query.sort ?? "popular"} options={[{ value: "popular", label: copy.popular }, { value: "recent", label: copy.recent }]} onChange={(value) => onUpdate({ sort: value as "popular" | "recent" })} /></div>
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
    paymentMode: undefined,
  });
  const minimumFromInput = (position: number) => Math.min(positionToPrice(position), max);
  const maximumFromInput = (position: number) => Math.max(positionToPrice(position), min);

  return <div aria-label={copy.priceRange} className="w-[154px] shrink-0 rounded-xl bg-slate-50 px-2 py-1.5" role="group">
    <div className="flex items-center justify-between gap-1 text-[10px] font-semibold tabular-nums text-slate-600"><span>{formatWholeKzt(min)}</span><span>{formatWholeKzt(max)}</span></div>
    <div className="relative h-7">
      <div aria-hidden="true" className="absolute inset-x-[9px] top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200"><div className="absolute h-full rounded-full bg-violet-600" style={{ left: `${minPosition / PRICE_RANGE_STEPS * 100}%`, width: `${(maxPosition - minPosition) / PRICE_RANGE_STEPS * 100}%` }} /></div>
      <input aria-label={copy.minPrice} aria-valuetext={formatWholeKzt(min)} className="price-range-input absolute inset-0 h-7 w-full" max={maxPosition} min={0} onChange={(event) => setMin(minimumFromInput(Number(event.currentTarget.value)))} onKeyUp={(event) => commit(minimumFromInput(Number(event.currentTarget.value)), max)} onPointerUp={(event) => commit(minimumFromInput(Number(event.currentTarget.value)), max)} step={1} style={{ zIndex: minPosition > PRICE_RANGE_STEPS - 50 ? 3 : 2 }} type="range" value={minPosition} />
      <input aria-label={copy.maxPrice} aria-valuetext={formatWholeKzt(max)} className="price-range-input absolute inset-0 h-7 w-full" max={PRICE_RANGE_STEPS} min={minPosition} onChange={(event) => setMax(maximumFromInput(Number(event.currentTarget.value)))} onKeyUp={(event) => commit(min, maximumFromInput(Number(event.currentTarget.value)))} onPointerUp={(event) => commit(min, maximumFromInput(Number(event.currentTarget.value)))} step={1} style={{ zIndex: 2 }} type="range" value={maxPosition} />
    </div>
  </div>;
}

function CatalogEventCard({ event, index }: { event: PublicEventSummary; index: number }) {
  const copy = useHomeCopy();
  const locale = useLocale();
  const { formatMoney } = useDisplayCurrency();
  return <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-lg"><Link className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500" href={`/events/${event.id}`}><div className="relative aspect-[1.6] overflow-hidden bg-slate-200"><PosterImage alt="" fallbackIndex={index} src={event.posterUrl} /><div className="absolute left-2 top-2"><AvailabilityBadge status={event.saleStatus} /></div><span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-md bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">{copy.categories[event.category]}</span><AgeRestrictionBadge age={event.ageRestriction} className="absolute bottom-2 right-2" /></div><div className="flex flex-1 flex-col justify-between gap-3 p-4"><div><p className="flex items-center gap-1.5 text-xs font-medium text-violet-700"><CalendarIcon />{formatEventDate(event, locale)}</p><h3 className="mt-1.5 line-clamp-2 text-sm font-bold leading-5 transition group-hover:text-violet-700">{event.title}</h3><ContentLanguageNote contentLocale={event.contentLocale} /><p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500"><PinIcon /><span className="truncate">{event.venueName}</span></p></div><div className="flex items-end justify-between gap-2 border-t border-slate-100 pt-2"><div><p className="text-[10px] uppercase tracking-wide text-slate-400">{event.paymentMode === "deposit" ? copy.deposit : copy.cost}</p><p className="mt-0.5 text-sm font-bold">{formatPrice(event, formatMoney, locale)}</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">{copy.tickets}</span></div></div></Link><FavoriteButton eventId={event.id} compact /></article>;
}

function AvailabilityBadge({ status }: { status: PublicEventSummary["saleStatus"] }) { const copy = useHomeCopy(); const styles = status === "few_left" ? "bg-rose-600 text-white" : status === "available" ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"; return <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${styles}`}>{copy.saleStatuses[status]}</span>; }

function PosterImage({ src, fallbackIndex, alt, position }: { src: string | null; fallbackIndex: number; alt: string; position?: string }) { const fallback = REFERENCE_POSTERS[fallbackIndex % REFERENCE_POSTERS.length] ?? REFERENCE_POSTERS[0]!; const [source, setSource] = useState(src || fallback); useEffect(() => setSource(src || fallback), [src, fallback]); return <img alt={alt} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" onError={() => setSource(fallback)} src={source} style={position ? { objectPosition: position } : undefined} />; }

function HomeSkeleton() { const copy = useHomeCopy(); return <div aria-label={copy.loadingEvents} className="space-y-6"><div className="h-[390px] animate-pulse rounded-2xl bg-[#e2e8f8]" /><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-80 animate-pulse rounded-xl bg-[#e2e8f8]" key={index} />)}</div></div>; }
function HomeFooter() { const copy = useHomeCopy(); return <footer className="mt-14 border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-8 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center lg:px-8"><div className="flex flex-wrap items-center gap-3"><Link className="text-lg font-extrabold tracking-tight text-[#6320ee]" href="/">TICKET</Link><span className="text-slate-300">|</span><span>© {new Date().getFullYear()} {copy.footerTagline}</span></div><nav aria-label={copy.footerLinks} className="flex flex-wrap gap-x-6 gap-y-2"><Link className="hover:text-violet-700" href="/organizer/events">{copy.forOrganizers}</Link><Link className="hover:text-violet-700" href="/favorites">{copy.favorites}</Link></nav></div></footer>; }

function formatPrice(event: PublicEventSummary, formatMoney: (amount: number, currency: string) => string, locale: EventLocale): string {
  const copy = HOME_COPY[locale];
  const unit = (value: string | null) => value === "table" ? copy.tableUnit : value === "seat" ? copy.seatUnit : copy.ticketUnit;
  if (event.startingPrices.length > 1) {
    return event.startingPrices.map((item) => `${copy.from} ${formatMoney(item.amount, item.currency)} ${unit(item.unit)}`).join(" · ");
  }
  if (event.startingAmount === null) {
    return ["sold_out", "sales_ended", "temporarily_unavailable"].includes(event.saleStatus)
      ? copy.saleStatuses[event.saleStatus] : copy.priceUnknown;
  }
  if (event.startingAmount === 0) return copy.free;
  return `${copy.from} ${formatMoney(event.startingAmount, event.startingCurrency ?? "KZT")} ${unit(event.startingUnit)}`;
}
function formatEventDate(event: PublicEventSummary, locale: EventLocale): string { const date = new Date(`${event.date}T00:00:00Z`); const formatted = new Intl.DateTimeFormat(INTL_LOCALES[locale], { day: "numeric", month: "long", timeZone: "UTC" }).format(date); return `${formatted}, ${event.time.slice(0, 5)}`; }

function CarouselChevron({ direction }: { direction: "left" | "right" }) { return <svg aria-hidden="true" className="size-10 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]" fill="none" viewBox="0 0 40 40"><path d={direction === "left" ? "m25 7-13 13 13 13" : "m15 7 13 13-13 13"} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" /></svg>; }
function SortIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24"><path d="M4 6h16M4 12h11M4 18h6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /><path d="m17 15 3 3 3-3M20 10v8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>; }
function CurrencyIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-violet-600" fill="none" viewBox="0 0 24 24"><circle cx="10" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M10 8v8m-2-6h4m-4 4h4M16 5.5a7 7 0 0 1 0 13" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>; }
function GridIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="7" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /><rect x="11" y="11" width="7" height="7" rx="1.5" /></svg>; }
function PinIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#713dcc]" fill="none" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2"/></svg>; }
function CalendarIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#713dcc]" fill="none" viewBox="0 0 24 24"><rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5"/><path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>; }
function ArrowIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>; }
