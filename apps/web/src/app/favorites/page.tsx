"use client";

import { ru, type FavoriteList } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { apiRequest } from "../(auth)/_lib/api";
import { EventCard, PageShell, EmptyState, ErrorState, LoadingGrid, SectionHeading } from "../../components/ui";
import { mergeLocalFavorites } from "../../lib/favorites";
import { fetchPublicEvent, publicEventToSummary } from "../../lib/public-events";
import { readLocalFavoriteIds } from "../../lib/local-preferences";
import { getSession } from "../(auth)/_lib/session";

const LIMIT = 12;

export default function FavoritesPage() {
  return <PageShell><FavoritesContent /></PageShell>;
}

function FavoritesContent() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<FavoriteList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    const load = getSession()
      ? mergeLocalFavorites().then(() => apiRequest<FavoriteList>(`/me/favorites?page=${page}&limit=${LIMIT}`))
      : Promise.all(readLocalFavoriteIds().map((id) => fetchPublicEvent(id).then(publicEventToSummary).catch(() => null))).then((items) => {
        const visible = items.filter((item): item is FavoriteList["items"][number] => item !== null);
        return { items: visible, page: 1, limit: LIMIT, total: visible.length, hasNext: false };
      });
    void load
      .then((next) => { if (active) setResult(next); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  return <>
    <SectionHeading title={ru.favorites.title} description={ru.favorites.description} action={<Link className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" href="/events">{ru.favorites.showEvents}</Link>} />
    <div className="mt-8" aria-live="polite">{loading ? <LoadingGrid /> : error ? <ErrorState message={ru.favorites.loadFailed} onRetry={() => setPage((current) => current)} /> : result?.items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{result.items.map((event) => <EventCard event={event} key={event.id} />)}</div> : <EmptyState title={ru.favorites.empty} description={ru.favorites.emptyDescription} action={<Link className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white" href="/events">{ru.favorites.showEvents}</Link>} />}</div>
    {result && result.total > result.limit ? <nav aria-label="Пагинация избранного" className="mt-8 flex items-center justify-between"><button className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold disabled:opacity-40" disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">{ru.common.previous}</button><span className="text-sm text-zinc-600">{page} {ru.events.of} {Math.ceil(result.total / result.limit)}</span><button className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold disabled:opacity-40" disabled={!result.hasNext} onClick={() => setPage((current) => current + 1)} type="button">{ru.common.next}</button></nav> : null}
  </>;
}
