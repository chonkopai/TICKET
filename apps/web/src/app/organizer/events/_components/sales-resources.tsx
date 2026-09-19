"use client";

import { ru, type OrganizerEvent, type VenueLayout } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../../../(auth)/_lib/api";
import { TicketTypesManager } from "./ticket-types-manager";

type SaleView = "ordinary" | "hall";

export function SalesResources({ event }: { event: OrganizerEvent | null }) {
  const [view, setView] = useState<SaleView>("ordinary");
  const [layout, setLayout] = useState<VenueLayout | null>(null);
  const [templates, setTemplates] = useState<VenueLayout[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(Boolean(event));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    setError(null);
    try {
      const [current, saved] = await Promise.all([
        apiRequest<VenueLayout>(`/api/organizer/events/${event.id}/venue-layout`).catch((reason: unknown) => {
          if (reason instanceof Error && reason.message === ru.venue.errors.notFound) return null;
          throw reason;
        }),
        apiRequest<{ items: VenueLayout[] }>("/api/organizer/venue-layout-templates?limit=50"),
      ]);
      setLayout(current);
      setView(current ? "hall" : "ordinary");
      setTemplates(saved.items);
      setTemplateId(saved.items[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ru.venue.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => { void load(); }, [load]);

  async function applyTemplate(): Promise<void> {
    if (!event || !templateId || event.status !== "draft") return;
    if (layout && !window.confirm("Заменить текущую схему выбранным шаблоном? Существующая расстановка будет удалена.")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const applied = await apiRequest<VenueLayout>(`/api/organizer/events/${event.id}/venue-layout/apply-template`, {
        method: "POST",
        body: JSON.stringify({ templateId }),
      });
      setLayout(applied);
      setView("hall");
      setMessage(ru.venue.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ru.venue.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!event) return <p className="rounded-2xl bg-violet-50 p-5 text-violet-900">{ru.events.saveStepFirst}</p>;

  return <div className="grid gap-7">
    <div>
      <h2 className="text-xl font-bold text-zinc-900">Формат продажи и посадки</h2>
      <p className="mt-1 text-sm text-zinc-600">Выберите способ продажи, который соответствует реальной рассадке гостей.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-2" aria-label="Формат продажи и посадки">
      <button aria-pressed={view === "ordinary"} className={`rounded-2xl border-2 p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${view === "ordinary" ? "border-violet-600 bg-violet-50" : "border-zinc-200 bg-white hover:border-violet-300"}`} onClick={() => setView("ordinary")} type="button">
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">Свободный вход</span>
        <span className="mt-3 block text-lg font-bold">Только входные билеты</span>
        <span className="mt-2 block text-sm text-zinc-600">Гость выбирает тип билета без стола или нумерованного места.</span>
      </button>
      <button aria-pressed={view === "hall"} className={`rounded-2xl border-2 p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${view === "hall" ? "border-violet-600 bg-violet-50" : "border-zinc-200 bg-white hover:border-violet-300"}`} onClick={() => setView("hall")} type="button">
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">Интерактивный зал</span>
        <span className="mt-3 block text-lg font-bold">Столы, ряды и места</span>
        <span className="mt-2 block text-sm text-zinc-600">Гость выбирает доступный стол или конкретное место на схеме.</span>
      </button>
    </div>
    {loading ? <p className="text-sm text-zinc-600">{ru.common.loading}</p> : null}
    {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : null}
    {message ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{message}</p> : null}
    {!loading && view === "ordinary" ? <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      {layout ? <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Схема зала уже сохранена для этого события. Продажа мест на ней остаётся доступной, пока схема существует. Измените или удалите её в конструкторе, если нужен только свободный вход.</p> : null}
      <TicketTypesManager event={event} />
    </div> : null}
    {!loading && view === "hall" ? <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
        <div><h3 className="font-bold">{layout ? "Схема зала сохранена" : "Создайте схему зала"}</h3><p className="mt-1 text-sm text-zinc-600">{layout ? `${layout.tables.length} столов · ${layout.rows?.length ?? 0} рядов` : "Задайте размер помещения и расположите столы, ряды и сцену."}</p></div>
        <Link className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600" href={`/organizer/venue-builder/${event.id}`}>{layout ? "Открыть конструктор" : "Создать схему с нуля"}</Link>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="font-bold">{ru.venue.templates}</h3>
        {templates.length === 0 ? <p className="mt-2 text-sm text-zinc-600">{ru.venue.noTemplates}</p> : <div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid min-w-56 flex-1 gap-2 text-sm font-semibold">Сохранённый шаблон<select className="rounded-xl border border-zinc-300 px-4 py-3 font-normal" value={templateId} onChange={(change) => setTemplateId(change.currentTarget.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.templateName}</option>)}</select></label><button className="rounded-xl border border-violet-600 px-5 py-3 text-sm font-semibold text-violet-800 disabled:opacity-40" disabled={busy || !templateId || event.status !== "draft"} onClick={() => void applyTemplate()} type="button">{ru.venue.applyTemplate}</button></div>}
        {layout ? <p className="mt-3 text-xs text-zinc-600">Применение шаблона заменит текущую схему. Сохраните её отдельно, если хотите оставить копию.</p> : null}
      </div>
      <p className="text-sm text-zinc-600">Цены, депозиты и продажа по столу или месту настраиваются в конструкторе. Типы обычных билетов можно редактировать отдельно.</p>
      <details className="rounded-2xl border border-zinc-200 bg-white p-5"><summary className="cursor-pointer font-semibold">Обычные типы билетов</summary><TicketTypesManager event={event} /></details>
    </div> : null}
  </div>;
}
