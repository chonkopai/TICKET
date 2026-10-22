"use client";
import {RefundPolicyText} from "../../../components/event-presentation";

import { INTL_LOCALES } from "../../../lib/locale";

import { TICKET_RECEIPT_COPY, ticketDateTime, ticketNumber, type QuickOrderStatus } from "@event-platform/shared-types";

import { useEffect, useState } from "react";

import { quickRequest } from "../api";

import { BackLink } from "../../../components/back-link";
import { OrderChat } from "../../../components/order-chat";
import { AccountIcon } from "../../../components/account-icon";
import "./receipt.css";
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
  const receipt = TICKET_RECEIPT_COPY[locale];
  const [access, setAccess] = useState("");
  const [status, setStatus] = useState<QuickOrderStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const order = new URLSearchParams(window.location.search).get("order") ?? "";
    const token = sessionStorage.getItem(`quick-order:${order}`);
    if (!token) { setError(text.unavailable); return; }
    setAccess(token);
    let stopped = false, count = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const result = await quickRequest<QuickOrderStatus>("order", token);
        if (stopped) return;
        setStatus(result); setError("");
        if ((result.status === "pending" || (result.status === "paid" && (result.deliveryStatus === "pending" || ["queued", "sending"].includes(result.emailDelivery.status)))) && ++count < 120) timer = setTimeout(() => void poll(), 3000);
      } catch { if (!stopped) { setError(text.error); if (++count < 120) timer = setTimeout(() => void poll(), 10000); } }
    };
    const onVisible = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void poll(); } };
    document.addEventListener("visibilitychange", onVisible);
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [text]);
  async function resendEmail() {
    if (busy || !access) return;
    setBusy(true); setError("");
    try {
      await quickRequest("order/email-delivery/resend", access, {});
      setStatus(await quickRequest<QuickOrderStatus>("order", access));
    } catch { setError(paymentCopy.resendError); }
    finally { setBusy(false); }
  }
  async function asset(id: string, format: "pdf" | "wallet") {
    try {
      const response = await fetch(`/api/quick/tickets/${id}/${format}`, { headers: { authorization: `Bearer ${access}` }, cache: "no-store", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a"); a.href = url; a.download = format === "pdf" ? `ticket-${id}.pdf` : "ticket.pkpass"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(format === "wallet" ? copy.walletFailed : text.error); }
  }
  const confirmed = status?.status === "paid";
  const orderDate = status?.createdAt ? new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "long", timeStyle: "short", timeZone: status.event?.timezone ?? "UTC" }).format(new Date(status.createdAt)) + ` (${status.event?.timezone ?? "UTC"})` : "—";
  return <main className="quick-receipt">
    <BackLink href={status?.eventId ? `/events/${status.eventId}` : "/"} label={copy.back} />
    {error ? <p role="alert" className="quick-receipt-error">{error}</p> : null}
    {!status && !error ? <p role="status">{copy.loading}</p> : null}
    {status ? <>
      <header className="quick-receipt-hero"><span className={`quick-receipt-symbol${confirmed ? " is-confirmed" : ""}`}><AccountIcon name={confirmed ? "circle-check" : "clock"}/></span><div><p className="quick-receipt-eyebrow" role="status">{confirmed ? status.amountDue === 0 ? receipt.freeReady : receipt.ready : status.status === "pending" ? receipt.waiting : paymentCopy.statuses[status.status] ?? status.status}</p><h1>{status.title}</h1><ContentLanguageNote contentLocale={status.sourceLocale}/></div></header>
      <section className="quick-receipt-event" aria-label={status.title}>
        {status.event ? <><p><AccountIcon name="clock"/><span>{ticketDateTime(status.event.date,status.event.time,status.event.timezone,locale)}</span></p><a href={`https://yandex.com/maps/?text=${encodeURIComponent(status.event.address)}`} target="_blank" rel="noopener noreferrer"><AccountIcon name="map-pin"/><span>{status.event.address}</span><AccountIcon name="arrow-up-right"/></a></> : null}
      </section>
      {status.status === "pending" ? <section className="quick-receipt-card quick-receipt-waiting"><AccountIcon name="clock"/><h2>{receipt.waiting}</h2><p>{receipt.waitingHint}</p><strong>{money(status.amountDue,status.currency)}</strong></section> : <>
        <section className="quick-receipt-order quick-receipt-card"><dl><div><dt>{receipt.order}</dt><dd>{status.orderId}</dd></div><div><dt>{receipt.buyer}</dt><dd>{status.buyerName ?? "—"}</dd></div><div><dt>{receipt.orderedAt}</dt><dd>{orderDate}</dd></div><div><dt>{receipt.total}</dt><dd className="quick-receipt-price">{status.amountDue === 0 ? receipt.free : money(status.amountDue,status.currency)}</dd></div></dl></section>
        <div className="quick-receipt-tickets">{status.tickets.map((ticket,index) => <QuickTicketCard key={ticket.id} access={access} ticket={ticket} confirmed={confirmed} title={status.title} position={index+1} total={status.tickets.length} price={money(ticket.price ?? status.amountDue / Math.max(1,status.tickets.length),status.currency)} free={(ticket.price ?? status.amountDue)===0} onPdf={()=>void asset(ticket.id,"pdf")}/>)}</div>
        {status.booking ? <p className="quick-receipt-card">{copy.tables}: {status.booking.table.name ?? `№${status.booking.table.number}`}</p> : null}
        <section className="quick-receipt-card"><h2><AccountIcon name="undo"/>{receipt.refund}</h2>{status.acceptedPolicy ? <RefundPolicyText locale={locale} free={status.acceptedPolicy.freeCancellation} available={status.acceptedPolicy.available} conditions={status.cancellationTerms}/> : <p>{status.amountDue === 0 ? receipt.freeRefund : status.cancellationTerms ?? receipt.noRefund}</p>}</section>
        {confirmed && status.emailDelivery.address ? <section className="quick-receipt-card quick-receipt-delivery"><h2><AccountIcon name="mail"/>{receipt.delivery}</h2><strong>{status.emailDelivery.address}</strong><p role="status">{paymentCopy.emailStatuses[status.emailDelivery.status] ?? status.emailDelivery.status}</p>{["accepted","failed","uncertain"].includes(status.emailDelivery.status) ? <button className="quick-receipt-button" type="button" disabled={busy} onClick={()=>void resendEmail()}><AccountIcon name="send"/>{paymentCopy.resend}</button> : null}</section> : null}
        {confirmed && status.deliveryStatus !== "unavailable" ? <p className="quick-receipt-note">{status.deliveryStatus === "confirmed" ? copy.deliveryConfirmed : copy.deliveryPending}</p> : null}
        {status.eventId ? <section className="quick-receipt-card quick-receipt-chat"><OrderChat eventId={status.eventId} orderId={status.orderId} mode="anonymous" accessToken={access}/></section> : null}
      </>}
      <button type="button" className="quick-receipt-refresh" onClick={()=>{void quickRequest<QuickOrderStatus>("order",access).then(value=>{setStatus(value);setError("");}).catch(()=>setError(text.error));}}><AccountIcon name="refresh-cw"/>{text.refresh}</button>
    </> : null}
  </main>;
}

function QuickTicketCard({access,ticket,confirmed,title,position,total,price,free,onPdf}:{access:string;ticket:QuickOrderStatus["tickets"][number];confirmed:boolean;title:string;position:number;total:number;price:string;free:boolean;onPdf:()=>void}) {
 const locale=useLocale(),copy=TICKET_RECEIPT_COPY[locale],text=QUICK_COPY[locale];
 const [qr,setQr]=useState(""),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const available=confirmed&&["active","used"].includes(ticket.status);
 useEffect(()=>{
  if(!available||!access)return;let alive=true,url="";setError(false);setQr("");
  void fetch(`/api/quick/tickets/${ticket.id}/qr`,{headers:{authorization:`Bearer ${access}`},cache:"no-store",referrerPolicy:"no-referrer"}).then(async response=>{if(!response.ok)throw new Error();return response.blob();}).then(blob=>{if(alive){url=URL.createObjectURL(blob);setQr(url);}}).catch(()=>{if(alive)setError(true);});
  return()=>{alive=false;if(url)URL.revokeObjectURL(url);};
 },[access,ticket.id,available,retry]);
 return <article className="quick-receipt-ticket"><div className="quick-receipt-ticket-main"><p className="quick-receipt-eyebrow">TICKET · {copy.ticket} {position}/{total}</p><h2>{title}</h2><h3>{ticket.name}</h3>{ticket.seatLabel?<p>{ticket.seatLabel}</p>:null}<span className="quick-receipt-status">{(text.ticketStatuses as Record<string,string>)[ticket.status] ?? ticket.status}</span><dl><div><dt>{copy.price}</dt><dd>{free?copy.free:price}</dd></div><div><dt>{copy.number}</dt><dd>{ticket.number ?? ticketNumber(ticket.id)}</dd></div></dl><p className="quick-receipt-warning"><AccountIcon name="shield-check"/>{copy.warning}</p></div><div className="quick-receipt-ticket-code">{available?<>{qr?<img src={qr} width="240" height="240" alt={`QR · ${ticket.name} · ${position}`}/>:error?<p role="alert">{copy.qrFailed}<button className="quick-receipt-refresh" type="button" onClick={()=>setRetry(value=>value+1)}><AccountIcon name="refresh-cw"/>{text.refresh}</button></p>:<p role="status">{QUICK_EXTRA[locale].loading}</p>}<p>{copy.show}</p><button className="quick-receipt-button is-primary" type="button" disabled={!qr} onClick={onPdf}><AccountIcon name="download"/>{copy.pdf}</button></>:<p>{copy.unavailable}</p>}</div></article>;
}
