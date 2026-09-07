"use client";

import { quickRu as text, ru, type BookingOptions, type CheckoutResponse, type PublicEvent, type QuickSession } from "@event-platform/shared-types";
import { useEffect, useState } from "react";
import { quickRequest } from "./api";
import { BackLink } from "../../components/back-link";

export default function QuickCheckoutPage() {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [session, setSession] = useState<QuickSession | null>(null);
  const [name, setName] = useState("");
  const [verified, setVerified] = useState(false);
  const [selected, setSelected] = useState("");
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
    void Promise.all([fetch(`/api/events/${id}`).then(async r => { if (!r.ok) throw new Error(); return r.json() as Promise<PublicEvent>; }), quickRequest<BookingOptions>(`events/${id}/options`)]).then(([data, layout]) => {
      if (!stopped) { setEvent(data); setOptions(layout); }
    }).catch(() => { if (!stopped) setError(text.error); });
    setRequestKey(crypto.randomUUID());
    const saved = sessionStorage.getItem(`quick-session:${id}`);
    if (saved) { try { const value = JSON.parse(saved) as { session: QuickSession; selected: string; quantity: number; key: string }; setSession(value.session); setSelected(value.selected); setQuantity(value.quantity); setRequestKey(value.key); setLocked(true); } catch { /* Ignore malformed local state. */ } }
    return () => { stopped = true; };
  }, []);
  async function act(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await work(); } catch { setError(text.error); } finally { setBusy(false); } }
  async function checkout() {
    if (!event || !session || !verified || !accepted || !selected) return;
    const [kind, id] = selected.split(":");
    // Keep the same request and key after timeouts/reloads; an unknown provider outcome is not a new purchase.
    sessionStorage.setItem(`quick-session:${event.id}`, JSON.stringify({ session, selected, quantity, key: requestKey }));
    setLocked(true);
    const result = await quickRequest<CheckoutResponse>(`checkouts/${kind === "ticket" ? "tickets" : "tables"}`, session.sessionToken,
      kind === "ticket" ? { ticketTypeId: id, quantity, termsAccepted: true } : { tableId: id, termsAccepted: true }, requestKey);
    sessionStorage.setItem(`quick-order:${result.orderId}`, session.accessToken);
    window.location.assign(result.paymentLink || `/quick/status?order=${result.orderId}`);
  }
  const item = selected.startsWith("ticket:") ? event?.ticketTypes.find(t => `ticket:${t.id}` === selected) : event?.tables.find(t => `table:${t.id}` === selected);
  const units = selected.startsWith("ticket:") ? quantity : 1;
  const payment = item?.payment;
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
    <BackLink href={event ? `/events/${event.id}` : "/events"} label={ru.publicEvent.back} />
    <h1 className="text-3xl font-semibold">{text.title}</h1>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {!event ? <p>{ru.common.loading}</p> : <>
      <h2 className="text-xl font-semibold">{event.title}</h2>
      {options?.layout && <svg role="img" aria-label={ru.checkout.venueLayout} className="w-full rounded-xl border" viewBox={`0 0 ${options.layout.canvas.width} ${options.layout.canvas.height}`}>{options.layout.tables.map(t => <g key={t.tableId} transform={`rotate(${t.rotation ?? 0} ${t.x + t.width / 2} ${t.y + t.height / 2})`}><rect x={t.x} y={t.y} width={t.width} height={t.height} fill={event.tables.find(table => table.id === t.tableId)?.availability === "available" ? "#bbf7d0" : "#e4e4e7"} stroke="#52525b" rx="8" /><text x={t.x + t.width / 2} y={t.y + t.height / 2} textAnchor="middle" dominantBaseline="middle">{event.tables.find(table => table.id === t.tableId)?.number}</text></g>)}</svg>}
      <label className="block">{ru.publicEvent.tickets} / {ru.publicEvent.tables}<select disabled={locked} className="mt-2 w-full rounded-xl border p-3" value={selected} onChange={e => setSelected(e.target.value)}><option value="">—</option>
        {event.ticketTypes.map(t => <option key={t.id} value={`ticket:${t.id}`} disabled={t.remaining < 1 || t.status !== "active"}>{t.name}</option>)}
        {event.tables.map(t => <option key={t.id} value={`table:${t.id}`} disabled={t.availability !== "available"}>{t.name ?? `№${t.number}`} · {t.seats} {text.seats}</option>)}
      </select></label>
      {selected.startsWith("ticket:") && <label className="block">{text.quantity}<input disabled={locked} className="ml-3 w-24 rounded-xl border p-3" type="number" min={1} max={10} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>}
      {payment && <div className="rounded-xl bg-zinc-100 p-4"><strong>{payment.mode === "deposit" ? text.deposit : text.full}: {(payment.amountDue * units / 100).toLocaleString("ru-RU")} {payment.currency}</strong>{payment.mode === "deposit" && payment.fullAmount !== null && <p>{text.informationalFull}: {(payment.fullAmount * units / 100).toLocaleString("ru-RU")} {payment.currency}</p>}</div>}
      <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">{ru.events.fields.cancellationTerms}</h2><p className="whitespace-pre-wrap">{event.cancellationTerms}</p>{event.paymentMode === "deposit" && <><h2 className="font-semibold">{ru.events.fields.depositTerms}</h2><p className="whitespace-pre-wrap">{event.depositTerms}</p></>}<label className="flex gap-3"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />{text.accept}</label></section>
      {!session ? <form onSubmit={e => { e.preventDefault(); void act(async () => { setSession(await quickRequest<QuickSession>("sessions", undefined, { name })); }); }} className="space-y-4"><label className="block">{text.name}<input required maxLength={100} className="mt-2 w-full rounded-xl border p-3" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" /></label><button disabled={busy || !selected} className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-40">{text.start}</button></form> : <div className="space-y-4"><p>{verified ? text.verified : text.waiting}</p><a href={session.telegramUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-xl border px-5 py-3">{text.verify}</a><button type="button" disabled={busy} className="ml-3 underline" onClick={() => void act(async () => { const result = await quickRequest<{ verified: boolean }>("session", session.sessionToken); setVerified(result.verified); })}>{text.check}</button><button disabled={busy || !verified || !accepted || !selected || quantity < 1 || quantity > 10} className="block rounded-xl bg-black px-5 py-3 text-white disabled:opacity-40" onClick={() => void act(checkout)}>{busy ? ru.common.loading : text.checkout}</button></div>}
    </>}
  </main>;
}
