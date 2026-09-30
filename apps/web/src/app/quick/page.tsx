"use client";

import { INTL_LOCALES, localeUrl } from "../../lib/locale";

import { SelectPicker } from "../../components/option-picker";

import { type BookingOptions, type CheckoutEmailChoice, type CheckoutResponse, type CreateCartCheckoutRequest, type PublicEvent, type PublicVenueLayout, type PublicVenueSeat, type QuickSession } from "@event-platform/shared-types";
import { useEffect, useState } from "react";
import { quickRequest } from "./api";
import { BackLink } from "../../components/back-link";
import { CheckoutEmailOption } from "../../components/checkout-email-option";
import { useDisplayCurrency } from "../../components/currency-provider";
import { useLocale } from "../../components/locale-provider";
import { QUICK_COPY, QUICK_EXTRA } from "../../lib/quick-copy";
import { ContentLanguageNote } from "../../components/content-language-note";

export default function QuickCheckoutPage() {
  const locale = useLocale();
  const text = QUICK_COPY[locale];
  const copy = QUICK_EXTRA[locale];
  const money = (amount: number, currency: string): string => new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(amount / 100);
  const { currency: displayCurrency, formatMoney: formatDisplayMoney } = useDisplayCurrency();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [seatLayout, setSeatLayout] = useState<PublicVenueLayout | null>(null);
  const [session, setSession] = useState<QuickSession | null>(null);
  const [name, setName] = useState("");
  const [verified, setVerified] = useState(false);
  const [telegramVerified, setTelegramVerified] = useState(false);
  const [emailChoice, setEmailChoice] = useState<CheckoutEmailChoice | null>(null);
  const [emailRequested, setEmailRequested] = useState(false);
  const [selected, setSelected] = useState("");
  const [cartSelection, setCartSelection] = useState<Omit<CreateCartCheckoutRequest, "eventId" | "termsAccepted"> | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { setError(text.unavailable); return; }
    let stopped = false;
    const search = new URLSearchParams(window.location.search);
    const requestedSeats = search.get("seats")?.split(",") ?? [];
    const validSeats = requestedSeats.length > 0 && requestedSeats.length <= 10 && requestedSeats.every((seatId) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seatId)) && new Set(requestedSeats).size === requestedSeats.length;
    const requestedChoice = search.get("choice");
    let requestedCart: Omit<CreateCartCheckoutRequest, "eventId" | "termsAccepted"> | null = null;
    try {
      const parsed = JSON.parse(search.get("cart") ?? "null") as { tickets?: Array<{ ticketTypeId: string; quantity: number }>; tableId?: string | null; seatIds?: string[] } | null;
      if (parsed && Array.isArray(parsed.tickets) && Array.isArray(parsed.seatIds) && parsed.tickets.every((ticket) => /^[0-9a-f-]{36}$/i.test(ticket.ticketTypeId) && Number.isInteger(ticket.quantity) && ticket.quantity >= 1 && ticket.quantity <= 10) && parsed.seatIds.every((seatId) => /^[0-9a-f-]{36}$/i.test(seatId)) && (!parsed.tableId || /^[0-9a-f-]{36}$/i.test(parsed.tableId))) {
        requestedCart = { tickets: parsed.tickets, ...(parsed.tableId ? { tableId: parsed.tableId } : {}), seatIds: parsed.seatIds };
      }
    } catch { /* Ignore invalid shared URL. */ }
    const requestedQuantity = Number(search.get("quantity"));
    const validChoice = requestedChoice && /^(ticket|table):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedChoice);
    void Promise.all([fetch(`/api/events/${id}?locale=${locale}`).then(async r => { if (!r.ok) throw new Error(); return r.json() as Promise<PublicEvent>; }), quickRequest<BookingOptions>(`events/${id}/options`), fetch(`/api/events/${id}/venue-layout`).then(async r => r.ok ? r.json() as Promise<PublicVenueLayout> : null)]).then(([data, layout, seats]) => {
      if (!stopped) {
        setEvent(data);
        setOptions(layout);
        setSeatLayout(seats);
        if (!saved && requestedCart) setCartSelection(requestedCart);
        else if (!saved && validSeats) setSelected(`seats:${requestedSeats.join(",")}`);
        else if (!saved && validChoice) {
          const available = data.ticketTypes.some((ticket) => requestedChoice === `ticket:${ticket.id}` && ticket.status === "active" && ticket.remaining > 0)
            || data.tables.some((table) => requestedChoice === `table:${table.id}` && table.saleMode === "whole_table" && table.availability === "available");
          if (available) { setSelected(requestedChoice); if (requestedChoice.startsWith("ticket:") && Number.isInteger(requestedQuantity) && requestedQuantity >= 1 && requestedQuantity <= 10) setQuantity(requestedQuantity); }
          else setError(copy.choiceUnavailable);
        }
      }
    }).catch(() => { if (!stopped) setError(text.error); });
    setRequestKey(crypto.randomUUID());
    const saved = sessionStorage.getItem(`quick-session:${id}`);
    if (saved) { try { const value = JSON.parse(saved) as { session: QuickSession; selected: string; quantity: number; cartSelection?: typeof cartSelection; key: string }; setSession(value.session); setSelected(value.selected); setQuantity(value.quantity); setCartSelection(value.cartSelection ?? null); setRequestKey(value.key); setLocked(true); } catch { /* Ignore malformed local state. */ } }
    return () => { stopped = true; };
  }, [locale, text, copy]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    void quickRequest<{ verified: boolean; telegramVerified: boolean; verifiedEmail: string | null }>("session", session.sessionToken).then(result => {
      if (!active) return;
      setVerified(result.verified); setTelegramVerified(result.telegramVerified);
      if (result.verifiedEmail) { setEmailChoice({ address: result.verifiedEmail }); setEmailRequested(true); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session]);
  async function act(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : text.error); if (event && selected.startsWith("seats:")) { try { const response = await fetch(`/api/events/${event.id}/venue-layout`, { cache: "no-store" }); if (response.ok) setSeatLayout(await response.json() as PublicVenueLayout); } catch { /* Keep the original checkout error. */ } } } finally { setBusy(false); } }
  async function checkout() {
    if (!event || !session || !verified || !accepted || (!selected && !cartSelection) || (emailRequested && !emailChoice) || (!telegramVerified && !emailChoice)) return;
    const [kind, id] = selected.split(":");
    // Keep the same request and key after timeouts/reloads; an unknown provider outcome is not a new purchase.
    sessionStorage.setItem(`quick-session:${event.id}`, JSON.stringify({ session, selected, quantity, cartSelection, key: requestKey }));
    setLocked(true);
    const emailDelivery = emailChoice ? { emailDelivery: emailChoice } : {};
    const result = cartSelection
      ? await quickRequest<CheckoutResponse>("checkouts/cart", session.sessionToken, { eventId: event.id, ...cartSelection, termsAccepted: true, ...emailDelivery }, requestKey)
      : await quickRequest<CheckoutResponse>(`checkouts/${kind === "ticket" ? "tickets" : kind === "seats" ? "seats" : "tables"}`, session.sessionToken,
        kind === "ticket" ? { ticketTypeId: id, quantity, termsAccepted: true, ...emailDelivery } : kind === "seats" ? { seatIds: validSelectedSeats, termsAccepted: true, ...emailDelivery } : { tableId: id, termsAccepted: true, ...emailDelivery }, requestKey);
    sessionStorage.setItem(`quick-order:${result.orderId}`, session.accessToken);
    window.location.assign(result.paymentLink || localeUrl(`/quick/status?order=${result.orderId}`, locale));
  }
  const item = selected.startsWith("ticket:") ? event?.ticketTypes.find(t => `ticket:${t.id}` === selected) : event?.tables.find(t => `table:${t.id}` === selected);
  const requestedSeatIds = selected.startsWith("seats:") ? selected.slice(6).split(",") : [];
  const validSelectedSeats = requestedSeatIds.filter((id) => seatLayout?.seats?.some((seat) => seat.id === id && seat.availability === "available"));
  const selectedSeats = validSelectedSeats.map((id) => seatLayout!.seats!.find((seat) => seat.id === id)!);
  const seatCurrency = selectedSeats[0]?.currency;
  const seatSelectionValid = requestedSeatIds.length > 0 && requestedSeatIds.length <= 10 && new Set(requestedSeatIds).size === requestedSeatIds.length && validSelectedSeats.length === requestedSeatIds.length && selectedSeats.every((seat) => seat.currency === seatCurrency);
  const units = selected.startsWith("ticket:") ? quantity : 1;
  const cartTickets = cartSelection?.tickets.map((entry) => ({ ...entry, ticket: event?.ticketTypes.find((ticket) => ticket.id === entry.ticketTypeId) })) ?? [];
  const cartTable = event?.tables.find((table) => table.id === cartSelection?.tableId);
  const cartSeats = cartSelection?.seatIds.map((id) => seatLayout?.seats?.find((seat) => seat.id === id)) ?? [];
  const cartCurrencies = [...cartTickets.map((entry) => entry.ticket?.currency), cartTable?.currency, ...cartSeats.map((seat) => seat?.currency)].filter((currency): currency is string => Boolean(currency));
  const cartValid = Boolean(cartSelection && (cartTickets.length || cartTable || cartSeats.length) && cartTickets.every((entry) => entry.ticket?.status === "active" && entry.ticket.remaining >= entry.quantity) && (!cartSelection.tableId || cartTable?.availability === "available") && cartSeats.every((seat) => seat?.availability === "available") && cartCurrencies.every((currency) => currency === cartCurrencies[0]) && cartTickets.reduce((sum, entry) => sum + entry.quantity, cartSeats.length) <= 10);
  const cartAmount = cartTickets.reduce((sum, entry) => sum + (entry.ticket?.payment.amountDue ?? 0) * entry.quantity, 0) + (cartTable?.payment.amountDue ?? 0) + cartSeats.reduce((sum, seat) => sum + (event?.paymentMode === "deposit" ? seat?.deposit ?? 0 : seat?.price ?? 0), 0);
  const payment = item?.payment;
  const venueLayout = options?.layout;
  const venueScale = venueLayout?.version === 2 ? 40 : 1;
  const venueWidth = venueLayout ? (venueLayout.version === 2 ? venueLayout.room.widthM * venueScale : venueLayout.canvas.width) : 0;
  const venueHeight = venueLayout ? (venueLayout.version === 2 ? venueLayout.room.heightM * venueScale : venueLayout.canvas.height) : 0;
  const backParams = new URLSearchParams();
  if (cartSelection) backParams.set("cart", JSON.stringify(cartSelection));
  else if (requestedSeatIds.length) backParams.set("seats", requestedSeatIds.join(","));
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
    <BackLink href={event ? `/events/${event.id}${backParams.size ? `?${backParams.toString()}` : ""}#venue-plan` : "/events"} label={copy.back} />
    <h1 className="text-3xl font-semibold">{text.title}</h1>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {!event ? <p>{copy.loading}</p> : <>
      <h2 className="text-xl font-semibold">{event.title}</h2>
      <ContentLanguageNote contentLocale={event.contentLocale} />
      {venueLayout && <svg role="img" aria-label={copy.venueLayout} className="w-full rounded-xl border" viewBox={`0 0 ${venueWidth} ${venueHeight}`}>{venueLayout.tables.map(t => { const x = t.x * venueScale; const y = t.y * venueScale; const width = t.width * venueScale; const height = t.height * venueScale; return <g key={t.tableId} transform={`rotate(${t.rotation ?? 0} ${x + width / 2} ${y + height / 2})`}><rect x={x} y={y} width={width} height={height} fill={event.tables.find(table => table.id === t.tableId)?.availability === "available" ? "#bbf7d0" : "#e4e4e7"} stroke="#52525b" rx="8" /><text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle">{event.tables.find(table => table.id === t.tableId)?.number}</text></g>; })}</svg>}
      {cartSelection ? <div className="rounded-xl bg-[#f7f2ff] p-4"><strong>{copy.yourChoice}</strong><ul className="mt-2 space-y-1 text-sm">{cartTickets.map((entry) => <li key={entry.ticketTypeId}>{entry.ticket?.name ?? copy.unavailableTicket} × {entry.quantity}</li>)}{cartTable ? <li>{cartTable.name ?? `${copy.table} ${cartTable.number}`} · {copy.wholeTable}</li> : null}{cartSeats.map((seat, index) => <li key={cartSelection.seatIds[index]}>{seat && seatLayout ? seatLabel(seatLayout, seat, copy) : copy.unavailableSeat}</li>)}</ul><p className="mt-3 font-semibold">{copy.total}: {money(cartAmount, cartCurrencies[0] ?? "KZT")}</p>{displayCurrency !== "KZT" && cartCurrencies[0] ? <p className="mt-1 text-xs text-zinc-600">{copy.approximate} {formatDisplayMoney(cartAmount, cartCurrencies[0])} · {copy.paymentIn} {cartCurrencies[0]}</p> : null}<p className="mt-2 text-xs">{copy.combinedRefund}</p>{!cartValid ? <p className="mt-2 text-red-700" role="alert">{copy.selectionChanged}</p> : null}</div> : <label className="block">{copy.tickets} / {copy.tables} / {copy.places}<SelectPicker aria-label={copy.choices} disabled={locked} className="mt-2 w-full rounded-xl border p-3" value={selected} onChange={e => setSelected(e.target.value)}><option value="">—</option>
        {requestedSeatIds.length ? <option value={selected}>{selectedSeats.length} {copy.places}</option> : null}
        {event.ticketTypes.map(t => <option key={t.id} value={`ticket:${t.id}`} disabled={t.remaining < 1 || t.status !== "active"}>{t.name}</option>)}
        {event.tables.filter((table) => table.saleMode === "whole_table").map(t => <option key={t.id} value={`table:${t.id}`} disabled={t.availability !== "available"}>{t.name ?? `№${t.number}`} · {t.seats} {text.seats}</option>)}
      </SelectPicker></label>}
      {selected.startsWith("ticket:") && <label className="block">{text.quantity}<input disabled={locked} className="ml-3 w-24 rounded-xl border p-3" type="number" min={1} max={10} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>}
      {requestedSeatIds.length > 0 && <div className="rounded-xl bg-[#f7f2ff] p-4"><strong>{copy.selectedSeats}</strong><p className="mt-1 text-sm">{selectedSeats.map((seat) => seat.rowId ? `${seatLayout?.rows.find((row) => row.id === seat.rowId)?.name || `${copy.row} ${seatLayout?.rows.find((row) => row.id === seat.rowId)?.number ?? ""}`} · ${copy.seat} ${seat.number}` : seat.tableId ? `${copy.table} ${seatLayout?.tables.find((table) => table.id === seat.tableId)?.number ?? ""} · ${copy.seat} ${seat.number}` : seat.label).join(", ") || copy.seatsUnavailable}</p>{!seatSelectionValid ? <p role="alert" className="mt-2 text-sm text-red-700">{copy.seatSelectionChanged}</p> : null}<a className="mt-2 inline-block text-sm font-semibold text-[#581db3] underline" href={localeUrl(`/events/${event.id}?seats=${validSelectedSeats.join(",")}#venue-plan`, locale)}>{copy.backToMap}</a></div>}
      {seatSelectionValid && <div className="rounded-xl bg-zinc-100 p-4"><strong>{event.paymentMode === "deposit" ? text.deposit : text.full}: {money(selectedSeats.reduce((sum, seat) => sum + (event.paymentMode === "deposit" ? seat.deposit : seat.price ?? 0), 0), seatCurrency ?? "KZT")}</strong></div>}
      {payment && <div className="rounded-xl bg-zinc-100 p-4"><strong>{payment.mode === "deposit" ? text.deposit : text.full}: {money(payment.amountDue * units, payment.currency)}</strong>{displayCurrency !== "KZT" ? <p className="mt-1 text-xs text-zinc-600">{copy.approximate} {formatDisplayMoney(payment.amountDue * units, payment.currency)} · {copy.paymentIn} {payment.currency}</p> : null}{payment.mode === "deposit" && payment.fullAmount !== null && <p>{text.informationalFull}: {money(payment.fullAmount * units, payment.currency)}</p>}</div>}
      <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">{copy.cancellationTerms}</h2><p className="whitespace-pre-wrap">{event.cancellationTerms}</p>{event.paymentMode === "deposit" && <><h2 className="font-semibold">{copy.depositTerms}</h2><p className="whitespace-pre-wrap">{event.depositTerms}</p></>}<label className="flex gap-3"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />{text.accept}</label></section>
      {!session ? <form onSubmit={e => { e.preventDefault(); void act(async () => { setSession(await quickRequest<QuickSession>("sessions", undefined, { name })); }); }} className="space-y-4"><label className="block">{text.name}<input required maxLength={100} className="mt-2 w-full rounded-xl border p-3" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" /></label><button disabled={busy || (cartSelection ? !cartValid : !selected || (requestedSeatIds.length > 0 && !seatSelectionValid))} className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-40">{copy.continueGuest}</button></form> : <div className="space-y-4"><p>{verified ? copy.recipientVerified : copy.verifyRecipient}</p><a href={session.telegramUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-xl border px-5 py-3">{text.verify}</a><button type="button" disabled={busy} className="ml-3 underline" onClick={() => void act(async () => { const result = await quickRequest<{ verified: boolean; telegramVerified: boolean }>("session", session.sessionToken); setVerified(result.verified); setTelegramVerified(result.telegramVerified); })}>{text.check}</button><CheckoutEmailOption quickToken={session.sessionToken} choice={emailChoice} onChoice={setEmailChoice} onEnabledChange={setEmailRequested} onVerified={() => setVerified(true)} /><button disabled={busy || !verified || !accepted || (emailRequested && !emailChoice) || (!telegramVerified && !emailChoice) || (cartSelection ? !cartValid : !selected || quantity < 1 || quantity > 10 || (requestedSeatIds.length > 0 && !seatSelectionValid))} className="block rounded-xl bg-black px-5 py-3 text-white disabled:opacity-40" onClick={() => void act(checkout)}>{busy ? copy.loading : text.checkout}</button></div>}
    </>}
  </main>;
}

function seatLabel(layout: PublicVenueLayout, seat: PublicVenueSeat, copy: typeof QUICK_EXTRA.ru): string {
  if (seat.tableId) return `${copy.table} ${layout.tables.find((item) => item.id === seat.tableId)?.number ?? ""} · ${copy.seat} ${seat.number}`;
  if (seat.rowId) { const row = layout.rows.find((item) => item.id === seat.rowId); return `${row?.name || `${copy.row} ${row?.number ?? ""}`} · ${copy.seat} ${seat.number}`; }
  return seat.label;
}
