"use client";

import { type CancellationTermsResponse,type GuestEvent } from "@event-platform/shared-types";
import Link from "next/link";
import { useState } from "react";

import { apiRequest } from "../app/(auth)/_lib/api";
import { Countdown } from "./countdown";
import { PublicFramedAsset } from "./public-event-media";
import { useLocale } from "./locale-provider";
import { GUEST_COPY, GUEST_EXTRA } from "../lib/guest-copy";
import { INTL_LOCALES, localeUrl } from "../lib/locale";
import { ContentLanguageNote } from "./content-language-note";

export function GuestEventCard({ event }: { event: GuestEvent }) {
  const locale = useLocale();
  const copy = GUEST_COPY[locale];
  const extra = GUEST_EXTRA[locale];
  const eventHref = localeUrl(`/events/${event.id}`, locale);
  const date = new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${event.date}T00:00:00Z`));
  const canOpenEvent = event.eventStatus === "published" && new Date(event.startsAt) > new Date();
  return <article className="overflow-hidden rounded-2xl border border-[#ded9e8] dark:border-ticket-border bg-white dark:bg-ticket-surface shadow-sm">
    <div className="grid gap-0 sm:grid-cols-[160px_1fr]">
      {canOpenEvent ? <Link aria-label={`${extra.openEvent}: ${event.title}`} className="block self-start aspect-video bg-gradient-to-br from-[#e7ddff] dark:from-ticket-raised via-[#f6f2ff] dark:via-ticket-raised to-[#d9e8ff] dark:to-ticket-raised focus-visible:outline-2 focus-visible:outline-[#713dcc] dark:focus-visible:outline-ticket-accent" href={eventHref}>{event.media?.find(asset => asset.isCard) ? <PublicFramedAsset asset={event.media.find(asset => asset.isCard)!} className="aspect-video w-full" /> : event.posterUrl ? <img alt="" className="h-full w-full object-cover" src={event.posterUrl} /> : <div aria-hidden="true" className="flex h-full min-h-36 items-end p-5 text-3xl font-bold text-[#5b21b6] dark:text-ticket-accent">{event.title.slice(0, 1)}</div>}</Link> : <div className="self-start aspect-video bg-gradient-to-br from-[#e7ddff] dark:from-ticket-raised via-[#f6f2ff] dark:via-ticket-raised to-[#d9e8ff] dark:to-ticket-raised">{event.media?.find(asset => asset.isCard) ? <PublicFramedAsset asset={event.media.find(asset => asset.isCard)!} className="aspect-video w-full" /> : event.posterUrl ? <img alt="" className="h-full w-full object-cover" src={event.posterUrl} /> : <div aria-hidden="true" className="flex h-full min-h-36 items-end p-5 text-3xl font-bold text-[#5b21b6] dark:text-ticket-accent">{event.title.slice(0, 1)}</div>}</div>}
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><span className="rounded-full bg-[#f0eaff] dark:bg-ticket-raised px-3 py-1 text-xs font-bold text-[#5b21b6] dark:text-ticket-accent">{copy.states[event.participationStatus]}</span><h2 className="mt-3 text-xl font-bold sm:text-2xl">{canOpenEvent ? <Link className="hover:text-[#5b21b6] dark:hover:text-ticket-accent hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[#713dcc] dark:focus-visible:outline-ticket-accent" href={eventHref}>{event.title}</Link> : event.title}</h2><div className="mt-2"><ContentLanguageNote contentLocale={event.contentLocale} /></div><p className="mt-2 text-sm text-[#645c70] dark:text-ticket-muted">{date} · {event.time} · {event.venueName}</p>{canOpenEvent ? <Link className="mt-2 inline-block text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent hover:underline" href={eventHref}>{extra.aboutTickets}</Link> : <p className="mt-2 text-xs text-[#645c70] dark:text-ticket-muted">{extra.pageUnavailable}</p>}</div>
          <Countdown startsAt={event.startsAt} past={new Date(event.startsAt) <= new Date()} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">{event.tickets.map((ticket) => <Link className="rounded-xl border border-[#cfc7da] dark:border-ticket-border px-4 py-2 text-sm font-semibold transition hover:border-[#713dcc] dark:hover:border-ticket-accent" href={localeUrl(`/account/tickets/${ticket.id}`, locale)} key={ticket.id}><span className="block">{ticket.ticketTypeName}</span>{ticket.seatLabel ? <span className="mt-1 block font-normal text-[#645c70] dark:text-ticket-muted">{ticket.seatLabel}</span> : null}<span className="mt-1 block font-normal text-[#5b21b6] dark:text-ticket-accent">{copy.states[ticket.participationStatus]}</span></Link>)}{event.bookings.map((booking) => <BookingChip booking={booking} key={booking.id} />)}</div>
      </div>
    </div>
  </article>;
}

function BookingChip({ booking }: { booking: GuestEvent["bookings"][number] }) {
  const locale = useLocale(); const copy = GUEST_COPY[locale]; const extra = GUEST_EXTRA[locale];
  const [message, setMessage] = useState<string | null>(null);
  async function cancel(): Promise<void> {
    try {
      const terms = await apiRequest<CancellationTermsResponse>(`/me/bookings/${booking.id}/cancellation`);
      if(terms.acceptedPolicy&&!terms.acceptedPolicy.available&&terms.amountPaid>0){setMessage(({ru:"Возврат денег не предусмотрен. Обратитесь к организатору.",en:"Monetary refunds are unavailable. Contact the organizer.",kk:"Ақшаны қайтару қарастырылмаған. Ұйымдастырушыға хабарласыңыз."})[locale]);return;}
      if (!window.confirm(`${terms.cancellationTerms ?? ""}\n\n${extra.cancelConfirm}`)) return;
      const result = await apiRequest<{ refundPending: boolean }>(`/me/bookings/${booking.id}/cancel`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ confirmed: true }) });
      setMessage(result.refundPending ? extra.refundPending : extra.cancelled);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : extra.failed); }
  }
  return <span className="rounded-xl bg-[#f4f1f7] dark:bg-ticket-raised px-4 py-2 text-sm">{copy.table} №{booking.table.number} · {message ?? copy.statuses[booking.status]}{booking.status === "pending" || booking.status === "confirmed" ? <button className="ml-3 text-red-700 dark:text-ticket-danger underline" onClick={() => void cancel()} type="button">{extra.cancel}</button> : null}</span>;
}
