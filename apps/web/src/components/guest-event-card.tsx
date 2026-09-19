"use client";

import { ru, type GuestEvent } from "@event-platform/shared-types";
import Link from "next/link";
import { useState } from "react";

import { apiRequest } from "../app/(auth)/_lib/api";
import { Countdown } from "./countdown";

export function GuestEventCard({ event }: { event: GuestEvent }) {
  return <article className="overflow-hidden rounded-2xl border border-[#ded9e8] bg-white shadow-sm">
    <div className="grid gap-0 sm:grid-cols-[160px_1fr]">
      <div className="min-h-36 bg-gradient-to-br from-[#e7ddff] via-[#f6f2ff] to-[#d9e8ff]">
        {event.posterUrl ? <img alt="" className="h-full w-full object-cover" src={event.posterUrl} /> : <div aria-hidden="true" className="flex h-full min-h-36 items-end p-5 text-3xl font-bold text-[#5b21b6]">{event.title.slice(0, 1)}</div>}
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><span className="rounded-full bg-[#f0eaff] px-3 py-1 text-xs font-bold text-[#5b21b6]">{ru.guest.states[event.participationStatus]}</span><h2 className="mt-3 text-xl font-bold sm:text-2xl">{event.title}</h2><p className="mt-2 text-sm text-[#645c70]">{event.date} · {event.time} · {event.venueName}</p></div>
          <Countdown startsAt={event.startsAt} past={new Date(event.startsAt) <= new Date()} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">{event.tickets.map((ticket) => <Link className="rounded-xl border border-[#cfc7da] px-4 py-2 text-sm font-semibold transition hover:border-[#713dcc]" href={`/my-events/tickets/${ticket.id}`} key={ticket.id}><span className="block">{ticket.ticketTypeName}</span>{ticket.seatLabel ? <span className="mt-1 block font-normal text-[#645c70]">{ticket.seatLabel}</span> : null}<span className="mt-1 block font-normal text-[#5b21b6]">{ru.guest.states[ticket.participationStatus]}</span></Link>)}{event.bookings.map((booking) => <BookingChip booking={booking} key={booking.id} />)}</div>
      </div>
    </div>
  </article>;
}

function BookingChip({ booking }: { booking: GuestEvent["bookings"][number] }) {
  const [message, setMessage] = useState<string | null>(null);
  async function cancel(): Promise<void> {
    try {
      const terms = await apiRequest<{ cancellationTerms: string | null }>(`/me/bookings/${booking.id}/cancellation`);
      if (!window.confirm(`${terms.cancellationTerms ?? ""}\n\n${ru.checkout.cancelConfirm}`)) return;
      const result = await apiRequest<{ refundPending: boolean }>(`/me/bookings/${booking.id}/cancel`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ confirmed: true }) });
      setMessage(result.refundPending ? ru.checkout.refundPending : ru.checkout.cancelled);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : ru.checkout.failed); }
  }
  return <span className="rounded-xl bg-[#f4f1f7] px-4 py-2 text-sm">{ru.guest.table} №{booking.table.number} · {message ?? ru.guest.statuses[booking.status]}{booking.status === "pending" || booking.status === "confirmed" ? <button className="ml-3 text-red-700 underline" onClick={() => void cancel()} type="button">{ru.checkout.cancel}</button> : null}</span>;
}
