"use client";

import { ru, type OrganizerDashboard, type OrganizerEventSort, type OrganizerEventStatusGroup, type OrganizerProfile, type OrganizerWorkspaceEvent, type OrganizerWorkspaceEventList } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "../../(auth)/_components/protected-route";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession } from "../../(auth)/_lib/session";
import { PageShell } from "../../../components/ui";

const PAGE_SIZE = 10;
const FILTERS: Array<{ id: OrganizerEventStatusGroup; label: string }> = [
  { id: "all", label: "Все события" }, { id: "on_sale", label: "В продаже" }, { id: "draft", label: "Черновики" }, { id: "archive", label: "Завершённые и архив" },
];

export default function OrganizerEventsPage() { return <PageShell className="max-w-7xl"><ProtectedRoute><OrganizerWorkspace /></ProtectedRoute></PageShell>; }

function OrganizerWorkspace() {
  const user = getSession()?.user;
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [dashboard, setDashboard] = useState<OrganizerDashboard | null>(null);
  const [result, setResult] = useState<OrganizerWorkspaceEventList | null>(null);
  const [statusGroup, setStatusGroup] = useState<OrganizerEventStatusGroup>("all");
  const [sort, setSort] = useState<OrganizerEventSort>("updated_desc");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiRequest<OrganizerProfile>("/me/organizer-profile"), apiRequest<OrganizerDashboard>("/api/organizer/events/dashboard/summary")])
      .then(([organizerProfile, summary]) => { setProfile(organizerProfile); setDashboard(summary); }).catch(showError(setError));
  }, [revision]);

  useEffect(() => {
    setResult(null); setError(null);
    apiRequest<OrganizerWorkspaceEventList>(`/api/organizer/events?page=${page}&limit=${PAGE_SIZE}&statusGroup=${statusGroup}&sort=${sort}`).then(setResult).catch(showError(setError));
  }, [page, statusGroup, sort, revision]);

  async function editOrganization(): Promise<void> {
    const next = window.prompt("Название организации", profile?.organizationName ?? user?.name ?? "");
    if (!next?.trim()) return;
    try { setProfile(await apiRequest<OrganizerProfile>("/me/organizer-profile", { method: "PATCH", body: JSON.stringify({ organizationName: next.trim() }) })); }
    catch (reason) { setError(errorMessage(reason)); }
  }

  async function deleteDraft(event: OrganizerWorkspaceEvent): Promise<void> {
    if (!window.confirm(`Удалить черновик «${event.title}»? Это действие нельзя отменить.`)) return;
    try { await apiRequest(`/api/organizer/events/${event.id}`, { method: "DELETE" }); setRevision((value) => value + 1); }
    catch (reason) { setError(errorMessage(reason)); }
  }

  const occupancy = dashboard && dashboard.totalAdmissions > 0 ? Math.round((dashboard.soldAdmissions / dashboard.totalAdmissions) * 100) : 0;

  return <section>
    <div className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-[#e2ddea] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-4"><div aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e9defa] text-2xl font-extrabold text-[#5b21b6]">{(profile?.organizationName || user?.name || "O").slice(0, 1).toUpperCase()}</div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-extrabold sm:text-3xl">{profile?.organizationName || user?.name || "Организатор"}</h1><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Организатор</span></div><p className="mt-1 text-sm text-[#665d70]">Telegram ID: {user?.telegramId ?? "…"} · {user?.telegramChatId ? "бот подключён" : "бот не подключён"}</p></div></div>
      <div className="flex flex-wrap gap-2"><button className="rounded-xl border border-[#d2cadc] px-4 py-2 text-sm font-bold" onClick={() => void editOrganization()} type="button">Редактировать профиль</button><Link className="rounded-xl bg-[#5b21b6] px-4 py-2 text-sm font-bold text-white" href="/account">Перейти в профиль гостя</Link></div>
    </div>

    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <DashboardCard label="Всего событий" value={dashboard?.totalEvents ?? "…"} detail={dashboard?.currency ? `${formatMoney(dashboard.settledRevenue, dashboard.currency)} выручки` : "Выручка появится после продаж"} />
      <DashboardCard label="Опубликовано" value={dashboard?.publishedEvents ?? "…"} detail={`${occupancy}% мест реализовано`} accent />
      <DashboardCard label="Черновики" value={dashboard?.draftEvents ?? "…"} detail={`${(dashboard?.completedEvents ?? 0) + (dashboard?.cancelledEvents ?? 0)} завершённых или отменённых`} />
    </div>

    <Link className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#26123f] p-6 text-white shadow-lg transition hover:bg-[#351653] sm:p-8" href="/organizer/events/new"><div><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#cbb6ec]">Быстрый старт</p><h2 className="mt-2 text-2xl font-extrabold">Создать новое событие</h2><p className="mt-2 text-sm text-white/70">Настройте программу, билеты и схему зала.</p></div><span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-white text-2xl font-bold text-[#5b21b6]">+</span></Link>

    <div className="mt-8 flex flex-wrap items-center justify-between gap-4"><div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Статусы событий">{FILTERS.map((filter) => <button aria-selected={statusGroup === filter.id} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${statusGroup === filter.id ? "bg-[#5b21b6] text-white" : "border border-[#d2cadc] bg-white text-[#51485c]"}`} key={filter.id} onClick={() => { setStatusGroup(filter.id); setPage(1); }} role="tab" type="button">{filter.label}</button>)}</div><label className="flex items-center gap-2 text-sm font-semibold text-[#665d70]">Сортировка<select className="rounded-xl border border-[#d2cadc] bg-white px-3 py-2 text-[#241c2d]" value={sort} onChange={(event) => { setSort(event.target.value as OrganizerEventSort); setPage(1); }}><option value="updated_desc">Недавно изменённые</option><option value="date_asc">По дате: сначала ближайшие</option><option value="date_desc">По дате: сначала поздние</option></select></label></div>

    {error ? <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</p> : null}
    {!result && !error ? <p className="mt-8 text-[#665d70]">Загрузка событий…</p> : null}
    {result?.items.length === 0 ? <div className="mt-6 rounded-3xl border border-dashed border-[#d2cadc] bg-white p-10 text-center"><h2 className="text-xl font-bold">Событий в этом разделе пока нет</h2><Link className="mt-5 inline-block rounded-xl bg-[#5b21b6] px-5 py-3 font-bold text-white" href="/organizer/events/new">Создать событие</Link></div> : null}
    <div className="mt-6 grid gap-4">{result?.items.map((event) => <OrganizerEventCard event={event} key={event.id} onDelete={() => void deleteDraft(event)} />)}</div>
    {result && result.total > result.limit ? <nav className="mt-8 flex items-center justify-between" aria-label="Страницы событий"><button className="rounded-xl border border-[#d2cadc] px-4 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Назад</button><span className="text-sm text-[#665d70]">Страница {page} из {Math.max(1, Math.ceil(result.total / result.limit))}</span><button className="rounded-xl border border-[#d2cadc] px-4 py-2 disabled:opacity-40" disabled={!result.hasNext} onClick={() => setPage((value) => value + 1)} type="button">Далее</button></nav> : null}
  </section>;
}

function DashboardCard({ label, value, detail, accent = false }: { label: string; value: number | string; detail: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? "border-[#cbb6ec] bg-[#f2ecff]" : "border-[#e2ddea] bg-white"}`}><p className="text-sm font-bold text-[#665d70]">{label}</p><p className="mt-2 text-3xl font-extrabold">{value}</p><p className="mt-2 text-sm text-[#665d70]">{detail}</p></div>; }

function OrganizerEventCard({ event, onDelete }: { event: OrganizerWorkspaceEvent; onDelete: () => void }) {
  const progress = event.metrics.capacity > 0 ? Math.min(100, Math.round((event.metrics.sold / event.metrics.capacity) * 100)) : 0;
  return <article className="overflow-hidden rounded-2xl border border-[#ded8e7] bg-white shadow-sm"><div className="grid md:grid-cols-[180px_1fr]">
    <div className="min-h-44 bg-gradient-to-br from-[#ded1f8] via-[#f7f1ff] to-[#d7e4ff]">{event.posterUrl ? <img alt="" className="h-full w-full object-cover" src={event.posterUrl} /> : <div aria-hidden="true" className="flex h-full min-h-44 items-end p-5 text-4xl font-extrabold text-[#5b21b6]">{event.title.slice(0, 1)}</div>}</div>
    <div className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(event.status)}`}>{ru.events.statuses[event.status]}</span><span className="text-xs font-semibold text-[#80758d]">ID {event.displayId}</span></div><h2 className="mt-3 text-xl font-extrabold sm:text-2xl">{event.title}</h2><p className="mt-2 text-sm text-[#665d70]">{event.date} · {event.time} · {event.venueName}</p><p className="mt-1 text-sm font-semibold text-[#5b21b6]">{modeLabel(event.metrics.mode)}</p></div><div className="flex gap-2"><Link className="rounded-xl border border-[#d2cadc] px-4 py-2 text-sm font-bold" href={`/organizer/events/${event.id}/preview`}>Предпросмотр</Link><Link className="rounded-xl bg-[#5b21b6] px-4 py-2 text-sm font-bold text-white" href={`/organizer/events/${event.id}`}>Управление</Link></div></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto]"><div><div className="flex justify-between gap-4 text-sm"><span className="font-semibold">Продано {event.metrics.sold} из {event.metrics.capacity}</span><span className="text-[#665d70]">{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eee9f2]"><div className="h-full rounded-full bg-[#713dcc]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-[#665d70]">Осталось: {event.metrics.remaining}{event.metrics.includedSeats !== null ? ` · включено мест в проданных столах: ${event.metrics.includedSeats}` : ""}</p></div><div className="lg:text-right"><p className="text-xs font-bold uppercase tracking-wide text-[#80758d]">Оплаченная выручка</p><p className="mt-1 text-xl font-extrabold">{event.metrics.currency ? formatMoney(event.metrics.settledRevenue, event.metrics.currency) : "—"}</p></div></div>
      {event.status === "draft" ? <div className="mt-5 border-t border-[#ece7f1] pt-4 text-right"><button className="text-sm font-bold text-red-700" onClick={onDelete} type="button">Удалить черновик</button></div> : null}
    </div>
  </div></article>;
}

function formatMoney(value: number, currency: string): string { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value / 100); }
function modeLabel(mode: OrganizerWorkspaceEvent["metrics"]["mode"]): string { return mode === "ordinary" ? "Билеты без схемы зала" : mode === "per_seat" ? "Продажа по местам" : "Продажа столами"; }
function statusClass(status: OrganizerWorkspaceEvent["status"]): string { if (status === "published") return "bg-emerald-50 text-emerald-700"; if (status === "draft") return "bg-amber-50 text-amber-800"; if (status === "cancelled") return "bg-red-50 text-red-700"; return "bg-[#f0eaff] text-[#5b21b6]"; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Не удалось загрузить данные"; }
function showError(setter: (message: string) => void): (error: unknown) => void { return (error) => setter(errorMessage(error)); }
