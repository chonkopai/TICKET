"use client";

import { INTL_LOCALES, localeFromBrowser } from "../lib/locale";

import { EVENT_CATEGORIES, type EventCategory, type EventLocale, type PublicEventSummary } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AfishaCalendar } from "../components/afisha-calendar";
import { DateStrip } from "../components/date-strip";
import { AgeRestrictionBadge } from "../components/age-restriction-badge";
import { FavoriteButton } from "../components/favorite-button";
import { OptionPicker } from "../components/option-picker";
import { useDisplayCurrency } from "../components/currency-provider";
import { ErrorState } from "../components/ui";
import { CATALOG_CITY_SELECTED, CATALOG_QUERY_UPDATED } from "../lib/catalog-query-events";
import { fetchPublicEvents, type PublicEventsQuery } from "../lib/public-events";
import { useLocale } from "../components/locale-provider";
import { HOME_COPY } from "./home-copy";
import { ContentLanguageNote } from "../components/content-language-note";
import { cityName, countryName } from "../lib/countries";
import { rememberCatalogLocation, savedCatalogLocation, validCountryCode } from "../lib/catalog-location";

function useHomeCopy() { return HOME_COPY[useLocale()]; }

const DEFAULT_CITY = "Алматы";
const CITY_HEADING_NAMES: Record<string, string> = { Алматы: "Алматы", Астана: "Астане", Шымкент: "Шымкенте" };
const PAGE_SIZE = 18;
const FEATURED_COUNT = 6;
const REFERENCE_POSTERS = Array.from({ length: 9 }, (_, index) => `/reference-events/event-${index + 1}.jpg`);
const CATEGORY_ICONS: Record<EventCategory, string> = { music: "🎵", nightlife: "✨", festival: "🎪", comedy: "😄", theatre: "🎭", business: "📊", education: "🎓", workshop: "🛠️", sport: "🏟️", family: "👨‍👩‍👧", food: "🍽️", other: "✨" };
const DEFAULT_QUERY: PublicEventsQuery = { countryCode: "KZ", city: DEFAULT_CITY, sort: "popular" };

function readHomeQuery(): PublicEventsQuery {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const datePreset = params.get("datePreset");
  const paymentMode = params.get("paymentMode");
  const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  const free = params.get("free") === "true";
  const price = (value: string | null) => value !== null && /^\d+$/.test(value) && Number(value) <= 1_000_000 ? Number(value) : undefined;
  const saved = !params.has("countryCode") && !params.has("city") ? savedCatalogLocation() : null;
  const countryCode = validCountryCode(params.get("countryCode")) ?? saved?.countryCode ?? "KZ";
  return {
    countryCode,
    city: params.has("city") ? params.get("city") ?? "" : saved?.city ?? (countryCode === "KZ" ? DEFAULT_CITY : ""),
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
  return Boolean(query.search || query.category || query.datePreset || query.from || query.to || query.free || query.paymentMode || query.minPrice !== undefined || query.maxPrice !== undefined || query.countryCode !== "KZ" || query.city !== DEFAULT_CITY || query.sort === "recent");
}

function queryUrl(query: PublicEventsQuery): string {
  const params = new URLSearchParams(window.location.search);
  for (const key of ["countryCode", "city", "sort", "search", "category", "datePreset", "from", "to", "paymentMode", "free", "minPrice", "maxPrice"]) params.delete(key);
  params.set("lang", localeFromBrowser());
  if (query.countryCode && query.countryCode !== "KZ") params.set("countryCode", query.countryCode);
  if (query.city !== DEFAULT_CITY || query.countryCode !== "KZ") params.set("city", query.city ?? "");
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

export default function HomePage() {
  const locale = useLocale();
  const copy = useHomeCopy();
  const [query, setQuery] = useState<PublicEventsQuery>(DEFAULT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState<PublicEventSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const restore = () => {
      const next = readHomeQuery();
      setQuery(next);
      setSearchInput(next.search ?? "");
      setPage(1);
    };
    restore();
    setReady(true);
    window.addEventListener("popstate", restore);
    window.addEventListener(CATALOG_CITY_SELECTED, restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener(CATALOG_CITY_SELECTED, restore);
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
    if (page === 1) { setEvents(null); setTotal(0); setHasNext(false); }
    void fetchPublicEvents({ ...query, page, limit: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setEvents((current) => page === 1 ? result.items : [...(current ?? []), ...result.items.filter((item) => !current?.some((existing) => existing.id === item.id))]);
        setTotal(result.total);
        setHasNext(result.hasNext);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, page, ready, retry]);

  function update(next: Partial<PublicEventsQuery>) {
    const changed = { ...query, ...next };
    setQuery(changed);
    setPage(1);
    window.history.pushState(null, "", queryUrl(changed));
    window.dispatchEvent(new Event(CATALOG_QUERY_UPDATED));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({ search: searchInput.trim() || undefined });
  }

  function reset() {
    setSearchInput("");
    rememberCatalogLocation({ countryCode: "KZ", city: DEFAULT_CITY });
    update({ ...DEFAULT_QUERY, search: undefined, category: undefined, datePreset: undefined, from: undefined, to: undefined, free: undefined, paymentMode: undefined, minPrice: undefined, maxPrice: undefined });
  }

  const filtered = hasActiveFilters(query);
  const featured = !filtered ? events?.slice(0, FEATURED_COUNT) ?? [] : [];
  const catalog = events?.slice(featured.length) ?? [];
  const city = query.city ?? DEFAULT_CITY;
  const countryCode = query.countryCode ?? "KZ";

  return <main className="min-h-screen bg-[#fafbff] text-[#111827]">
    <section className="relative px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 border-b border-slate-200/80 pb-5 md:flex-row md:items-end md:justify-between">
          <div><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{allTotal ?? "—"} {copy.online}</span><h1 className="mt-2 max-w-4xl text-[2rem] font-extrabold leading-[1.15] tracking-[-0.03em] sm:text-5xl">{city ? `${copy.headingCity} ${locale === "ru" ? CITY_HEADING_NAMES[city] ?? city : cityName(city, locale)}${countryCode === "KZ" ? "" : ` · ${countryName(countryCode, locale)}`}` : `${copy.heading} — ${countryName(countryCode, locale)}`}</h1></div>
        </div>
        <form className="mt-6 flex gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] focus-within:ring-2 focus-within:ring-violet-200" onSubmit={submit}><label className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5"><SearchIcon /><span className="sr-only">{copy.searchLabel}</span><input className="w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400" maxLength={120} onChange={(event) => setSearchInput(event.target.value)} placeholder={copy.searchPlaceholder} value={searchInput} /></label><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#6320ee] px-5 font-semibold text-white transition hover:bg-[#4f16c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2" type="submit"><FilterIcon />{copy.search}</button></form>
        <div className="relative mt-5 flex items-start gap-2"><nav aria-label={copy.categoriesLabel} className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"><CategoryButton active={!query.category} count={allTotal ?? undefined} onClick={() => update({ category: undefined })} /><>{EVENT_CATEGORIES.slice(0, 7).map((category) => <CategoryButton active={query.category === category} category={category} count={query.category === category ? total : undefined} key={category} onClick={() => update({ category })} />)}</></nav>{query.category && (EVENT_CATEGORIES as readonly string[]).indexOf(query.category) >= 7 ? <CategoryButton active category={query.category as EventCategory} count={total} onClick={() => update({ category: undefined })} /> : null}<CategoryMenu active={query.category as EventCategory | undefined} count={query.category ? total : undefined} onSelect={(category) => update({ category })} /></div>
        <CatalogFilters query={query} onUpdate={update} onReset={reset} />
      </div>
    </section>
    <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
      {error ? <div className="mt-5"><ErrorState message={copy.loadFailed} onRetry={() => setRetry((value) => value + 1)} /></div> : null}
      {!events && !error ? <HomeSkeleton /> : null}
      {events && !error ? <>
        {featured.length ? <FeaturedCarousel events={featured} /> : null}
        {!filtered && !featured.length ? <EmptyCatalog onShowAll={() => update({ city: "" })} /> : null}
        {filtered || catalog.length > 0 ? <section className="mt-6" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="text-xl font-bold tracking-tight">{filtered ? copy.results : copy.current}</h2><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">{total}</span></div><p className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{copy.liveBooking}</p></div>
          {catalog.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{catalog.map((event, index) => <CatalogEventCard event={event} index={index + 1} key={event.id} />)}</div> : <p className="mt-5 rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">{copy.emptyResults}</p>}
          {hasNext ? <div className="mt-9 flex justify-center"><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-medium shadow-sm transition hover:border-violet-400 hover:text-violet-700 disabled:opacity-50" disabled={loading} onClick={() => setPage((value) => value + 1)} type="button">{loading ? copy.loading : copy.showMore} <ChevronIcon /></button></div> : null}
        </section> : null}
      </> : null}
    </div>
    <HomeFooter />
  </main>;
}

function CategoryButton({ category, active, onClick, count }: { category?: EventCategory; active: boolean; onClick: () => void; count?: number | undefined }) {
  const copy = useHomeCopy();
  return <button aria-pressed={active} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:border-violet-400 hover:text-violet-700"}`} onClick={onClick} type="button">{category ? <><span aria-hidden="true" className="text-base">{CATEGORY_ICONS[category]}</span>{copy.categories[category]}{active && count !== undefined ? <span className="rounded-full bg-slate-200/80 px-1.5 text-[11px] text-slate-700">{count}</span> : null}</> : <><GridIcon />{copy.all}{count !== undefined ? <span className="rounded-full bg-slate-200/80 px-1.5 text-[11px] text-slate-700">{count}</span> : null}</>}</button>;
}

function CategoryMenu({ active, count, onSelect }: { active: EventCategory | undefined; count?: number | undefined; onSelect: (category: EventCategory | undefined) => void }) {
  const copy = useHomeCopy();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="relative shrink-0" ref={container}><button aria-expanded={open} aria-haspopup="menu" aria-label={copy.allCategories} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-xl font-bold text-slate-700 shadow-sm hover:border-violet-400 focus-visible:outline-2 focus-visible:outline-violet-500" onClick={() => setOpen((value) => !value)} type="button">⋯</button>{open ? <div aria-label={copy.allCategories} className="absolute right-0 top-full z-40 mt-2 grid max-h-80 w-56 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl" role="menu"><button className="rounded-lg px-3 py-2 text-left text-sm hover:bg-violet-50" onClick={() => { onSelect(undefined); setOpen(false); }} role="menuitem" type="button">{copy.allCategories}</button>{EVENT_CATEGORIES.map((category) => <button aria-current={active === category ? "true" : undefined} className={`rounded-lg px-3 py-2 text-left text-sm hover:bg-violet-50 ${active === category ? "bg-violet-50 font-semibold text-violet-700" : "text-slate-700"}`} key={category} onClick={() => { onSelect(category); setOpen(false); }} role="menuitem" type="button">{CATEGORY_ICONS[category]} {copy.categories[category]}{active === category && count !== undefined ? ` · ${count}` : ""}</button>)}</div> : null}</div>;
}

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
    <div className="relative z-[1] flex min-h-[350px] max-w-[720px] flex-col justify-between p-6 sm:p-9 lg:p-10"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#6320ee] px-3 py-1 text-[10px] font-bold uppercase tracking-wide">{copy.editorsChoice}</span><AvailabilityBadge status={event.saleStatus} /><span className="text-[11px] font-medium uppercase tracking-wide text-slate-300">{copy.categories[event.category]}</span></div><h2 className="mt-4 text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl">{event.title}</h2><ContentLanguageNote contentLocale={event.contentLocale} />{event.announcement ? <p className="mt-3 max-w-lg text-sm leading-6 text-slate-100">{event.announcement}</p> : null}</div><div className="mt-6 border-t border-white/10 pt-5"><p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium"><span className="inline-flex items-center gap-1.5"><CalendarIcon />{formatEventDate(event, locale)}</span><span className="inline-flex items-center gap-1.5"><PinIcon />{event.venueName}</span></p><div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] uppercase tracking-wide text-slate-300">{event.paymentMode === "deposit" ? copy.deposit : copy.tickets}</p><p className="mt-1 text-2xl font-extrabold leading-tight">{formatPrice(event, formatMoney, locale)}</p></div><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#6320ee] px-5 text-sm font-semibold text-white shadow-[0_10px_25px_-5px_rgba(99,32,238,0.3)] transition hover:bg-[#4f16c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" href={`/events/${event.id}`}>{copy.chooseSeats} <ArrowIcon /></Link></div></div></div><AgeRestrictionBadge age={event.ageRestriction} className="absolute bottom-4 right-4 z-[2]" /><FavoriteButton eventId={event.id} />
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
            <span className={chipClassName}>{countryName(query.countryCode ?? "KZ", locale)} · {query.city ? cityName(query.city, locale) : copy.allCities}</span>
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
  return <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-lg"><Link className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500" href={`/events/${event.id}`}><div className="relative aspect-[1.6] overflow-hidden bg-slate-200"><PosterImage alt="" fallbackIndex={index} src={event.posterUrl} /><div className="absolute left-2 top-2"><AvailabilityBadge status={event.saleStatus} /></div><span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-md bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">{copy.categories[event.category]}</span><AgeRestrictionBadge age={event.ageRestriction} className="absolute bottom-2 right-4" /></div><div className="flex flex-1 flex-col justify-between gap-3 p-4"><div><p className="flex items-center gap-1.5 text-xs font-medium text-violet-700"><CalendarIcon />{formatEventDate(event, locale)}</p><h3 className="mt-1.5 line-clamp-2 text-sm font-bold leading-5 transition group-hover:text-violet-700">{event.title}</h3><ContentLanguageNote contentLocale={event.contentLocale} /><p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500"><PinIcon /><span className="truncate">{event.venueName}</span></p></div><div className="flex items-end justify-between gap-2 border-t border-slate-100 pt-2"><div><p className="text-[10px] uppercase tracking-wide text-slate-400">{event.paymentMode === "deposit" ? copy.deposit : copy.cost}</p><p className="mt-0.5 text-sm font-bold">{formatPrice(event, formatMoney, locale)}</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">{copy.tickets}</span></div></div></Link><FavoriteButton eventId={event.id} /></article>;
}

function AvailabilityBadge({ status }: { status: PublicEventSummary["saleStatus"] }) { const copy = useHomeCopy(); const styles = status === "few_left" ? "bg-rose-600 text-white" : status === "available" ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"; return <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${styles}`}>{copy.saleStatuses[status]}</span>; }

function PosterImage({ src, fallbackIndex, alt, position }: { src: string | null; fallbackIndex: number; alt: string; position?: string }) { const fallback = REFERENCE_POSTERS[fallbackIndex % REFERENCE_POSTERS.length] ?? REFERENCE_POSTERS[0]!; const [source, setSource] = useState(src || fallback); useEffect(() => setSource(src || fallback), [src, fallback]); return <img alt={alt} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" onError={() => setSource(fallback)} src={source} style={position ? { objectPosition: position } : undefined} />; }

function EmptyCatalog({ onShowAll }: { onShowAll: () => void }) { const copy = useHomeCopy(); return <div className="mt-4 rounded-2xl bg-white p-10 text-center shadow-sm"><h2 className="text-2xl font-bold">{copy.emptyTitle}</h2><p className="mt-2 text-[#4a4453]">{copy.emptyDescription}</p><button className="mt-5 inline-flex rounded-xl bg-[#6320ee] px-5 py-3 font-semibold text-white" onClick={onShowAll} type="button">{copy.allCities}</button></div>; }
function HomeSkeleton() { const copy = useHomeCopy(); return <div aria-label={copy.loadingEvents} className="space-y-6"><div className="h-[390px] animate-pulse rounded-2xl bg-[#e2e8f8]" /><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-80 animate-pulse rounded-xl bg-[#e2e8f8]" key={index} />)}</div></div>; }
function HomeFooter() { const copy = useHomeCopy(); return <footer className="mt-14 border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-8 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center lg:px-8"><div className="flex flex-wrap items-center gap-3"><Link className="text-lg font-extrabold tracking-tight text-[#6320ee]" href="/">TICKET</Link><span className="text-slate-300">|</span><span>© {new Date().getFullYear()} {copy.footerTagline}</span></div><nav aria-label={copy.footerLinks} className="flex flex-wrap gap-x-6 gap-y-2"><Link className="hover:text-violet-700" href="/organizer/events">{copy.forOrganizers}</Link><Link className="hover:text-violet-700" href="/my-events">{copy.myEvents}</Link><Link className="hover:text-violet-700" href="/favorites">{copy.favorites}</Link></nav></div></footer>; }

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
function SearchIcon() { return <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-[#4a4453]" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>; }
function FilterIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="M4 5h16l-6.5 7.5V19l-3 2v-8.5L4 5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /></svg>; }
function GridIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="7" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /><rect x="11" y="11" width="7" height="7" rx="1.5" /></svg>; }
function ChevronIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>; }
function PinIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#713dcc]" fill="none" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2"/></svg>; }
function CalendarIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#713dcc]" fill="none" viewBox="0 0 24 24"><rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5"/><path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>; }
function ArrowIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>; }
