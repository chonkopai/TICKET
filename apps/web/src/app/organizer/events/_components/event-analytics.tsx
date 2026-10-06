"use client";

import { INTL_LOCALES, localeFromBrowser, localeUrl } from "../../../../lib/locale";
import { ANALYTICS_COPY } from "../../../../lib/analytics-copy";

import { SelectPicker } from "../../../../components/option-picker";

import {
  MANAGEMENT_ANALYTICS_MAX_DAYS,
  MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS,
  zonedInputToIso,
  type ManagementAnalyticsBucket,
  type ManagementAnalyticsBucketValue,
  type ManagementAnalyticsResponse,
  type ManagementCurrencyMoney,
  type ManagementEventSummary,
} from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { apiBlobRequest, apiRequest } from "../../../(auth)/_lib/api";

type Filters = { from: string; to: string; bucket: ManagementAnalyticsBucket };

export function EventAnalytics({ eventId }: { eventId: string }) {
  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"><ProtectedRoute><Analytics eventId={eventId} /></ProtectedRoute></main>;
}

function Analytics({ eventId }: { eventId: string }) {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  const [summary, setSummary] = useState<ManagementEventSummary | null>(null);
  const [report, setReport] = useState<ManagementAnalyticsResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  const [appliedFilters, setAppliedFilters] = useState<Filters>(() => defaultFilters(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [reportRetry, setReportRetry] = useState(0);
  const [downloading, setDownloading] = useState<"analytics" | "orders" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const reportRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    setReport(null);
    setSummaryError(null);
    void apiRequest<ManagementEventSummary>(`/api/organizer/events/${eventId}/management-summary`, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        const initial = defaultFilters(value.event.timezone);
        setFilters(initial);
        setAppliedFilters(initial);
        setSummary(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setSummaryError(errorText(reason));
      });
    return () => controller.abort();
  }, [eventId, summaryRetry]);

  useEffect(() => {
    if (!summary || summary.event.id !== eventId) return;
    const controller = new AbortController();
    const requestId = reportRequest.current + 1;
    reportRequest.current = requestId;
    setReport(null);
    setReportError(null);
    const query = analyticsQuery(appliedFilters, summary.event.timezone);
    void apiRequest<ManagementAnalyticsResponse>(`/api/organizer/events/${eventId}/analytics?${query}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted && requestId === reportRequest.current) setReport(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && requestId === reportRequest.current) setReportError(errorText(reason));
      });
    return () => controller.abort();
  }, [appliedFilters, eventId, reportRetry, summary]);

  const currencies = useMemo(() => report ? [...new Set([
    ...(report.totals.grossReceived ?? []).map(({ currency }) => currency),
    ...(report.totals.depositsReceived ?? []).map(({ currency }) => currency),
    ...report.buckets.flatMap((bucket) => bucket.money.map(({ currency }) => currency)),
  ])].sort() : [], [report]);
  const currency = selectedCurrency && currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] ?? null;
  const rangeError = summary ? validateFilters(filters, summary.event.timezone) : null;

  function applyFilters(): void {
    if (!rangeError) setAppliedFilters(filters);
  }

  async function download(kind: "analytics" | "orders"): Promise<void> {
    if (!summary || downloading) return;
    setDownloading(kind);
    setDownloadError(null);
    try {
      const path = kind === "analytics"
        ? `/api/organizer/events/${eventId}/analytics/export?${analyticsQuery(appliedFilters, summary.event.timezone)}`
        : `/api/organizer/events/${eventId}/orders/export?payment=all&booking=all&attendance=all`;
      const blob = await apiBlobRequest(path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${kind === "analytics" ? "analytics" : "orders"}-${eventId}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) {
      setDownloadError(errorText(reason));
    } finally {
      setDownloading(null);
    }
  }

  if (summaryError) return <PageError message={summaryError} onRetry={() => setSummaryRetry((value) => value + 1)} />;
  if (!summary) return <AnalyticsSkeleton />;
  const eventDate = new Intl.DateTimeFormat(INTL_LOCALES[localeFromBrowser()], { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${summary.event.date}T00:00:00Z`));

  return <div className="space-y-6">
    <nav aria-label={copy.navigation} className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-ticket-muted">
      <Link className="font-semibold text-violet-800 dark:text-ticket-accent hover:underline" href={localeUrl(`/organizer/events/${eventId}`, localeFromBrowser())}>← {copy.back}</Link>
      <span aria-hidden="true">/</span>
      <span>{copy.analytics}</span>
    </nav>

    <header className="rounded-3xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-ticket-accent">{copy.eventAnalytics}</p>
          <h1 className="mt-2 break-words text-3xl font-bold tracking-tight text-zinc-950 dark:text-ticket-text sm:text-4xl">{summary.event.title}</h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-ticket-muted sm:text-base">{eventDate} · {summary.event.time} · {summary.event.timezone}<br />{summary.event.address}, {summary.event.address}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-xl border border-violet-200 dark:border-ticket-accent bg-violet-50 dark:bg-ticket-accent-soft px-4 py-2 text-sm font-semibold text-violet-900 dark:text-ticket-accent disabled:opacity-50" disabled={Boolean(downloading)} onClick={() => void download("analytics")} type="button">{downloading === "analytics" ? copy.preparing : copy.financialCsv}</button>
          <button className="rounded-xl border border-zinc-200 dark:border-ticket-border bg-zinc-50 dark:bg-ticket-bg px-4 py-2 text-sm font-semibold text-zinc-800 dark:text-ticket-text disabled:opacity-50" disabled={Boolean(downloading)} onClick={() => void download("orders")} type="button">{downloading === "orders" ? copy.preparing : copy.ordersCsv}</button>
        </div>
      </div>
    </header>

    <section aria-labelledby="current-state-heading">
      <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-ticket-muted">{copy.currentState}</p><h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-ticket-text" id="current-state-heading">{copy.inventory}</h2></div><span className="text-xs text-zinc-500 dark:text-ticket-muted">{copy.asOf} {formatInstant(summary.asOf, summary.event.timezone)}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={copy.soldSeats} value={`${formatNumber(summary.inventory.soldAdmissions)} / ${formatNumber(summary.inventory.configuredAdmissionCapacity)}`} detail={`${copy.availableNow}: ${formatNumber(summary.inventory.buyableAdmissions)}`} />
        <MetricCard label={copy.issuedTickets} value={formatNumber(summary.inventory.issuedTickets.total)} detail={`${copy.active}: ${formatNumber(summary.inventory.issuedTickets.active)} · ${copy.used}: ${formatNumber(summary.inventory.issuedTickets.used)}`} />
        <MetricCard label={copy.tables} value={`${formatNumber(summary.inventory.wholeTables.sold)} / ${formatNumber(summary.inventory.wholeTables.configured)}`} detail={`${copy.held}: ${formatNumber(summary.inventory.wholeTables.held)} · ${copy.available}: ${formatNumber(summary.inventory.wholeTables.buyable)}`} />
        <MetricCard label={copy.attendance} value={formatNumber(summary.attendance.checkedInTickets)} detail={`${copy.groupScans}: ${formatNumber(summary.attendance.checkedInGroupPasses)}`} />
        <MetricCard label={copy.cancellations} value={formatNumber(summary.cancellations.tickets + summary.cancellations.bookings)} detail={`${copy.tickets}: ${formatNumber(summary.cancellations.tickets)} · ${copy.bookings}: ${formatNumber(summary.cancellations.bookings)}`} />
        <MetricCard label={copy.refundRequests} value={formatNumber(summary.cancellations.refundRequests)} detail={copy.refundNote} />
        <MoneyMetricCard label={copy.grossReceived} values={summary.money.grossReceived} unavailable={summary.money.grossReceived === null} />
        <MoneyMetricCard label={copy.depositsReceived} values={summary.money.depositsReceived} unavailable={summary.money.depositsReceived === null} />
      </div>
    </section>

    <section aria-labelledby="period-heading" className="rounded-3xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-ticket-accent">{copy.periodSales}</p><h2 className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-ticket-text" id="period-heading">{copy.revenueTrend}</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_140px_auto]">
          <label className="text-sm font-medium text-zinc-700 dark:text-ticket-muted">{copy.from}<input className="mt-1 block h-11 w-full rounded-lg border border-zinc-300 dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 focus:border-violet-700 dark:focus:border-ticket-accent focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-ticket-accent" max={filters.to} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))} type="date" value={filters.from} /></label>
          <label className="text-sm font-medium text-zinc-700 dark:text-ticket-muted">{copy.to}<input className="mt-1 block h-11 w-full rounded-lg border border-zinc-300 dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 focus:border-violet-700 dark:focus:border-ticket-accent focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-ticket-accent" min={filters.from} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))} type="date" value={filters.to} /></label>
          <label className="text-sm font-medium text-zinc-700 dark:text-ticket-muted">{copy.grouping}<SelectPicker className="mt-1 block h-11 w-full rounded-lg border border-zinc-300 dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 focus:border-violet-700 dark:focus:border-ticket-accent focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-ticket-accent" onChange={(event) => setFilters((value) => ({ ...value, bucket: event.target.value as ManagementAnalyticsBucket }))} value={filters.bucket}><option value="day">{copy.byDay}</option><option value="hour">{copy.byHour}</option></SelectPicker></label>
          <button className="h-11 self-end rounded-lg bg-violet-700 dark:bg-ticket-primary px-5 text-sm font-semibold text-white disabled:bg-zinc-300 dark:disabled:bg-ticket-raised" disabled={Boolean(rangeError)} onClick={applyFilters} type="button">{copy.apply}</button>
        </div>
      </div>
      {rangeError ? <p className="mt-3 text-sm text-red-700 dark:text-ticket-danger" role="alert">{rangeError}</p> : null}
    </section>

    {reportError ? <PageError message={reportError} onRetry={() => setReportRetry((value) => value + 1)} /> : !report ? <ReportSkeleton /> : <>
      {downloadError ? <p className="rounded-xl border border-red-200 dark:border-ticket-danger-border bg-red-50 dark:bg-ticket-danger-soft p-4 text-sm text-red-800 dark:text-ticket-danger" role="alert">{copy.downloadFailed}: {downloadError}</p> : null}
      {report.unavailable.length ? <IncompleteNotice values={report.unavailable} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-ticket-muted">{copy.separateCurrency}</p>
        {currencies.length ? <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-ticket-muted">{copy.currency}<SelectPicker className="h-10 rounded-lg border border-zinc-300 dark:border-ticket-border bg-white dark:bg-ticket-surface px-3" onChange={(event) => setSelectedCurrency(event.target.value)} value={currency ?? ""}>{currencies.map((value) => <option key={value} value={value}>{value}</option>)}</SelectPicker></label> : null}
      </div>
      <RangeSummary currency={currency} report={report} />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(280px,5fr)]">
        <SalesChart buckets={report.buckets} currency={currency} />
        <TicketBreakdown buckets={report.buckets} currency={currency} />
      </div>
      <AnalyticsTable buckets={report.buckets} currency={currency} timezone={report.timezone} />
    </>}
  </div>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-zinc-200 dark:border-ticket-border bg-white dark:bg-ticket-surface p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-ticket-muted">{label}</p><p className="mt-3 text-2xl font-bold tabular-nums text-zinc-950 dark:text-ticket-text">{value}</p><p className="mt-1 text-sm text-zinc-600 dark:text-ticket-muted">{detail}</p></article>;
}

function MoneyMetricCard({ label, values, unavailable }: { label: string; values: ManagementCurrencyMoney[] | null; unavailable: boolean }) {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  return <article className="rounded-2xl border border-zinc-200 dark:border-ticket-border bg-white dark:bg-ticket-surface p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-ticket-muted">{label}</p>{unavailable ? <p className="mt-3 text-xl font-semibold text-zinc-500 dark:text-ticket-muted">{copy.unavailable}</p> : values?.length ? <div className="mt-3 space-y-1">{values.map((value) => <p className="text-xl font-bold tabular-nums text-zinc-950 dark:text-ticket-text" key={value.currency}>{formatMoney(value.amount, value.currency)}</p>)}</div> : <p className="mt-3 text-xl font-semibold text-zinc-500 dark:text-ticket-muted">{copy.noRevenue}</p>}<p className="mt-1 text-sm text-zinc-600 dark:text-ticket-muted">{copy.allTime}</p></article>;
}

function RangeSummary({ report, currency }: { report: ManagementAnalyticsResponse; currency: string | null }) {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  const received = report.totals.grossReceived;
  const deposits = report.totals.depositsReceived;
  const receivedAmount = received?.find((value) => value.currency === currency)?.amount;
  const depositAmount = deposits?.find((value) => value.currency === currency)?.amount;
  const admissions = sumKnownBuckets(report.buckets.map((bucket) => bucket.soldAdmissions));
  const tickets = sumKnownBuckets(report.buckets.map((bucket) => bucket.issuedTickets));
  const moneyValue = (amount: number | undefined, values: ManagementCurrencyMoney[] | null) => values === null ? copy.unavailable : currency ? formatMoney(amount ?? 0, currency) : values.length ? copy.unknownCurrency : copy.noRevenue;
  return <section aria-label={copy.periodTotals} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label={copy.receivedInPeriod} value={moneyValue(receivedAmount, received)} detail={currency ?? copy.unknownCurrency} /><MetricCard label={copy.depositsInPeriod} value={moneyValue(depositAmount, deposits)} detail={copy.depositsIncluded} /><MetricCard label={copy.soldSeats} value={admissions === null ? copy.unavailable : formatNumber(admissions)} detail={copy.selectedPeriod} /><MetricCard label={copy.issuedTickets} value={tickets === null ? copy.unavailable : formatNumber(tickets)} detail={copy.selectedPeriod} /></section>;
}

function SalesChart({ buckets, currency }: { buckets: ManagementAnalyticsBucketValue[]; currency: string | null }) {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  const values = buckets.map((bucket) => {
    const money = bucket.money.find((value) => value.currency === currency);
    return money ? money.grossReceived : 0;
  });
  const knownValues = values.flatMap((value) => value === null ? [] : [value]);
  const hasSales = knownValues.some((value) => value > 0);
  const hasUnknownPeriods = values.some((value) => value === null);
  const emptyMessage = knownValues.length === 0
    ? copy.historyUnavailable
    : !currency ? copy.currencyHistoryUnavailable
      : !hasSales && !hasUnknownPeriods ? `${copy.noPeriodRevenue} (${currency}).` : null;
  if (emptyMessage) return <section className="min-w-0 rounded-3xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-6 shadow-sm"><h2 className="text-xl font-semibold">{copy.revenueTrend}</h2><p className="mt-8 rounded-2xl bg-zinc-50 dark:bg-ticket-bg p-8 text-center text-zinc-600 dark:text-ticket-muted">{emptyMessage}</p></section>;
  const maximum = Math.max(...knownValues, 0);
  const width = 760;
  const height = 260;
  const chartHeight = 190;
  const barSpace = (width - 60) / values.length;
  const barWidth = Math.max(3, Math.min(26, barSpace * 0.55));
  return <section className="min-w-0 rounded-3xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-5 shadow-sm sm:p-6"><div><h2 className="text-xl font-semibold text-zinc-950 dark:text-ticket-text">{copy.revenueTrend}</h2><p className="mt-1 text-sm text-zinc-600 dark:text-ticket-muted">{copy.intervalAmounts}, {currency}</p></div><div className="mt-5 max-w-full overflow-x-auto"><svg aria-label={`${copy.chartLabel} (${currency})`} className="h-64 min-w-[620px] w-full" role="img" viewBox={`0 0 ${width} ${height}`}><title>{copy.chartLabel} ({currency})</title>{[0, 0.5, 1].map((ratio) => <line key={ratio} stroke="var(--ticket-border)" strokeDasharray="4 4" x1="46" x2={width - 10} y1={20 + chartHeight * ratio} y2={20 + chartHeight * ratio} />)}{values.map((value, index) => { const x = 52 + index * barSpace + (barSpace - barWidth) / 2; const barHeight = value === null || maximum === 0 ? 0 : value / maximum * chartHeight; const y = 20 + chartHeight - barHeight; return <g key={buckets[index]?.startsAt}>{value === null ? null : <rect fill="var(--ticket-accent)" height={barHeight} rx="4" width={barWidth} x={x} y={y}><title>{buckets[index]?.label}: {formatMoney(value, currency ?? "KZT")}</title></rect>}{shouldShowLabel(index, values.length) ? <text fill="var(--ticket-muted)" fontSize="10" textAnchor="middle" x={x + barWidth / 2} y="230">{shortLabel(buckets[index]?.label ?? "")}</text> : null}</g>; })}</svg></div>{values.some((value) => value === null) ? <p className="mt-2 text-xs text-amber-800 dark:text-ticket-warning">{copy.unknownSkipped}</p> : null}</section>;
}

function TicketBreakdown({ buckets, currency }: { buckets: ManagementAnalyticsBucketValue[]; currency: string | null }) {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  const byType = new Map<string, { id: string; name: string; sold: number }>();
  for (const bucket of buckets) for (const type of bucket.salesByType) if (!currency || type.currency === currency) { const current = byType.get(type.ticketTypeId) ?? { id: type.ticketTypeId, name: type.name, sold: 0 }; current.sold += type.soldAdmissions; byType.set(type.ticketTypeId, current); }
  const rows = [...byType.values()].sort((left, right) => right.sold - left.sold);
  const total = rows.reduce((sum, row) => sum + row.sold, 0);
  return <section className="min-w-0 rounded-3xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-5 shadow-sm sm:p-6"><h2 className="text-xl font-semibold text-zinc-950 dark:text-ticket-text">{copy.byTicketType}</h2><p className="mt-1 text-sm text-zinc-600 dark:text-ticket-muted">{copy.ticketTypeNote}</p>{rows.length ? <div className="mt-5 space-y-4">{rows.map((row) => <div key={row.id}><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium text-zinc-800 dark:text-ticket-text">{row.name}</span><span className="font-bold tabular-nums text-zinc-950 dark:text-ticket-text">{formatNumber(row.sold)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-ticket-accent-soft"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${total ? row.sold / total * 100 : 0}%` }} /></div></div>)}</div> : <p className="mt-8 rounded-2xl bg-zinc-50 dark:bg-ticket-bg p-8 text-center text-zinc-600 dark:text-ticket-muted">{copy.noTypeSales}</p>}</section>;
}

function AnalyticsTable({ buckets, currency, timezone }: { buckets: ManagementAnalyticsBucketValue[]; currency: string | null; timezone: string }) {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  return <section className="rounded-3xl border border-[#e5e1d8] dark:border-ticket-border bg-white dark:bg-ticket-surface p-5 shadow-sm sm:p-6"><h2 className="text-xl font-semibold text-zinc-950 dark:text-ticket-text">{copy.intervalData}</h2><p className="mt-1 text-sm text-zinc-600 dark:text-ticket-muted">{copy.timezone}: {timezone}. {copy.timezoneNote}</p><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left text-sm"><thead><tr className="border-b border-zinc-200 dark:border-ticket-border text-xs uppercase tracking-wide text-zinc-500 dark:text-ticket-muted"><th className="px-3 py-3">{copy.period}</th><th className="px-3 py-3 text-right">{copy.received}</th><th className="px-3 py-3 text-right">{copy.refunds}</th><th className="px-3 py-3 text-right">{copy.deposits}</th><th className="px-3 py-3 text-right">{copy.seats}</th><th className="px-3 py-3 text-right">{copy.tickets}</th></tr></thead><tbody>{buckets.map((bucket) => { const money = bucket.money.find((value) => value.currency === currency); return <tr className="border-b border-zinc-100 dark:border-ticket-border last:border-0" key={bucket.startsAt}><td className="px-3 py-3 font-medium text-zinc-800 dark:text-ticket-text">{bucket.label}</td><td className="px-3 py-3 text-right tabular-nums">{currency ? metricBucketMoney(money?.grossReceived, money !== undefined, currency) : "—"}</td><td className="px-3 py-3 text-right tabular-nums">{currency ? metricBucketMoney(money?.completedRefunds, money !== undefined, currency) : "—"}</td><td className="px-3 py-3 text-right tabular-nums">{currency ? metricBucketMoney(money?.depositsReceived, money !== undefined, currency) : "—"}</td><td className="px-3 py-3 text-right tabular-nums">{bucket.soldAdmissions ?? copy.unavailable}</td><td className="px-3 py-3 text-right tabular-nums">{bucket.issuedTickets ?? copy.unavailable}</td></tr>; })}</tbody></table></div></section>;
}

function IncompleteNotice({ values }: { values: ManagementAnalyticsResponse["unavailable"] }) {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  const labels = { settlement_time: copy.missingSettlement, completed_refund_money: copy.missingRefund, per_type_revenue: copy.missingTypeRevenue } as const;
  return <aside className="rounded-2xl border border-amber-200 dark:border-ticket-warning-border bg-amber-50 dark:bg-ticket-warning-soft p-4 text-sm text-amber-950 dark:text-ticket-warning"><p className="font-semibold">{copy.incompleteHistory}</p><ul className="mt-2 list-disc space-y-1 pl-5">{values.map((value) => <li key={value}>{labels[value]}</li>)}</ul></aside>;
}

function PageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  return <div className="rounded-2xl border border-red-200 dark:border-ticket-danger-border bg-red-50 dark:bg-ticket-danger-soft p-6 text-red-900 dark:text-ticket-danger" role="alert"><p className="font-semibold">{copy.loadFailed}</p><p className="mt-1 text-sm">{message}</p><button className="mt-4 rounded-xl border border-red-300 dark:border-ticket-danger-border px-4 py-2 text-sm font-semibold" onClick={onRetry} type="button">{copy.retry}</button></div>;
}

function AnalyticsSkeleton() {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  return <div aria-label={copy.analyticsLoading} className="space-y-5"><div className="h-44 animate-pulse rounded-3xl bg-zinc-200 dark:bg-ticket-raised" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div className="h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-ticket-raised" key={index} />)}</div></div>;
}

function ReportSkeleton() {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  return <div aria-label={copy.reportLoading} className="grid gap-5 lg:grid-cols-2"><div className="h-80 animate-pulse rounded-3xl bg-zinc-200 dark:bg-ticket-raised" /><div className="h-80 animate-pulse rounded-3xl bg-zinc-200 dark:bg-ticket-raised" /></div>;
}

function defaultFilters(timezone: string): Filters {
  const today = dateInputInTimezone(new Date(), timezone);
  return { from: dateInput(addDays(new Date(`${today}T00:00:00Z`), -29)), to: today, bucket: "day" };
}

function dateInputInTimezone(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: "year" | "month" | "day") => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function sumKnownBuckets(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function metricBucketMoney(value: number | null | undefined, hasCurrencyRecord: boolean, currency: string): string {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  if (hasCurrencyRecord && value === null) return copy.unavailable;
  return formatMoney(value ?? 0, currency);
}

function validateFilters(filters: Filters, timezone: string): string | null {
  const copy = ANALYTICS_COPY[localeFromBrowser()];
  if (!filters.from || !filters.to) return copy.rangeRequired;
  const from = new Date(zonedInputToIso(`${filters.from}T00:00`, timezone));
  const to = new Date(zonedInputToIso(`${dateInput(addDays(new Date(`${filters.to}T00:00:00Z`), 1))}T00:00`, timezone));
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days <= 0) return copy.rangeOrder;
  const maximum = filters.bucket === "hour" ? MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS : MANAGEMENT_ANALYTICS_MAX_DAYS;
  return days > maximum ? `${copy.maximumPeriod} (${filters.bucket === "hour" ? copy.byHour : copy.byDay}): ${maximum} ${copy.days}.` : null;
}

function analyticsQuery(filters: Filters, timezone: string): string {
  const endDate = dateInput(addDays(new Date(`${filters.to}T00:00:00Z`), 1));
  return new URLSearchParams({ from: zonedInputToIso(`${filters.from}T00:00`, timezone), to: zonedInputToIso(`${endDate}T00:00`, timezone), bucket: filters.bucket }).toString();
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateInput(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`;
}

function formatNumber(value: number): string { return value.toLocaleString(INTL_LOCALES[localeFromBrowser()]); }
function formatMoney(value: number, currency: string): string { return new Intl.NumberFormat(INTL_LOCALES[localeFromBrowser()], { style: "currency", currency }).format(value / 100); }
function formatInstant(value: string, timezone: string): string { return new Intl.DateTimeFormat(INTL_LOCALES[localeFromBrowser()], { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); }
function errorText(reason: unknown): string { return reason instanceof Error ? reason.message : ANALYTICS_COPY[localeFromBrowser()].unknownError; }
function shortLabel(value: string): string { return value.length > 11 ? `${value.slice(5, 10)} ${value.slice(11, 13)}`.trim() : value; }
function shouldShowLabel(index: number, count: number): boolean { return count <= 12 || index === 0 || index === count - 1 || index % Math.ceil(count / 6) === 0; }
