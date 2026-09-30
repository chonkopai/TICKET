"use client";

import { type EventLocale, type OrganizerEventPreview } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "../../../../(auth)/_components/protected-route";
import { apiRequest } from "../../../../(auth)/_lib/api";
import { BackLink } from "../../../../../components/back-link";
import { PageShell } from "../../../../../components/ui";
import { useLocale } from "../../../../../components/locale-provider";
import { ContentLanguageNote } from "../../../../../components/content-language-note";
import { INTL_LOCALES, localeUrl } from "../../../../../lib/locale";
import { EVENTS_COPY } from "../../../../../lib/events-copy";
import { TICKET_TYPES_COPY } from "../../../../../lib/ticket-types-copy";
import { GUEST_EXTRA } from "../../../../../lib/guest-copy";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const PREVIEW_COPY: Record<EventLocale, { ticketsAndTables: string; seats: string }> = {
  ru: { ticketsAndTables: "Билеты и столы", seats: "мест" },
  kk: { ticketsAndTables: "Билеттер мен үстелдер", seats: "орын" },
  en: { ticketsAndTables: "Tickets and tables", seats: "seats" },
};

export default function OrganizerEventPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <PageShell><ProtectedRoute><Preview params={params} /></ProtectedRoute></PageShell>;
}

function Preview({ params }: { params: Promise<{ id: string }> }) {
  const locale = useLocale();
  const events = EVENTS_COPY[locale];
  const copy = PREVIEW_COPY[locale];
  const ticketCopy = TICKET_TYPES_COPY[locale];
  const money = (amount: number, currency: string) => new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(amount / 100);
  const [event, setEvent] = useState<OrganizerEventPreview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void params.then(({ id }) => apiRequest<OrganizerEventPreview>(`/api/organizer/events/${id}/preview?locale=${locale}`).then(setEvent).catch(() => setError(true)));
  }, [params, locale]);
  if (error) return <p className="rounded-2xl bg-red-50 p-5 text-red-800">{events.previewFailed}</p>;
  if (!event) return <p>{GUEST_EXTRA[locale].loading}</p>;
  return <section>
    <div className="flex flex-wrap items-center justify-between gap-3"><BackLink href={localeUrl(`/organizer/events/${event.id}`, locale)} /><span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{event.status === "draft" ? events.previewDraftBanner : events.previewPublishedBanner}</span></div>
    <article className="mt-6 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
      {event.posterUrl ? <img className="max-h-[32rem] w-full object-cover" src={new URL(event.posterUrl, API_URL).toString()} alt={event.title} /> : null}
      <div className="p-6 sm:p-10"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">{events.categories[event.category]}</span><h1 className="mt-4 text-4xl font-semibold tracking-tight">{event.title}</h1><div className="mt-2"><ContentLanguageNote contentLocale={event.contentLocale} /></div>{event.announcement ? <p className="mt-3 text-xl text-zinc-700">{event.announcement}</p> : null}</div><span className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-semibold">{events.paymentModes[event.paymentMode]}</span></div>
        <p className="mt-6 text-zinc-700">{new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${event.date}T00:00:00Z`))} · {event.time} · {event.timezone}<br />{event.city}, {event.venueName}<br />{event.address}</p>
        <PreviewSection title={events.fields.description} text={event.description} /><PreviewSection title={events.fields.program} text={event.program} /><PreviewSection title={events.fields.rules} text={event.rules} /><PreviewSection title={events.fields.visitTerms} text={event.visitTerms} /><PreviewSection title={events.fields.cancellationTerms} text={event.cancellationTerms} /><PreviewSection title={events.fields.extraConditions} text={event.extraConditions} />{event.paymentMode === "deposit" ? <PreviewSection title={events.fields.depositTerms} text={event.depositTerms} /> : null}
        <section className="mt-8 grid gap-4 border-t border-zinc-200 pt-6"><h2 className="text-xl font-semibold">{copy.ticketsAndTables}</h2>{event.ticketTypes.length ? <div className="grid gap-3 sm:grid-cols-2">{event.ticketTypes.map((ticket) => <div className="rounded-2xl border border-zinc-200 p-4" key={ticket.id}><p className="font-semibold">{ticket.name}</p><p className="mt-1 text-sm text-zinc-600">{ticket.description ?? "—"}</p><p className="mt-2 text-sm">{money(ticket.payment.amountDue, ticket.payment.currency)} · {ticket.remaining} {ticketCopy.counters.remaining.toLowerCase()}</p></div>)}</div> : <p className="text-sm text-zinc-500">{ticketCopy.empty}</p>}{event.tables.length ? <div className="grid gap-3 sm:grid-cols-2">{event.tables.map((table) => <div className="rounded-2xl border border-zinc-200 p-4" key={table.id}><p className="font-semibold">{table.name ?? `№${table.number}`}</p><p className="mt-1 text-sm text-zinc-600">{table.seats} {copy.seats} · {money(table.payment.amountDue, table.payment.currency)}</p></div>)}</div> : null}</section>
        <div className="mt-8 border-t border-zinc-200 pt-6"><p className="text-sm text-zinc-500">{events.previewCheckoutDisabled}</p></div>
      </div>
    </article>
  </section>;
}

function PreviewSection({ title, text }: { title: string; text: string | null }) { return text ? <section className="mt-7"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-700">{text}</p></section> : null; }
