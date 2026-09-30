"use client";

import { INTL_LOCALES } from "../../lib/locale";

import { useEffect, useRef, useState } from "react";

import { PageShell } from "../../components/ui";
import { useLocale } from "../../components/locale-provider";
import { DELIVERY_COPY } from "../../lib/delivery-copy";
import { ContentLanguageNote } from "../../components/content-language-note";
import type { EventLocale } from "@event-platform/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type DeliveryView = {
  orderId: string; title: string; sourceLocale?: EventLocale; date: string | null; time: string | null; timezone: string | null; venue: string | null;
  paymentMode: "deposit" | "full_payment"; amountPaid: number; currency: string; status: string;
  items: Array<{ name: string; quantity: number }>;
  tickets: Array<{ id: string; name: string; seatLabel: string | null; status: string }>;
  booking: { status: string; table: { number: number; name: string | null } } | null;
  groupPass: { id: string; status: string; totalSeats: number } | null;
};

export default function DeliveryPage() {
  const locale = useLocale();
  const copy = DELIVERY_COPY[locale];
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<DeliveryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const blobs = useRef<string[]>([]);

  useEffect(() => {
    const secret = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) { setError(copy.invalidLink); return; }
    setToken(secret);
    let active = true;
    void fetch(new URL("/ticket-email/access", API_URL), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: secret }), cache: "no-store", referrerPolicy: "no-referrer" })
      .then(async response => { if (!response.ok) throw new Error(); return await response.json() as DeliveryView; })
      .then(result => { if (active) setView(result); })
      .catch(() => { if (active) setError(copy.unavailable); });
    return () => { active = false; };
  }, [copy]);

  useEffect(() => () => { blobs.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  async function openQr(kind: "ticket" | "group", id: string) {
    if (!token) return;
    try {
      const path = kind === "ticket" ? `/ticket-email/tickets/${id}/qr` : `/ticket-email/group-passes/${id}/qr`;
      const response = await fetch(new URL(path, API_URL), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      blobs.current.push(url);
      setQrUrls(previous => ({ ...previous, [id]: url }));
    } catch { setError(copy.qrUnavailable); }
  }

  return <PageShell><main className="mx-auto max-w-3xl py-12">
    <h1 className="text-3xl font-bold">{copy.title}</h1>
    <p className="mt-3 text-sm text-[#665d70]">{copy.warning}</p>
    {error ? <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : null}
    {!view && !error ? <p className="mt-6">{copy.loading}</p> : null}
    {view ? <div className="mt-6 space-y-5">
      <section className="rounded-2xl border border-[#ded8e7] bg-white p-6"><h2 className="text-2xl font-bold">{view.title}</h2><div className="mt-2"><ContentLanguageNote contentLocale={view.sourceLocale} /></div><p className="mt-2 text-[#665d70]">{[view.date, view.time, view.timezone, view.venue].filter(Boolean).join(" · ")}</p><p className="mt-3 font-semibold">{view.paymentMode === "deposit" ? copy.depositPaid : copy.purchasePaid}: {new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency: view.currency }).format(view.amountPaid / 100)}</p><p className="mt-2 text-sm text-[#665d70]">{view.items.map(item => `${item.name} × ${item.quantity}`).join(", ")}</p></section>
      {view.booking ? <section className="rounded-2xl border border-[#ded8e7] bg-white p-5"><h2 className="font-bold">{copy.table}{view.booking.table.number}</h2><p className="text-sm text-[#665d70]">{copy.bookingStatus}: {view.booking.status}</p></section> : null}
      {view.groupPass ? <section className="rounded-2xl border border-[#ded8e7] bg-white p-5"><h2 className="font-bold">{copy.groupPass} · {view.groupPass.totalSeats} {copy.seats}</h2><p className="text-sm text-[#665d70]">{copy.status}: {view.groupPass.status}</p>{view.groupPass.status === "active" || view.groupPass.status === "used" ? <QrButton copy={copy} id={view.groupPass.id} url={qrUrls[view.groupPass.id]} onOpen={() => void openQr("group", view.groupPass!.id)} /> : null}</section> : null}
      <section className="rounded-2xl border border-[#ded8e7] bg-white p-5"><h2 className="text-xl font-bold">{copy.tickets}</h2><div className="mt-4 grid gap-4">{view.tickets.map(ticket => <div key={ticket.id} className="rounded-xl bg-[#f7f4fb] p-4"><p className="font-bold">{ticket.name}</p>{ticket.seatLabel ? <p className="text-sm">{ticket.seatLabel}</p> : null}<p className="text-sm text-[#665d70]">{copy.status}: {copy.ticketStatuses[ticket.status] ?? ticket.status}</p>{ticket.status === "active" || ticket.status === "used" ? <QrButton copy={copy} id={ticket.id} url={qrUrls[ticket.id]} onOpen={() => void openQr("ticket", ticket.id)} /> : null}</div>)}</div></section>
    </div> : null}
  </main></PageShell>;
}

function QrButton({ copy, id, url, onOpen }: { copy: typeof DELIVERY_COPY.ru; id: string; url?: string | undefined; onOpen: () => void }) { return <div className="mt-3">{url ? <img alt={`${copy.qr} ${id}`} src={url} className="h-52 w-52" /> : <button type="button" className="rounded-xl bg-[#5b21b6] px-4 py-2 font-semibold text-white" onClick={onOpen}>{copy.showQr}</button>}</div>; }
