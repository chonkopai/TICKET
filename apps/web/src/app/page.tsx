"use client";

import { EVENT_CATEGORIES, ru, type PublicEventSummary } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { EventCard, ErrorState, LoadingGrid, PageShell } from "../components/ui";
import { fetchPublicEvent, fetchPublicEvents, publicEventToSummary } from "../lib/public-events";
import { readRecentlyViewedIds } from "../lib/local-preferences";

type Sections = { city: PublicEventSummary[]; weekend: PublicEventSummary[]; free: PublicEventSummary[]; recent: PublicEventSummary[]; few: PublicEventSummary[]; viewed: PublicEventSummary[] };

export default function HomePage() {
  const [sections, setSections] = useState<Sections | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("Алматы");
  const [viewedIds, setViewedIds] = useState<string[]>([]);

  useEffect(() => {
    const ids = readRecentlyViewedIds();
    setViewedIds(ids);
    let active = true;
    void Promise.all([
      fetchPublicEvents({ sort: "popular", limit: 8, city: "Алматы" }),
      fetchPublicEvents({ datePreset: "weekend", limit: 8 }),
      fetchPublicEvents({ free: true, limit: 8 }),
      fetchPublicEvents({ sort: "recent", limit: 8 }),
    ]).then(async ([cityResult, weekendResult, freeResult, recentResult]) => {
      const viewed = await loadViewed(ids);
      if (active) setSections({ city: cityResult.items, weekend: weekendResult.items, free: freeResult.items, recent: recentResult.items, few: recentResult.items.filter((item) => item.saleStatus === "few_left"), viewed });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  // Read local history once on mount; a later visit is picked up on the next page load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (city) params.set("city", city);
    window.location.assign(`/events?${params.toString()}`);
  }

  const renderedSections = useMemo(() => {
    if (!sections) return null;
    const seen = new Set<string>();
    const takeUnique = (items: PublicEventSummary[]) => items.filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
    return { city: takeUnique(sections.city), weekend: takeUnique(sections.weekend), free: takeUnique(sections.free), recent: takeUnique(sections.recent), few: takeUnique(sections.few), viewed: sections.viewed.filter((item) => !seen.has(item.id)) };
  }, [sections]);

  return <PageShell>
    <section className="relative overflow-hidden rounded-[2rem] bg-indigo-950 px-6 py-12 text-white shadow-xl sm:px-12 sm:py-16">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" />
      <div className="relative max-w-3xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">{ru.home.title}</h1><p className="mt-5 max-w-xl text-lg leading-8 text-indigo-100">{ru.home.description}</p>
        <form className="mt-8 grid gap-3 rounded-2xl bg-white/10 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]" onSubmit={submit}><label className="sr-only" htmlFor="home-search">{ru.home.searchPlaceholder}</label><input className="rounded-xl border-0 bg-white px-4 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-white" id="home-search" onChange={(event) => setSearch(event.target.value)} placeholder={ru.home.searchPlaceholder} value={search} /><select aria-label={ru.home.cityPlaceholder} className="rounded-xl border-0 bg-white px-3 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-white" onChange={(event) => setCity(event.target.value)} value={city}><option value="">{ru.home.allCities}</option><option value="Алматы">Алматы</option><option value="Астана">Астана</option><option value="Шымкент">Шымкент</option></select><button className="rounded-xl bg-white px-5 py-3 font-semibold text-indigo-950 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" type="submit">{ru.home.searchAction}</button></form>
      </div>
    </section>
    <div className="mt-8 overflow-x-auto pb-2"><div className="flex min-w-max gap-2" aria-label={ru.home.categoryTitle}>{EVENT_CATEGORIES.map((category) => <Link className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-indigo-500 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" href={`/events?category=${category}`} key={category}>{ru.events.categories[category]}</Link>)}</div></div>
    {error ? <div className="mt-10"><ErrorState message={ru.publicEvent.loadFailed} onRetry={() => window.location.reload()} /></div> : null}
    {!renderedSections && !error ? <div className="mt-12"><LoadingGrid /></div> : null}
    {renderedSections ? <>
      <EventSection title={`${ru.home.popularInCity}: Алматы`} events={renderedSections.city} />
      <EventSection title={ru.home.weekend} events={renderedSections.weekend} />
      <EventSection title={ru.home.freeEvents} events={renderedSections.free} />
      <EventSection title={ru.home.newEvents} events={renderedSections.recent} />
      <EventSection title={ru.home.fewLeft} events={renderedSections.few} />
      {viewedIds.length > 0 ? <EventSection title={ru.home.recentlyViewed} events={renderedSections.viewed} /> : null}
    </> : null}
  </PageShell>;
}

function EventSection({ title, events }: { title: string; events: PublicEventSummary[] }) {
  if (events.length === 0) return null;
  return <section className="mt-12"><div className="flex items-end justify-between gap-4"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2><Link className="text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline" href="/events">{ru.home.showAll}</Link></div><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard event={event} key={event.id} />)}</div></section>;
}

async function loadViewed(ids: string[]): Promise<PublicEventSummary[]> {
  const events = await Promise.all(ids.slice(0, 12).map((id) => fetchPublicEvent(id).then(publicEventToSummary).catch(() => null)));
  return events.filter((event): event is PublicEventSummary => event !== null);
}
