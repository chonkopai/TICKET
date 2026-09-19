"use client";

import { ru, type GuestEventList } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "../../(auth)/_components/protected-route";
import { apiRequest } from "../../(auth)/_lib/api";
import { PageShell } from "../../../components/ui";
import { GuestEventCard } from "../../../components/guest-event-card";

export default function MyEventsPage() {
  return <PageShell><ProtectedRoute><MyEvents /></ProtectedRoute></PageShell>;
}

function MyEvents() {
  const [status, setStatus] = useState<"upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<GuestEventList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null); setError(null);
    apiRequest<GuestEventList>(`/me/events?status=${status}&page=${page}&limit=10`)
      .then(setResult)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : ru.guest.loadFailed));
  }, [status, page]);

  function changeStatus(next: "upcoming" | "past"): void { setStatus(next); setPage(1); }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">{ru.guest.myEvents}</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{status === "upcoming" ? ru.guest.upcoming : ru.guest.past}</h1></div>
        <div className="flex flex-wrap gap-3"><Link className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold" href="/events">{ru.common.events}</Link><Link className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold" href="/account">{ru.guest.profile}</Link></div>
      </div>
      <div className="mt-7 flex gap-2" role="tablist" aria-label={ru.guest.myEvents}>
        <button className={`rounded-xl px-4 py-2 font-semibold ${status === "upcoming" ? "bg-black text-white" : "border border-zinc-300 bg-white"}`} onClick={() => changeStatus("upcoming")} role="tab" aria-selected={status === "upcoming"} type="button">{ru.guest.upcoming}</button>
        <button className={`rounded-xl px-4 py-2 font-semibold ${status === "past" ? "bg-black text-white" : "border border-zinc-300 bg-white"}`} onClick={() => changeStatus("past")} role="tab" aria-selected={status === "past"} type="button">{ru.guest.past}</button>
      </div>
      {error ? <p className="mt-6 rounded-2xl bg-red-50 p-4 text-red-800">{error}</p> : null}
      {!result && !error ? <p className="mt-8 text-zinc-600">{ru.common.loading}</p> : null}
      {result?.items.length === 0 ? <p className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-600">{ru.guest.empty}</p> : null}
      <div className="mt-6 grid gap-5">{result?.items.map((event) => <GuestEventCard event={event} key={event.id} />)}</div>
      {result && result.total > result.limit ? <nav className="mt-8 flex items-center justify-between" aria-label={ru.guest.myEvents}><button className="rounded-xl border border-zinc-300 px-4 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button">{ru.guest.previous}</button><span className="text-sm text-zinc-600">{page}</span><button className="rounded-xl border border-zinc-300 px-4 py-2 disabled:opacity-40" disabled={!result.hasNext} onClick={() => setPage((value) => value + 1)} type="button">{ru.guest.next}</button></nav> : null}
    </section>
  );
}
