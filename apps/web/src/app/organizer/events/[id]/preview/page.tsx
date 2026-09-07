"use client";

import { ru, type OrganizerEventPreview } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "../../../../(auth)/_components/protected-route";
import { apiRequest } from "../../../../(auth)/_lib/api";
import { BackLink } from "../../../../../components/back-link";
import { PageShell } from "../../../../../components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function OrganizerEventPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <PageShell><ProtectedRoute><Preview params={params} /></ProtectedRoute></PageShell>;
}

function Preview({ params }: { params: Promise<{ id: string }> }) {
  const [event, setEvent] = useState<OrganizerEventPreview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void params.then(({ id }) => apiRequest<OrganizerEventPreview>(`/api/organizer/events/${id}/preview`).then(setEvent).catch(() => setError(true)));
  }, [params]);
  if (error) return <p className="rounded-2xl bg-red-50 p-5 text-red-800">{ru.events.previewFailed}</p>;
  if (!event) return <p>{ru.common.loading}</p>;
  return <section>
    <div className="flex flex-wrap items-center justify-between gap-3"><BackLink href={`/organizer/events/${event.id}`} /><span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{event.status === "draft" ? ru.events.previewDraftBanner : ru.events.previewPublishedBanner}</span></div>
    <article className="mt-6 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
      {event.posterUrl ? <img className="max-h-[32rem] w-full object-cover" src={new URL(event.posterUrl, API_URL).toString()} alt={event.title} /> : null}
      <div className="p-6 sm:p-10"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">{ru.events.categories[event.category]}</span><h1 className="mt-4 text-4xl font-semibold tracking-tight">{event.title}</h1>{event.announcement ? <p className="mt-3 text-xl text-zinc-700">{event.announcement}</p> : null}</div><span className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-semibold">{ru.events.paymentModes[event.paymentMode]}</span></div>
        <p className="mt-6 text-zinc-700">{event.date} · {event.time} · {event.timezone}<br />{event.city}, {event.venueName}<br />{event.address}</p>
        <PreviewSection title={ru.events.fields.description} text={event.description} /><PreviewSection title={ru.events.fields.program} text={event.program} /><PreviewSection title={ru.events.fields.rules} text={event.rules} /><PreviewSection title={ru.events.fields.visitTerms} text={event.visitTerms} /><PreviewSection title={ru.events.fields.cancellationTerms} text={event.cancellationTerms} /><PreviewSection title={ru.events.fields.extraConditions} text={event.extraConditions} />{event.paymentMode === "deposit" ? <PreviewSection title={ru.events.fields.depositTerms} text={event.depositTerms} /> : null}
        <section className="mt-8 grid gap-4 border-t border-zinc-200 pt-6"><h2 className="text-xl font-semibold">{ru.events.previewTickets} и {ru.events.previewTables}</h2>{event.ticketTypes.length ? <div className="grid gap-3 sm:grid-cols-2">{event.ticketTypes.map((ticket) => <div className="rounded-2xl border border-zinc-200 p-4" key={ticket.id}><p className="font-semibold">{ticket.name}</p><p className="mt-1 text-sm text-zinc-600">{ticket.description ?? "—"}</p><p className="mt-2 text-sm">{ticket.payment.amountDue / 100} {ticket.payment.currency} · {ticket.remaining} {ru.ticketTypes.counters.remaining.toLowerCase()}</p></div>)}</div> : <p className="text-sm text-zinc-500">{ru.ticketTypes.empty}</p>}{event.tables.length ? <div className="grid gap-3 sm:grid-cols-2">{event.tables.map((table) => <div className="rounded-2xl border border-zinc-200 p-4" key={table.id}><p className="font-semibold">{table.name ?? `№${table.number}`}</p><p className="mt-1 text-sm text-zinc-600">{table.seats} {ru.venue.fields.seats.toLowerCase()} · {table.payment.amountDue / 100} {table.payment.currency}</p></div>)}</div> : null}</section>
        <div className="mt-8 border-t border-zinc-200 pt-6"><p className="text-sm text-zinc-500">{ru.events.previewCheckoutDisabled}</p></div>
      </div>
    </article>
  </section>;
}

function PreviewSection({ title, text }: { title: string; text: string | null }) { return text ? <section className="mt-7"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-700">{text}</p></section> : null; }
