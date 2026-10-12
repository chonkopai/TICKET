"use client";

import type { CancellationResponse, CancellationTermsResponse, GuestTicket } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { apiBlobRequest, apiRequest } from "../app/(auth)/_lib/api";
import { downloadTicket, ticketDate } from "../lib/download-ticket";
import { eventMapUrl } from "../lib/event-map-url";
import { localeUrl } from "../lib/locale";
import { TICKET_ACTIONS_COPY } from "../lib/ticket-actions-copy";
import { useEventEnded } from "../lib/use-event-ended";
import { AccountIcon } from "./account-icon";
import { RefundPolicyText } from "./event-presentation";
import { useLocale } from "./locale-provider";

type Panel = "qr" | "contacts" | "address" | "refund";
type Props = {
  ticket?: GuestTicket | undefined;
  details?: GuestTicket["eventDetails"];
  chatPath?: string | null | undefined;
  initialPanel?: Panel;
  onReturned?: (() => void) | undefined;
  variant?: "all" | "ticket" | "organizer";
};

export function GuestTicketActions({ ticket, details = ticket?.eventDetails, chatPath = ticket?.chatPath, initialPanel, onReturned, variant = "all" }: Props) {
  const locale = useLocale(), c = TICKET_ACTIONS_COPY[locale], id = useId();
  const [panel, setPanel] = useState<Panel | null>(initialPanel ?? null);
  const [qr, setQr] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<CancellationTermsResponse | null>(null), [result, setResult] = useState<CancellationResponse | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0);
  const requestActive = useRef(false), requestKey = useRef<string | null>(null), heading = useRef<HTMLHeadingElement>(null);
  const invalid = ticket?.status === "cancelled" || ticket?.status === "refunded" || !!result;
  const ended = useEventEnded(details ?? {});
  const ready = !!ticket && ["active", "paid", "used"].includes(ticket.status) && !invalid && !ended;
  const canReturn = !!ticket && ticket.status !== "used" && !invalid && !ended;
  const unavailable = !ticket ? c.noTicket : invalid ? c.invalid : ended ? c.ended : c.pending;
  const mapUrl = details ? eventMapUrl(details) : null;

  useEffect(() => {
    let live = true, objectUrl: string | null = null;
    setQr(null); setTerms(null); setError(null);
    if (!ticket || !panel || !["qr", "refund"].includes(panel) || invalid || ended) { setLoading(false); return; }
    if (panel === "qr" && !ready) return;
    setLoading(true);
    void (async () => {
      try {
        if (panel === "qr") {
          const blob = await apiBlobRequest(ticket.qrPath);
          if (live) { objectUrl = URL.createObjectURL(blob); setQr(objectUrl); }
        } else {
          const value = await apiRequest<CancellationTermsResponse>(`/me/tickets/${ticket.id}/cancellation`);
          if (live) setTerms(value);
        }
      } catch { if (live) setError(c.failed); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [panel, ticket?.id, ticket?.qrPath, invalid, ended, ready, retry, c.failed]);

  function toggle(next: Panel) {
    setError(null); setPanel(value => value === next ? null : next);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  async function download() {
    if (!ticket || !ready || requestActive.current) return;
    requestActive.current = true; setBusy(true); setError(null);
    try {
      const value = ticket.eventDetails ? ticket : await apiRequest<GuestTicket>(`/me/tickets/${ticket.id}?locale=${locale}`);
      const blob = await apiBlobRequest(value.qrPath);
      await downloadTicket(details ? { ...value, eventDetails: details } : value, blob, locale);
    } catch { setError(c.failed); }
    finally { requestActive.current = false; setBusy(false); }
  }

  async function confirmReturn() {
    if (!ticket || !terms || !canReturn || requestActive.current) return;
    requestActive.current = true; setBusy(true); setError(null);
    requestKey.current ??= crypto.randomUUID();
    try {
      setResult(await apiRequest<CancellationResponse>(`/me/tickets/${ticket.id}/cancel`, { method: "POST", headers: { "Idempotency-Key": requestKey.current }, body: JSON.stringify({ confirmed: true }) }));
      onReturned?.();
    } catch { setError(c.failed); }
    finally { requestActive.current = false; setBusy(false); }
  }

  const refundable = terms && (!terms.acceptedPolicy || terms.acceptedPolicy.available || terms.acceptedPolicy.freeCancellation || terms.amountPaid === 0);
  const panelTitle = panel === "qr" ? c.qr : panel === "contacts" ? c.contacts : panel === "address" ? c.address : c.terms;
  const floating = panel === "qr" || panel === "refund";
  const errorMessage = error ? <p className="account-ticket-error" role="alert">{error} {floating ? <button type="button" className="account-text-link" disabled={busy} onClick={() => setRetry(value => value + 1)}>{c.retry}</button> : null}</p> : null;
  const panelContent = <>
      <div className="account-card-toolbar"><h3 id={`${id}-title`} ref={heading} tabIndex={-1}>{panelTitle}</h3><button className="account-text-link" type="button" disabled={busy} onClick={() => setPanel(null)}>{c.close}</button></div>
      {floating ? errorMessage : null}
      {loading ? <p role="status">{c.loading}</p> : null}
      {floating && !result && (invalid || ended) ? <p role="status">{unavailable}</p> : null}
      {panel === "qr" && ready ? <div className="account-ticket-qr">{qr ? <img src={qr} width={280} height={280} alt={`${c.ticket} QR`} /> : null}<p>{c.qrHint}</p><small>{ticket?.ticketTypeName}{ticket?.seatLabel ? ` · ${ticket.seatLabel}` : ""}</small></div> : null}
      {panel === "contacts" ? <div className="account-ticket-contact">{details?.organizer.name ? <strong>{details.organizer.name}</strong> : null}{details?.organizer.phone ? <a href={`tel:${details.organizer.phone}`}><AccountIcon name="smartphone" />{details.organizer.phone}</a> : null}{details?.organizer.email ? <a href={`mailto:${details.organizer.email}`}><AccountIcon name="mail" />{details.organizer.email}</a> : null}{details?.organizer.address ? <p>{details.organizer.address}</p> : null}{!details?.organizer.phone && !details?.organizer.email && !details?.organizer.address ? <p>{c.noContacts}</p> : null}</div> : null}
      {panel === "address" ? <div className="account-ticket-contact"><p>{details?.address || c.noAddress}</p>{details ? <p>{ticketDate(details.startsAt, details.timezone, locale)} · {details.timezone}</p> : null}{mapUrl ? <a className="account-text-link" href={mapUrl} target="_blank" rel="noopener noreferrer"><AccountIcon name="map-pin" />{c.map}<AccountIcon name="arrow-up-right" /></a> : null}</div> : null}
      {panel === "refund" && terms && !result ? <div className="account-ticket-return">{terms.acceptedPolicy ? <RefundPolicyText locale={locale} free={terms.acceptedPolicy.freeCancellation} available={terms.acceptedPolicy.available} conditions={terms.cancellationTerms} /> : <p>{terms.cancellationTerms ?? "—"}</p>}{refundable ? <button className="account-button account-ticket-refund" type="button" disabled={busy} onClick={() => void confirmReturn()}>{busy ? c.processing : c.confirm}</button> : <p>{c.refundUnavailable}</p>}</div> : null}
      {result ? <p role="status" className="account-ticket-success">{c.returned} {result.refundPending ? c.refundPending : ""}</p> : null}
    </>;
  return <div className={`account-ticket-tools account-ticket-tools-${variant}`}>
    <div className="account-ticket-actions">
      {variant !== "organizer" ? <>
      <button className="account-button account-button-primary" type="button" disabled={!ready || busy} title={!ready ? unavailable : c.fileHint} onClick={() => void download()}><AccountIcon name="download" />{busy && panel !== "refund" ? c.processing : c.download}</button>
      <button className="account-button" type="button" disabled={!ready || busy} title={!ready ? unavailable : undefined} aria-haspopup="dialog" aria-expanded={panel === "qr"} aria-controls={id} onClick={() => toggle("qr")}><AccountIcon name="qr" />{c.qr}</button>
      </> : null}
      {variant !== "ticket" ? <>
      <button className="account-button" type="button" aria-expanded={panel === "contacts"} aria-controls={id} onClick={() => toggle("contacts")}><AccountIcon name="contact-round" />{c.contacts}</button>
      {variant === "all" ? <button className="account-button" type="button" aria-expanded={panel === "address"} aria-controls={id} onClick={() => toggle("address")}><AccountIcon name="map-pin" />{c.address}</button> : null}
      </> : null}
      {variant !== "organizer" ?
      <button className="account-button account-ticket-refund" type="button" disabled={!canReturn || busy} title={!canReturn ? ticket?.status === "used" ? c.used : unavailable : undefined} aria-haspopup="dialog" aria-expanded={panel === "refund"} aria-controls={id} onClick={() => toggle("refund")}><AccountIcon name="undo" />{c.refund}</button>
      : null}
      {variant !== "ticket" ? chatPath ? <Link className="account-button" href={localeUrl(chatPath, locale)}><AccountIcon name="messages" />{c.chat}</Link> : <button className="account-button" type="button" disabled title={c.chatUnavailable}><AccountIcon name="messages" />{c.chat}</button> : null}
    </div>
    {variant !== "organizer" && !ready ? <p className="account-ticket-note">{unavailable}</p> : null}
    {!floating ? errorMessage : null}
    {panel ? floating ? <TicketActionDialog id={id} busy={busy} onClose={() => setPanel(null)}>{panelContent}</TicketActionDialog> : <section id={id} className="account-ticket-disclosure" aria-labelledby={`${id}-title`}>{panelContent}</section> : null}
  </div>;
}

function TicketActionDialog({ id, busy, onClose, children }: { id: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} id={id} className="account-ticket-dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClose={event => {
    // Strict Mode may reopen the dialog before a cleanup's close event arrives.
    if (!event.currentTarget.open) onClose();
  }} onCancel={event => { if (busy) event.preventDefault(); }} onClick={event => {
    if (busy || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
  }}>{children}</dialog>;
}
