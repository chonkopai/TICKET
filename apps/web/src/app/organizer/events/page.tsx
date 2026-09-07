"use client";

import { ru, type OrganizerEventList } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "../../(auth)/_components/protected-route";
import { apiRequest } from "../../(auth)/_lib/api";
import { PageShell } from "../../../components/ui";

const PAGE_SIZE = 10;

export default function OrganizerEventsPage() {
  return (
    <PageShell>
      <ProtectedRoute>
        <EventList />
      </ProtectedRoute>
    </PageShell>
  );
}

function EventList() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<OrganizerEventList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    apiRequest<OrganizerEventList>(`/api/organizer/events?page=${page}&limit=${PAGE_SIZE}`)
      .then(setResult)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : ru.events.loadFailed),
      );
  }, [page]);

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {ru.events.eyebrow}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{ru.events.listTitle}</h1>
          <p className="mt-3 text-zinc-600">{ru.events.listDescription}</p>
        </div>
        <Link className="rounded-xl bg-black px-5 py-3 font-semibold text-white" href="/organizer/events/new">
          {ru.events.create}
        </Link>
      </div>

      {result ? <div className="mt-8 grid gap-3 sm:grid-cols-3"><Summary label="Всего событий" value={result.total} /><Summary label="Опубликовано" value={result.items.filter((event) => event.status === "published").length} /><Summary label="Черновики" value={result.items.filter((event) => event.status === "draft").length} /></div> : null}

      {error ? (
        <p className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</p>
      ) : null}

      {!result && !error ? <p className="mt-10 text-zinc-600">{ru.common.loading}</p> : null}

      {result?.items.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <h2 className="text-xl font-semibold">{ru.events.emptyTitle}</h2>
          <p className="mt-2 text-zinc-600">{ru.events.emptyDescription}</p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-4">
        {result?.items.map((event) => (
          <article key={event.id} className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              {event.posterUrl ? <img alt="" className="h-20 w-28 rounded-xl object-cover" src={event.posterUrl} /> : <div aria-hidden="true" className="flex h-20 w-28 items-center justify-center rounded-xl bg-indigo-50 text-2xl font-semibold text-indigo-700">{event.title.slice(0, 1)}</div>}
              <div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                  {ru.events.statuses[event.status]}
                </span>
                <h2 className="mt-3 text-xl font-semibold">{event.title}</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  {ru.events.categories[event.category]} · {event.city}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {event.date} · {event.time} · {event.venueName} · {ru.events.paymentModes[event.paymentMode]}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="rounded-xl border border-black/15 px-4 py-2 font-semibold transition hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" href={`/organizer/events/${event.id}`}>
                  {ru.events.open}
                </Link>
                <Link className="rounded-xl border border-indigo-200 px-4 py-2 font-semibold text-indigo-800 transition hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" href={`/organizer/events/${event.id}/preview`}>
                  {ru.events.preview}
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {result && result.total > PAGE_SIZE ? (
        <nav className="mt-8 flex items-center justify-between" aria-label={ru.events.page}>
          <button
            className="rounded-xl border border-black/15 px-4 py-2 disabled:opacity-40"
            disabled={page === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            {ru.common.previous}
          </button>
          <span className="text-sm text-zinc-600">
            {ru.events.page} {page} {ru.events.of} {pageCount}
          </span>
          <button
            className="rounded-xl border border-black/15 px-4 py-2 disabled:opacity-40"
            disabled={!result.hasNext}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            {ru.common.next}
          </button>
        </nav>
      ) : null}

      <Link className="mt-10 inline-block text-sm text-zinc-500 underline" href="/account">
        {ru.auth.account}
      </Link>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-sm text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}
