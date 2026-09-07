"use client";

import { EVENT_CATEGORIES, ru, type EventCategory } from "@event-platform/shared-types";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { fetchPublicEvents, type PublicEventsQuery } from "../lib/public-events";
import { EmptyState, ErrorState, EventCard, LoadingGrid } from "./ui";

const DEFAULT_QUERY: PublicEventsQuery = { page: 1, limit: 12, sort: "recent" };
const CITY_OPTIONS = ["Алматы", "Астана", "Шымкент"];

export function PublicEventsBrowser() {
  const [query, setQuery] = useState<PublicEventsQuery>(readInitialQuery);
  const [searchInput, setSearchInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchPublicEvents>> | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setSearchInput(query.search ?? "");
    setCityInput(query.city ?? "");
  }, [query.search, query.city]);

  useEffect(() => {
    const onPopState = () => setQuery(readInitialQuery());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void fetchPublicEvents(query)
      .then((next) => { if (active) setResult(next); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });

    const params = new URLSearchParams();
    if (query.page && query.page > 1) params.set("page", String(query.page));
    if (query.sort && query.sort !== "recent") params.set("sort", query.sort);
    for (const key of ["search", "from", "to", "city", "category", "datePreset", "paymentMode"] as const) {
      const value = query[key];
      if (value) params.set(key, String(value));
    }
    if (query.free !== undefined) params.set("free", String(query.free));
    window.history.replaceState(null, "", params.toString() ? `/events?${params.toString()}` : "/events");
    return () => { active = false; };
  }, [query]);

  function update(next: Partial<PublicEventsQuery>): void {
    setQuery((current) => ({ ...current, ...next, page: next.page ?? 1 }));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    update({ search: searchInput.trim() || undefined, city: cityInput.trim() || undefined });
  }

  function reset(): void {
    setQuery(DEFAULT_QUERY);
    setSearchInput("");
    setCityInput("");
  }

  const selected = useMemo(() => selectedFilters(query), [query]);
  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  return <>
    <form className="mt-8 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm" onSubmit={submitSearch}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto]">
        <label className="grid gap-1 text-xs font-semibold text-zinc-600"><span className="sr-only">Поиск событий</span><input className="min-w-0 rounded-xl border border-zinc-300 px-4 py-3 text-base font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" maxLength={120} onChange={(event) => setSearchInput(event.target.value)} placeholder={ru.publicEvent.searchPlaceholder} value={searchInput} /></label>
        <label className="grid gap-1 text-xs font-semibold text-zinc-600"><span className="sr-only">{ru.publicEvent.city}</span><input className="rounded-xl border border-zinc-300 px-4 py-3 text-base font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" list="event-cities" maxLength={120} onChange={(event) => setCityInput(event.target.value)} placeholder={ru.home.cityPlaceholder} value={cityInput} /><datalist id="event-cities">{CITY_OPTIONS.map((city) => <option key={city} value={city} />)}</datalist></label>
        <button className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" type="submit">{ru.publicEvent.find}</button>
      </div>

      <button aria-expanded={filtersOpen} className="mt-4 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" onClick={() => setFiltersOpen((value) => !value)} type="button">{filtersOpen ? ru.publicEvent.filtersClose : ru.publicEvent.filtersOpen}</button>
      <div className={`${filtersOpen ? "grid" : "hidden"} mt-4 gap-4 md:grid md:grid-cols-2 lg:grid-cols-4`}>
        <label className="grid gap-1 text-xs font-semibold text-zinc-600">{ru.publicEvent.category}<select aria-label={ru.publicEvent.category} className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" onChange={(event) => update({ category: event.target.value ? event.target.value as EventCategory : undefined })} value={query.category ?? ""}><option value="">{ru.publicEvent.allCategories}</option>{EVENT_CATEGORIES.map((category) => <option key={category} value={category}>{ru.events.categories[category]}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-zinc-600">{ru.publicEvent.fromDate}<input aria-label={ru.publicEvent.fromDate} className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" onChange={(event) => update({ from: event.target.value || undefined })} type="date" value={query.from ?? ""} /></label>
        <label className="grid gap-1 text-xs font-semibold text-zinc-600">{ru.publicEvent.toDate}<input aria-label={ru.publicEvent.toDate} className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" onChange={(event) => update({ to: event.target.value || undefined })} type="date" value={query.to ?? ""} /></label>
        <label className="grid gap-1 text-xs font-semibold text-zinc-600">{ru.publicEvent.sortLabel}<select aria-label={ru.publicEvent.sortLabel} className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" onChange={(event) => update({ sort: event.target.value as "recent" | "popular" })} value={query.sort ?? "recent"}><option value="recent">{ru.publicEvent.sortRecent}</option><option value="popular">{ru.publicEvent.sortPopular}</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label={ru.publicEvent.quickFilters}>
        <QuickFilter active={query.datePreset === "today"} label={ru.publicEvent.today} onClick={() => update({ datePreset: query.datePreset === "today" ? undefined : "today" })} />
        <QuickFilter active={query.datePreset === "weekend"} label={ru.publicEvent.weekend} onClick={() => update({ datePreset: query.datePreset === "weekend" ? undefined : "weekend" })} />
        <QuickFilter active={query.free === true} label={ru.publicEvent.free} onClick={() => update(query.free === true ? { free: undefined } : { free: true, paymentMode: undefined })} />
        <QuickFilter active={query.paymentMode === "deposit"} label={ru.publicEvent.deposit} onClick={() => update(query.paymentMode === "deposit" ? { paymentMode: undefined } : { paymentMode: "deposit", free: undefined })} />
        <QuickFilter active={query.paymentMode === "full_payment"} label={ru.publicEvent.fullPayment} onClick={() => update(query.paymentMode === "full_payment" ? { paymentMode: undefined } : { paymentMode: "full_payment", free: undefined })} />
        {selected.length > 0 ? <button className="ml-auto rounded-xl px-3 py-2 text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" onClick={reset} type="button">{ru.publicEvent.resetFilters}</button> : null}
      </div>
      {selected.length > 0 ? <div className="mt-3 flex flex-wrap gap-2" aria-label={ru.publicEvent.selectedFilters}>{selected.map((filter) => <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800" key={filter}>{filter}</span>)}</div> : null}
    </form>

    <div className="mt-8" aria-live="polite">
      {loading ? <LoadingGrid /> : error ? <ErrorState message={ru.publicEvent.loadFailed} onRetry={() => setQuery((current) => ({ ...current }))} /> : result?.items.length === 0 ? <EmptyState title={ru.publicEvent.noSearchResults} description={ru.publicEvent.noSearchResultsDescription} action={<button className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white" onClick={reset} type="button">{ru.publicEvent.resetFilters}</button>} /> : <><p className="mb-4 text-sm text-zinc-600">{ru.publicEvent.resultCount}: {result?.total}</p><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{result?.items.map((event) => <EventCard event={event} key={event.id} />)}</div></>}
    </div>
    {result && result.total > result.limit ? <nav aria-label="Пагинация событий" className="mt-8 flex items-center justify-between"><button className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" disabled={query.page === 1} onClick={() => update({ page: Math.max(1, (query.page ?? 1) - 1) })} type="button">{ru.common.previous}</button><span className="text-sm text-zinc-600">{query.page} {ru.events.of} {pageCount}</span><button className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" disabled={!result.hasNext} onClick={() => update({ page: (query.page ?? 1) + 1 })} type="button">{ru.common.next}</button></nav> : null}
  </>;
}

function QuickFilter({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={`rounded-full border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400"}`} onClick={onClick} type="button">{label}</button>;
}

function selectedFilters(query: PublicEventsQuery): string[] {
  const filters: string[] = [];
  if (query.city) filters.push(`${ru.publicEvent.city}: ${query.city}`);
  if (query.category) filters.push(ru.events.categories[query.category as EventCategory]);
  if (query.datePreset) filters.push(query.datePreset === "today" ? ru.publicEvent.today : ru.publicEvent.weekend);
  if (query.free) filters.push(ru.publicEvent.free);
  if (query.paymentMode) filters.push(query.paymentMode === "deposit" ? ru.publicEvent.deposit : ru.publicEvent.fullPayment);
  if (query.from || query.to) filters.push(`${query.from ?? "…"} — ${query.to ?? "…"}`);
  return filters;
}

function readInitialQuery(): PublicEventsQuery {
  if (typeof window === "undefined") return DEFAULT_QUERY;
  const params = new URLSearchParams(window.location.search);
  return {
    page: Math.max(1, Number(params.get("page") ?? 1) || 1),
    limit: 12,
    sort: params.get("sort") === "popular" ? "popular" : "recent",
    search: params.get("search") || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    city: params.get("city") || undefined,
    category: EVENT_CATEGORIES.includes(params.get("category") as EventCategory) ? params.get("category") as EventCategory : undefined,
    datePreset: params.get("datePreset") === "today" || params.get("datePreset") === "weekend" ? params.get("datePreset") as "today" | "weekend" : undefined,
    paymentMode: params.get("paymentMode") === "deposit" || params.get("paymentMode") === "full_payment" ? params.get("paymentMode") as "deposit" | "full_payment" : undefined,
    free: params.get("free") === "true" ? true : undefined,
  };
}
