"use client";

import type { PaymentStatusResponse } from "@event-platform/shared-types";
import { ru } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { apiRequest } from "../../../(auth)/_lib/api";

const terminal = new Set(["paid", "failed", "cancelled", "refunded", "expired", "review_required"]);

export default function PaymentStatusPage() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState<PaymentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("order");
    if (!value || !/^[0-9a-f-]{20,}$/i.test(value)) {
      setError(ru.checkout.paymentStatusError);
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
      if (stopped) return;
      try {
        const next = await apiRequest<PaymentStatusResponse>(`/orders/${orderId}/payment-status`);
        if (stopped) return;
        setStatus(next);
        setError(null);
        attempts += 1;
        if (!terminal.has(next.status) && attempts < 20) timer = window.setTimeout(() => void read(), 3_000);
      } catch {
        if (!stopped) setError(ru.checkout.paymentStatusError);
      }
    };
    void read();
    return () => { stopped = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [orderId]);

  const label = status ? ru.checkout.paymentStatuses[status.status] : ru.common.loading;
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-16">
    <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-semibold">{ru.checkout.paymentStatusTitle}</h1>
      {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : null}
      {status ? <div className="mt-6 space-y-3 rounded-2xl bg-zinc-50 p-5"><p className="text-xl font-semibold">{label}</p><p className="text-zinc-600">{formatMoney(status.amount, status.currency)} · {status.paymentLabel === "deposit" ? ru.checkout.deposit : ru.checkout.fullPayment}</p>{status.status === "pending" && status.paymentLink ? <a className="font-semibold underline" href={status.paymentLink}>{ru.checkout.continuePayment}</a> : null}</div> : null}
      <Link className="mt-7 inline-block underline" href="/my-events">{ru.guest.myEvents}</Link>
    </section>
  </main>;
}

function formatMoney(value: number, currency: string): string { return `${(value / 100).toLocaleString("ru-RU")} ${currency}`; }
