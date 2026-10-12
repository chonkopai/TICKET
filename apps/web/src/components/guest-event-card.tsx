"use client";

import { type CancellationTermsResponse,type GuestEvent } from "@event-platform/shared-types";
import Link from "next/link";
import { useState } from "react";

import { apiRequest } from "../app/(auth)/_lib/api";
import { Countdown } from "./countdown";
import { PublicFramedAsset } from "./public-event-media";
import { useLocale } from "./locale-provider";
import { GUEST_COPY, GUEST_EXTRA } from "../lib/guest-copy";
import { localeUrl } from "../lib/locale";
import { ContentLanguageNote } from "./content-language-note";
import { GuestTicketActions } from "./guest-ticket-actions";
import { TICKET_ACTIONS_COPY } from "../lib/ticket-actions-copy";
import { AccountIcon } from "./account-icon";
import { eventMapUrl } from "../lib/event-map-url";
import { guestEventSchedule } from "../lib/guest-event-schedule";
import { guestEventParticipationLabel, guestTicketParticipationLabel } from "../lib/guest-participation-label";
import { useEventEnded } from "../lib/use-event-ended";

export function GuestEventCard({ event, onReturned }: { event: GuestEvent; onReturned?: () => void }) {
  const locale = useLocale();
  const extra = GUEST_EXTRA[locale];
  const actionsCopy = TICKET_ACTIONS_COPY[locale];
  const ended = useEventEnded(event);
  const details = { startsAt: event.startsAt, endsAt: event.endsAt ?? null, timezone: event.timezone, address: event.address, coordinates: event.coordinates ?? null, organizer: event.organizer ?? { name: null, phone: null, email: null, address: null } };
  const mapUrl = eventMapUrl(event);
  const chatPath = event.tickets.find(ticket => ticket.chatPath)?.chatPath ?? event.bookings.find(booking => booking.chatPath)?.chatPath;
  const eventHref = localeUrl(`/events/${event.id}`, locale);
  const schedule = guestEventSchedule(event, locale);
  const canOpenEvent = event.eventStatus === "published" && !ended;
  const cardAsset = event.media?.find(asset => asset.isCard);
  const singleTicket = event.tickets.length === 1 ? event.tickets[0] : null;
  const poster = cardAsset ? <PublicFramedAsset asset={cardAsset} className="account-event-poster-media" />
    : event.posterUrl ? <img alt="" className="account-event-poster-media" src={event.posterUrl} />
    : <span aria-hidden="true" className="account-event-poster-placeholder">{event.title.slice(0, 1)}</span>;
  return <article className="account-guest-event">
    <div className="account-event-identity">
    {canOpenEvent ? <Link aria-label={`${extra.openEvent}: ${event.title}`} className="account-event-poster" href={eventHref}><div className="account-event-poster-frame">{poster}</div></Link> : <div className="account-event-poster"><div className="account-event-poster-frame">{poster}</div></div>}
      <header className="account-event-heading">
        <h2 title={event.title}>{canOpenEvent ? <Link href={eventHref}>{event.title}</Link> : event.title}</h2>
        <div className="account-event-badges">
          <span className="account-event-status">{guestEventParticipationLabel(event, locale, ended)}</span>
          <Countdown startsAt={event.startsAt} past={ended} />
        </div>
      </header>
      {event.contentLocale && event.contentLocale !== locale ? <div className="account-event-language"><ContentLanguageNote contentLocale={event.contentLocale} /></div> : null}
    </div>
    <div className="account-event-body">
      <div className={`account-event-details${event.tickets.length ? "" : " account-event-details-no-tickets"}`}>
        <div className="account-event-summary">
          <div className="account-event-meta">
            <span><AccountIcon name="clock" /><time dateTime={event.startsAt}>{schedule}</time></span>
            {mapUrl ? <a href={mapUrl} target="_blank" rel="noopener noreferrer" title={`${actionsCopy.map}: ${event.address}`}><AccountIcon name="map-pin" /><span>{event.address || actionsCopy.map}</span><AccountIcon name="arrow-up-right" /></a> : <span><AccountIcon name="map-pin" />{actionsCopy.noAddress}</span>}
          </div>
          {singleTicket?.seatLabel ? <p className="account-event-ticket-info">{singleTicket.seatLabel}</p> : null}
          {canOpenEvent ? <Link className="account-event-about" href={eventHref}>{extra.aboutTickets}</Link> : <p className="account-event-about">{extra.pageUnavailable}</p>}
          {event.bookings.length ? <div className="account-event-bookings">{event.bookings.map(booking => <BookingChip booking={booking} key={booking.id} />)}</div> : null}
        </div>
        {event.tickets.length ? <div className="account-guest-tickets">{event.tickets.map(ticket => <section className="account-guest-ticket" key={ticket.id} aria-label={`${ticket.ticketTypeName}${ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}`}>
          {!singleTicket ? <>
            <Link className="account-guest-ticket-title" href={localeUrl(`/account/tickets/${ticket.id}`, locale)}>{ticket.ticketTypeName}<AccountIcon name="arrow-right" /></Link>
            {ticket.seatLabel ? <p className="account-guest-ticket-seat">{ticket.seatLabel}</p> : null}
            <p className="account-guest-ticket-status">{guestTicketParticipationLabel(ticket, locale, ended)}</p>
          </> : null}
          <GuestTicketActions variant="ticket" ticket={ticket} details={details} onReturned={onReturned} />
        </section>)}</div> : null}
      </div>
      <GuestTicketActions variant="organizer" details={details} chatPath={chatPath} />
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
