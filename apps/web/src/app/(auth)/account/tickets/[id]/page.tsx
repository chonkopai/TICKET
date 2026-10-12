"use client";

import type { GuestTicket } from "@event-platform/shared-types";
import { useEffect, useState } from "react";
import { BackLink } from "../../../../../components/back-link";
import { ProtectedRoute } from "../../../_components/protected-route";
import { apiBlobRequest, apiRequest } from "../../../_lib/api";
import { useLocale } from "../../../../../components/locale-provider";
import { GUEST_COPY, GUEST_EXTRA } from "../../../../../lib/guest-copy";
import { localeUrl } from "../../../../../lib/locale";
import { ContentLanguageNote } from "../../../../../components/content-language-note";
import { GuestTicketActions } from "../../../../../components/guest-ticket-actions";
import { saveTicketBlob, ticketDate } from "../../../../../lib/download-ticket";
import { TICKET_ACTIONS_COPY } from "../../../../../lib/ticket-actions-copy";
import { useEventEnded } from "../../../../../lib/use-event-ended";

export default function GuestTicketPage({ params }: { params: Promise<{ id: string }> }) {
  return <main className="account-workspace"><div className="mx-auto min-h-screen max-w-3xl px-5 py-12"><ProtectedRoute><Ticket params={params} /></ProtectedRoute></div></main>;
}

function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const locale = useLocale(), copy = GUEST_COPY[locale], extra = GUEST_EXTRA[locale];
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<GuestTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const ended = useEventEnded(ticket?.eventDetails ?? {});
  useEffect(() => { let live = true; void params.then(({ id }) => { if (live) setTicketId(id); }); return () => { live = false; }; }, [params]);
  useEffect(() => {
    if (!ticketId) return;
    let live = true; setError(null);
    void apiRequest<GuestTicket>(`/me/tickets/${ticketId}?locale=${locale}`).then(value => { if (live) setTicket(value); }).catch(() => { if (live) setError(copy.loadFailed); });
    return () => { live = false; };
  }, [ticketId, locale, copy.loadFailed, refresh]);

  async function downloadWallet() {
    if (!ticket?.walletPath || walletBusy || ended) return;
    setWalletBusy(true); setError(null);
    try { saveTicketBlob(await apiBlobRequest(ticket.walletPath), `ticket-${ticket.id}.pkpass`); }
    catch { setError(copy.walletFailed); }
    finally { setWalletBusy(false); }
  }

  if (!ticket) return error ? <p className="account-resource-error" role="alert">{error}<button className="account-text-link" onClick={() => setRefresh(value => value + 1)} type="button">{({ ru: "Повторить попытку", en: "Try again", kk: "Қайталап көру" })[locale]}</button></p> : <p role="status">{extra.loading}</p>;
  const status = ended && !["used", "cancelled", "refunded"].includes(ticket.status) ? TICKET_ACTIONS_COPY[locale].unavailableStatus : TICKET_ACTIONS_COPY[locale].statuses[ticket.status];
  return <section className="account-card p-6 sm:p-8">
    <BackLink href={localeUrl("/account", locale)} />
    <h1 className="mt-6 text-3xl font-semibold">{ticket.eventTitle}</h1>
    <div className="mt-2"><ContentLanguageNote contentLocale={ticket.contentLocale ?? ticket.sourceLocale ?? "ru"} /></div>
    <p className="mt-3 text-ticket-muted">{ticket.ticketTypeName}{ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}</p>
    <p className="mt-1 text-sm text-ticket-muted">{status}</p>
    {ticket.eventDetails ? <div className="mt-4 space-y-2 text-sm text-ticket-muted"><p>{ticketDate(ticket.eventDetails.startsAt, ticket.eventDetails.timezone, locale)} · {ticket.eventDetails.timezone}</p><p>{ticket.eventDetails.address}</p></div> : null}
    {error ? <p className="account-resource-error mt-4" role="alert">{error}</p> : null}
    <GuestTicketActions key={ticket.id} ticket={ticket} initialPanel="qr" onReturned={() => setRefresh(value => value + 1)} />
    {ticket.walletPath ? <button className="account-button mt-5" disabled={walletBusy || ended} onClick={() => void downloadWallet()} type="button">{walletBusy ? extra.loading : copy.addWallet}</button> : null}
  </section>;
}
