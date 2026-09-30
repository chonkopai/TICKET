"use client";

import { INTL_LOCALES, localeUrl } from "../../../../lib/locale";

import type { PaymentStatusResponse } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { apiRequest } from "../../../(auth)/_lib/api";
import { useDisplayCurrency } from "../../../../components/currency-provider";
import { useLocale } from "../../../../components/locale-provider";
import { PAYMENT_STATUS_COPY } from "../../../../lib/payment-status-copy";

const terminal = new Set(["paid", "failed", "cancelled", "refunded", "expired", "review_required"]);

export default function PaymentStatusPage() {
  const locale = useLocale();
  const copy = PAYMENT_STATUS_COPY[locale];
  const formatMoney = (value: number, currency: string): string => new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(value / 100);
  const { currency: displayCurrency, formatMoney: formatDisplayMoney } = useDisplayCurrency();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState<PaymentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [emailDelivery, setEmailDelivery] = useState<{ status: string; address: string | null; acceptedAt: string | null } | null>(null);
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("order");
    if (!value || !/^[0-9a-f-]{20,}$/i.test(value)) {
      setError(copy.error);
      return;
    }
    setOrderId(value);
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let stopped = false;
    let timer: number | undefined;
    let attempts = 0;
    const read = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const next = await apiRequest<PaymentStatusResponse>(`/orders/${orderId}/payment-status`);
        if (stopped) return;
        setStatus(next);
        void apiRequest<{ status: string; address: string | null; acceptedAt: string | null }>(`/me/orders/${orderId}/email-delivery`).then(value => { if (!stopped) setEmailDelivery(value); }).catch(() => undefined);
        setError(null);
        attempts += 1;
        if (!terminal.has(next.status) && attempts < 120) timer = window.setTimeout(() => void read(), 3_000);
      } catch {
        if (!stopped) { setError(copy.error); if (++attempts < 120) timer = window.setTimeout(() => void read(), 10_000); }
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") { if (timer !== undefined) window.clearTimeout(timer); void read(); } };
    document.addEventListener("visibilitychange", onVisible);
    void read();
    return () => { stopped = true; if (timer !== undefined) window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [orderId, retryKey, copy]);

  const label = status ? copy.statuses[status.status] ?? status.status : copy.loading;
  async function resendEmail() {
    if (!orderId || resendBusy) return;
    setResendBusy(true);
    try { await apiRequest(`/me/orders/${orderId}/email-delivery/resend`, { method: "POST" }); setEmailDelivery(await apiRequest(`/me/orders/${orderId}/email-delivery`)); setError(null); }
    catch { setError(copy.resendError); }
    finally { setResendBusy(false); }
  }
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-16">
    <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-semibold">{copy.title}</h1>
      {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-800" role="alert">{error}</p> : null}
      {status ? <div className="mt-6 space-y-3 rounded-2xl bg-zinc-50 p-5" role="status"><p className="text-xl font-semibold">{label}</p><p className="text-zinc-600">{formatMoney(status.amount, status.currency)} · {status.paymentLabel === "deposit" ? copy.deposit : copy.full}</p>{displayCurrency !== "KZT" ? <p className="text-xs text-zinc-500">{copy.approximate} {formatDisplayMoney(status.amount, status.currency)} · {copy.paymentIn} {status.currency}</p> : null}{status.status === "pending" && status.expiresAt ? <p className="text-sm">{copy.payBefore} {new Date(status.expiresAt).toLocaleString(INTL_LOCALES[locale])}</p> : null}{status.status === "pending" && status.paymentLink ? <a className="font-semibold underline" href={status.paymentLink}>{copy.continuePayment}</a> : null}</div> : null}
      {emailDelivery?.address ? <div className="mt-4 rounded-xl border p-4 text-sm"><p>{copy.emailTickets}: {emailDelivery.address}</p><p>{copy.emailStatuses[emailDelivery.status] ?? emailDelivery.status}</p>{["accepted", "failed", "uncertain"].includes(emailDelivery.status) ? <button type="button" disabled={resendBusy} className="mt-2 font-semibold text-[#5b21b6] underline disabled:opacity-50" onClick={() => void resendEmail()}>{copy.resend}</button> : null}</div> : null}
      {orderId ? <button className="mt-5 block font-semibold underline" onClick={() => setRetryKey((value) => value + 1)} type="button">{copy.refresh}</button> : null}
      <Link className="mt-7 inline-block underline" href={localeUrl("/my-events", locale)}>{copy.myEvents}</Link>
    </section>
  </main>;
}
