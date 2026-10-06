"use client";

import type { EventLocale, OrganizerEventSort, OrganizerEventStatusGroup, OrganizerWorkspaceEvent, OrganizerWorkspaceEventList } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SelectPicker } from "../../../components/option-picker";
import { OrganizerAvatar, OrganizerIcon, OrganizerResourceError, OrganizerWorkspaceShell, useOrganizerWorkspace } from "../../../components/organizer-workspace";
import { useLocale } from "../../../components/locale-provider";
import { EVENTS_COPY } from "../../../lib/events-copy";
import { ORGANIZER_EVENTS_COPY } from "../../../lib/organizer-events-copy";
import { ORGANIZER_WORKSPACE_COPY } from "../../../lib/organizer-workspace-copy";
import { INTL_LOCALES, localeUrl } from "../../../lib/locale";
import { apiRequest } from "../../(auth)/_lib/api";
import { useAccountResource } from "../../(auth)/account/use-account-resource";

const PAGE_SIZE = 10;
const FILTERS: OrganizerEventStatusGroup[] = ["all", "on_sale", "draft", "archive"];

export default function OrganizerEventsPage() {
  return <OrganizerWorkspaceShell active="events"><OrganizerEvents /></OrganizerWorkspaceShell>;
}

function OrganizerEvents() {
  const locale = useLocale(); const copy = ORGANIZER_EVENTS_COPY[locale]; const design = ORGANIZER_WORKSPACE_COPY[locale];
  const { profile, dashboard, user } = useOrganizerWorkspace();
  const [statusGroup, setStatusGroup] = useState<OrganizerEventStatusGroup>("all");
  const [sort, setSort] = useState<OrganizerEventSort>("updated_desc"); const [page, setPage] = useState(1);
  const list = useAccountResource<OrganizerWorkspaceEventList>(`/api/organizer/events?page=${page}&limit=${PAGE_SIZE}&statusGroup=${statusGroup}&sort=${sort}`);
  const [mutationError, setMutationError] = useState<string | null>(null); const [busyId, setBusyId] = useState<string | null>(null);
  const mutationLock = useRef(false); const [publishedMessage, setPublishedMessage] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("published") !== "1") return;
    setPublishedMessage(true); url.searchParams.delete("published");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function mutate(event: OrganizerWorkspaceEvent, action: "delete" | "reopen") {
    if (mutationLock.current) return;
    if (action === "delete" && !window.confirm(copy.deleteConfirm.replace("{title}", event.title))) return;
    mutationLock.current = true; setBusyId(event.id); setMutationError(null);
    try {
      await apiRequest(`/api/organizer/events/${event.id}${action === "reopen" ? "/reopen" : ""}`, { method: action === "reopen" ? "POST" : "DELETE" });
      if (action === "delete" && page > 1 && list.data?.items.length === 1) setPage(value => value - 1);
      else list.retry();
      dashboard.retry();
    } catch (reason) { setMutationError(reason instanceof Error ? reason.message : copy.loadFailed); }
    finally { mutationLock.current = false; setBusyId(null); }
  }

  const summary = dashboard.data;
  const counts = { all: summary?.totalEvents, on_sale: summary?.publishedEvents, draft: summary?.draftEvents, archive: summary ? summary.completedEvents + summary.cancelledEvents : undefined };
  const occupancy = summary && summary.totalAdmissions > 0 ? Math.min(100, Math.round(summary.soldAdmissions / summary.totalAdmissions * 100)) : 0;
  const name = profile.data?.organizationName || user?.name || copy.organizer;
  const result = list.data;
  return <>
    <div className="organizer-page-heading"><div className="account-heading"><p>{design.workspace}</p><h1>{design.events}</h1><p>{design.eventsHint}</p></div><Link className="account-button account-button-primary" href={localeUrl("/events/create", locale)}><OrganizerIcon name="plus" />{copy.create}</Link></div>
    <section className="account-card organizer-overview"><OrganizerAvatar name={name} photoUrl={profile.data?.photoUrl ?? user?.photoUrl ?? null} /><div><h2>{name}</h2><p>Telegram ID: {user?.telegramId ?? "…"} · {user?.telegramChatId ? copy.botConnected : copy.botDisconnected}</p></div><Link className="account-button" href={localeUrl("/organizer/profile", locale)}><OrganizerIcon name="pencil" />{copy.editProfile}</Link></section>
    <section className="organizer-metrics" aria-label={design.workspace}>
      <Metric label={copy.totalEvents} value={summary?.totalEvents ?? "…"} detail={design.totalEventsHint} icon="calendar-days" />
      <Metric label={copy.published} value={summary?.publishedEvents ?? "…"} detail={summary ? `${occupancy}% ${copy.occupancy}` : "…"} icon="circle-check" />
      <Metric label={copy.drafts} value={summary?.draftEvents ?? "…"} detail={summary ? `${summary.completedEvents + summary.cancelledEvents} ${copy.archived}` : "…"} icon="pencil" />
      <Metric label={copy.paidRevenue} value={summary ? summary.currency ? formatMoney(summary.settledRevenue, summary.currency, locale) : "—" : "…"} detail={summary ? summary.currency ? summary.settledRevenue === 0 ? design.noSales : copy.paidRevenue : design.revenueUnavailable : "…"} icon="money" />
    </section>
    {dashboard.error ? <OrganizerResourceError message={dashboard.error} onRetry={dashboard.retry} /> : null}
    {publishedMessage ? <p className="organizer-success" role="status">{copy.publishedMessage}</p> : null}
    {mutationError ? <OrganizerResourceError message={mutationError} /> : null}
    <section className="organizer-events" aria-label={design.events}>
      <div className="organizer-event-toolbar"><div className="organizer-filters" role="group" aria-label={copy.statusTabs}>{FILTERS.map(filter => <button aria-pressed={statusGroup === filter} key={filter} type="button" onClick={() => { setStatusGroup(filter); setPage(1); }}>{copy.filters[filter]} <span>{counts[filter] ?? "…"}</span></button>)}</div><div className="organizer-sort"><SelectPicker aria-label={copy.sort} value={sort} onChange={event => { setSort(event.target.value as OrganizerEventSort); setPage(1); }}><option value="updated_desc">{copy.updated}</option><option value="date_asc">{copy.earliest}</option><option value="date_desc">{copy.latest}</option></SelectPicker></div></div>
      {list.error ? <OrganizerResourceError message={list.error} onRetry={list.retry} /> : null}
      {!result && !list.error ? <p className="account-loading" role="status">{copy.loading}</p> : null}
      {result ? <div className="account-card organizer-event-list">
        {result.items.length ? <table className="organizer-table"><caption className="sr-only">{design.events}</caption><thead><tr><th scope="col">{design.eventColumn}</th><th scope="col">{design.salesColumn}</th><th scope="col">{design.revenueColumn}</th><th scope="col">{design.actionsColumn}</th></tr></thead><tbody>{result.items.map(event => <EventRow key={event.id} event={event} busy={busyId !== null} pending={busyId === event.id} onDelete={() => void mutate(event, "delete")} onReopen={() => void mutate(event, "reopen")} />)}</tbody></table> : <div className="organizer-empty"><OrganizerIcon name="calendar-days" /><h2>{copy.empty}</h2><Link className="account-button account-button-primary" href={localeUrl("/events/create", locale)}>{copy.create}</Link></div>}
        <div className="organizer-list-summary"><p>{design.shown} {result.items.length} {design.of} {result.total}</p><p>{design.pageSales}: {result.items.reduce((total, event) => total + event.metrics.sold, 0)} {design.units}</p></div>
      </div> : null}
      {result && result.total > result.limit ? <nav className="account-pager" aria-label={copy.pages}><button className="account-button" type="button" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>{copy.previous}</button><span>{copy.page} {page} {copy.of} {Math.max(1, Math.ceil(result.total / result.limit))}</span><button className="account-button" type="button" disabled={!result.hasNext} onClick={() => setPage(value => value + 1)}>{copy.next}</button></nav> : null}
    </section>
    <section className="organizer-quick-start"><OrganizerIcon name="plus" /><div><h2>{design.quickStart}</h2><p>{copy.setupHint}</p></div><Link className="account-text-link" href={localeUrl("/events/create", locale)}>{copy.newEvent}<OrganizerIcon name="arrow-right" /></Link></section>
  </>;
}

function Metric({ label, value, detail, icon }: { label: string; value: number | string; detail: string; icon: string }) {
  return <div className="account-card organizer-metric"><div><h2>{label}</h2><OrganizerIcon name={icon} /></div><p>{value}</p><small>{detail}</small></div>;
}

function EventRow({ event, busy, pending, onDelete, onReopen }: { event: OrganizerWorkspaceEvent; busy: boolean; pending: boolean; onDelete: () => void; onReopen: () => void }) {
  const locale = useLocale(); const copy = ORGANIZER_EVENTS_COPY[locale]; const design = ORGANIZER_WORKSPACE_COPY[locale]; const eventsCopy = EVENTS_COPY[locale];
  const [posterFailed, setPosterFailed] = useState(false);
  useEffect(() => setPosterFailed(false), [event.posterUrl]);
  const metrics = event.metrics; const progress = metrics.capacity > 0 ? Math.min(100, Math.round(metrics.sold / metrics.capacity * 100)) : 0;
  const unit = metrics.mode === "whole_table" ? design.tables : metrics.mode === "per_seat" ? design.seats : design.tickets;
  return <tr className="organizer-event-row">
    <td><div className="organizer-event-details"><div className="organizer-poster" aria-hidden="true">{event.posterUrl && !posterFailed ? <img alt="" src={event.posterUrl} onError={() => setPosterFailed(true)} /> : event.title.slice(0, 1)}</div><div><div className="organizer-event-status"><span className={`organizer-status organizer-status-${event.status}`}>{eventsCopy.statuses[event.status]}</span><span>ID {event.displayId}</span></div><h2>{event.title}</h2><p>{event.date} · {event.time} · {event.address}</p><p className="organizer-admission-mode">{metrics.mode === "ordinary" ? copy.ordinary : metrics.mode === "per_seat" ? copy.perSeat : copy.perTable}</p></div></div></td>
    <td data-label={design.salesColumn}><div className="organizer-sales"><p>{metrics.sold}{metrics.capacity > 0 ? ` ${copy.of} ${metrics.capacity}` : ""} {unit}</p><progress aria-label={`${copy.sold}: ${event.title}`} max={100} value={progress} /><small>{copy.remaining} {metrics.remaining} · {progress}%</small>{metrics.includedSeats !== null ? <small>{copy.includedSeats} {metrics.includedSeats}</small> : null}</div></td>
    <td data-label={design.revenueColumn}><strong className="organizer-row-revenue">{metrics.currency ? formatMoney(metrics.settledRevenue, metrics.currency, locale) : "—"}</strong></td>
    <td><div className="organizer-event-actions"><Link className="account-button" href={localeUrl(`/organizer/events/${event.id}/preview`, locale)}><OrganizerIcon name="eye" />{copy.preview}</Link><Link className="account-button account-button-primary" href={localeUrl(`/organizer/events/${event.id}${event.status === "draft" ? "/edit" : ""}`, locale)}>{event.status === "draft" ? copy.continue : copy.manage}</Link>
      {event.status === "draft" ? <button className="organizer-delete" type="button" disabled={busy} onClick={onDelete}>{eventsCopy.deleteDraft}</button> : null}
      {event.status === "completed" && event.paymentMode !== "deposit" ? <button className="account-text-link" type="button" disabled={busy} onClick={onReopen}>{pending ? copy.publishing : copy.republish}</button> : null}
    </div></td>
  </tr>;
}
function formatMoney(value: number, currency: string, locale: EventLocale) { return new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(value / 100); }
