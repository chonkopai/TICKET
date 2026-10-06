"use client";

import { type EventLocale, type FavoriteList } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

import { apiRequest } from "../app/(auth)/_lib/api";
import { EventCard, EmptyState, ErrorState, LoadingGrid, SectionHeading } from "./ui";
import { mergeLocalFavorites } from "../lib/favorites";
import { fetchPublicEventSummary } from "../lib/public-events";
import { readLocalFavoriteIds } from "../lib/local-preferences";
import { getSession } from "../app/(auth)/_lib/session";
import { useLocale } from "./locale-provider";

const COPY: Record<EventLocale, { title: string; description: string; failed: string; empty: string; emptyDescription: string; pagination: string; previous: string; next: string; of: string }> = {
  ru: { title: "Избранное", description: "Сохранённые мероприятия в одном месте.", failed: "Не удалось загрузить избранное.", empty: "В избранном пока пусто", emptyDescription: "Сохраните интересные мероприятия, чтобы вернуться к ним позже.", pagination: "Страницы избранного", previous: "Назад", next: "Вперёд", of: "из" },
  kk: { title: "Таңдаулылар", description: "Сақталған іс-шаралар бір жерде.", failed: "Таңдаулыларды жүктеу мүмкін болмады.", empty: "Таңдаулылар әзірге бос", emptyDescription: "Қызықты іс-шараларды кейін қарау үшін сақтаңыз.", pagination: "Таңдаулылар беттері", previous: "Артқа", next: "Алға", of: "/" },
  en: { title: "Favorites", description: "Your saved events in one place.", failed: "Could not load favorites.", empty: "No favorites yet", emptyDescription: "Save events you like and return to them later.", pagination: "Favorite pages", previous: "Previous", next: "Next", of: "of" },
};

const LIMIT = 12;

export function FavoritesContent({ embedded = false }: { embedded?: boolean }) {
  const locale = useLocale();
  const copy = COPY[locale];
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<FavoriteList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    const load = getSession()
      ? mergeLocalFavorites().then(() => apiRequest<FavoriteList>(`/me/favorites?page=${page}&limit=${LIMIT}&locale=${locale}`))
      : Promise.all(readLocalFavoriteIds().map((id) => fetchPublicEventSummary(id).catch(() => null))).then((items) => {
        const visible = items.filter((item): item is FavoriteList["items"][number] => item !== null);
        return { items: visible, page: 1, limit: LIMIT, total: visible.length, hasNext: false };
      });
    void load
      .then((next) => { if (active) setResult(next); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, locale, reload]);

  return <>
    {embedded ? <div><h2 className="text-xl font-bold">{copy.title}</h2><p className="mt-2 text-sm text-zinc-600 dark:text-ticket-muted">{copy.description}</p></div> : <SectionHeading title={copy.title} description={copy.description} />}
    <div className="mt-8" aria-live="polite">{loading ? <LoadingGrid /> : error ? <ErrorState message={copy.failed} onRetry={() => setReload((current) => current + 1)} /> : result?.items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{result.items.map((event) => <EventCard event={event} key={event.id} />)}</div> : <EmptyState title={copy.empty} description={copy.emptyDescription} />}</div>
    {result && result.total > result.limit ? <nav aria-label={copy.pagination} className="mt-8 flex items-center justify-between"><button className="rounded-xl border border-zinc-300 dark:border-ticket-border bg-white dark:bg-ticket-surface px-4 py-2 font-semibold disabled:opacity-40" disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">{copy.previous}</button><span className="text-sm text-zinc-600 dark:text-ticket-muted">{page} {copy.of} {Math.ceil(result.total / result.limit)}</span><button className="rounded-xl border border-zinc-300 dark:border-ticket-border bg-white dark:bg-ticket-surface px-4 py-2 font-semibold disabled:opacity-40" disabled={!result.hasNext} onClick={() => setPage((current) => current + 1)} type="button">{copy.next}</button></nav> : null}
  </>;
}
