"use client";

import { ru, quickRu, type BookingOptions, type CheckoutResponse, type PublicEvent, type PublicPaymentOption } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { apiRequest } from "../../(auth)/_lib/api";
import { getSession } from "../../(auth)/_lib/session";

export function CheckoutPanel({ event }: { event: PublicEvent }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [options, setOptions] = useState<BookingOptions | null>(null);

  useEffect(() => {
    const authenticated = Boolean(getSession());
    setLoggedIn(authenticated);
    if (authenticated) void apiRequest<BookingOptions>(`/me/events/${event.id}/booking-options`).then(setOptions).catch(() => undefined);
  }, [event.id]);

  async function checkout(path: string, body: object, key: string): Promise<void> {
    if (!accepted || busy) return;
    setBusy(key); setError(null); setResult(null);
    try {
      setResult(await apiRequest<CheckoutResponse>(path, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ru.checkout.failed);
    } finally { setBusy(null); }
  }

  return <section className="mt-10 border-t border-zinc-200 pt-8">
    <Link href={`/quick?event=${event.id}`} className="mb-5 inline-block rounded-xl border px-5 py-3 font-semibold">{quickRu.quick}</Link>
    <div className="rounded-2xl bg-zinc-50 p-4"><strong>{paymentName(event.paymentMode)}</strong><p className="mt-1 text-sm text-zinc-600">{event.paymentMode === "deposit" ? ru.checkout.depositExplanation : ru.checkout.fullPaymentExplanation}</p></div>
    <label className="mt-5 flex items-start gap-3 rounded-xl border border-zinc-200 p-4"><input checked={accepted} className="mt-1" onChange={(input) => setAccepted(input.target.checked)} type="checkbox" /><span>{ru.checkout.acceptTerms}</span></label>
    {!loggedIn ? <p className="mt-5"><Link className="font-semibold underline" href="/login">{ru.checkout.login}</Link></p> : null}
    {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : null}
    {result ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-900"><p>{ru.checkout.created}</p><a className="mt-2 inline-block font-semibold underline" href={result.paymentLink}>{ru.checkout.continuePayment}</a></div> : null}
    {options?.layout ? <VenuePreview event={event} options={options} /> : null}
    <div className="mt-8 grid gap-8 md:grid-cols-2">
      <div><h2 className="text-2xl font-semibold">{ru.publicEvent.tickets}</h2>{event.ticketTypes.length === 0 ? <p className="mt-3 text-zinc-500">{ru.publicEvent.noTickets}</p> : <div className="mt-3 grid gap-3">{event.ticketTypes.map((ticket) => <div className="rounded-2xl border border-zinc-200 p-4" key={ticket.id}><div className="flex justify-between gap-3 font-semibold"><span>{ticket.name}</span><span>{paymentSummary(ticket.payment)}</span></div><p className="mt-2 text-sm text-zinc-600">{ticket.status === "active" ? `${ru.publicEvent.remaining}: ${ticket.remaining}` : ru.publicEvent.unavailable}</p>{ticket.description ? <p className="mt-2 text-sm">{ticket.description}</p> : null}<button className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!loggedIn || !accepted || ticket.status !== "active" || Boolean(busy)} onClick={() => void checkout("/me/checkouts/tickets", { ticketTypeId: ticket.id, quantity: 1, termsAccepted: true }, ticket.id)} type="button">{busy === ticket.id ? ru.common.loading : ru.checkout.buyTicket}</button></div>)}</div>}</div>
      <div><h2 className="text-2xl font-semibold">{ru.publicEvent.tables}</h2>{event.tables.length === 0 ? <p className="mt-3 text-zinc-500">{ru.publicEvent.noTables}</p> : <div className="mt-3 grid gap-3">{event.tables.map((table) => <div className="rounded-2xl border border-zinc-200 p-4" key={table.id}><div className="flex justify-between gap-3 font-semibold"><span>{table.name ?? `№ ${table.number}`}</span><span>{table.seats} мест</span></div><p className="mt-2 text-sm">{paymentSummary(table.payment)}</p><p className="mt-2 text-sm text-zinc-600">{table.availability === "available" ? ru.publicEvent.available : table.availability === "booked" ? ru.publicEvent.booked : ru.publicEvent.unavailable}</p><button className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!loggedIn || !accepted || table.availability !== "available" || Boolean(busy)} onClick={() => void checkout("/me/checkouts/tables", { tableId: table.id, termsAccepted: true }, table.id)} type="button">{busy === table.id ? ru.common.loading : ru.checkout.bookTable}</button></div>)}</div>}</div>
    </div>
  </section>;
}

function VenuePreview({ event, options }: { event: PublicEvent; options: BookingOptions }) {
  const layout = options.layout;
  if (!layout) return null;
  return <div className="mt-8 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><svg aria-label={ru.checkout.venueLayout} className="h-auto min-w-[320px]" role="img" viewBox={`0 0 ${layout.canvas.width} ${layout.canvas.height}`}>{layout.tables.map((geometry) => { const table = event.tables.find(({ id }) => id === geometry.tableId); if (!table) return null; return <g key={geometry.tableId} transform={`rotate(${geometry.rotation ?? 0} ${geometry.x + geometry.width / 2} ${geometry.y + geometry.height / 2})`}><rect fill={table.availability === "available" ? "#dcfce7" : "#e4e4e7"} height={geometry.height} rx="10" stroke="#52525b" width={geometry.width} x={geometry.x} y={geometry.y} /><text dominantBaseline="middle" fontSize="18" textAnchor="middle" x={geometry.x + geometry.width / 2} y={geometry.y + geometry.height / 2}>{table.name ?? `№${table.number}`}</text></g>; })}</svg></div>;
}

function paymentName(mode: "deposit" | "full_payment"): string { return mode === "deposit" ? ru.checkout.deposit : ru.checkout.fullPayment; }
function paymentSummary(payment: PublicPaymentOption): string { const due = formatMoney(payment.amountDue, payment.currency); return payment.fullAmount !== null && payment.mode === "deposit" ? `${ru.checkout.deposit}: ${due} · ${ru.checkout.fullAmount}: ${formatMoney(payment.fullAmount, payment.currency)}` : `${paymentName(payment.mode)}: ${due}`; }
function formatMoney(value: number, currency: string): string { return `${(value / 100).toLocaleString("ru-RU")} ${currency}`; }
