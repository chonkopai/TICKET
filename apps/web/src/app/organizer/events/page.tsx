"use client";

import { INTL_LOCALES } from "../../../lib/locale";

import { SelectPicker } from "../../../components/option-picker";

import { type EventLocale, type OrganizerDashboard, type OrganizerEventSort, type OrganizerEventStatusGroup, type OrganizerProfile, type OrganizerWorkspaceEvent, type OrganizerWorkspaceEventList } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "../../(auth)/_components/protected-route";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession } from "../../(auth)/_lib/session";
import { PageShell } from "../../../components/ui";
import { useLocale } from "../../../components/locale-provider";
import { EVENTS_COPY } from "../../../lib/events-copy";

const COPY: Record<EventLocale, { filters: Record<OrganizerEventStatusGroup, string>; organizer: string; botConnected: string; botDisconnected: string; editProfile: string; guestProfile: string; totalEvents: string; revenue: string; revenueLater: string; published: string; occupancy: string; drafts: string; archived: string; quickStart: string; newEvent: string; setupHint: string; statusTabs: string; sort: string; updated: string; earliest: string; latest: string; publishedMessage: string; loading: string; empty: string; create: string; pages: string; previous: string; next: string; page: string; of: string; deleteConfirm: string; preview: string; continue: string; manage: string; sold: string; remaining: string; includedSeats: string; paidRevenue: string; publishing: string; republish: string; ordinary: string; perSeat: string; perTable: string; loadFailed: string }> = {
  ru: { filters: { all: "Все события", on_sale: "В продаже", draft: "Черновики", archive: "Завершённые и архив" }, organizer: "Организатор", botConnected: "бот подключён", botDisconnected: "бот не подключён", editProfile: "Редактировать профиль", guestProfile: "Перейти в профиль гостя", totalEvents: "Всего событий", revenue: "выручки", revenueLater: "Выручка появится после продаж", published: "Опубликовано", occupancy: "мест реализовано", drafts: "Черновики", archived: "завершённых или отменённых", quickStart: "Быстрый старт", newEvent: "Создать новое событие", setupHint: "Настройте программу, билеты и схему зала.", statusTabs: "Статусы событий", sort: "Сортировка", updated: "Недавно изменённые", earliest: "По дате: сначала ближайшие", latest: "По дате: сначала поздние", publishedMessage: "Событие опубликовано и доступно в панели организатора.", loading: "Загрузка событий…", empty: "Событий в этом разделе пока нет", create: "Создать событие", pages: "Страницы событий", previous: "Назад", next: "Далее", page: "Страница", of: "из", deleteConfirm: "Удалить черновик «{title}»? Это действие нельзя отменить.", preview: "Предпросмотр", continue: "Продолжить", manage: "Управление", sold: "Продано", remaining: "Осталось:", includedSeats: "включено мест в проданных столах:", paidRevenue: "Оплаченная выручка", publishing: "Публикуем…", republish: "Опубликовать снова", ordinary: "Билеты без схемы зала", perSeat: "Продажа по местам", perTable: "Продажа столами", loadFailed: "Не удалось загрузить данные" },
  kk: { filters: { all: "Барлық іс-шаралар", on_sale: "Сатылымда", draft: "Нобайлар", archive: "Аяқталған және мұрағат" }, organizer: "Ұйымдастырушы", botConnected: "бот қосылған", botDisconnected: "бот қосылмаған", editProfile: "Профильді өңдеу", guestProfile: "Қонақ профиліне өту", totalEvents: "Іс-шаралар саны", revenue: "түсім", revenueLater: "Түсім сатылым басталғанда көрсетіледі", published: "Жарияланған", occupancy: "орын сатылды", drafts: "Нобайлар", archived: "аяқталған немесе тоқтатылған", quickStart: "Жылдам бастау", newEvent: "Жаңа іс-шара жасау", setupHint: "Бағдарламаны, билеттерді және зал сызбасын баптаңыз.", statusTabs: "Іс-шара күйлері", sort: "Сұрыптау", updated: "Жақында өзгертілгендер", earliest: "Күні бойынша: жақыны алдымен", latest: "Күні бойынша: кейінгісі алдымен", publishedMessage: "Іс-шара жарияланды және ұйымдастырушы панелінде қолжетімді.", loading: "Іс-шаралар жүктелуде…", empty: "Бұл бөлімде әзірге іс-шара жоқ", create: "Іс-шара жасау", pages: "Іс-шара беттері", previous: "Артқа", next: "Алға", page: "Бет", of: "/", deleteConfirm: "«{title}» нобайын жоясыз ба? Бұл әрекетті болдырмау мүмкін емес.", preview: "Алдын ала қарау", continue: "Жалғастыру", manage: "Басқару", sold: "Сатылды", remaining: "Қалды:", includedSeats: "сатылған үстелдерге кіретін орындар:", paidRevenue: "Төленген түсім", publishing: "Жариялануда…", republish: "Қайта жариялау", ordinary: "Зал сызбасынсыз билеттер", perSeat: "Орын бойынша сату", perTable: "Үстел бойынша сату", loadFailed: "Деректерді жүктеу мүмкін болмады" },
  en: { filters: { all: "All events", on_sale: "On sale", draft: "Drafts", archive: "Completed and archived" }, organizer: "Organizer", botConnected: "bot connected", botDisconnected: "bot not connected", editProfile: "Edit profile", guestProfile: "Go to guest profile", totalEvents: "Total events", revenue: "revenue", revenueLater: "Revenue appears after sales", published: "Published", occupancy: "of places sold", drafts: "Drafts", archived: "completed or cancelled", quickStart: "Quick start", newEvent: "Create a new event", setupHint: "Set up the program, tickets, and venue map.", statusTabs: "Event statuses", sort: "Sort", updated: "Recently updated", earliest: "Date: nearest first", latest: "Date: latest first", publishedMessage: "Your event is published and available in the organizer dashboard.", loading: "Loading events…", empty: "No events in this section yet", create: "Create event", pages: "Event pages", previous: "Previous", next: "Next", page: "Page", of: "of", deleteConfirm: "Delete draft “{title}”? This cannot be undone.", preview: "Preview", continue: "Continue", manage: "Manage", sold: "Sold", remaining: "Remaining:", includedSeats: "seats included with sold tables:", paidRevenue: "Paid revenue", publishing: "Publishing…", republish: "Publish again", ordinary: "Tickets without a venue map", perSeat: "Seat sales", perTable: "Table sales", loadFailed: "Could not load data" },
};

const PAGE_SIZE = 10;


export default function OrganizerEventsPage() { return <PageShell className="max-w-7xl"><ProtectedRoute><OrganizerWorkspace /></ProtectedRoute></PageShell>; }

function OrganizerWorkspace() {
  const locale = useLocale();
  const copy = COPY[locale];
  const user = getSession()?.user;
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [dashboard, setDashboard] = useState<OrganizerDashboard | null>(null);
  const [result, setResult] = useState<OrganizerWorkspaceEventList | null>(null);
  const [statusGroup, setStatusGroup] = useState<OrganizerEventStatusGroup>("all");
  const [sort, setSort] = useState<OrganizerEventSort>("updated_desc");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [publishedMessage, setPublishedMessage] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("published") !== "1") return;
    setPublishedMessage(true);
    const url = new URL(window.location.href); url.searchParams.delete("published"); window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    Promise.all([apiRequest<OrganizerProfile>("/me/organizer-profile"), apiRequest<OrganizerDashboard>("/api/organizer/events/dashboard/summary")])
      .then(([organizerProfile, summary]) => { setProfile(organizerProfile); setDashboard(summary); }).catch(showError(setError, locale));
  }, [revision]);

  useEffect(() => {
    setResult(null); setError(null);
    apiRequest<OrganizerWorkspaceEventList>(`/api/organizer/events?page=${page}&limit=${PAGE_SIZE}&statusGroup=${statusGroup}&sort=${sort}`).then(setResult).catch(showError(setError, locale));
  }, [page, statusGroup, sort, revision]);

  async function deleteDraft(event: OrganizerWorkspaceEvent): Promise<void> {
    if (!window.confirm(copy.deleteConfirm.replace("{title}", event.title))) return;
    try { await apiRequest(`/api/organizer/events/${event.id}`, { method: "DELETE" }); setRevision((value) => value + 1); }
    catch (reason) { setError(errorMessage(reason, locale)); }
  }

  async function reopenEvent(event: OrganizerWorkspaceEvent): Promise<void> {
    setReopeningId(event.id); setError(null);
    try {
      await apiRequest(`/api/organizer/events/${event.id}/reopen`, { method: "POST" });
      setRevision((value) => value + 1);
    } catch (reason) { setError(errorMessage(reason, locale)); }
    finally { setReopeningId(null); }
  }

  const occupancy = dashboard && dashboard.totalAdmissions > 0 ? Math.round((dashboard.soldAdmissions / dashboard.totalAdmissions) * 100) : 0;

  return <section>
    <div className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-[#e2ddea] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-4"><div aria-hidden="true" className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-[#e9defa] text-2xl font-extrabold text-[#5b21b6]">{profile?.photoUrl ? <img alt="" className="h-full w-full object-cover" src={new URL(profile.photoUrl, process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").toString()} /> : (profile?.organizationName || user?.name || "O").slice(0, 1).toUpperCase()}</div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-extrabold sm:text-3xl">{profile?.organizationName || user?.name || copy.organizer}</h1><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{copy.organizer}</span></div><p className="mt-1 text-sm text-[#665d70]">Telegram ID: {user?.telegramId ?? "…"} · {user?.telegramChatId ? copy.botConnected : copy.botDisconnected}</p></div></div>
      <div className="flex flex-wrap gap-2"><Link className="rounded-xl border border-[#d2cadc] px-4 py-2 text-sm font-bold" href="/organizer/profile">{copy.editProfile}</Link><Link className="rounded-xl bg-[#5b21b6] px-4 py-2 text-sm font-bold text-white" href="/account">{copy.guestProfile}</Link></div>
    </div>

    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <DashboardCard label={copy.totalEvents} value={dashboard?.totalEvents ?? "…"} detail={dashboard?.currency ? `${formatMoney(dashboard.settledRevenue, dashboard.currency, locale)} ${copy.revenue}` : copy.revenueLater} />
      <DashboardCard label={copy.published} value={dashboard?.publishedEvents ?? "…"} detail={`${occupancy}% ${copy.occupancy}`} accent />
      <DashboardCard label={copy.drafts} value={dashboard?.draftEvents ?? "…"} detail={`${(dashboard?.completedEvents ?? 0) + (dashboard?.cancelledEvents ?? 0)} ${copy.archived}`} />
    </div>

    <Link className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#26123f] p-6 text-white shadow-lg transition hover:bg-[#351653] sm:p-8" href="/organizer/events/new"><div><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#cbb6ec]">{copy.quickStart}</p><h2 className="mt-2 text-2xl font-extrabold">{copy.newEvent}</h2><p className="mt-2 text-sm text-white/70">{copy.setupHint}</p></div><span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-white text-2xl font-bold text-[#5b21b6]">+</span></Link>

    <div className="mt-8 flex flex-wrap items-center justify-between gap-4"><div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label={copy.statusTabs}>{(Object.keys(copy.filters) as OrganizerEventStatusGroup[]).map((filter) => <button aria-selected={statusGroup === filter} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${statusGroup === filter ? "bg-[#5b21b6] text-white" : "border border-[#d2cadc] bg-white text-[#51485c]"}`} key={filter} onClick={() => { setStatusGroup(filter); setPage(1); }} role="tab" type="button">{copy.filters[filter]}</button>)}</div><label className="flex items-center gap-2 text-sm font-semibold text-[#665d70]">{copy.sort}<SelectPicker className="rounded-xl border border-[#d2cadc] bg-white px-3 py-2 text-[#241c2d]" value={sort} onChange={(event) => { setSort(event.target.value as OrganizerEventSort); setPage(1); }}><option value="updated_desc">{copy.updated}</option><option value="date_asc">{copy.earliest}</option><option value="date_desc">{copy.latest}</option></SelectPicker></label></div>

    {publishedMessage ? <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800" role="status">{copy.publishedMessage}</p> : null}
    {error ? <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</p> : null}
    {!result && !error ? <p className="mt-8 text-[#665d70]">{copy.loading}</p> : null}
    {result?.items.length === 0 ? <div className="mt-6 rounded-3xl border border-dashed border-[#d2cadc] bg-white p-10 text-center"><h2 className="text-xl font-bold">{copy.empty}</h2><Link className="mt-5 inline-block rounded-xl bg-[#5b21b6] px-5 py-3 font-bold text-white" href="/organizer/events/new">{copy.create}</Link></div> : null}
    <div className="mt-6 grid gap-4">{result?.items.map((event) => <OrganizerEventCard event={event} key={event.id} onDelete={() => void deleteDraft(event)} onReopen={() => void reopenEvent(event)} reopening={reopeningId === event.id} />)}</div>
    {result && result.total > result.limit ? <nav className="mt-8 flex items-center justify-between" aria-label={copy.pages}><button className="rounded-xl border border-[#d2cadc] px-4 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">{copy.previous}</button><span className="text-sm text-[#665d70]">{copy.page} {page} {copy.of} {Math.max(1, Math.ceil(result.total / result.limit))}</span><button className="rounded-xl border border-[#d2cadc] px-4 py-2 disabled:opacity-40" disabled={!result.hasNext} onClick={() => setPage((value) => value + 1)} type="button">{copy.next}</button></nav> : null}
  </section>;
}

function DashboardCard({ label, value, detail, accent = false }: { label: string; value: number | string; detail: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? "border-[#cbb6ec] bg-[#f2ecff]" : "border-[#e2ddea] bg-white"}`}><p className="text-sm font-bold text-[#665d70]">{label}</p><p className="mt-2 text-3xl font-extrabold">{value}</p><p className="mt-2 text-sm text-[#665d70]">{detail}</p></div>; }

function OrganizerEventCard({ event, onDelete, onReopen, reopening }: { event: OrganizerWorkspaceEvent; onDelete: () => void; onReopen: () => void; reopening: boolean }) {
  const locale = useLocale();
  const copy = COPY[locale];
  const eventsCopy = EVENTS_COPY[locale];
  const progress = event.metrics.capacity > 0 ? Math.min(100, Math.round((event.metrics.sold / event.metrics.capacity) * 100)) : 0;
  return <article className="overflow-hidden rounded-2xl border border-[#ded8e7] bg-white shadow-sm"><div className="grid md:grid-cols-[180px_1fr]">
    <div className="min-h-44 bg-gradient-to-br from-[#ded1f8] via-[#f7f1ff] to-[#d7e4ff]">{event.posterUrl ? <img alt="" className="h-full w-full object-cover" src={event.posterUrl} /> : <div aria-hidden="true" className="flex h-full min-h-44 items-end p-5 text-4xl font-extrabold text-[#5b21b6]">{event.title.slice(0, 1)}</div>}</div>
    <div className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(event.status)}`}>{eventsCopy.statuses[event.status]}</span><span className="text-xs font-semibold text-[#80758d]">ID {event.displayId}</span></div><h2 className="mt-3 text-xl font-extrabold sm:text-2xl">{event.title}</h2><p className="mt-2 text-sm text-[#665d70]">{event.date} · {event.time} · {event.venueName}</p><p className="mt-1 text-sm font-semibold text-[#5b21b6]">{modeLabel(event.metrics.mode, locale)}</p></div><div className="flex gap-2"><Link className="rounded-xl border border-[#d2cadc] px-4 py-2 text-sm font-bold" href={`/organizer/events/${event.id}/preview`}>{copy.preview}</Link>{event.status === "draft" ? <Link className="rounded-xl bg-[#5b21b6] px-4 py-2 text-sm font-bold text-white" href={`/organizer/events/${event.id}/edit`}>{copy.continue}</Link> : <Link className="rounded-xl bg-[#5b21b6] px-4 py-2 text-sm font-bold text-white" href={`/organizer/events/${event.id}`}>{copy.manage}</Link>}</div></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto]"><div><div className="flex justify-between gap-4 text-sm"><span className="font-semibold">{copy.sold} {event.metrics.sold} {copy.of} {event.metrics.capacity}</span><span className="text-[#665d70]">{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eee9f2]"><div className="h-full rounded-full bg-[#713dcc]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-[#665d70]">{copy.remaining} {event.metrics.remaining}{event.metrics.includedSeats !== null ? ` · ${copy.includedSeats} ${event.metrics.includedSeats}` : ""}</p></div><div className="lg:text-right"><p className="text-xs font-bold uppercase tracking-wide text-[#80758d]">{copy.paidRevenue}</p><p className="mt-1 text-xl font-extrabold">{event.metrics.currency ? formatMoney(event.metrics.settledRevenue, event.metrics.currency, locale) : "—"}</p></div></div>
      {event.status === "draft" ? <div className="mt-5 border-t border-[#ece7f1] pt-4 text-right"><button className="text-sm font-bold text-red-700" onClick={onDelete} type="button">{eventsCopy.deleteDraft}</button></div> : null}
      {event.status === "completed" ? <div className="mt-5 border-t border-[#ece7f1] pt-4 text-right"><button className="rounded-xl border border-violet-300 px-4 py-2 text-sm font-bold text-violet-800 disabled:opacity-40" disabled={reopening} onClick={onReopen} type="button">{reopening ? copy.publishing : copy.republish}</button></div> : null}
    </div>
  </div></article>;
}

function formatMoney(value: number, currency: string, locale: EventLocale): string { return new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(value / 100); }
function modeLabel(mode: OrganizerWorkspaceEvent["metrics"]["mode"], locale: EventLocale): string { const copy = COPY[locale]; return mode === "ordinary" ? copy.ordinary : mode === "per_seat" ? copy.perSeat : copy.perTable; }
function statusClass(status: OrganizerWorkspaceEvent["status"]): string { if (status === "published") return "bg-emerald-50 text-emerald-700"; if (status === "draft") return "bg-amber-50 text-amber-800"; if (status === "cancelled") return "bg-red-50 text-red-700"; return "bg-[#f0eaff] text-[#5b21b6]"; }
function errorMessage(error: unknown, locale: EventLocale): string { return error instanceof Error ? error.message : COPY[locale].loadFailed; }
function showError(setter: (message: string) => void, locale: EventLocale): (error: unknown) => void { return (error) => setter(errorMessage(error, locale)); }
