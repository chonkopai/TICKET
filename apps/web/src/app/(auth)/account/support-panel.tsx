"use client";
import { OrderChatButton } from "../../../components/floating-order-chat";

import { PlatformSupport } from "../../../components/platform-support";
import type { AccountOrderList } from "@event-platform/shared-types";
import { useEffect, useState } from "react";
import { AccountIcon } from "../../../components/account-icon";
import { useLocale } from "../../../components/locale-provider";
import { ACCOUNT_COPY } from "../../../lib/account-copy";
import { ACCOUNT_EXPERIENCE_COPY } from "../../../lib/account-experience-copy";
import { INTL_LOCALES } from "../../../lib/locale";
import { useAccountResource } from "./use-account-resource";

export function SupportPanel({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const copy = ACCOUNT_EXPERIENCE_COPY[locale];
  const [channel, setChannel] = useState<"organizer" | "website" | null>(null);
  useEffect(()=>{if(new URLSearchParams(location.search).has("caseId"))setChannel("website");},[]);
  const [page, setPage] = useState(1);
  const orders = useAccountResource<AccountOrderList>(channel === "organizer" ? `/me/orders?page=${page}&limit=10` : null);
  const eligible = orders.data?.items.filter(order => order.eventId) ?? [];

  return <section className="account-support-panel" aria-label={ACCOUNT_COPY[locale].writeOrganizer + " / " + copy.supportTitle}>
    <div className="account-support-options">
      {(["organizer", "website"] as const).map(item => <button key={item} type="button" className={`account-card account-support-option ${channel === item ? "is-active" : ""}`} aria-expanded={channel === item} aria-controls={`account-support-${compact ? "payments" : "help"}`} onClick={() => setChannel(current => current === item ? null : item)}><span className="account-symbol"><AccountIcon name={item === "organizer" ? "messages" : "circle-help"} /></span><span><strong>{item === "organizer" ? copy.organizerTitle : copy.supportTitle}</strong><span>{item === "organizer" ? copy.organizerHint : copy.websiteHint}</span><span className="account-text-link">{item === "organizer" ? copy.writeOrganizer : copy.writeSupport}<AccountIcon name="arrow-right" /></span></span></button>)}
    </div>
    <div id={`account-support-${compact ? "payments" : "help"}`}>
      {channel === "organizer" ? <section className="account-card account-orders"><h2>{copy.chooseOrder}</h2>{orders.error ? <div className="account-resource-error" role="alert"><p>{orders.error}</p><button type="button" className="account-text-link" onClick={orders.retry}>{copy.retry}</button></div> : !orders.data ? <p role="status" className="account-muted">{ACCOUNT_COPY[locale].loading}</p> : <>{eligible.length ? <div className="account-order-list">{eligible.map(order => <article className="account-support-order" key={order.id}><div><h3>{order.eventTitle}</h3><p>{order.itemSummary} · {new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium" }).format(new Date(order.createdAt))}</p><small>#{order.id.slice(-8)}</small></div><OrderChatButton className="account-button" eventId={order.eventId!} orderId={order.id} title={order.eventTitle}><AccountIcon name="messages" />{copy.writeOrganizer}</OrderChatButton></article>)}</div> : <div className="account-support-empty"><span className="account-empty-symbol"><AccountIcon name="ticket" /></span><h3>{copy.noOrders}</h3><p>{copy.noOrdersHint}</p></div>}{orders.data.total > orders.data.limit ? <nav className="account-pager" aria-label={ACCOUNT_COPY[locale].pages}><button className="account-button" type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{copy.back}</button><span>{page}</span><button className="account-button" type="button" disabled={!orders.data.hasNext} onClick={() => setPage(value => value + 1)}>{copy.next}</button></nav> : null}</>}</section> : null}
      {channel === "website" ? <PlatformSupport /> : null}
    </div>
  </section>;
}
