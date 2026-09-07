"use client";

import { ru, type CancellationResponse, type CancellationTermsResponse, type GuestTicket } from "@event-platform/shared-types";
import { BackLink } from "../../../../../components/back-link";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "../../../../(auth)/_components/protected-route";
import { apiBlobRequest, apiRequest } from "../../../../(auth)/_lib/api";

export default function GuestTicketPage({ params }: { params: Promise<{ id: string }> }) {
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-12"><ProtectedRoute><Ticket params={params} /></ProtectedRoute></main>;
}

function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<GuestTicket | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [cancellation, setCancellation] = useState<CancellationTermsResponse | null>(null);
  const [cancelled, setCancelled] = useState<CancellationResponse | null>(null);
  useEffect(() => { void params.then(({ id }) => setTicketId(id)); }, [params]);
  useEffect(() => {
    if (!ticketId) return;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const loadedTicket = await apiRequest<GuestTicket>(`/me/tickets/${ticketId}`);
        const qr = await apiBlobRequest(`/me/tickets/${ticketId}/qr`);
        setTicket(loadedTicket);
        objectUrl = URL.createObjectURL(qr);
        setQrUrl(objectUrl);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : ru.guest.loadFailed);
      }
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [ticketId]);
  async function downloadWallet(): Promise<void> {
    if (!ticket) return;
    setWalletBusy(true);
    setError(null);
    try {
      const blob = await apiBlobRequest(ticket.walletPath);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ticket-${ticket.id}.pkpass`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ru.guest.walletFailed);
    } finally {
      setWalletBusy(false);
    }
  }
  async function loadCancellation(): Promise<void> {
    if (!ticket) return;
    try { setCancellation(await apiRequest(`/me/tickets/${ticket.id}/cancellation`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : ru.checkout.failed); }
  }
  async function cancelTicket(): Promise<void> {
    if (!ticket || !cancellation) return;
    setWalletBusy(true); setError(null);
    try {
      setCancelled(await apiRequest(`/me/tickets/${ticket.id}/cancel`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ confirmed: true }) }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : ru.checkout.failed); }
    finally { setWalletBusy(false); }
  }
  if (error) return <p className="rounded-2xl bg-red-50 p-5 text-red-800">{error}</p>;
  if (!ticket) return <p>{ru.common.loading}</p>;
  return <section className="rounded-3xl border border-black/10 bg-white p-7 text-center shadow-sm"><BackLink href="/my-events" /><h1 className="mt-6 text-3xl font-semibold">{ticket.eventTitle}</h1><p className="mt-2 text-zinc-600">{ticket.ticketTypeName} · {ru.guest.statuses[ticket.status as keyof typeof ru.guest.statuses] ?? ticket.status}</p>{qrUrl ? <img className="mx-auto mt-7 w-72 rounded-2xl border border-zinc-200 p-2" src={qrUrl} alt={`${ru.guest.ticket} QR`} /> : <p className="mt-7 text-zinc-600">{ru.common.loading}</p>}<div className="mt-6 flex flex-wrap justify-center gap-3"><button className="rounded-xl border border-black/15 px-5 py-3 font-semibold disabled:opacity-50" disabled={walletBusy} onClick={() => void downloadWallet()} type="button">{walletBusy ? ru.common.loading : ru.guest.addWallet}</button>{ticket.status !== "cancelled" && ticket.status !== "used" && ticket.status !== "refunded" ? <button className="rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-800 disabled:opacity-50" disabled={walletBusy} onClick={() => void loadCancellation()} type="button">{ru.checkout.cancel}</button> : null}</div>{cancellation && !cancelled ? <div className="mt-6 rounded-2xl bg-zinc-50 p-5 text-left"><h2 className="font-semibold">{ru.events.fields.cancellationTerms}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{cancellation.cancellationTerms ?? "—"}</p><button className="mt-4 rounded-xl bg-red-700 px-4 py-2 font-semibold text-white" onClick={() => void cancelTicket()} type="button">{ru.checkout.cancelConfirm}</button></div> : null}{cancelled ? <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-emerald-900">{ru.checkout.cancelled}{cancelled.refundPending ? ` ${ru.checkout.refundPending}` : ""}</p> : null}</section>;
}
