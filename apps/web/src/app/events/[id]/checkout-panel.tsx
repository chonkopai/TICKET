"use client";

import { INTL_LOCALES, localeUrl } from "../../../lib/locale";

import { type CheckoutEmailChoice, type CheckoutResponse, type PublicEvent, type PublicPaymentOption, type PublicVenueLayout, type PublicVenueSeat } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession } from "../../(auth)/_lib/session";
import { CheckoutEmailOption } from "../../../components/checkout-email-option";
import { useDisplayCurrency } from "../../../components/currency-provider";
import { useLocale } from "../../../components/locale-provider";
import { CHECKOUT_COPY } from "../../../lib/checkout-copy";

interface CheckoutPanelProps {
  event: PublicEvent;
  layout: PublicVenueLayout | null;
  selectedSeatIds: string[];
  selectedTableId: string | null;
  onTableChange: (id: string | null) => void;
  ticketQuantities: Record<string, number>;
  onTicketChange: (id: string, quantity: number) => void;
  onClearSeats: () => void;
  onRefreshAvailability: () => Promise<void>;
}

export function CheckoutPanel({ event, layout, selectedSeatIds, selectedTableId, onTableChange, ticketQuantities, onTicketChange, onClearSeats, onRefreshAvailability }: CheckoutPanelProps) {
  const locale = useLocale();
  const copy = CHECKOUT_COPY[locale];
  const formatMoney = (value: number, currency: string): string => new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(value / 100);
  const { currency: displayCurrency, formatMoney: formatDisplayMoney } = useDisplayCurrency();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [emailRequested, setEmailRequested] = useState(false);
  const [emailChoice, setEmailChoice] = useState<CheckoutEmailChoice | null>(null);
  useEffect(() => setLoggedIn(Boolean(getSession())), []);
  useEffect(() => { setResult(null); setError(null); }, [selectedSeatIds, selectedTableId, ticketQuantities]);

  const selectedTickets = event.ticketTypes.filter((ticket) => (ticketQuantities[ticket.id] ?? 0) > 0);
  const selection = useMemo(() => {
    const items: Array<{ label: string; amount: number; currency: string }> = [];
    let invalid = false;
    for (const ticket of event.ticketTypes) {
      const quantity = ticketQuantities[ticket.id] ?? 0;
      if (!quantity) continue;
      if (ticket.status !== "active" || quantity > ticket.remaining) invalid = true;
      items.push({ label: `${ticket.name} × ${quantity}`, amount: ticket.payment.amountDue * quantity, currency: ticket.currency });
    }
    const table = event.tables.find((item) => item.id === selectedTableId);
    if (selectedTableId && (!table || table.availability !== "available")) invalid = true;
    if (table) items.push({ label: `${table.name ?? `${copy.table} ${table.number}`} · ${copy.wholeTable}`, amount: table.payment.amountDue, currency: table.currency });
    for (const id of selectedSeatIds) {
      const seat = layout?.seats?.find((item) => item.id === id);
      if (!seat || seat.availability !== "available") { invalid = true; continue; }
      items.push({ label: seatLabel(layout!, seat, copy), amount: event.paymentMode === "deposit" ? seat.deposit : seat.price ?? 0, currency: seat.currency });
    }
    const currency = items[0]?.currency ?? "";
    const count = selectedSeatIds.length + selectedTickets.reduce((sum, ticket) => sum + (ticketQuantities[ticket.id] ?? 0), 0);
    if (count > 10 || items.some((item) => item.currency !== currency)) invalid = true;
    return { items, amount: items.reduce((sum, item) => sum + item.amount, 0), currency, valid: items.length > 0 && !invalid, reason: invalid ? copy.invalidSelection : null };
  }, [event, layout, selectedSeatIds, selectedTableId, ticketQuantities, selectedTickets, copy]);

  async function checkout(): Promise<void> {
    if (!accepted || busy || !selection.valid || (emailRequested && !emailChoice)) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const emailDelivery = emailChoice ? { emailDelivery: emailChoice } : {};
      const cartBody = { eventId: event.id, tickets: selectedTickets.map((ticket) => ({ ticketTypeId: ticket.id, quantity: (ticketQuantities[ticket.id] ?? 0) })), ...(selectedTableId ? { tableId: selectedTableId } : {}), seatIds: selectedSeatIds, termsAccepted: true, ...emailDelivery };
      const request = selectedTickets.length === 1 && !selectedTableId && !selectedSeatIds.length
        ? { path: "/me/checkouts/tickets", body: { ticketTypeId: selectedTickets[0]!.id, quantity: (ticketQuantities[selectedTickets[0]!.id] ?? 0), termsAccepted: true, ...emailDelivery } }
        : selectedTableId && !selectedTickets.length && !selectedSeatIds.length
          ? { path: "/me/checkouts/tables", body: { tableId: selectedTableId, termsAccepted: true, ...emailDelivery } }
          : selectedSeatIds.length && !selectedTickets.length && !selectedTableId
            ? { path: "/me/checkouts/seats", body: { seatIds: selectedSeatIds, termsAccepted: true, ...emailDelivery } }
            : { path: "/me/checkouts/cart", body: cartBody };
      const fingerprint = `${request.path}:${JSON.stringify(request.body)}`;
      const keyStorage = `ticket-checkout-key:${event.id}`;
      const prior = sessionStorage.getItem(keyStorage);
      let requestKey = crypto.randomUUID();
      if (prior) { try { const saved = JSON.parse(prior) as { fingerprint: string; key: string }; if (saved.fingerprint === fingerprint && /^[0-9a-f-]{36}$/i.test(saved.key)) requestKey = saved.key; } catch { /* Ignore stale browser state. */ } }
      sessionStorage.setItem(keyStorage, JSON.stringify({ fingerprint, key: requestKey }));
      const response = await apiRequest<CheckoutResponse>(request.path, { method: "POST", headers: { "Idempotency-Key": requestKey }, body: JSON.stringify(request.body) });
      setResult(response);
      sessionStorage.removeItem(keyStorage);
    } catch (reason) { setError(reason instanceof Error ? reason.message : copy.failed); }
    finally { setBusy(false); }
  }

  const availableTables = event.tables.filter((table) => table.saleMode === "whole_table");
  const hasSelectableSeats = Boolean(layout?.seats?.some((seat) => seat.availability === "available"));
  const hasAvailableInventory = event.ticketTypes.some((ticket) => ticket.status === "active" && ticket.remaining > 0)
    || availableTables.some((table) => table.availability === "available")
    || hasSelectableSeats;
  if (!hasAvailableInventory) return <aside className="border-t-2 border-[#6320ee] bg-white pt-6 lg:sticky lg:top-8" id="tickets"><h2 className="text-2xl font-bold">{copy.choose}</h2><p className="mt-5 rounded-xl bg-[#f0f3ff] p-4 text-sm">{copy.noOptions}</p></aside>;
  const quickParams = new URLSearchParams({ event: event.id });
  if (selectedTickets.length === 1 && !selectedTableId && !selectedSeatIds.length) { quickParams.set("choice", `ticket:${selectedTickets[0]!.id}`); quickParams.set("quantity", String(ticketQuantities[selectedTickets[0]!.id])); }
  else if (selectedTableId && !selectedTickets.length && !selectedSeatIds.length) quickParams.set("choice", `table:${selectedTableId}`);
  else if (selectedSeatIds.length && !selectedTickets.length && !selectedTableId) quickParams.set("seats", selectedSeatIds.join(","));
  else quickParams.set("cart", JSON.stringify({ tickets: selectedTickets.map((ticket) => ({ ticketTypeId: ticket.id, quantity: (ticketQuantities[ticket.id] ?? 0) })), tableId: selectedTableId, seatIds: selectedSeatIds }));
  return <aside className="border-t-2 border-[#6320ee] bg-white pt-6 lg:sticky lg:top-8" id="tickets">
    <div className="flex items-start justify-between gap-3"><h2 className="text-2xl font-bold">{copy.choose}</h2>{selection.currency ? <span className="rounded-md bg-[#e7eefe] px-2 py-1 text-xs font-bold">{selection.currency}</span> : null}</div>
    {hasSelectableSeats ? <a className="mt-5 flex min-h-11 items-center justify-center rounded-lg border border-[#713dcc] bg-[#f7f2ff] px-4 text-sm font-semibold text-[#581db3]" href="#venue-plan">{copy.plan}</a> : null}
    <div className="mt-5 space-y-2">
      {event.ticketTypes.map((ticket) => <div key={ticket.id}><OptionButton active={Boolean((ticketQuantities[ticket.id] ?? 0))} disabled={ticket.status !== "active" || ticket.remaining < 1} onClick={() => onTicketChange(ticket.id, (ticketQuantities[ticket.id] ?? 0) ? 0 : 1)} title={ticket.name} meta={`${ticket.remaining} ${copy.left}`} price={paymentSummary(ticket.payment, formatDisplayMoney)} unavailable={copy.unavailable} />{(ticketQuantities[ticket.id] ?? 0) ? <div className="flex items-center justify-between rounded-xl bg-[#f7f2ff] p-3"><span className="text-sm">{copy.quantity}</span><div className="flex items-center gap-3"><button aria-label={`${copy.decrease} ${ticket.name}`} className="rounded border bg-white px-3 py-1" onClick={() => onTicketChange(ticket.id, (ticketQuantities[ticket.id] ?? 0) - 1)} type="button">−</button><span aria-live="polite">{(ticketQuantities[ticket.id] ?? 0)}</span><button aria-label={`${copy.increase} ${ticket.name}`} className="rounded border bg-white px-3 py-1 disabled:opacity-40" disabled={(ticketQuantities[ticket.id] ?? 0) >= Math.min(10, ticket.remaining)} onClick={() => onTicketChange(ticket.id, (ticketQuantities[ticket.id] ?? 0) + 1)} type="button">+</button></div></div> : null}</div>)}
      {availableTables.map((table) => <OptionButton active={selectedTableId === table.id} disabled={table.availability !== "available"} key={table.id} onClick={() => onTableChange(selectedTableId === table.id ? null : table.id)} title={table.name ?? `${copy.table} ${table.number}`} meta={`${table.seats} ${copy.places} · ${copy.wholeTable}`} price={paymentSummary(table.payment, formatDisplayMoney)} unavailable={copy.unavailable} />)}
      {selectedSeatIds.length ? <div className="rounded-xl border-2 border-[#713dcc] bg-[#f7f2ff] p-4"><strong>{copy.selectedSeats} · {selectedSeatIds.length}</strong><button className="ml-3 text-sm text-[#581db3] underline" onClick={onClearSeats} type="button">{copy.clear}</button></div> : null}
    </div>
    <div className="mt-5 rounded-xl bg-[#f0f3ff] p-4"><p className="text-xs font-semibold uppercase text-[#4a4453]">{copy.yourChoice}</p>{selection.items.length ? <ul className="mt-2 space-y-1 text-sm">{selection.items.map((item, index) => <li className="flex justify-between gap-3" key={`${item.label}-${index}`}><span>{item.label}</span><span>{formatMoney(item.amount, item.currency)}</span></li>)}</ul> : <p className="mt-2">{copy.nothing}</p>}{selection.items.length ? <><p className="mt-3 border-t pt-2 text-right text-xl font-bold text-[#581db3]">{copy.total}: {formatMoney(selection.amount, selection.currency)}</p>{displayCurrency !== "KZT" ? <p className="mt-1 text-right text-xs text-[#4a4453]">{copy.approximately} {formatDisplayMoney(selection.amount, selection.currency)} · {copy.paymentIn} {selection.currency}</p> : null}</> : null}<p className="mt-2 text-xs text-[#4a4453]">{event.paymentMode === "deposit" ? copy.depositExplanation : copy.fullPaymentExplanation}</p></div>
    {selection.reason ? <p className="mt-3 text-sm text-red-700" role="alert">{selection.reason}</p> : null}
    {selectedTickets.length + Number(Boolean(selectedTableId)) + Number(selectedSeatIds.length > 0) > 1 ? <p className="mt-3 text-xs leading-5 text-[#4a4453]">{copy.combinedRefund}</p> : null}
    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#dce2f3] p-3 text-sm"><input checked={accepted} className="mt-1 h-4 w-4 accent-[#5b21b6]" onChange={(input) => setAccepted(input.target.checked)} type="checkbox" /><span>{copy.acceptTerms}</span></label>
    {loggedIn ? <CheckoutEmailOption choice={emailChoice} onChoice={setEmailChoice} onEnabledChange={setEmailRequested} /> : null}
    {error ? <div className="mt-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]"><p role="alert">{error}</p><button className="mt-2 font-semibold underline" onClick={() => void onRefreshAvailability().then(() => setError(null)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : copy.failed))} type="button">{copy.refresh}</button></div> : null}
    {result ? <div className="mt-4 rounded-xl bg-[#e2f7ed] p-4 text-sm text-[#005137]"><p className="font-semibold">{copy.created}</p><a className="mt-3 inline-flex font-bold underline" href={result.paymentLink || localeUrl(`/payment/status?order=${result.orderId}`, locale)}>{copy.continuePayment}</a></div> : null}
    {loggedIn ? <button className="mt-4 min-h-12 w-full rounded-lg bg-[#5b21b6] px-5 font-semibold text-white disabled:bg-[#dce2f3] disabled:text-[#77717f]" disabled={!accepted || !selection.valid || busy || Boolean(result) || (emailRequested && !emailChoice)} onClick={() => void checkout()} type="button">{busy ? copy.loading : selection.currency ? `${copy.pay} · ${formatMoney(selection.amount, selection.currency)}` : copy.pay}</button> : <Link aria-disabled={!accepted || !selection.valid} className={`mt-4 flex min-h-12 w-full items-center justify-center rounded-lg font-semibold ${accepted && selection.valid ? "bg-[#5b21b6] text-white" : "pointer-events-none bg-[#dce2f3] text-[#77717f]"}`} href={localeUrl(`/quick?${quickParams.toString()}`, locale)}>{copy.quick}</Link>}
    {!loggedIn ? <p className="mt-3 text-center text-xs text-[#4a4453]">{copy.guestHint}</p> : null}
    {layout ? <a className="mt-4 flex justify-center text-sm font-semibold text-[#581db3] underline" href="#venue-plan">{copy.openPlan}</a> : null}
  </aside>;
}

function OptionButton({ active, disabled, onClick, title, meta, price, unavailable }: { active: boolean; disabled: boolean; onClick: () => void; title: string; meta: string; price: string; unavailable: string }) {
  return <button aria-pressed={active} className={`w-full rounded-xl border p-3 text-left ${active ? "border-[#713dcc] bg-[#f7f2ff]" : "border-[#dce2f3] hover:border-[#a98ae4]"} disabled:opacity-60`} disabled={disabled} onClick={onClick} type="button"><span className="flex items-start gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${active ? "border-[#5b21b6] bg-[#5b21b6] text-white" : "border-[#a8adbb]"}`}>{active ? "✓" : null}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap justify-between gap-2"><strong>{title}</strong><strong className="text-[#581db3]">{price}</strong></span><small className="block text-[#4a4453]">{disabled ? unavailable : meta}</small></span></span></button>;
}
function paymentSummary(payment: PublicPaymentOption, format: (amount: number, currency: string) => string): string { return format(payment.amountDue, payment.currency); }
function seatLabel(layout: PublicVenueLayout, seat: PublicVenueSeat, copy: typeof CHECKOUT_COPY.ru): string {
  if (seat.tableId) { const table = layout.tables.find((item) => item.id === seat.tableId); return `${copy.table} ${table?.number ?? ""} · ${copy.seat} ${seat.number}`; }
  if (seat.rowId) { const row = layout.rows.find((item) => item.id === seat.rowId); return `${row?.name || `${copy.row} ${row?.number ?? ""}`} · ${copy.seat} ${seat.number}`; }
  return seat.label;
}
