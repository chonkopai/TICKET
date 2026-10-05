"use client";
import { ThemeToggle } from "../../../../components/theme-toggle";

import { INTL_LOCALES, localeFromBrowser } from "../../../../lib/locale";

import { SelectPicker } from "../../../../components/option-picker";

import {
  ru,
  type ManagementAnalyticsBucket,
  type ManagementAnalyticsBucketValue,
  type ManagementAnalyticsResponse,
  type ManagementAttendanceFilter,
  type ManagementBookingFilter,
  type ManagementEventSummary,
  type ManagementOrderDetail,
  type ManagementOrderFilterOptions,
  type ManagementOrderList,
  type ManagementOrderRow,
  type ManagementHoldPreview,
  type ManagementHoldRelease,
  type ManagementRefundQuote,
  type ManagementRefundRequest,
  type EventNotificationStatus,
  type ManagementPaymentFilter,
  MANAGEMENT_ANALYTICS_MAX_DAYS,
  MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS,
  zonedInputToIso,
} from "@event-platform/shared-types";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { apiBlobRequest, apiRequest } from "../../../(auth)/_lib/api";
import { getSession } from "../../../(auth)/_lib/session";
import { OrderChat } from "../../../../components/order-chat";

type OrderFilters = { search: string; payment: ManagementPaymentFilter; booking: ManagementBookingFilter; attendance: ManagementAttendanceFilter; tableId: string };
type DateRange = { from: string; to: string };
type DownloadKind = "report" | "orders";
const PAGE_SIZE = 20;
const EMPTY_FILTERS: OrderFilters = { search: "", payment: "all", booking: "all", attendance: "all", tableId: "" };

export function EventManagement({ eventId }: { eventId: string }) {
  return <MaterialSymbolsProvider><ProtectedRoute><Management eventId={eventId} /></ProtectedRoute></MaterialSymbolsProvider>;
}

const MaterialSymbolsContext = createContext(false);

function MaterialSymbolsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stylesheetId = "ticket-management-material-symbols";
    let stylesheet = document.getElementById(stylesheetId) as HTMLLinkElement | null;
    if (!stylesheet) {
      stylesheet = document.createElement("link");
      stylesheet.id = stylesheetId;
      stylesheet.rel = "stylesheet";
      stylesheet.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
      document.head.append(stylesheet);
    }
    const handleFontError = () => setReady(false);
    const verifyFont = () => {
      void document.fonts.load('400 24px "Material Symbols Outlined"', "confirmation_number")
        .then((faces) => setReady(faces.length > 0 && document.fonts.check('400 24px "Material Symbols Outlined"')))
        .catch(() => setReady(false));
    };
    stylesheet.addEventListener("load", verifyFont);
    stylesheet.addEventListener("error", handleFontError);
    if (stylesheet.sheet) verifyFont();
    return () => {
      stylesheet?.removeEventListener("load", verifyFont);
      stylesheet?.removeEventListener("error", handleFontError);
    };
  }, []);
  return <MaterialSymbolsContext.Provider value={ready}>{children}</MaterialSymbolsContext.Provider>;
}

function Management({ eventId }: { eventId: string }) {
  const [summary, setSummary] = useState<ManagementEventSummary | null>(null);
  const [analytics, setAnalytics] = useState<ManagementAnalyticsResponse | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [orders, setOrders] = useState<ManagementOrderList | null>(null);
  const [tableOptions, setTableOptions] = useState<ManagementOrderFilterOptions["tables"]>([]);
  const [tableOptionsLoading, setTableOptionsLoading] = useState(true);
  const [tableOptionsError, setTableOptionsError] = useState<string | null>(null);
  const [tableOptionsReload, setTableOptionsReload] = useState(0);
  const [range, setRange] = useState<DateRange | null>(null);
  const [dateDraft, setDateDraft] = useState<DateRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_FILTERS);
  const [draftSearch, setDraftSearch] = useState("");
  const [bucket, setBucket] = useState<ManagementAnalyticsBucket>("day");
  const [currency, setCurrency] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [downloading, setDownloading] = useState<DownloadKind | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ManagementOrderDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const mutationInFlight = useRef(false);
  const orderRequest = useRef(0);
  const drawerRequest = useRef(0);
  const drawerController = useRef<AbortController | null>(null);
  const analyticsQuery = useMemo(() => summary && range && !validateManagementRange(range, bucket, summary.event.timezone) ? buildAnalyticsQuery(range, bucket, summary.event.timezone) : null, [bucket, range, summary]);
  const orderQuery = useMemo(() => buildOrderQuery(page, filters), [filters, page]);
  const closeDrawer = useCallback(() => {
    drawerRequest.current += 1;
    drawerController.current?.abort();
    drawerController.current = null;
    setSelectedOrder(null); setDrawerError(null); setDrawerLoading(false);
  }, []);

  useEffect(() => setUserName(getSession()?.user.name ?? null), []);
  useEffect(() => () => drawerController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    setError(null); setSummary(null);
    void apiRequest<ManagementEventSummary>(`/api/organizer/events/${eventId}/management-summary`, { signal: controller.signal }).then((value) => {
      if (controller.signal.aborted) return;
      setSummary(value);
      const initialRange = managementRange(value.event.timezone);
      setRange((previous) => previous ?? initialRange);
      setDateDraft((previous) => previous ?? initialRange);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [eventId, reload]);

  useEffect(() => {
    if (!analyticsQuery) { setAnalytics(null); setAnalyticsError(null); setAnalyticsLoading(false); return; }
    const controller = new AbortController();
    setAnalytics(null); setAnalyticsError(null); setAnalyticsLoading(true);
    void apiRequest<ManagementAnalyticsResponse>(`/api/organizer/events/${eventId}/analytics?${analyticsQuery}`, { signal: controller.signal }).then((value) => { if (!controller.signal.aborted) setAnalytics(value); }).catch((reason: unknown) => { if (!controller.signal.aborted) setAnalyticsError(errorText(reason)); }).finally(() => { if (!controller.signal.aborted) setAnalyticsLoading(false); });
    return () => controller.abort();
  }, [analyticsQuery, eventId, reload]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = orderRequest.current + 1;
    orderRequest.current = requestId;
    setOrders(null); setOrdersError(null);
    void apiRequest<ManagementOrderList>(`/api/organizer/events/${eventId}/orders?${orderQuery}`, { signal: controller.signal }).then((value) => { if (!controller.signal.aborted && requestId === orderRequest.current) setOrders(value); }).catch((reason: unknown) => { if (!controller.signal.aborted && requestId === orderRequest.current) setOrdersError(errorText(reason)); });
    return () => controller.abort();
  }, [eventId, orderQuery, reload]);

  useEffect(() => {
    const controller = new AbortController();
    setTableOptionsLoading(true);
    setTableOptionsError(null);
    void apiRequest<ManagementOrderFilterOptions>(`/api/organizer/events/${eventId}/order-filter-options`, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setTableOptions(value.tables); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setTableOptionsError(errorText(reason)); })
      .finally(() => { if (!controller.signal.aborted) setTableOptionsLoading(false); });
    return () => controller.abort();
  }, [eventId, reload, tableOptionsReload]);

  const currencies = useMemo(() => [...new Set([...(summary?.money.grossReceived ?? []).map((item) => item.currency), ...(analytics?.buckets.flatMap((item) => item.money.map((money) => money.currency)) ?? [])])].sort(), [analytics, summary]);
  const selectedCurrency = currency && currencies.includes(currency) ? currency : currencies[0] ?? null;
  const analyticsRangeError = summary && dateDraft ? validateManagementRange(dateDraft, bucket, summary.event.timezone) : null;

  async function download(kind: DownloadKind): Promise<void> {
    if (downloading) return;
    if (kind === "report" && !analyticsQuery) { setDownloadError("Выберите корректный период для отчёта."); return; }
    setDownloading(kind); setDownloadError(null);
    try {
      const path = kind === "report" && analyticsQuery ? `/api/organizer/events/${eventId}/analytics/export?${analyticsQuery}` : `/api/organizer/events/${eventId}/orders/export?${buildOrderQuery(undefined, filters)}`;
      const blob = await apiBlobRequest(path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${kind === "report" ? "event-report" : "event-orders"}-${eventId}.csv`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) { setDownloadError(errorText(reason)); }
    finally { setDownloading(null); }
  }

  async function openOrder(orderId: string): Promise<void> {
    drawerController.current?.abort();
    const requestId = drawerRequest.current + 1;
    drawerRequest.current = requestId;
    const controller = new AbortController();
    drawerController.current = controller;
    setDrawerLoading(true); setDrawerError(null); setSelectedOrder(null);
    try {
      const detail = await apiRequest<ManagementOrderDetail>(`/api/organizer/events/${eventId}/orders/${orderId}`, { signal: controller.signal });
      if (!controller.signal.aborted && drawerRequest.current === requestId) setSelectedOrder(detail);
    } catch (reason) {
      if (!controller.signal.aborted && drawerRequest.current === requestId) setDrawerError(errorText(reason));
    } finally {
      if (drawerRequest.current === requestId) { drawerController.current = null; setDrawerLoading(false); }
    }
  }

  async function transition(action: "complete" | "cancel" | "reopen"): Promise<void> {
    if (!summary || busy || mutationInFlight.current) return;
    const verb = action === "complete" ? "завершить" : action === "cancel" ? "отменить" : "опубликовать снова";
    const consequence = action === "complete" ? "Новые продажи будут остановлены." : action === "cancel" ? "Событие будет снято с продажи." : "Продажи снова станут доступны.";
    if (!window.confirm(`Вы уверены, что хотите ${verb} мероприятие «${summary.event.title}»? ${consequence}`)) return;
    mutationInFlight.current = true; setBusy(true); setError(null);
    try { await apiRequest(`/api/organizer/events/${eventId}/${action}`, { method: "POST" }); setReload((value) => value + 1); }
    catch (reason) { setError(errorText(reason)); }
    finally { mutationInFlight.current = false; setBusy(false); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); setPage(1); setFilters((value) => ({ ...value, search: draftSearch.trim() })); }

  if (error && !summary) return <ManagementError message={error} onRetry={() => setReload((value) => value + 1)} />;
  if (!summary) return <ManagementSkeleton />;
  const hasHall = summary.event.salesModes.includes("per_seat") || summary.event.salesModes.includes("whole_table");
  const publicHref = summary.event.status === "published" ? `/events/${eventId}` : `/organizer/events/${eventId}/preview`;
  const status = statusPresentation(summary.event.status);

  return <div className="min-h-screen overflow-x-hidden bg-[#f9f9ff] dark:bg-ticket-bg text-[#151c27] dark:text-ticket-text">
    <OrganizerHeader eventTitle={summary.event.title} userName={userName} downloading={downloading === "report"} onExport={() => void download("report")} />
    <main className="mx-auto w-full max-w-[1440px] space-y-5 px-4 pb-12 pt-5 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-5 shadow-[0_2px_12px_rgba(27,24,21,0.04)] sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${status.className}`}>{status.label}</span><span className="font-mono text-xs text-[#7b7485] dark:text-ticket-muted">ID #{summary.event.id.slice(0, 8).toUpperCase()}</span></div><h1 className="mt-3 max-w-3xl break-words text-3xl font-bold tracking-[-0.03em] sm:text-4xl">{summary.event.title}</h1><div className="mt-4 flex flex-col gap-2 text-sm text-[#4a4453] dark:text-ticket-muted sm:flex-row sm:flex-wrap sm:gap-x-5"><Meta icon="calendar">{formatEventDate(summary.event.date, summary.event.time)} <span className="text-[#7b7485] dark:text-ticket-muted">({summary.event.timezone})</span></Meta><Meta icon="location">{summary.event.venueName}{summary.event.address ? `, ${summary.event.address}` : ""}</Meta></div></div>
          <div className="flex max-w-3xl flex-wrap gap-2"><ActionLink href={`/organizer/events/${eventId}/edit`} icon="edit">Редактировать</ActionLink><ActionLink href={publicHref} icon="external">{summary.event.status === "published" ? "Открыть в афише" : "Предпросмотр"}</ActionLink><ActionLink href={`/organizer/events/${eventId}/notifications`} icon="bell">Уведомить гостей</ActionLink><ActionLink href={`/organizer/events/${eventId}/scanner`} icon="qr">Сканер входа</ActionLink></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#f0ece1] dark:border-ticket-border pt-4"><div className="flex flex-wrap gap-2"><Link className="rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 py-2 text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent hover:bg-[#e2e8f8] dark:hover:bg-ticket-hover" href={`/organizer/events/${eventId}/analytics`}>Подробная аналитика</Link>{summary.event.status === "published" ? <Link className="rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 py-2 text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent hover:bg-[#e2e8f8] dark:hover:bg-ticket-hover" href={`/organizer/events/${eventId}/campaigns`}>Рекламная рассылка</Link> : null}{hasHall && summary.event.status === "published" ? <Link className="rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 py-2 text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent hover:bg-[#e2e8f8] dark:hover:bg-ticket-hover" href={`/events/${eventId}#venue-plan`}>Открыть схему зала</Link> : hasHall ? <span className="rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 py-2 text-sm text-[#6b7280] dark:text-ticket-muted" title="Схема доступна в режиме просмотра после публикации">Схема зала · после публикации</span> : null}</div><LifecycleMenu busy={busy} status={summary.event.status} deposit={summary.event.paymentMode === "deposit"} onTransition={transition} eventId={eventId} /></div>
      </section>
      {error ? <p className="rounded-xl border border-red-200 dark:border-ticket-danger-border bg-red-50 dark:bg-ticket-danger-soft p-4 text-sm text-red-800 dark:text-ticket-danger" role="alert">{error}</p> : null}
      {downloadError ? <p className="rounded-xl border border-red-200 dark:border-ticket-danger-border bg-red-50 dark:bg-ticket-danger-soft p-4 text-sm text-red-800 dark:text-ticket-danger" role="alert">Не удалось скачать файл: {downloadError}</p> : null}
      {summary.event.status !== "published" ? <StateNotice status={summary.event.status} eventId={eventId} /> : null}
      <KpiGrid summary={summary} />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(340px,5fr)]"><SalesPanel analytics={analytics} loading={analyticsLoading} error={analyticsError} bucket={bucket} currency={selectedCurrency} currencies={currencies} range={dateDraft ?? range} rangeError={analyticsRangeError} onRange={setDateDraft} onApplyRange={() => { if (!analyticsRangeError && dateDraft) setRange(dateDraft); }} onRetry={() => setReload((value) => value + 1)} onBucket={setBucket} onCurrency={setCurrency} /><TariffPanel analytics={analytics} loading={analyticsLoading} error={analyticsError} onRetry={() => setReload((value) => value + 1)} summary={summary} currency={selectedCurrency} eventId={eventId} hasHall={hasHall} /></div>
      <OrdersSection orders={orders} error={ordersError} page={page} draftSearch={draftSearch} filters={filters} tables={tableOptions} tableOptionsLoading={tableOptionsLoading} tableOptionsError={tableOptionsError} timezone={summary.event.timezone} downloading={downloading === "orders"} onDraftSearch={setDraftSearch} onFilters={(next) => { setPage(1); setFilters(next); }} onPage={setPage} onSearch={submitSearch} onExport={() => void download("orders")} onOpen={(id) => void openOrder(id)} onRetry={() => setReload((value) => value + 1)} onRetryTables={() => setTableOptionsReload((value) => value + 1)} />
    </main>
    {(drawerLoading || drawerError || selectedOrder) ? <OrderDrawer order={selectedOrder} loading={drawerLoading} error={drawerError} timezone={summary.event.timezone} onClose={closeDrawer} onChanged={() => { closeDrawer(); setReload((value) => value + 1); }} /> : null}
  </div>;
}

function OrganizerHeader({ eventTitle, userName, downloading, onExport }: { eventTitle: string; userName: string | null; downloading: boolean; onExport: () => void }) {
  const initial = userName?.trim().slice(0, 1).toUpperCase() || "О";
  return <header className="sticky top-0 z-30 border-b border-[#ece8f1] dark:border-ticket-border bg-white/95 dark:bg-ticket-surface/95 backdrop-blur-xl">
    <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
      <div className="flex min-w-0 items-center gap-3"><Link aria-label="TICKET — мероприятия организатора" className="flex shrink-0 items-center gap-2 font-bold text-[#420093] dark:text-ticket-accent" href="/organizer/events"><Icon name="ticket" className="h-5 w-5" /><span>TICKET</span></Link><span aria-hidden="true" className="text-[#ccc3d6] dark:text-ticket-dim">/</span><Link className="hidden shrink-0 text-sm text-[#575e70] dark:text-ticket-muted hover:text-[#420093] dark:hover:text-ticket-accent md:inline" href="/organizer/events">Панель организатора</Link><span aria-hidden="true" className="hidden text-[#ccc3d6] dark:text-ticket-dim md:inline">/</span><span className="truncate text-sm font-semibold sm:text-base">{eventTitle}</span></div>
      <div className="flex shrink-0 items-center gap-2"><ThemeToggle /><button aria-label="Экспорт отчёта" className="grid h-10 w-10 place-items-center rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised text-sm font-semibold hover:bg-[#e2e8f8] dark:hover:bg-ticket-hover disabled:opacity-50 sm:flex sm:w-auto sm:gap-2 sm:px-3" disabled={downloading} onClick={onExport} title="Экспорт финансового отчёта CSV" type="button"><Icon name="export" className="h-4 w-4" /><span className="hidden sm:inline">{downloading ? "Экспорт…" : "Экспорт отчёта"}</span></button><Link aria-label="Профиль организатора" className="grid h-9 w-9 place-items-center rounded-full bg-[#5b21b6] dark:bg-ticket-primary text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc] dark:focus-visible:ring-ticket-accent focus-visible:ring-offset-2" href="/account" title={userName ?? "Профиль организатора"}>{initial}</Link></div>
    </div>
  </header>;
}

function KpiGrid({ summary }: { summary: ManagementEventSummary }) {
  return <section aria-label="Основные показатели" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard icon="money" label="Выручка брутто" value={<MoneyList values={summary.money.grossReceived} />} detail={summary.money.depositsReceived?.length ? <>Депозиты включены в поступления: <MoneyList inline values={summary.money.depositsReceived} /></> : "Подтверждённые поступления; депозиты входят в сумму"} /><KpiCard icon="ticket" label="Продано мест" value={`${formatNumber(summary.inventory.soldAdmissions)} / ${formatNumber(summary.inventory.configuredAdmissionCapacity)}`} detail={`Сейчас доступно ${formatNumber(summary.inventory.buyableAdmissions)} · удерживается ${formatNumber(summary.inventory.heldAdmissions)}${summary.inventory.wholeTables.sold ? ` · целых столов: ${formatNumber(summary.inventory.wholeTables.sold)}` : ""}`} progress={percentage(summary.inventory.soldAdmissions, summary.inventory.configuredAdmissionCapacity)} /><KpiCard icon="users" label="Покупатели с аккаунтом" value={summary.buyers.unknown ? "Недоступно" : formatNumber(summary.buyers.registered)} detail={`Анонимных заказов: ${formatNumber(summary.buyers.anonymousOrders)} · билетов отмечено: ${formatNumber(summary.attendance.checkedInTickets)}${summary.attendance.checkedInGroupPasses ? ` · групповых пропусков: ${formatNumber(summary.attendance.checkedInGroupPasses)}` : ""}`} /><KpiCard icon="refund" label="Отмены и возвраты" value={<span className="text-lg">Билеты: {formatNumber(summary.cancellations.tickets)}<br />Брони: {formatNumber(summary.cancellations.bookings)}</span>} detail={<>Запросов: {formatNumber(summary.cancellations.refundRequests)} · подтверждено: <MoneyList inline values={summary.money.completedRefunds} /></>} tone="danger" /></section>;
}

function KpiCard({ icon, label, value, detail, progress, tone = "default" }: { icon: IconName; label: string; value: ReactNode; detail: ReactNode; progress?: number; tone?: "default" | "danger" }) {
  return <article className="min-w-0 rounded-2xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-4 shadow-[0_2px_12px_rgba(27,24,21,0.035)] sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6b7280] dark:text-ticket-muted">{label}</p><Icon name={icon} className={`h-5 w-5 ${tone === "danger" ? "text-[#ba1a1a] dark:text-ticket-danger" : "text-[#5b21b6] dark:text-ticket-accent"}`} /></div><div className="mt-3 font-mono text-2xl font-bold tracking-[-0.04em] text-[#151c27] dark:text-ticket-text">{value}</div><div className="mt-2 text-xs leading-5 text-[#6b7280] dark:text-ticket-muted">{detail}</div>{progress !== undefined ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e7eefe] dark:bg-ticket-raised"><div className="h-full rounded-full bg-[#059669]" style={{ width: `${progress}%` }} /></div> : null}</article>;
}

function SalesPanel({ analytics, loading, error, bucket, currency, currencies, range, rangeError, onRange, onApplyRange, onRetry, onBucket, onCurrency }: { analytics: ManagementAnalyticsResponse | null; loading: boolean; error: string | null; bucket: ManagementAnalyticsBucket; currency: string | null; currencies: string[]; range: DateRange | null; rangeError: string | null; onRange: (value: DateRange) => void; onApplyRange: () => void; onRetry: () => void; onBucket: (value: ManagementAnalyticsBucket) => void; onCurrency: (value: string) => void }) {
  return <section className="min-w-0 rounded-2xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-semibold">Динамика продаж</h2><p className="mt-1 text-sm text-[#6b7280] dark:text-ticket-muted">Подтверждённые поступления · часовой пояс события</p></div><div className="flex flex-wrap gap-2"><div className="flex rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised p-1" aria-label="Группировка графика">{(["day", "hour"] as const).map((value) => <button aria-pressed={bucket === value} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${bucket === value ? "bg-white dark:bg-ticket-surface text-[#420093] dark:text-ticket-accent shadow-sm" : "text-[#575e70] dark:text-ticket-muted"}`} key={value} onClick={() => onBucket(value)} type="button">{value === "day" ? "По дням" : "По часам"}</button>)}</div>{currencies.length > 1 ? <label className="flex items-center gap-1 text-xs text-[#575e70] dark:text-ticket-muted">Валюта<SelectPicker className="rounded-lg border border-[#dce2f3] dark:border-ticket-border bg-white dark:bg-ticket-surface px-2 py-1.5 text-xs" onChange={(event) => onCurrency(event.target.value)} value={currency ?? ""}>{currencies.map((value) => <option key={value}>{value}</option>)}</SelectPicker></label> : null}</div></div><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-xs text-[#575e70] dark:text-ticket-muted">С даты<input aria-label="Продажи с даты" className="mt-1 block h-10 w-full rounded-lg border border-[#ccc3d6] dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 text-sm text-[#151c27] dark:text-ticket-text" onChange={(event) => range && onRange({ ...range, from: event.target.value })} type="date" value={range?.from ?? ""} /></label><label className="text-xs text-[#575e70] dark:text-ticket-muted">По дату<input aria-label="Продажи по дату" className="mt-1 block h-10 w-full rounded-lg border border-[#ccc3d6] dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 text-sm text-[#151c27] dark:text-ticket-text" onChange={(event) => range && onRange({ ...range, to: event.target.value })} type="date" value={range?.to ?? ""} /></label><button className="h-10 rounded-lg bg-[#5b21b6] dark:bg-ticket-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!range || Boolean(rangeError)} onClick={onApplyRange} type="button">Применить</button></div>{rangeError ? <p className="text-xs text-red-700 dark:text-ticket-danger" role="alert">{rangeError}</p> : null}</div>{error ? <div className="mt-5 rounded-xl bg-red-50 dark:bg-ticket-danger-soft p-4 text-sm text-red-800 dark:text-ticket-danger" role="alert">Не удалось загрузить график: {error}<button className="ml-3 font-semibold underline" onClick={onRetry} type="button">Повторить</button></div> : loading || !analytics ? <PanelSkeleton /> : <RevenueChart buckets={analytics.buckets} currency={currency} />}{analytics?.unavailable.includes("settlement_time") ? <p className="mt-3 text-xs text-amber-800 dark:text-ticket-warning">У части старых платежей нет точного времени зачисления; они не включены в график.</p> : null}</section>;
}

function RevenueChart({ buckets, currency }: { buckets: ManagementAnalyticsBucketValue[]; currency: string | null }) {
  const rows = buckets.map((bucket) => {
    const money = bucket.money.find((item) => item.currency === currency);
    return { bucket, grossReceived: money ? money.grossReceived : 0 };
  });
  const knownValues = rows.flatMap(({ grossReceived }) => grossReceived === null ? [] : [grossReceived]);
  if (!currency) return <EmptyPanel>Валюта и история поступлений пока недоступны.</EmptyPanel>;
  if (knownValues.length === 0) return <EmptyPanel>Исторические поступления за выбранный период недоступны.</EmptyPanel>;
  const width = 720, height = 250, chartHeight = 170, maximum = Math.max(...knownValues, 1), step = (width - 80) / Math.max(1, rows.length - 1);
  const coordinate = (value: number, index: number) => `${50 + index * step},${20 + chartHeight - value / maximum * chartHeight}`;
  const segments: string[][] = [];
  for (const [index, row] of rows.entries()) {
    if (row.grossReceived === null) continue;
    const current = segments.at(-1);
    if (index > 0 && rows[index - 1]?.grossReceived === null) segments.push([coordinate(row.grossReceived, index)]);
    else if (current) current.push(coordinate(row.grossReceived, index));
    else segments.push([coordinate(row.grossReceived, index)]);
  }
  return <div className="mt-5">
    <div className="overflow-x-auto"><svg aria-label={`Поступления в ${currency}`} className="h-[250px] min-w-[620px] w-full" role="img" viewBox={`0 0 ${width} ${height}`}><title>Поступления по периодам в {currency}</title>{[0, .5, 1].map((ratio) => <g key={ratio}><line stroke="var(--ticket-border)" strokeDasharray="4 5" x1="50" x2={width - 20} y1={20 + chartHeight * ratio} y2={20 + chartHeight * ratio} /><text fill="var(--ticket-muted)" fontSize="10" x="2" y={24 + chartHeight * ratio}>{formatCompactMoney(maximum * (1 - ratio), currency)}</text></g>)}{segments.filter((segment) => segment.length > 1).map((segment, index) => <polyline fill="none" key={index} points={segment.join(" ")} stroke="var(--ticket-accent)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />)}{rows.map(({ bucket, grossReceived }, index) => <g key={bucket.startsAt}>{grossReceived === null ? null : <circle cx={50 + index * step} cy={20 + chartHeight - grossReceived / maximum * chartHeight} fill="var(--ticket-accent)" r={rows.length < 40 ? 3.5 : 2}><title>{bucket.label}: {formatMoney(grossReceived, currency)}</title></circle>}{showAxisLabel(index, rows.length) ? <text fill="var(--ticket-muted)" fontSize="10" textAnchor="middle" x={50 + index * step} y="220">{shortDate(bucket.label)}</text> : null}</g>)}</svg></div>
    {rows.some(({ grossReceived }) => grossReceived === null) ? <p className="mt-2 text-xs text-amber-800 dark:text-ticket-warning">В графике пропущены периоды с неизвестными суммами.</p> : null}
    <details className="mt-3 rounded-lg border border-[#e5e1d8] dark:border-ticket-border bg-[#fbfaff] dark:bg-ticket-raised p-3"><summary className="cursor-pointer text-sm font-semibold text-[#420093] dark:text-ticket-accent">Показать данные таблицей</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full min-w-[420px] text-left text-sm"><caption className="sr-only">Поступления и продажи по периодам, валюта {currency}</caption><thead className="sticky top-0 bg-[#f0f3ff] dark:bg-ticket-raised text-xs"><tr><th className="px-3 py-2">Период</th><th className="px-3 py-2">Продано мест</th><th className="px-3 py-2 text-right">Поступления</th></tr></thead><tbody>{rows.map(({ bucket, grossReceived }) => <tr className="border-t border-[#e5e1d8] dark:border-ticket-border" key={bucket.startsAt}><th className="px-3 py-2 font-medium">{bucket.label}</th><td className="px-3 py-2">{bucket.soldAdmissions === null ? "Недоступно" : formatNumber(bucket.soldAdmissions)}</td><td className="px-3 py-2 text-right font-mono">{grossReceived === null ? "Недоступно" : formatMoney(grossReceived, currency)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

function TariffPanel({ analytics, loading, error, onRetry, summary, currency, eventId, hasHall }: { analytics: ManagementAnalyticsResponse | null; loading: boolean; error: string | null; onRetry: () => void; summary: ManagementEventSummary; currency: string | null; eventId: string; hasHall: boolean }) {
  const rows = tariffRows(summary, analytics, currency);
  return <section className="min-w-0 rounded-2xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">По столам, зонам и рядам</h2><p className="mt-1 text-sm text-[#6b7280] dark:text-ticket-muted">Наличие сейчас и оплаченные продажи всего</p></div>{hasHall && summary.event.status === "published" ? <Link className="inline-flex items-center gap-1.5 rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 py-2 text-xs font-semibold text-[#5b21b6] dark:text-ticket-accent" href={`/events/${eventId}#venue-plan`}><Icon name="seats" className="h-4 w-4" />Схема зала</Link> : null}</div>{error ? <div className="mt-4 rounded-lg bg-red-50 dark:bg-ticket-danger-soft p-3 text-sm text-red-800 dark:text-ticket-danger" role="alert">Не удалось загрузить продажи за период. <button className="font-semibold underline" onClick={onRetry} type="button">Повторить</button></div> : null}{loading && !analytics ? <PanelSkeleton /> : rows.length ? <div className="mt-5 max-h-[680px] space-y-3 overflow-y-auto pr-1">{rows.map((row, index) => { const occupancy = percentage(row.sold, row.configured); return <article className="rounded-xl bg-[#f7f7fd] dark:bg-ticket-raised p-4" key={row.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${index % 2 ? "bg-[#059669]" : "bg-[#713dcc] dark:bg-ticket-primary"}`} /><h3 className="truncate text-sm font-semibold">{row.name}</h3></div><p className="mt-1 pl-[18px] font-mono text-xs text-[#6b7280] dark:text-ticket-muted">{row.price === null ? "Разные цены" : formatMoney(row.price, row.currency)} · {row.unit === "tables" ? "стол целиком" : row.unit === "seats" ? "места" : "билеты"}</p></div><span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${row.buyable > 0 ? "bg-emerald-100 dark:bg-ticket-success-soft text-emerald-800 dark:text-ticket-success" : "bg-zinc-200 dark:bg-ticket-raised text-zinc-700 dark:text-ticket-muted"}`}>{row.buyable > 0 ? `Осталось ${formatNumber(row.buyable)}` : "Нет мест"}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dce2f3] dark:bg-ticket-raised"><div className="h-full rounded-full bg-[#5b21b6] dark:bg-ticket-primary" style={{ width: `${occupancy}%` }} /></div><div className="mt-2 flex justify-between gap-3 text-xs text-[#575e70] dark:text-ticket-muted"><span>Продано {formatNumber(row.sold)} из {formatNumber(row.configured)} {row.unit === "tables" ? "столов" : row.unit === "seats" ? "мест" : "билетов"}</span><span className="font-mono font-semibold">{occupancy}%</span></div>{row.revenue === null ? <p className="mt-1 text-[11px] text-[#7b7485] dark:text-ticket-muted">Выручка по этой группе недоступна</p> : <p className="mt-1 text-[11px] text-[#7b7485] dark:text-ticket-muted">Выручка: {formatMoney(row.revenue, row.currency)}</p>}</article>; })}</div> : <EmptyPanel>{loading ? "Загружаем тарифы…" : "Типы билетов или продажи пока не созданы."}</EmptyPanel>}</section>;
}

function OrdersSection(props: { orders: ManagementOrderList | null; error: string | null; page: number; draftSearch: string; filters: OrderFilters; tables: Array<{ id: string; label: string }>; tableOptionsLoading: boolean; tableOptionsError: string | null; timezone: string; downloading: boolean; onDraftSearch: (value: string) => void; onFilters: (value: OrderFilters) => void; onPage: (value: number) => void; onSearch: (event: FormEvent<HTMLFormElement>) => void; onExport: () => void; onOpen: (id: string) => void; onRetry: () => void; onRetryTables: () => void }) {
  const { orders, error, page, draftSearch, filters, tables, tableOptionsLoading, tableOptionsError, timezone, downloading, onDraftSearch, onFilters, onPage, onSearch, onExport, onOpen, onRetry, onRetryTables } = props;
  return <section className="rounded-2xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-4 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0"><h2 className="text-xl font-semibold">Список гостей и заказы</h2><p className="mt-1 text-sm text-[#6b7280] dark:text-ticket-muted">Одна строка соответствует одному заказу</p></div>
      <button aria-label="Экспорт заказов в CSV" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#f0f3ff] dark:bg-ticket-raised px-3 text-sm font-semibold text-[#420093] dark:text-ticket-accent hover:bg-[#e7eefe] dark:hover:bg-ticket-hover disabled:opacity-50" disabled={downloading} onClick={onExport} type="button"><Icon name="download" className="h-4 w-4" />{downloading ? "Экспорт…" : "CSV"}</button>
    </div>
    <div aria-label="Поиск и фильтры заказов" className="mt-5 grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
      <form className="min-w-0 sm:col-span-2 xl:col-span-1" onSubmit={onSearch}>
        <label className="mb-1.5 block text-xs font-medium text-[#6b7280] dark:text-ticket-muted" htmlFor="order-search">Поиск гостей</label>
        <div className="flex h-10 min-w-0 overflow-hidden rounded-xl border border-slate-200 dark:border-ticket-border bg-white dark:bg-ticket-surface focus-within:border-violet-500 dark:focus-within:border-ticket-accent focus-within:ring-2 focus-within:ring-violet-500/20">
          <div className="relative min-w-0 flex-1"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b7485] dark:text-ticket-muted" /><input aria-label="Поиск по имени или контакту" className="h-full w-full min-w-0 bg-transparent pl-9 pr-2 text-sm outline-none" id="order-search" onChange={(event) => onDraftSearch(event.target.value)} placeholder="Имя или контакт" value={draftSearch} /></div>
          <button className="shrink-0 border-l border-slate-200 dark:border-ticket-border bg-[#f0f3ff] dark:bg-ticket-raised px-3 text-sm font-semibold text-[#420093] dark:text-ticket-accent hover:bg-[#e7eefe] dark:hover:bg-ticket-hover" type="submit">Найти</button>
        </div>
      </form>
      <div className="min-w-0"><p className="mb-1.5 text-xs font-medium text-[#6b7280] dark:text-ticket-muted">Оплата</p><SelectPicker aria-label="Статус оплаты" onChange={(event) => onFilters({ ...filters, payment: event.target.value as ManagementPaymentFilter })} value={filters.payment}><option value="all">Все оплаты</option><option value="paid">Оплачено</option><option value="pending">Ожидает оплаты</option><option value="refunded">Возвращено</option><option value="cancelled">Отменено</option><option value="failed">Ошибка</option></SelectPicker></div>
      <div className="min-w-0"><p className="mb-1.5 text-xs font-medium text-[#6b7280] dark:text-ticket-muted">Бронирование</p><SelectPicker aria-label="Статус бронирования" onChange={(event) => onFilters({ ...filters, booking: event.target.value as ManagementBookingFilter })} value={filters.booking}><option value="all">Все бронирования</option><option value="none">Без брони</option><option value="pending">Бронь ожидает оплаты</option><option value="confirmed">Подтверждена</option><option value="cancelled">Отменена</option><option value="expired">Истекла</option></SelectPicker></div>
      <div className="min-w-0"><p className="mb-1.5 text-xs font-medium text-[#6b7280] dark:text-ticket-muted">Посещаемость</p><SelectPicker aria-label="Посещаемость" onChange={(event) => onFilters({ ...filters, attendance: event.target.value as ManagementAttendanceFilter })} value={filters.attendance}><option value="all">Любая посещаемость</option><option value="none">Не отмечены</option><option value="partial">Часть гостей пришла</option><option value="all_checked_in">Все отмечены</option><option value="group_pass_used">Групповой пропуск использован</option><option value="unknown">Неизвестно</option></SelectPicker></div>
      <div className="min-w-0"><p className="mb-1.5 text-xs font-medium text-[#6b7280] dark:text-ticket-muted">Стол</p><SelectPicker aria-label="Фильтр по столу" disabled={tableOptionsLoading || Boolean(tableOptionsError)} onChange={(event) => onFilters({ ...filters, tableId: event.target.value })} value={filters.tableId}><option value="">{tableOptionsLoading ? "Загрузка столов…" : "Все столы"}</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.label}</option>)}</SelectPicker></div>
    </div>
    <p className="mt-3 text-xs text-[#7b7485] dark:text-ticket-muted">Фильтр по секторам недоступен: заказы пока не связаны с секторами зала.</p>
    {tableOptionsError ? <p className="mt-3 text-sm text-red-800 dark:text-ticket-danger" role="alert">Не удалось загрузить столы для фильтра. {tableOptionsError}<button className="ml-2 font-semibold underline" onClick={onRetryTables} type="button">Повторить</button></p> : null}
    <div className="mt-5 flex flex-wrap gap-2" aria-label="Быстрые фильтры оплаты">{(["all", "paid", "pending", "refunded"] as const).map((value) => <button aria-pressed={filters.payment === value} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filters.payment === value ? "bg-[#5b21b6] dark:bg-ticket-primary text-white" : "bg-[#f0f3ff] dark:bg-ticket-raised text-[#575e70] dark:text-ticket-muted"}`} key={value} onClick={() => onFilters({ ...filters, payment: value })} type="button">{paymentLabel(value)}{orders ? ` (${orders.statusCounts[value]})` : ""}</button>)}</div>
    {error ? <div className="mt-5 rounded-xl bg-red-50 dark:bg-ticket-danger-soft p-5 text-sm text-red-800 dark:text-ticket-danger" role="alert">{error}<button className="ml-3 font-semibold underline" onClick={onRetry} type="button">Повторить</button></div> : !orders ? <OrdersSkeleton /> : orders.items.length === 0 ? <EmptyPanel>Заказов с выбранными фильтрами нет.</EmptyPanel> : <>
      <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] border-collapse text-left text-sm"><thead><tr className="bg-[#f0f3ff] dark:bg-ticket-raised text-[11px] uppercase tracking-[0.08em] text-[#575e70] dark:text-ticket-muted"><th className="rounded-l-lg px-4 py-3">Заказ / время</th><th className="px-4 py-3">Гость и контакт</th><th className="px-4 py-3">Места / сектор</th><th className="px-4 py-3">Сумма и оплата</th><th className="px-4 py-3">Билет / вход</th><th className="rounded-r-lg px-4 py-3 text-right">Действие</th></tr></thead><tbody>{orders.items.map((order) => <OrderTableRow key={order.id} order={order} timezone={timezone} onOpen={onOpen} />)}</tbody></table></div>
      <div className="mt-4 grid gap-3 md:hidden">{orders.items.map((order) => <OrderCard key={order.id} order={order} timezone={timezone} onOpen={onOpen} />)}</div>
      <div className="mt-5 flex flex-col gap-3 border-t border-[#f0ece1] dark:border-ticket-border pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-[#6b7280] dark:text-ticket-muted">Показано {orders.items.length} из {formatNumber(orders.total)}</p><div className="flex gap-2"><button className="rounded-lg border border-[#ccc3d6] dark:border-ticket-border px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">Предыдущая</button><span className="grid min-w-10 place-items-center rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 font-mono text-sm">{page}</span><button className="rounded-lg border border-[#ccc3d6] dark:border-ticket-border px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={!orders.hasNext} onClick={() => onPage(page + 1)} type="button">Следующая</button></div></div>
    </>}
  </section>;
}

function OrderTableRow({ order, timezone, onOpen }: { order: ManagementOrderRow; timezone: string; onOpen: (id: string) => void }) {
  return <tr className="border-b border-[#f0ece1] dark:border-ticket-border align-top hover:bg-[#fbfaff] dark:hover:bg-ticket-hover"><td className="px-4 py-4"><p className="font-mono text-xs font-semibold">#{order.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs text-[#7b7485] dark:text-ticket-muted">{formatInstant(order.createdAt, timezone)}</p></td><td className="px-4 py-4"><p className="font-semibold">{order.buyer.name ?? "Имя не указано"}</p><p className="mt-1 max-w-48 truncate text-xs text-[#6b7280] dark:text-ticket-muted">{order.buyer.contact ?? "Контакт недоступен"}</p></td><td className="px-4 py-4"><p className="max-w-56 font-medium">{order.resources.labels.join(" · ") || "Свободный вход"}</p><p className="mt-1 text-xs text-[#6b7280] dark:text-ticket-muted">{resourceSummary(order)}</p></td><td className="px-4 py-4"><p className="font-mono font-semibold">{formatMoney(order.payment.amount, order.payment.currency)}</p><StatusBadge status={order.payment.status} /></td><td className="px-4 py-4"><p className="text-sm">{attendanceLabel(order)}</p><p className="mt-1 text-xs text-[#6b7280] dark:text-ticket-muted">{order.attendance.totalTickets ? `${order.attendance.checkedInTickets} из ${order.attendance.totalTickets}` : "Индивидуальных билетов нет"}</p></td><td className="px-4 py-4 text-right"><button aria-label={`Открыть заказ ${order.id}`} className="inline-flex items-center gap-1 rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 py-2 text-xs font-semibold text-[#420093] dark:text-ticket-accent" onClick={() => onOpen(order.id)} type="button"><Icon name="eye" className="h-4 w-4" />Открыть</button></td></tr>;
}

function OrderCard({ order, timezone, onOpen }: { order: ManagementOrderRow; timezone: string; onOpen: (id: string) => void }) {
  return <article className="rounded-xl border border-[#e5e1d8] dark:border-ticket-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold">#{order.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs text-[#7b7485] dark:text-ticket-muted">{formatInstant(order.createdAt, timezone)}</p></div><StatusBadge status={order.payment.status} /></div><h3 className="mt-3 font-semibold">{order.buyer.name ?? "Имя не указано"}</h3><p className="mt-1 text-sm text-[#6b7280] dark:text-ticket-muted">{order.buyer.contact ?? "Контакт недоступен"}</p><p className="mt-3 text-sm">{order.resources.labels.join(" · ") || "Свободный вход"}</p><div className="mt-3 flex items-end justify-between gap-3"><div><p className="font-mono font-semibold">{formatMoney(order.payment.amount, order.payment.currency)}</p><p className="text-xs text-[#6b7280] dark:text-ticket-muted">{attendanceLabel(order)}</p></div><button className="rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 py-2 text-sm font-semibold text-[#420093] dark:text-ticket-accent" onClick={() => onOpen(order.id)} type="button">Подробнее</button></div></article>;
}

function OrderDrawer({ order, loading, error, timezone, onClose, onChanged }: { order: ManagementOrderDetail | null; loading: boolean; error: string | null; timezone: string; onClose: () => void; onChanged: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null), closeRef = useRef<HTMLButtonElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; closeRef.current?.focus();
    function keydown(event: KeyboardEvent): void {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0]!, last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow; previousFocus.current?.focus(); };
  }, [onClose]);
    return <div aria-labelledby="order-drawer-title" aria-modal="true" className="fixed inset-0 z-50 flex justify-end bg-[#151c27]/35" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }} role="dialog"><div className="h-full w-full max-w-xl overflow-y-auto bg-white dark:bg-ticket-surface p-5 shadow-2xl sm:p-7" ref={panelRef}><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#713dcc] dark:text-ticket-accent">Заказ</p><h2 className="mt-1 text-2xl font-semibold" id="order-drawer-title">{order ? `#${order.id.slice(0, 8).toUpperCase()}` : "Загрузка заказа"}</h2></div><button aria-label="Закрыть сведения о заказе" className="grid h-10 w-10 place-items-center rounded-full bg-[#f0f3ff] dark:bg-ticket-raised" onClick={onClose} ref={closeRef} type="button"><Icon name="close" className="h-5 w-5" /></button></div>{loading ? <PanelSkeleton /> : error ? <p className="mt-6 rounded-xl bg-red-50 dark:bg-ticket-danger-soft p-4 text-red-800 dark:text-ticket-danger" role="alert">{error}</p> : order ? <><OrderDetailContent order={order} timezone={timezone} /><TicketResendControls order={order} /><HoldControls order={order} timezone={timezone} onChanged={onChanged} /><RefundControls order={order} onChanged={onChanged} /><OrderChat eventId={order.eventId} orderId={order.id} mode="organizer" /></> : null}</div></div>;
}

function TicketResendControls({ order }: { order: ManagementOrderDetail }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<EventNotificationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<{ ticketId: string; value: string } | null>(null);
  useEffect(() => {
    if (!result || !["queued", "sending"].includes(result.status)) return;
    const timer = setInterval(() => {
      void apiRequest<EventNotificationStatus>(`/api/organizer/events/${order.eventId}/notifications/${result.id}`).then(setResult).catch(() => undefined);
    }, 10_000);
    return () => clearInterval(timer);
  }, [order.eventId, result]);
  async function resend(ticket: ManagementOrderDetail["tickets"][number]): Promise<void> {
    if (busy || ticket.status !== "active") return;
    if (!window.confirm(`Отправить существующий билет «${ticket.typeName}» повторно через Telegram?`)) return;
    const requestKey = key.current?.ticketId === ticket.id ? key.current.value : crypto.randomUUID(); key.current = { ticketId: ticket.id, value: requestKey };
    setBusy(ticket.id); setError(null);
    try {
      setResult(await apiRequest<EventNotificationStatus>(`/api/organizer/events/${order.eventId}/orders/${order.id}/tickets/${ticket.id}/resend`, { method: "POST", body: JSON.stringify({ requestKey }) }));
      key.current = null;
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(null); }
  }
  const active = order.tickets.filter((ticket) => ticket.status === "active");
  if (!active.length) return null;
  return <section className="mt-6 border-t border-[#e7e3ed] dark:border-ticket-border pt-5"><h3 className="text-sm font-bold uppercase tracking-wide text-[#5b6070] dark:text-ticket-muted">Повторная отправка билета</h3><p className="mt-1 text-xs text-[#647086] dark:text-ticket-muted">Используется тот же QR-код; статус посещения не меняется. Нужен подтверждённый Telegram-чат покупателя.</p><div className="mt-3 flex flex-wrap gap-2">{active.map((ticket) => <button key={ticket.id} type="button" disabled={Boolean(busy)} onClick={() => void resend(ticket)} className="rounded-lg bg-[#f0eaff] dark:bg-ticket-raised px-3 py-2 text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent disabled:opacity-50">{busy === ticket.id ? "Ставим в очередь…" : `Отправить: ${ticket.typeName}${ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}`}</button>)}</div>{result ? <p className="mt-3 text-sm" role="status">{result.counts.accepted ? "Telegram принял билет" : result.counts.uncertain ? "Результат отправки неизвестен; не повторяйте без проверки" : result.counts.failed ? "Telegram отклонил отправку" : "Билет в очереди на отправку"}</p> : null}{error ? <p className="mt-3 text-sm text-red-800 dark:text-ticket-danger" role="alert">{error}</p> : null}</section>;
}

function HoldControls({ order, timezone, onChanged }: { order: ManagementOrderDetail; timezone: string; onChanged: () => void }) {
  const [preview, setPreview] = useState<ManagementHoldPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (order.payment.status !== "pending") return;
    const controller = new AbortController();
    void apiRequest<ManagementHoldPreview>(`/api/organizer/events/${order.eventId}/orders/${order.id}/hold`, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setPreview(value); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [order.eventId, order.id, order.payment.status]);
  if (order.payment.status !== "pending") return null;
  async function release(): Promise<void> {
    if (!preview?.eligible || submitting.current) return;
    if (!window.confirm(`Снять бронь заказа #${order.id.slice(0, 8).toUpperCase()} (${preview.resourceLabels.join(", ") || "места"})? Заказ больше нельзя будет оплатить, а места снова станут доступны.`)) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      await apiRequest<ManagementHoldRelease>(`/api/organizer/events/${order.eventId}/orders/${order.id}/hold/release`, { method: "POST" });
      onChanged();
    } catch (reason) { setError(errorText(reason)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="mt-6 rounded-xl border border-amber-200 dark:border-ticket-warning-border bg-amber-50 dark:bg-ticket-warning-soft p-4"><h3 className="font-semibold">Бронь мест</h3>{preview ? <><p className="mt-2 text-sm">{preview.resourceLabels.join(" · ") || "Ресурсы заказа"}</p>{preview.expiresAt ? <p className="mt-1 text-xs text-slate-600 dark:text-ticket-muted">Истекает: {formatInstant(preview.expiresAt, timezone)}</p> : null}{preview.eligible ? <button type="button" disabled={busy} onClick={() => void release()} className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Снимаем бронь…" : "Снять бронь"}</button> : <p className="mt-2 text-sm text-amber-900 dark:text-ticket-warning">Эту бронь уже нельзя снять: {holdReason(preview.reason)}.</p>}</> : !error ? <p className="mt-2 text-sm">Проверяем бронь…</p> : null}{error ? <p role="alert" className="mt-2 text-sm text-red-800 dark:text-ticket-danger">{error}</p> : null}</section>;
}

function holdReason(reason: ManagementHoldPreview["reason"]): string { return ({ active: "активна", expired: "срок истёк", released: "уже снята", not_pending: "заказ больше не ожидает оплаты", payment_received: "оплата уже поступила", no_active_hold: "активных мест нет" } as const)[reason]; }

function RefundControls({ order, onChanged }: { order: ManagementOrderDetail; onChanged: () => void }) {
  const [quote, setQuote] = useState<ManagementRefundQuote | null>(null);
  const [refund, setRefund] = useState<ManagementRefundRequest | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    if (order.payment.status !== "paid" && order.payment.status !== "cancelled" && order.payment.status !== "refunded") return;
    const controller = new AbortController();
    void Promise.all([
      apiRequest<ManagementRefundQuote>(`/api/organizer/events/${order.eventId}/orders/${order.id}/refund/quote`, { signal: controller.signal }),
      apiRequest<ManagementRefundRequest | null>(`/api/organizer/events/${order.eventId}/orders/${order.id}/refund`, { signal: controller.signal }),
    ]).then(([nextQuote, nextRefund]) => { if (!controller.signal.aborted) { setQuote(nextQuote); setRefund(nextRefund); } }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); });
    return () => controller.abort();
  }, [order.eventId, order.id, order.payment.status, refresh]);
  if (order.payment.status !== "paid" && order.payment.status !== "cancelled" && order.payment.status !== "refunded") return null;
  async function submit(): Promise<void> {
    if (!quote || (!quote.eligible && refund?.status !== "failed") || submitting.current || (refund?.status !== "failed" && reason.trim().length < 10)) return;
    if (!window.confirm(`Запросить полный ${quote.testOnly ? "тестовый " : ""}возврат ${formatMoney(quote.amount, quote.currency)} по заказу #${order.id.slice(0, 8).toUpperCase()}? Места будут освобождены только после подтверждения возврата.`)) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await apiRequest<ManagementRefundRequest>(`/api/organizer/events/${order.eventId}/orders/${order.id}/refund`, { method: "POST", body: JSON.stringify({ reason: refund?.status === "failed" ? "Повторная попытка возврата" : reason.trim() }) });
      setRefund(result); setRefresh((value) => value + 1);
      if (result.status === "succeeded") onChanged();
    } catch (cause) { setError(errorText(cause)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="mt-6 rounded-xl border border-[#ded9f0] dark:border-ticket-border bg-[#f9f7ff] dark:bg-ticket-raised p-4"><h3 className="font-semibold">Возврат заказа</h3>{quote ? <><p className="mt-2 text-sm">Полный возврат: <strong>{formatMoney(quote.amount, quote.currency)}</strong>{quote.depositAmount !== null ? ` · оплаченный депозит: ${formatMoney(quote.depositAmount, quote.currency)}` : ""}</p><p className="mt-1 text-xs text-slate-600 dark:text-ticket-muted">{quote.resourceLabels.join(" · ")}</p>{quote.testOnly ? <p className="mt-2 text-sm font-semibold text-amber-900 dark:text-ticket-warning">Тестовый платёж: реальные деньги не переводятся.</p> : null}{refund ? <p role="status" className="mt-3 text-sm">Статус возврата: {refundStatus(refund.status)}{refund.lastError ? ` · ${refund.lastError}` : ""}</p> : null}{quote.eligible ? <><label htmlFor="refund-reason" className="mt-3 block text-sm font-medium">Причина возврата</label><textarea id="refund-reason" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d7d7ea] dark:border-ticket-border p-2 text-sm" placeholder="Опишите причину (не менее 10 символов)" /><button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void submit()} className="mt-2 rounded-lg bg-[#5b21b6] dark:bg-ticket-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Отправляем запрос…" : "Запросить полный возврат"}</button></> : <p className="mt-2 text-sm text-slate-600 dark:text-ticket-muted">{refundReason(quote.reason)}</p>}{refund?.status === "failed" ? <button type="button" disabled={busy} onClick={() => void submit()} className="mt-2 block rounded-lg border border-[#5b21b6] dark:border-ticket-accent px-3 py-2 text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent disabled:opacity-50">Повторить возврат после проверки</button> : null}{refund?.status === "processing" || refund?.status === "requested" ? <button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-2 block text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent">Обновить статус</button> : null}</> : !error ? <p className="mt-2 text-sm">Проверяем возможность возврата…</p> : null}{error ? <p role="alert" className="mt-2 text-sm text-red-800 dark:text-ticket-danger">{error}</p> : null}</section>;
}

function refundStatus(status: ManagementRefundRequest["status"]): string { return ({ requested: "запрошен", processing: "проверяется у провайдера", succeeded: "подтверждён", failed: "отклонён" } as const)[status]; }
function refundReason(reason: ManagementRefundQuote["reason"]): string { return ({ available: "Доступен", unsupported_provider: "Провайдер не поддерживает возвраты в этой конфигурации.", not_paid: "Подтверждённого платежа нет.", already_requested: "Запрос уже создан; дождитесь подтверждения.", already_refunded: "Возврат уже подтверждён.", used_ticket: "Билет уже использован на входе.", payment_mismatch: "Сумма или валюта платежа требует ручной проверки." } as const)[reason]; }

function OrderDetailContent({ order, timezone }: { order: ManagementOrderDetail; timezone: string }) {
  return <div className="mt-6 space-y-6"><dl className="grid gap-4 rounded-xl bg-[#f7f7fd] dark:bg-ticket-raised p-4 sm:grid-cols-2"><Detail label="Покупатель" value={order.buyer.name ?? "Не указан"} /><Detail label="Контакт" value={order.buyer.contact ?? "Недоступен"} /><Detail label="Создан" value={formatInstant(order.createdAt, timezone)} /><Detail label="Тип" value={orderTypeLabel(order.type)} /><Detail label="Сумма" value={formatMoney(order.payment.amount, order.payment.currency)} /><Detail label="Оплата" value={paymentLabel(order.payment.status)} /></dl><section><h3 className="font-semibold">Места и билеты</h3><p className="mt-2 text-sm text-[#575e70] dark:text-ticket-muted">{order.resources.labels.join(" · ") || "Свободный вход"}</p>{order.tickets.length ? <div className="mt-3 space-y-2">{order.tickets.map((ticket) => <div className="rounded-lg border border-[#e5e1d8] dark:border-ticket-border p-3 text-sm" key={ticket.id}><div className="flex justify-between gap-3"><span className="font-semibold">{ticket.typeName}</span><span className="text-[#6b7280] dark:text-ticket-muted">{ticketStatusLabel(ticket.status)}</span></div><p className="mt-1 text-xs text-[#6b7280] dark:text-ticket-muted">{ticket.seatLabel ?? "Без назначенного места"}</p></div>)}</div> : <p className="mt-2 text-sm text-[#7b7485] dark:text-ticket-muted">Индивидуальных билетов нет.</p>}</section><section><h3 className="font-semibold">Платежи</h3>{order.payments.length ? <div className="mt-3 space-y-2">{order.payments.map((payment, index) => <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f7fd] dark:bg-ticket-raised p-3 text-sm" key={`${payment.status}-${index}`}><span>{paymentLabel(payment.status)}</span><span className="font-mono font-semibold">{formatMoney(payment.amount, payment.currency)}</span></div>)}</div> : <p className="mt-2 text-sm text-[#7b7485] dark:text-ticket-muted">Платёжные записи отсутствуют.</p>}</section><section><h3 className="font-semibold">История</h3>{order.history.length ? <ol className="mt-3 border-l border-[#d3bbff] dark:border-ticket-border pl-4">{order.history.map((item, index) => <li className="relative pb-4 text-sm before:absolute before:-left-[21px] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-[#713dcc] dark:before:bg-ticket-primary" key={`${item.occurredAt}-${index}`}><p className="font-medium">{item.description}</p><p className="mt-1 text-xs text-[#7b7485] dark:text-ticket-muted">{formatInstant(item.occurredAt, timezone)}</p></li>)}</ol> : <p className="mt-2 text-sm text-[#7b7485] dark:text-ticket-muted">История до начала аудита недоступна.</p>}</section></div>;
}

function LifecycleMenu({ busy, status, deposit, onTransition, eventId }: { deposit:boolean; busy: boolean; status: ManagementEventSummary["event"]["status"]; onTransition: (action: "complete" | "cancel" | "reopen") => Promise<void>; eventId: string }) {
  if (status === "published") return <div className="flex flex-wrap gap-2"><button className="rounded-xl border border-amber-300 dark:border-ticket-warning-border bg-amber-50 dark:bg-ticket-warning-soft px-4 py-2 text-sm font-semibold text-amber-900 dark:text-ticket-warning hover:bg-amber-100 dark:hover:bg-ticket-warning-soft disabled:opacity-50" disabled={busy} onClick={() => void onTransition("complete")} type="button">Завершить мероприятие</button><button className="rounded-xl border border-red-200 dark:border-ticket-danger-border bg-red-50 dark:bg-ticket-danger-soft px-4 py-2 text-sm font-semibold text-red-700 dark:text-ticket-danger hover:bg-red-100 dark:hover:bg-ticket-danger-soft disabled:opacity-50" disabled={busy} onClick={() => void onTransition("cancel")} type="button">Отменить мероприятие</button></div>;
  if (status === "completed" && deposit) return <Link className="font-semibold underline" href={`/organizer/events/${eventId}/edit`}>Проверить событие</Link>;
  if (status === "completed") return <button className="rounded-xl border border-emerald-200 dark:border-ticket-success-border bg-emerald-50 dark:bg-ticket-success-soft px-4 py-2 text-sm font-semibold text-emerald-800 dark:text-ticket-success hover:bg-emerald-100 dark:hover:bg-ticket-success-soft disabled:opacity-50" disabled={busy} onClick={() => void onTransition("reopen")} type="button">Опубликовать снова</button>;
  if (status === "draft") return <Link className="rounded-xl border border-violet-200 dark:border-ticket-accent bg-violet-50 dark:bg-ticket-accent-soft px-4 py-2 text-sm font-semibold text-violet-700 dark:text-ticket-accent" href={`/organizer/events/${eventId}/edit`}>Продолжить публикацию</Link>;
  return null;
}

function StateNotice({ status, eventId }: { status: ManagementEventSummary["event"]["status"]; eventId: string }) {
  const content = status === "draft" ? <>Событие ещё не опубликовано. Продолжите проверку, чтобы открыть продажи. <Link className="font-semibold underline" href={`/organizer/events/${eventId}/edit`}>Перейти к публикации</Link></> : status === "completed" ? "Мероприятие завершено. Данные и отчёты доступны, новые продажи остановлены." : "Мероприятие отменено и снято с продажи.";
  return <aside className="rounded-xl border border-amber-200 dark:border-ticket-warning-border bg-amber-50 dark:bg-ticket-warning-soft p-4 text-sm text-amber-950 dark:text-ticket-warning">{content}</aside>;
}

function ActionLink({ href, icon, children }: { href: string; icon: IconName; children: ReactNode }) { return <Link className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 text-sm font-semibold text-[#151c27] dark:text-ticket-text hover:bg-[#e2e8f8] dark:hover:bg-ticket-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc] dark:focus-visible:ring-ticket-accent" href={href}><Icon name={icon} className="h-4 w-4" />{children}</Link>; }
function Meta({ icon, children }: { icon: IconName; children: ReactNode }) { return <span className="flex min-w-0 items-start gap-2"><Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-[#713dcc] dark:text-ticket-accent" /><span>{children}</span></span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b7485] dark:text-ticket-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>; }
function EmptyPanel({ children }: { children: ReactNode }) { return <div className="mt-5 rounded-xl bg-[#f7f7fd] dark:bg-ticket-raised px-5 py-10 text-center text-sm text-[#6b7280] dark:text-ticket-muted">{children}</div>; }
function PanelSkeleton() { return <div aria-label="Загрузка данных" className="mt-5 h-48 animate-pulse rounded-xl bg-[#f0f3ff] dark:bg-ticket-raised motion-reduce:animate-none" />; }
function OrdersSkeleton() { return <div aria-label="Загрузка заказов" className="mt-5 space-y-2">{Array.from({ length: 4 }, (_, index) => <div className="h-16 animate-pulse rounded-xl bg-[#f0f3ff] dark:bg-ticket-raised motion-reduce:animate-none" key={index} />)}</div>; }
function ManagementSkeleton() { return <main className="min-h-screen bg-[#f9f9ff] dark:bg-ticket-bg p-4 sm:p-8"><div className="flex justify-end"><ThemeToggle /></div><div className="mx-auto max-w-[1360px] space-y-5"><div className="h-16 animate-pulse rounded-xl bg-white dark:bg-ticket-surface motion-reduce:animate-none" /><div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ticket-surface motion-reduce:animate-none" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-40 animate-pulse rounded-2xl bg-white dark:bg-ticket-surface motion-reduce:animate-none" key={index} />)}</div></div></main>; }
function ManagementError({ message, onRetry }: { message: string; onRetry: () => void }) { return <main className="relative grid min-h-screen place-items-center bg-[#f9f9ff] dark:bg-ticket-bg p-5"><div className="absolute right-4 top-4"><ThemeToggle /></div><div className="max-w-lg rounded-2xl border border-red-200 dark:border-ticket-danger-border bg-white dark:bg-ticket-surface p-8 text-center"><h1 className="text-xl font-semibold">Не удалось открыть управление событием</h1><p className="mt-2 text-sm text-red-800 dark:text-ticket-danger" role="alert">{message}</p><button className="mt-5 rounded-lg bg-[#5b21b6] dark:bg-ticket-primary px-4 py-2 text-sm font-semibold text-white" onClick={onRetry} type="button">Повторить</button></div></main>; }

function MoneyList({ values, inline = false }: { values: ManagementEventSummary["money"]["grossReceived"]; inline?: boolean }) { if (values === null) return <>Недоступно</>; if (!values.length) return <>Нет поступлений</>; return <>{values.map((value, index) => <span className={inline ? "" : "block"} key={value.currency}>{index && inline ? " · " : ""}{formatMoney(value.amount, value.currency)}</span>)}</>; }
function StatusBadge({ status }: { status: ManagementPaymentFilter }) { const style = status === "paid" ? "bg-emerald-100 dark:bg-ticket-success-soft text-emerald-800 dark:text-ticket-success" : status === "pending" ? "bg-amber-100 dark:bg-ticket-warning-soft text-amber-900 dark:text-ticket-warning" : status === "refunded" || status === "cancelled" ? "bg-red-100 dark:bg-ticket-danger-soft text-red-800 dark:text-ticket-danger" : "bg-zinc-200 dark:bg-ticket-raised text-zinc-700 dark:text-ticket-muted"; return <span className={`mt-2 inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${style}`}>{paymentLabel(status)}</span>; }

type IconName = "ticket" | "export" | "edit" | "external" | "bell" | "qr" | "calendar" | "location" | "money" | "users" | "refund" | "seats" | "search" | "download" | "eye" | "close";
function Icon({ name, className }: { name: IconName; className?: string }) {
  const materialSymbolsReady = useContext(MaterialSymbolsContext);
  const glyphs: Record<IconName, string> = {
    ticket: "confirmation_number", export: "ios_share", edit: "edit_note", external: "open_in_new",
    bell: "campaign", qr: "qr_code_scanner", calendar: "calendar_today", location: "near_me",
    money: "payments", users: "groups", refund: "assignment_return", seats: "table_bar",
    search: "search", download: "file_download", eye: "visibility", close: "close",
  };
  if (materialSymbolsReady) {
    const dimension = className?.match(/(?:^|\s)h-(\d+(?:\.\d+)?)(?:\s|$)/)?.[1];
    return <span aria-hidden="true" className={`material-symbols-outlined inline-block leading-none ${className ?? ""}`} style={{ fontSize: dimension ? `${Number(dimension) * 4}px` : "20px" }}>{glyphs[name]}</span>;
  }
  const paths: Record<IconName, ReactNode> = {
    ticket: <path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5Zm5 0v14M15 5v14" />, export: <path d="M12 3v12m0-12 4 4m-4-4L8 7M5 13v7h14v-7" />, edit: <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9-12 3.5 3.5" />, external: <path d="M14 4h6v6m0-6-9 9M19 14v6H4V5h6" />, bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />, qr: <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2v2h-2v-2Zm4 0h2v6h-6v-2h4v-4Z" />, calendar: <path d="M5 4h14v16H5V4Zm3-2v4m8-4v4M5 9h14" />, location: <path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />, money: <path d="M4 6h16v12H4V6Zm8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 9H5m14 6h-2" />, users: <path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6M2 20a7 7 0 0 1 14 0m0-5a6 6 0 0 1 6 5" />, refund: <path d="M4 7h12a5 5 0 0 1 0 10H8M4 7l4-4M4 7l4 4" />, seats: <path d="M6 11V7a2 2 0 0 1 4 0v4h4V7a2 2 0 0 1 4 0v4m-14 0h16v7H4v-7Zm2 7v3m12-3v3" />, search: <path d="m20 20-4.5-4.5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />, download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16" />, eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />, close: <path d="m5 5 14 14M19 5 5 19" />,
  };
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function tariffRows(summary: ManagementEventSummary, analytics: ManagementAnalyticsResponse | null, currency: string | null) {
  return summary.inventory.saleGroups.filter((item) => !currency || item.currency === currency).map((item) => {
    let revenue: number | null = analytics && item.ticketTypeIds.length ? 0 : null;
    for (const bucket of analytics?.buckets ?? []) for (const sale of bucket.salesByType) if (item.ticketTypeIds.includes(sale.ticketTypeId)) revenue = revenue === null || sale.grossReceived === null ? null : revenue + sale.grossReceived;
    return { ...item, revenue };
  }).sort((left, right) => right.sold - left.sold || left.name.localeCompare(right.name, "ru"));
}
function buildOrderQuery(page: number | undefined, filters: OrderFilters): string { const query = new URLSearchParams({ payment: filters.payment, booking: filters.booking, attendance: filters.attendance }); if (page !== undefined) { query.set("page", String(page)); query.set("limit", String(PAGE_SIZE)); } if (filters.search) query.set("search", filters.search); if (filters.tableId) query.set("tableId", filters.tableId); return query.toString(); }
function managementRange(timezone: string): DateRange { const to = localDateInput(new Date(), timezone); return { from: shiftDateInput(to, -29), to }; }
function buildAnalyticsQuery(range: DateRange, bucket: ManagementAnalyticsBucket, timezone: string): string { const toExclusive = shiftDateInput(range.to, 1); return new URLSearchParams({ from: zonedInputToIso(`${range.from}T00:00`, timezone), to: zonedInputToIso(`${toExclusive}T00:00`, timezone), bucket }).toString(); }
function validateManagementRange(range: DateRange, bucket: ManagementAnalyticsBucket, timezone: string): string | null {
  if (!range.from || !range.to) return "Выберите начало и конец периода.";
  try {
    const from = Date.parse(zonedInputToIso(`${range.from}T00:00`, timezone));
    const to = Date.parse(zonedInputToIso(`${shiftDateInput(range.to, 1)}T00:00`, timezone));
    const days = (to - from) / 86_400_000;
    if (!Number.isFinite(days) || days <= 0) return "Дата окончания должна быть не раньше даты начала.";
    const maximum = bucket === "hour" ? MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS : MANAGEMENT_ANALYTICS_MAX_DAYS;
    return days > maximum ? `Для группировки ${bucket === "hour" ? "по часам" : "по дням"} выберите не более ${maximum} дней.` : null;
  } catch {
    return "Выберите корректный период.";
  }
}
function localDateInput(value: Date, timezone: string): string { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value); const get = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? ""; return `${get("year")}-${get("month")}-${get("day")}`; }
function shiftDateInput(value: string, days: number): string { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function percentage(value: number, total: number): number { return total > 0 ? Math.min(100, Math.round(value / total * 100)) : 0; }
function formatNumber(value: number): string { return value.toLocaleString(INTL_LOCALES[localeFromBrowser()]); }
function formatMoney(value: number, currency: string): string { return new Intl.NumberFormat(INTL_LOCALES[localeFromBrowser()], { style: "currency", currency }).format(value / 100); }
function formatCompactMoney(value: number, currency: string): string { return new Intl.NumberFormat(INTL_LOCALES[localeFromBrowser()], { notation: "compact", maximumFractionDigits: 1, style: "currency", currency }).format(value / 100); }
function formatInstant(value: string, timezone: string): string { return new Intl.DateTimeFormat(INTL_LOCALES[localeFromBrowser()], { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); }
function formatEventDate(date: string, time: string): string { const parsed = new Date(`${date}T00:00:00Z`); return Number.isNaN(parsed.getTime()) ? `${date} · ${time}` : `${new Intl.DateTimeFormat(INTL_LOCALES[localeFromBrowser()], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parsed)}, ${time}`; }
function shortDate(value: string): string { return value.length > 12 ? value.slice(5, 10).replace("-", ".") : value; }
function showAxisLabel(index: number, count: number): boolean { return count <= 8 || index === 0 || index === count - 1 || index % Math.ceil(count / 6) === 0; }
function paymentLabel(value: ManagementPaymentFilter): string { return ({ all: "Все", pending: "Ожидает", paid: "Оплачено", failed: "Ошибка", cancelled: "Отменено", refunded: "Возвращено" } as const)[value]; }
function ticketStatusLabel(value: string): string { return ({ active: "Действителен", used: "Использован", pending_payment: "Ожидает оплаты", cancelled: "Отменён", refunded: "Возвращён", created: "Создан" } as Record<string, string>)[value] ?? "Неизвестный статус"; }
function orderTypeLabel(value: ManagementOrderRow["type"]): string { return value === "table" ? "Стол" : value === "deposit" ? "Депозит" : "Билеты"; }
function attendanceLabel(order: ManagementOrderRow): string { if (order.attendance.state === "all_checked_in") return "Все гости прошли"; if (order.attendance.state === "partial") return "Часть гостей прошла"; if (order.attendance.state === "unknown") return "Посещаемость неизвестна"; if (order.attendance.state === "group_pass_used") return "Групповой пропуск использован"; return "Ещё не отмечен"; }
function resourceSummary(order: ManagementOrderRow): string { const parts = []; if (order.resources.ticketCount) parts.push(`${order.resources.ticketCount} бил.`); if (order.resources.allocatedSeatCount) parts.push(`${order.resources.allocatedSeatCount} мест`); if (order.resources.wholeTableCount) parts.push(`${order.resources.wholeTableCount} стол`); return parts.join(" · ") || orderTypeLabel(order.type); }
function statusPresentation(status: ManagementEventSummary["event"]["status"]): { label: string; className: string } { if (status === "published") return { label: "Опубликовано", className: "bg-emerald-100 dark:bg-ticket-success-soft text-emerald-800 dark:text-ticket-success" }; if (status === "draft") return { label: "Черновик", className: "bg-amber-100 dark:bg-ticket-warning-soft text-amber-900 dark:text-ticket-warning" }; if (status === "completed") return { label: "Завершено", className: "bg-violet-100 dark:bg-ticket-accent-soft text-violet-800 dark:text-ticket-accent" }; return { label: "Отменено", className: "bg-red-100 dark:bg-ticket-danger-soft text-red-800 dark:text-ticket-danger" }; }
function errorText(reason: unknown): string { return reason instanceof Error ? reason.message : ru.events.loadFailed; }
