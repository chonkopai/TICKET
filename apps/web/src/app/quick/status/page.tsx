"use client";

import { quickRu as text, ru, type QuickOrderStatus } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession } from "../../(auth)/_lib/session";
import { quickRequest } from "../api";
import { TelegramLoginButton } from "../../(auth)/_components/telegram-login-button";
import { BackLink } from "../../../components/back-link";

export default function QuickStatusPage() {
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
      try {
        const result = await quickRequest<QuickOrderStatus>("order", token);
        if (stopped) return;
        setStatus(result); setError("");
        if (result.status === "pending" && ++count < 60) timer = setTimeout(() => void poll(), 3000);
      } catch { if (!stopped) setError(text.error); }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, []);
  async function claim() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { claimToken } = await quickRequest<{ claimToken: string }>("claim-token", access, {});
      await apiRequest("/api/quick/claim", { method: "POST", body: JSON.stringify({ claimToken }) });
      setStatus(await quickRequest<QuickOrderStatus>("order", access));
    } catch { setError(text.error); } finally { setBusy(false); }
  }
  async function asset(id: string, format: "qr" | "wallet") {
    try {
      const response = await fetch(`/api/quick/tickets/${id}/${format}`, { headers: { authorization: `Bearer ${access}` }, cache: "no-store", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a"); a.href = url; a.download = format === "qr" ? "ticket.png" : "ticket.pkpass"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(format === "wallet" ? ru.guest.walletFailed : text.error); }
  }
  return <main className="mx-auto max-w-2xl space-y-5 px-5 py-10">
    <BackLink href="/events" label={ru.publicEvent.back} />
    <h1 className="text-3xl font-semibold">{status?.title ?? text.title}</h1>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {status && <>
      <p role="status" className="rounded-xl bg-zinc-100 p-5">{(ru.checkout.paymentStatuses as Record<string, string>)[status.status] ?? status.status}<br />{status.paymentMode === "deposit" ? text.deposit : text.full}: {(status.amountDue / 100).toLocaleString("ru-RU")} {status.currency}</p>
      {status.status === "pending" && <p>{text.return}</p>}
      {status.tickets.map(ticket => <section key={ticket.id} className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">{ticket.name}</h2><p>{(text.ticketStatuses as Record<string, string>)[ticket.status] ?? ticket.status}</p>{status.status === "paid" && ["active", "used"].includes(ticket.status) && <div className="flex flex-wrap gap-4"><button className="underline" onClick={() => void asset(ticket.id, "qr")}>{text.qr}</button>{ticket.status === "active" && <button className="underline" onClick={() => void asset(ticket.id, "wallet")}>{text.wallet}</button>}</div>}</section>)}
      {status.booking && <p>{ru.publicEvent.tables}: {status.booking.table.name ?? `№${status.booking.table.number}`} · {status.booking.status}</p>}
      {status.status === "paid" && (status.linked ? <p>{text.saved} · <Link href="/my-events" className="underline">{ru.guest.myEvents}</Link></p> : loggedIn ? <button disabled={busy} className="rounded-xl bg-black px-5 py-3 text-white" onClick={() => void claim()}>{text.claim}</button> : <section><h2 className="mb-4 font-semibold">{text.login}</h2><TelegramLoginButton onAuthenticated={() => setLoggedIn(true)} /></section>)}
    </>}
    {access && <button className="underline" onClick={() => { setLoggedIn(Boolean(getSession())); void quickRequest<QuickOrderStatus>("order", access).then(setStatus).catch(() => setError(text.error)); }}>{text.refresh}</button>}
  </main>;
}
