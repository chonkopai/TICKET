"use client";

import { INTL_LOCALES, localeUrl } from "../../../lib/locale";

import { type QuickOrderStatus } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession } from "../../(auth)/_lib/session";
import { quickRequest } from "../api";
import { TelegramLoginButton } from "../../(auth)/_components/telegram-login-button";
import { BackLink } from "../../../components/back-link";
import { OrderChat } from "../../../components/order-chat";
import { useDisplayCurrency } from "../../../components/currency-provider";
import { useLocale } from "../../../components/locale-provider";
import { QUICK_COPY, QUICK_EXTRA } from "../../../lib/quick-copy";
import { PAYMENT_STATUS_COPY } from "../../../lib/payment-status-copy";
import { ContentLanguageNote } from "../../../components/content-language-note";

export default function QuickStatusPage() {
  const locale = useLocale();
  const text = QUICK_COPY[locale];
  const copy = QUICK_EXTRA[locale];
  const paymentCopy = PAYMENT_STATUS_COPY[locale];
  const money = (amount: number, currency: string): string => new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(amount / 100);
  const { currency: displayCurrency, formatMoney: formatDisplayMoney } = useDisplayCurrency();
  const [access, setAccess] = useState("");
  const [status, setStatus] = useState<QuickOrderStatus | null>(null);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const order = new URLSearchParams(window.location.search).get("order") ?? "";
    const token = sessionStorage.getItem(`quick-order:${order}`);
    if (!token) { setError(text.unavailable); return; }
    setAccess(token); setLoggedIn(Boolean(getSession()));
    let stopped = false, count = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const result = await quickRequest<QuickOrderStatus>("order", token);
        if (stopped) return;
        setStatus(result); setError("");
        if ((result.status === "pending" || (result.status === "paid" && result.deliveryStatus === "pending")) && ++count < 120) timer = setTimeout(() => void poll(), 3000);
      } catch { if (!stopped) { setError(text.error); if (++count < 120) timer = setTimeout(() => void poll(), 10000); } }
    };
    const onVisible = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void poll(); } };
    document.addEventListener("visibilitychange", onVisible);
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [text]);
  async function claim() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { claimToken } = await quickRequest<{ claimToken: string }>("claim-token", access, {});
      await apiRequest("/api/quick/claim", { method: "POST", body: JSON.stringify({ claimToken }) });
      setStatus(await quickRequest<QuickOrderStatus>("order", access));
    } catch { setError(text.error); } finally { setBusy(false); }
  }
  async function resendEmail() {
    if (busy || !access) return;
    setBusy(true); setError("");
    try {
      await quickRequest("order/email-delivery/resend", access, {});
      setStatus(await quickRequest<QuickOrderStatus>("order", access));
    } catch { setError(paymentCopy.resendError); }
    finally { setBusy(false); }
  }
  async function asset(id: string, format: "qr" | "wallet") {
    try {
      const response = await fetch(`/api/quick/tickets/${id}/${format}`, { headers: { authorization: `Bearer ${access}` }, cache: "no-store", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a"); a.href = url; a.download = format === "qr" ? "ticket.png" : "ticket.pkpass"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(format === "wallet" ? copy.walletFailed : text.error); }
  }
  return <main className="mx-auto max-w-2xl space-y-5 px-5 py-10">
    <BackLink href="/events" label={copy.back} />
    <h1 className="text-3xl font-semibold">{status?.title ?? text.title}</h1>
    {status ? <ContentLanguageNote contentLocale={status.sourceLocale} /> : null}
    {status?.event ? <p className="text-sm text-zinc-700">{status.event.date} · {status.event.time} ({status.event.timezone})<br />{status.event.venueName} · {status.event.address}</p> : null}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {status && <>
      <p role="status" className="rounded-xl bg-zinc-100 p-5">{paymentCopy.statuses[status.status] ?? status.status}<br />{status.paymentMode === "deposit" ? text.deposit : text.full}: {money(status.amountDue, status.currency)}{displayCurrency !== "KZT" ? <span className="mt-1 block text-xs text-zinc-600">{copy.approximate} {formatDisplayMoney(status.amountDue, status.currency)} · {copy.paymentIn} {status.currency}</span> : null}</p>
      {status.paymentMode === "deposit" && status.fullAmount !== null ? <p>{text.informationalFull}: {money(status.fullAmount, status.currency)}. {copy.fullPriceRemainder}</p> : null}
      {status.depositTerms ? <p className="whitespace-pre-wrap text-sm">{copy.depositTerms}: {status.depositTerms}</p> : null}
      {status.cancellationTerms ? <p className="whitespace-pre-wrap text-sm">{copy.cancellationTerms}: {status.cancellationTerms}</p> : null}
      {status.status === "pending" && <p>{text.return}{status.expiresAt ? ` ${copy.validUntil} ${new Date(status.expiresAt).toLocaleString(INTL_LOCALES[locale])}.` : ""}</p>}
      {status.status === "paid" && status.emailDelivery.address ? <p className="rounded-xl bg-zinc-50 p-4 text-sm">{copy.emailTickets}: {status.emailDelivery.address}. {copy.status}: {paymentCopy.emailStatuses[status.emailDelivery.status] ?? status.emailDelivery.status}</p> : null}
      {status.status === "paid" && status.emailDelivery.address && ["accepted", "failed", "uncertain"].includes(status.emailDelivery.status) ? <button className="font-semibold text-[#5b21b6] underline disabled:opacity-50" type="button" disabled={busy} onClick={() => void resendEmail()}>{paymentCopy.resend}</button> : null}
      {status.status === "paid" && status.deliveryStatus !== "unavailable" ? <p className="rounded-xl bg-zinc-50 p-4 text-sm">{status.deliveryStatus === "confirmed" ? copy.deliveryConfirmed : copy.deliveryPending}</p> : null}
      {status.tickets.map(ticket => <section key={ticket.id} className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">{ticket.name}</h2>{ticket.seatLabel ? <p>{ticket.seatLabel}</p> : null}<p>{(text.ticketStatuses as Record<string, string>)[ticket.status] ?? ticket.status}</p>{status.status === "paid" && ["active", "used"].includes(ticket.status) && <div className="flex flex-wrap gap-4"><button className="underline" onClick={() => void asset(ticket.id, "qr")}>{text.qr}</button>{ticket.status === "active" && status.walletAvailable && <button className="underline" onClick={() => void asset(ticket.id, "wallet")}>{text.wallet}</button>}</div>}</section>)}
      {status.booking && <p>{copy.tables}: {status.booking.table.name ?? `№${status.booking.table.number}`} · {status.booking.status}</p>}
      {status.status === "paid" && (status.linked ? <p>{text.saved} · <Link href={localeUrl("/my-events", locale)} className="underline">{copy.myEvents}</Link></p> : loggedIn ? <button disabled={busy} className="rounded-xl bg-black px-5 py-3 text-white" onClick={() => void claim()}>{text.claim}</button> : <section><h2 className="mb-4 font-semibold">{text.login}</h2><Link className="font-semibold text-[#5b21b6] underline" href={`/login?returnTo=${encodeURIComponent(`/quick/status?order=${status.orderId}`)}`}>{copy.loginVerified}</Link><div className="mt-4"><TelegramLoginButton onAuthenticated={() => setLoggedIn(true)} /></div></section>)}
      {status.eventId && ["paid", "refunded", "cancelled"].includes(status.status) ? <OrderChat eventId={status.eventId} orderId={status.orderId} mode="anonymous" accessToken={access} /> : null}
    </>}
    {access && <button className="underline" onClick={() => { setLoggedIn(Boolean(getSession())); void quickRequest<QuickOrderStatus>("order", access).then(setStatus).catch(() => setError(text.error)); }}>{text.refresh}</button>}
  </main>;
}
