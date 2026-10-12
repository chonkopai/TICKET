"use client";
import { RefundPolicyText } from "../../../components/event-presentation";

import { INTL_LOCALES, localeUrl } from "../../../lib/locale";

import { type CheckoutEmailChoice, type CheckoutResponse, type PublicEvent, type PublicPaymentOption, type PublicVenueLayout, type PublicVenueSeat } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession, subscribeSession } from "../../(auth)/_lib/session";
import { CheckoutEmailOption } from "../../../components/checkout-email-option";
import { useDisplayCurrency } from "../../../components/currency-provider";
import { useLocale } from "../../../components/locale-provider";
import { CHECKOUT_COPY } from "../../../lib/checkout-copy";
import { BOOKING_PANEL_COPY } from "../../../lib/booking-panel-copy";
import { AccountIcon } from "../../../components/account-icon";
import "./checkout-panel.css";

interface CheckoutPanelProps {
  readOnly?: boolean;
  emptyMessage?: string | undefined;
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

export function CheckoutPanel({ event, layout, selectedSeatIds, selectedTableId, onTableChange, ticketQuantities, onTicketChange, onClearSeats, onRefreshAvailability, readOnly = false, emptyMessage }: CheckoutPanelProps) {
  const locale = useLocale();
  const copy = CHECKOUT_COPY[locale];
  const design = BOOKING_PANEL_COPY[locale];
  const formatMoney = (value: number, currency: string): string => new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(value / 100);
  const { currency: displayCurrency, formatMoney: formatDisplayMoney } = useDisplayCurrency();
  const [accepted, setAccepted] = useState(false);
  useEffect(()=>setAccepted(false),[event.refundPolicyRevision,event.contentLocale]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [emailRequested, setEmailRequested] = useState(false);
  const [emailChoice, setEmailChoice] = useState<CheckoutEmailChoice | null>(null);
  useEffect(() => {
    if (readOnly) return;
    const refresh = () => setLoggedIn(Boolean(getSession()));
    refresh();
    return subscribeSession(refresh);
  }, [readOnly]);
  useEffect(() => { setResult(null); setError(null); }, [selectedSeatIds, selectedTableId, ticketQuantities]);
  const selectionKey = JSON.stringify([selectedSeatIds.toSorted(), selectedTableId, Object.entries(ticketQuantities).sort(([left], [right]) => left.localeCompare(right))]);
  useEffect(() => setAccepted(false), [selectionKey]);

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
      items.push({ label: seatLabel(layout!, seat, copy), amount: seat.price ?? 0, currency: seat.currency });
    }
    const currency = items[0]?.currency ?? "";
    const count = selectedSeatIds.length + selectedTickets.reduce((sum, ticket) => sum + (ticketQuantities[ticket.id] ?? 0), 0);
    if (count > 10 || items.some((item) => item.currency !== currency)) invalid = true;
    return { items, amount: items.reduce((sum, item) => sum + item.amount, 0), currency, valid: items.length > 0 && !invalid, reason: invalid ? copy.invalidSelection : null };
  }, [event, layout, selectedSeatIds, selectedTableId, ticketQuantities, selectedTickets, copy]);
  useEffect(() => {
    if (!selection.items.length) { setEmailRequested(false); setEmailChoice(null); }
  }, [selection.items.length]);

  async function checkout(): Promise<void> {
    if (readOnly || !accepted || busy || !selection.valid || (emailRequested && !emailChoice)) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const emailDelivery = emailChoice ? { emailDelivery: emailChoice } : {};
      const cartBody = { eventId: event.id, tickets: selectedTickets.map((ticket) => ({ ticketTypeId: ticket.id, quantity: (ticketQuantities[ticket.id] ?? 0) })), ...(selectedTableId ? { tableId: selectedTableId } : {}), seatIds: selectedSeatIds, termsAccepted: true, contentLocale:event.contentLocale,policyRevision:event.refundPolicyRevision, ...emailDelivery };
      const request = selectedTickets.length === 1 && !selectedTableId && !selectedSeatIds.length
        ? { path: "/me/checkouts/tickets", body: { ticketTypeId: selectedTickets[0]!.id, quantity: (ticketQuantities[selectedTickets[0]!.id] ?? 0), termsAccepted: true, contentLocale:event.contentLocale,policyRevision:event.refundPolicyRevision, ...emailDelivery } }
        : selectedTableId && !selectedTickets.length && !selectedSeatIds.length
          ? { path: "/me/checkouts/tables", body: { tableId: selectedTableId, termsAccepted: true, contentLocale:event.contentLocale,policyRevision:event.refundPolicyRevision, ...emailDelivery } }
          : selectedSeatIds.length && !selectedTickets.length && !selectedTableId
            ? { path: "/me/checkouts/seats", body: { seatIds: selectedSeatIds, termsAccepted: true, contentLocale:event.contentLocale,policyRevision:event.refundPolicyRevision, ...emailDelivery } }
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

  const header = <header className="checkout-heading">
    <span className="checkout-heading-icon"><AccountIcon name="ticket" /></span>
    <div><h2>{copy.choose}</h2><p>{event.saleMode === "free" ? design.freeIntro : design.paidIntro}</p></div>
  </header>;
  if (event.paymentMode === "deposit") return <aside id="tickets" className="event-booking">
    {header}<div className="checkout-empty"><AccountIcon name="info" /><h3>{design.paused}</h3><p>{design.pausedHint}</p></div>
  </aside>;
  const availableTables = event.tables.filter((table) => table.saleMode === "whole_table");
  const hasSelectableSeats = Boolean(layout?.seats?.some((seat) => seat.availability === "available"));
  const hasAvailableInventory = event.ticketTypes.some((ticket) => ticket.status === "active" && ticket.remaining > 0)
    || availableTables.some((table) => table.availability === "available") || hasSelectableSeats;
  if (!hasAvailableInventory) return <aside className="event-booking" id="tickets">
    {header}<div className="checkout-empty"><AccountIcon name="ticket" /><p>{emptyMessage ?? copy.noOptions}</p></div>
  </aside>;
  const quickParams = new URLSearchParams({ event: event.id });
  if (selectedTickets.length === 1 && !selectedTableId && !selectedSeatIds.length) { quickParams.set("choice", `ticket:${selectedTickets[0]!.id}`); quickParams.set("quantity", String(ticketQuantities[selectedTickets[0]!.id])); }
  else if (selectedTableId && !selectedTickets.length && !selectedSeatIds.length) quickParams.set("choice", `table:${selectedTableId}`);
  else if (selectedSeatIds.length && !selectedTickets.length && !selectedTableId) quickParams.set("seats", selectedSeatIds.join(","));
  else quickParams.set("cart", JSON.stringify({ tickets: selectedTickets.map((ticket) => ({ ticketTypeId: ticket.id, quantity: (ticketQuantities[ticket.id] ?? 0) })), tableId: selectedTableId, seatIds: selectedSeatIds }));
  const total = selection.amount === 0 ? design.free : formatMoney(selection.amount, selection.currency);
  const checkoutDisabled = !accepted || !selection.valid || busy || (emailRequested && !emailChoice);
  const resultHref = result ? result.amountDue === 0
    ? localeUrl(result.ticketIds[0] ? `/account/tickets/${result.ticketIds[0]}` : "/account", locale)
    : result.paymentLink || localeUrl(`/payment/status?order=${result.orderId}`, locale) : "";
  const hint = !selection.items.length ? null : !accepted ? design.acceptHint : emailRequested && !emailChoice ? design.emailHint : null;
  return <aside className="event-booking" id="tickets">
    {header}
    {hasSelectableSeats ? <a className="checkout-plan-button" href="#venue-plan"><AccountIcon name="map-pin" /><span>{copy.plan.replace(/\s*↓$/, "")}</span><AccountIcon name="arrow-up-right" /></a> : null}
    <div className="checkout-options">
      {event.ticketTypes.map(ticket => {
        const quantity = ticketQuantities[ticket.id] ?? 0;
        const available = ticket.status === "active" && ticket.remaining > 0;
        return <article className={`checkout-ticket${quantity ? " is-selected" : ""}${available ? "" : " is-unavailable"}`} key={ticket.id} aria-label={ticket.name}>
          <div className="checkout-ticket-heading"><h3>{ticket.name}</h3><strong className="checkout-option-price">{ticket.payment.amountDue === 0 ? design.free : paymentSummary(ticket.payment, formatDisplayMoney)}</strong></div>
          {ticket.description ? <p className="checkout-ticket-description">{ticket.description}</p> : null}
          <div className="checkout-ticket-controls"><span className={`checkout-availability${available ? "" : " is-unavailable"}`}><span aria-hidden="true" />{available ? `${ticket.remaining} ${copy.left}` : copy.unavailable}</span>
            {quantity ? <div className="checkout-stepper" role="group" aria-label={`${copy.quantity}: ${ticket.name}`}>
              <button aria-label={`${copy.decrease} ${ticket.name}`} onClick={click => { const option = click.currentTarget.closest("article"); onTicketChange(ticket.id, quantity - 1); if (quantity === 1) requestAnimationFrame(() => option?.querySelector<HTMLButtonElement>(".checkout-add")?.focus({ preventScroll: true })); }} type="button">−</button>
              <output aria-live="polite" aria-label={`${copy.quantity}: ${ticket.name}`}>{quantity}</output>
              <button aria-label={`${copy.increase} ${ticket.name}`} disabled={!available || quantity >= Math.min(10, ticket.remaining)} onClick={() => onTicketChange(ticket.id, quantity + 1)} type="button">+</button>
            </div> : <button className="checkout-add" disabled={!available} onClick={click => { const option = click.currentTarget.closest("article"); onTicketChange(ticket.id, 1); requestAnimationFrame(() => option?.querySelector<HTMLButtonElement>(".checkout-stepper button")?.focus({ preventScroll: true })); }} type="button" aria-label={`${design.add}: ${ticket.name}`}>{design.add}<AccountIcon name="plus" /></button>}
          </div>
        </article>;
      })}
      {availableTables.map(table => <OptionButton active={selectedTableId === table.id} disabled={table.availability !== "available"} key={table.id} onClick={() => onTableChange(selectedTableId === table.id ? null : table.id)} title={table.name ?? `${copy.table} ${table.number}`} meta={`${table.seats} ${copy.places} · ${copy.wholeTable}`} price={table.payment.amountDue === 0 ? design.free : paymentSummary(table.payment, formatDisplayMoney)} unavailable={copy.unavailable} />)}
      {selectedSeatIds.length ? <div className="checkout-selected-seats"><AccountIcon name="circle-check" /><strong>{copy.selectedSeats} · {selectedSeatIds.length}</strong><button className="checkout-text-action" onClick={onClearSeats} type="button">{copy.clear}</button></div> : null}
    </div>
    <section className="checkout-summary" aria-label={copy.yourChoice}>
      <div className="checkout-summary-heading"><h3>{copy.yourChoice}</h3>{selection.currency ? <span>{selection.currency}</span> : null}</div>
      {selection.items.length ? <>
        <ul>{selection.items.map((item, index) => <li key={`${item.label}-${index}`}><span>{item.label}</span><span>{item.amount === 0 ? design.free : formatMoney(item.amount, item.currency)}</span></li>)}</ul>
        <div className="checkout-total"><span>{copy.total}</span><strong>{total}</strong></div>
        {selection.amount > 0 && displayCurrency !== selection.currency ? <p className="checkout-conversion">{copy.approximately} {formatDisplayMoney(selection.amount, selection.currency)} · {copy.paymentIn} {selection.currency}</p> : null}
      </> : <p className="checkout-summary-empty"><AccountIcon name="shopping-bag" />{design.selectHint}</p>}
    </section>
    {selection.reason ? <p className="checkout-message is-error" role="alert">{selection.reason}</p> : null}
    {selection.items.length > 0 ? <div className="checkout-details">
      {selectedTickets.length + Number(Boolean(selectedTableId)) + Number(selectedSeatIds.length > 0) > 1 ? <p className="checkout-note">{copy.combinedRefund}</p> : null}
      {event.creationVersion === 2 ? <details className="checkout-refund"><summary><AccountIcon name="undo" /><span>{design.refund}</span><AccountIcon name="chevron-down" /></summary><div><RefundPolicyText locale={locale} free={event.saleMode === "free"} available={event.refundsAvailable ?? false} conditions={event.cancellationTerms} /></div></details> : null}
      <label className="checkout-terms"><input checked={accepted} disabled={busy || Boolean(result)} onChange={input => setAccepted(input.target.checked)} type="checkbox" /><span>{event.creationVersion === 2 ? ({ ru: "Принимаю условия регистрации, покупки и отмены", en: "I accept the registration, purchase and cancellation terms", kk: "Тіркелу, сатып алу және бас тарту шарттарын қабылдаймын" })[locale] : copy.acceptTerms}</span></label>
      {loggedIn ? <CheckoutEmailOption compact choice={emailChoice} onChoice={setEmailChoice} onEnabledChange={setEmailRequested} /> : null}
    </div> : null}
    {error ? <div className="checkout-message is-error"><p role="alert">{error}</p><button className="checkout-text-action" onClick={() => void onRefreshAvailability().then(() => setError(null)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : copy.failed))} type="button"><AccountIcon name="refresh-cw" />{copy.refresh}</button></div> : null}
    {result ? <div className="checkout-message is-success" role="status"><AccountIcon name="circle-check" /><p>{result.amountDue === 0 ? design.confirmed : copy.created}</p></div> : null}
    <footer className="checkout-footer">
      {result ? <a className="checkout-primary" href={resultHref}><span>{result.amountDue === 0 ? design.openTicket : copy.continuePayment}</span><AccountIcon name="arrow-right" /></a>
        : loggedIn ? <button className="checkout-primary" disabled={checkoutDisabled} aria-busy={busy} onClick={() => void checkout()} type="button"><span>{busy ? copy.loading : event.saleMode === "free" ? design.registration : copy.pay}</span><AccountIcon name="arrow-right" /></button>
        : <Link aria-disabled={!accepted || !selection.valid} tabIndex={accepted && selection.valid ? 0 : -1} className={`checkout-primary${accepted && selection.valid ? "" : " is-disabled"}`} onClick={event => { if (!accepted || !selection.valid) event.preventDefault(); }} href={localeUrl(`/quick?${quickParams.toString()}`, locale)}><span>{copy.quick}</span><AccountIcon name="arrow-right" /></Link>}
      {hint && !result ? <p className="checkout-continue-hint">{hint}</p> : null}
      <p className="checkout-delivery-hint"><AccountIcon name="qr" />{design.delivery}</p>
      {!loggedIn && selection.items.length ? <p className="checkout-guest-hint">{copy.guestHint}</p> : null}
    </footer>
  </aside>;
}

function OptionButton({ active, disabled, onClick, title, meta, price, unavailable }: { active: boolean; disabled: boolean; onClick: () => void; title: string; meta: string; price: string; unavailable: string }) {
  return <button aria-pressed={active} className={`checkout-table${active ? " is-selected" : ""}`} disabled={disabled} onClick={onClick} type="button">
    <span className="checkout-table-icon"><AccountIcon name={active ? "circle-check" : "ticket"} /></span>
    <span className="checkout-table-label"><strong>{title}</strong><small>{disabled ? unavailable : meta}</small></span>
    <strong className="checkout-option-price">{price}</strong>
  </button>;
}
function paymentSummary(payment: PublicPaymentOption, format: (amount: number, currency: string) => string): string { return format(payment.amountDue, payment.currency); }
function seatLabel(layout: PublicVenueLayout, seat: PublicVenueSeat, copy: typeof CHECKOUT_COPY.ru): string {
  if (seat.tableId) { const table = layout.tables.find((item) => item.id === seat.tableId); return `${copy.table} ${table?.number ?? ""} · ${copy.seat} ${seat.number}`; }
  if (seat.rowId) { const row = layout.rows.find((item) => item.id === seat.rowId); return `${row?.name || `${copy.row} ${row?.number ?? ""}`} · ${copy.seat} ${seat.number}`; }
  return seat.label;
}
