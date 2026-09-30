"use client";

import { type CancellationResponse, type CancellationTermsResponse, type GuestTicket } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

import { BackLink } from "../../../../../components/back-link";
import { ProtectedRoute } from "../../../../(auth)/_components/protected-route";
import { apiBlobRequest, apiRequest } from "../../../../(auth)/_lib/api";
import { useLocale } from "../../../../../components/locale-provider";
import { GUEST_COPY, GUEST_EXTRA } from "../../../../../lib/guest-copy";
import { localeUrl } from "../../../../../lib/locale";
import { ContentLanguageNote } from "../../../../../components/content-language-note";

export default function GuestTicketPage({ params }: { params: Promise<{ id: string }> }) {
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-12"><ProtectedRoute><Ticket params={params} /></ProtectedRoute></main>;
}

function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const locale = useLocale();
  const copy = GUEST_COPY[locale];
  const extra = GUEST_EXTRA[locale];
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
        const loadedTicket = await apiRequest<GuestTicket>(`/me/tickets/${ticketId}?locale=${locale}`);
        setTicket(loadedTicket);
        if (loadedTicket.status !== "cancelled" && loadedTicket.status !== "refunded") {
          const qr = await apiBlobRequest(`/me/tickets/${ticketId}/qr`);
          objectUrl = URL.createObjectURL(qr);
          setQrUrl(objectUrl);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : copy.loadFailed);
      }
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [ticketId, copy]);

  async function downloadWallet(): Promise<void> {
    if (!ticket?.walletPath) return;
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
      setError(reason instanceof Error ? reason.message : copy.walletFailed);
    } finally { setWalletBusy(false); }
  }

  async function loadCancellation(): Promise<void> {
    if (!ticket) return;
    setWalletBusy(true);
    setError(null);
    try { setCancellation(await apiRequest(`/me/tickets/${ticket.id}/cancellation`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : extra.failed); }
    finally { setWalletBusy(false); }
  }

  async function cancelTicket(): Promise<void> {
    if (!ticket) return;
    setWalletBusy(true);
    setError(null);
    try {
      setCancelled(await apiRequest(`/me/tickets/${ticket.id}/cancel`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ confirmed: true }) }));
      setTicket(await apiRequest<GuestTicket>(`/me/tickets/${ticket.id}?locale=${locale}`));
      if (qrUrl) URL.revokeObjectURL(qrUrl);
      setQrUrl(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : extra.failed); }
    finally { setWalletBusy(false); }
  }

  if (!ticket) return error ? <p className="rounded-2xl bg-red-50 p-5 text-red-800" role="alert">{error}</p> : <p>{extra.loading}</p>;
  const status = copy.statuses[ticket.status as keyof typeof copy.statuses] ?? ticket.status;

  return <section className="rounded-3xl border border-black/10 bg-white p-7 text-center shadow-sm">
    <BackLink href={localeUrl("/account", locale)} />
    <h1 className="mt-6 text-3xl font-semibold">{ticket.eventTitle}</h1>
    <div className="mt-2"><ContentLanguageNote contentLocale={ticket.contentLocale ?? ticket.sourceLocale ?? "ru"} /></div>
    <p className="mt-2 text-zinc-600">{ticket.ticketTypeName}</p>
    {ticket.sourceLocale && ticket.contentLocale === locale && ticket.sourceLocale !== locale ? <div className="mt-1"><ContentLanguageNote contentLocale={ticket.sourceLocale} /></div> : null}
    {ticket.seatLabel ? <p className="mt-1 text-lg font-semibold">{ticket.seatLabel}</p> : null}
    <p className="mt-1 text-sm text-zinc-600">{status}</p>
    {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-800" role="alert">{error}</p> : null}
    {qrUrl ? <img className="mx-auto mt-7 w-72 rounded-2xl border border-zinc-200 p-2" src={qrUrl} alt={`${copy.ticket} QR`} /> : ticket.status === "cancelled" || ticket.status === "refunded" ? <p className="mt-7 text-zinc-600">{extra.qrInvalid}</p> : <p className="mt-7 text-zinc-600">{extra.loading}</p>}
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {ticket.walletPath ? <button className="rounded-xl border border-black/15 px-5 py-3 font-semibold disabled:opacity-50" disabled={walletBusy} onClick={() => void downloadWallet()} type="button">{walletBusy ? extra.loading : copy.addWallet}</button> : null}
      {ticket.status !== "cancelled" && ticket.status !== "used" && ticket.status !== "refunded" ? <button className="rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-800 disabled:opacity-50" disabled={walletBusy} onClick={() => void loadCancellation()} type="button">{extra.cancel}</button> : null}
    </div>
    {cancellation && !cancelled ? <div className="mt-6 rounded-2xl bg-zinc-50 p-5 text-left"><h2 className="font-semibold">{extra.cancellationTerms}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{cancellation.cancellationTerms ?? "—"}</p><button className="mt-4 rounded-xl bg-red-700 px-5 py-3 font-semibold text-white" onClick={() => void cancelTicket()} type="button">{extra.cancelConfirm}</button></div> : null}
    {cancelled ? <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-emerald-900">{extra.cancelled}{cancelled.refundPending ? ` ${extra.refundPending}` : ""}</p> : null}
  </section>;
}
