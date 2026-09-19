"use client";

import { ru, quickRu, type CheckoutResponse, type PublicEvent, type PublicPaymentOption, type PublicVenueLayout } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../(auth)/_lib/api";
import { getSession } from "../../(auth)/_lib/session";

interface CheckoutPanelProps {
  event: PublicEvent;
  layout: PublicVenueLayout | null;
  selectedSeatIds: string[];
  onClearSeats: () => void;
}

export function CheckoutPanel({ event, layout, selectedSeatIds, onClearSeats }: CheckoutPanelProps) {
  const firstTicket = event.ticketTypes.find((ticket) => ticket.status === "active" && ticket.remaining > 0)?.id ?? null;
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(firstTicket);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => setLoggedIn(Boolean(getSession())), []);
  useEffect(() => { if (selectedSeatIds.length) { setSelectedTicketId(null); setSelectedTableId(null); } }, [selectedSeatIds]);

  const selection = useMemo(() => {
    if (selectedSeatIds.length && layout) {
      let total = 0;
      let currency = "KZT";
      for (const id of selectedSeatIds) {
        const canonical = layout.seats?.find((seat) => seat.id === id);
        if (canonical) { total += event.paymentMode === "deposit" ? canonical.deposit : canonical.price ?? 0; currency = canonical.currency; continue; }
        for (const row of layout.rows) {
          const seat = row.seats.find((item) => item.id === id);
          if (seat) { total += event.paymentMode === "deposit" ? seat.deposit : seat.price ?? 0; currency = seat.currency; }
        }
        for (const table of layout.tables) {
          const seat = table.seatRecords.find((item) => item.id === id);
          if (seat) { total += event.paymentMode === "deposit" ? table.deposit : table.price ?? 0; currency = table.currency; }
        }
      }
      return { label: `${selectedSeatIds.length} ${pluralizePlaces(selectedSeatIds.length)}`, amount: total, currency, kind: "seats" as const };
    }
    const table = event.tables.find((item) => item.id === selectedTableId);
    if (table) return { label: table.name ?? `Стол ${table.number}`, amount: table.payment.amountDue, currency: table.payment.currency, kind: "table" as const };
    const ticket = event.ticketTypes.find((item) => item.id === selectedTicketId);
    if (ticket) return { label: ticket.name, amount: ticket.payment.amountDue, currency: ticket.payment.currency, kind: "ticket" as const };
    return null;
  }, [event, layout, selectedSeatIds, selectedTableId, selectedTicketId]);

  async function checkout(): Promise<void> {
    if (!accepted || busy || !selection) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const request = selection.kind === "seats"
        ? { path: "/me/checkouts/seats", body: { seatIds: selectedSeatIds, termsAccepted: true } }
        : selection.kind === "table"
          ? { path: "/me/checkouts/tables", body: { tableId: selectedTableId, termsAccepted: true } }
          : { path: "/me/checkouts/tickets", body: { ticketTypeId: selectedTicketId, quantity: 1, termsAccepted: true } };
      setResult(await apiRequest<CheckoutResponse>(request.path, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(request.body) }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : ru.checkout.failed); }
    finally { setBusy(false); }
  }

  function chooseTicket(id: string): void { setSelectedTicketId(id); setSelectedTableId(null); onClearSeats(); setResult(null); setError(null); }
  function chooseTable(id: string): void { setSelectedTableId(id); setSelectedTicketId(null); onClearSeats(); setResult(null); setError(null); }

  const availableTables = event.tables.filter((table) => table.saleMode === "whole_table" && table.availability !== "booked");
  const seatLoginRequired = selectedSeatIds.length > 0 && !loggedIn;

  return <aside className="sticky top-24 rounded-2xl border border-[#dce2f3] bg-white p-5 shadow-[0_8px_28px_rgba(37,0,89,0.08)] sm:p-6" id="tickets">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#581db3]">{event.paymentMode === "deposit" ? "Бронирование по депозиту" : "Билеты на событие"}</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.02em]">Выберите вариант</h2></div><span className="rounded-md bg-[#e7eefe] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#4a4453]">KZT</span></div>

    <div className="mt-5 space-y-2">
      {event.ticketTypes.map((ticket) => <OptionButton active={selectedTicketId === ticket.id && selectedSeatIds.length === 0} disabled={ticket.status !== "active" || ticket.remaining < 1} key={ticket.id} onClick={() => chooseTicket(ticket.id)} title={ticket.name} meta={`${ticket.remaining} осталось`} price={paymentSummary(ticket.payment)} />)}
      {availableTables.map((table) => <OptionButton active={selectedTableId === table.id && selectedSeatIds.length === 0} disabled={table.availability !== "available"} key={table.id} onClick={() => chooseTable(table.id)} title={table.name ?? `Стол ${table.number}`} meta={`${table.seats} ${pluralizePlaces(table.seats)} · ${table.saleMode === "whole_table" ? "стол целиком" : "по местам"}`} price={paymentSummary(table.payment)} />)}
      {selectedSeatIds.length ? <div className="rounded-xl border-2 border-[#713dcc] bg-[#f7f2ff] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">Места на схеме</p><p className="mt-1 text-xs text-[#4a4453]">{selectedSeatIds.length} {pluralizePlaces(selectedSeatIds.length)}</p></div><button className="text-xs font-semibold text-[#581db3] hover:underline" onClick={onClearSeats} type="button">Очистить</button></div></div> : null}
      {!event.ticketTypes.length && !availableTables.length && !selectedSeatIds.length ? <p className="rounded-xl bg-[#f0f3ff] p-4 text-sm text-[#4a4453]">Доступные варианты скоро появятся.</p> : null}
    </div>

    <div className="mt-5 rounded-xl bg-[#f0f3ff] p-4"><div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">Ваш выбор</p><p className="mt-1 font-semibold">{selection?.label ?? "Ничего не выбрано"}</p></div>{selection ? <p className="shrink-0 text-xl font-bold text-[#581db3]">{formatMoney(selection.amount, selection.currency)}</p> : null}</div><p className="mt-2 text-xs leading-5 text-[#4a4453]">{event.paymentMode === "deposit" ? ru.checkout.depositExplanation : ru.checkout.fullPaymentExplanation}</p></div>

    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#dce2f3] p-3 text-sm leading-5"><input checked={accepted} className="mt-1 h-4 w-4 accent-[#5b21b6]" onChange={(input) => setAccepted(input.target.checked)} type="checkbox" /><span>{ru.checkout.acceptTerms}</span></label>

    {error ? <p className="mt-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Не удалось оформить заказ. Проверьте доступность и попробуйте снова.</p> : null}
    {result ? <div className="mt-4 rounded-xl bg-[#e2f7ed] p-4 text-sm text-[#005137]"><p className="font-semibold">{ru.checkout.created}</p><a className="mt-3 inline-flex font-bold underline" href={result.paymentLink}>{ru.checkout.continuePayment}</a></div> : null}

    {loggedIn ? <button className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#5b21b6] px-5 font-semibold text-white transition hover:bg-[#420093] disabled:cursor-not-allowed disabled:bg-[#dce2f3] disabled:text-[#77717f]" disabled={!accepted || !selection || busy} onClick={() => void checkout()} type="button">{busy ? ru.common.loading : selection?.amount === 0 ? "Получить билет" : `Перейти к оплате${selection ? ` · ${formatMoney(selection.amount, selection.currency)}` : ""}`}<span aria-hidden="true">→</span></button> : seatLoginRequired ? <Link className="mt-4 flex min-h-12 w-full items-center justify-center rounded-lg bg-[#5b21b6] px-5 text-center font-semibold text-white" href="/login">Войти для покупки выбранных мест</Link> : <Link aria-disabled={!accepted || !selection} className={`mt-4 flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-center font-semibold ${accepted && selection ? "bg-[#5b21b6] text-white hover:bg-[#420093]" : "pointer-events-none bg-[#dce2f3] text-[#77717f]"}`} href={`/quick?event=${event.id}`}>{quickRu.quick}</Link>}
    {!loggedIn ? <p className="mt-3 text-center text-xs leading-5 text-[#4a4453]">Личный кабинет не обязателен. Билет придёт в Telegram.</p> : null}
    {layout && (layout.tables.length || layout.rows.length || layout.seats?.length) ? <a className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-[#581db3] hover:underline" href="#venue-plan">Открыть схему зала <span aria-hidden="true">↓</span></a> : null}
  </aside>;
}

function OptionButton({ active, disabled, onClick, title, meta, price }: { active: boolean; disabled: boolean; onClick: () => void; title: string; meta: string; price: string }) {
  return <button aria-pressed={active} className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-[#713dcc] bg-[#f7f2ff] shadow-sm" : "border-[#dce2f3] hover:border-[#a98ae4]"} disabled:cursor-not-allowed disabled:bg-[#f0f3ff] disabled:opacity-60`} disabled={disabled} onClick={onClick} type="button"><div className="flex items-start gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-[#5b21b6]" : "border-[#a8adbb]"}`}>{active ? <span className="h-2.5 w-2.5 rounded-full bg-[#5b21b6]" /> : null}</span><span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong className="truncate">{title}</strong><strong className="shrink-0 text-[#581db3]">{price}</strong></span><span className="mt-1 block text-xs text-[#4a4453]">{disabled ? ru.publicEvent.unavailable : meta}</span></span></div></button>;
}

function paymentName(mode: "deposit" | "full_payment"): string { return mode === "deposit" ? ru.checkout.deposit : ru.checkout.fullPayment; }
function paymentSummary(payment: PublicPaymentOption): string { return `${paymentName(payment.mode)} ${formatMoney(payment.amountDue, payment.currency)}`; }
function formatMoney(value: number, currency: string): string { const symbol = currency === "KZT" ? "₸" : currency; return `${(value / 100).toLocaleString("ru-RU")} ${symbol}`; }
function pluralizePlaces(value: number): string { const tens = value % 100; const units = value % 10; if (tens >= 11 && tens <= 14) return "мест"; if (units === 1) return "место"; if (units >= 2 && units <= 4) return "места"; return "мест"; }
