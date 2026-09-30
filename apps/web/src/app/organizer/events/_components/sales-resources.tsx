"use client";

import { SelectPicker } from "../../../../components/option-picker";

import { ru, type EventLocale, type OrganizerEvent, type VenueLayout } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../../../(auth)/_lib/api";
import { TicketTypesManager } from "./ticket-types-manager";
import { useLocale } from "../../../../components/locale-provider";
import { EVENTS_COPY } from "../../../../lib/events-copy";

const COPY: Record<EventLocale, { loadFailed: string; actionFailed: string; saved: string; confirmReplace: string; title: string; description: string; freeEntry: string; ticketsOnly: string; ticketsHint: string; hall: string; hallTitle: string; hallHint: string; loading: string; existingHall: string; hallSaved: string; createHall: string; tables: string; rows: string; hallSetup: string; openBuilder: string; buildFromScratch: string; templates: string; noTemplates: string; savedTemplate: string; applyTemplate: string; replaceHint: string; priceHint: string; ordinaryTickets: string }> = {
  ru: { loadFailed: "Не удалось загрузить схему зала.", actionFailed: "Не удалось сохранить изменения.", saved: "Схема сохранена.", confirmReplace: "Заменить текущую схему шаблоном? Существующая расстановка будет удалена.", title: "Формат продажи и посадки", description: "Выберите способ продажи, который соответствует реальной рассадке гостей.", freeEntry: "Свободный вход", ticketsOnly: "Только входные билеты", ticketsHint: "Гость выбирает тип билета без стола или нумерованного места.", hall: "Интерактивный зал", hallTitle: "Столы, ряды и места", hallHint: "Гость выбирает стол или место на схеме.", loading: "Загрузка…", existingHall: "Схема зала уже сохранена. Продажа мест остаётся доступной, пока она существует. Измените или удалите её в конструкторе, если нужен только свободный вход.", hallSaved: "Схема зала сохранена", createHall: "Создайте схему зала", tables: "столов", rows: "рядов", hallSetup: "Задайте размер помещения и расположите столы, ряды и сцену.", openBuilder: "Открыть конструктор", buildFromScratch: "Создать схему с нуля", templates: "Шаблоны", noTemplates: "Сохранённых шаблонов пока нет.", savedTemplate: "Сохранённый шаблон", applyTemplate: "Применить шаблон", replaceHint: "Применение шаблона заменит текущую схему. Сохраните её отдельно, если хотите оставить копию.", priceHint: "Цены, депозиты и продажа по столу или месту настраиваются в конструкторе. Обычные билеты редактируются отдельно.", ordinaryTickets: "Обычные типы билетов" },
  kk: { loadFailed: "Зал сызбасын жүктеу мүмкін болмады.", actionFailed: "Өзгерістерді сақтау мүмкін болмады.", saved: "Сызба сақталды.", confirmReplace: "Ағымдағы сызбаны үлгімен ауыстырасыз ба? Қазіргі орналасу жойылады.", title: "Сату және орындар форматы", description: "Қонақтардың нақты орналасуына сай сату тәсілін таңдаңыз.", freeEntry: "Еркін кіру", ticketsOnly: "Тек кіру билеттері", ticketsHint: "Қонақ үстелсіз немесе нөмірленген орынсыз билет түрін таңдайды.", hall: "Интерактивті зал", hallTitle: "Үстелдер, қатарлар және орындар", hallHint: "Қонақ сызбадан үстел немесе орын таңдайды.", loading: "Жүктелуде…", existingHall: "Зал сызбасы сақталған. Ол бар кезде орындарды сату қолжетімді. Тек еркін кіру қажет болса, сызбаны конструкторда өзгертіңіз немесе жойыңыз.", hallSaved: "Зал сызбасы сақталды", createHall: "Зал сызбасын жасаңыз", tables: "үстел", rows: "қатар", hallSetup: "Бөлме өлшемін белгілеп, үстелдерді, қатарларды және сахнаны орналастырыңыз.", openBuilder: "Конструкторды ашу", buildFromScratch: "Сызбаны жаңадан жасау", templates: "Үлгілер", noTemplates: "Сақталған үлгілер жоқ.", savedTemplate: "Сақталған үлгі", applyTemplate: "Үлгіні қолдану", replaceHint: "Үлгіні қолдану ағымдағы сызбаны ауыстырады. Көшірмесін сақтау керек болса, оны алдын ала бөлек сақтаңыз.", priceHint: "Бағалар, депозиттер және үстел не орын бойынша сату конструкторда бапталады. Кәдімгі билеттер бөлек өңделеді.", ordinaryTickets: "Кәдімгі билет түрлері" },
  en: { loadFailed: "Could not load the venue map.", actionFailed: "Could not save changes.", saved: "Venue map saved.", confirmReplace: "Replace the current map with this template? The existing layout will be removed.", title: "Ticketing and seating format", description: "Choose how tickets are sold based on the actual seating arrangement.", freeEntry: "General admission", ticketsOnly: "Admission tickets only", ticketsHint: "Guests choose a ticket type without a table or numbered seat.", hall: "Interactive venue", hallTitle: "Tables, rows, and seats", hallHint: "Guests choose a table or seat on the map.", loading: "Loading…", existingHall: "A venue map is already saved. Seat sales remain available while it exists. Change or remove it in the builder if you want general admission only.", hallSaved: "Venue map saved", createHall: "Create a venue map", tables: "tables", rows: "rows", hallSetup: "Set the room size and place tables, rows, and the stage.", openBuilder: "Open builder", buildFromScratch: "Create from scratch", templates: "Templates", noTemplates: "No saved templates yet.", savedTemplate: "Saved template", applyTemplate: "Apply template", replaceHint: "Applying a template replaces the current map. Save a separate copy first if needed.", priceHint: "Prices, deposits, and table or seat sales are set in the builder. Regular tickets can be edited separately.", ordinaryTickets: "Regular ticket types" },
};

type SaleView = "ordinary" | "hall";

export function SalesResources({ event }: { event: OrganizerEvent | null }) {
  const locale = useLocale();
  const copy = COPY[locale];
  const eventsCopy = EVENTS_COPY[locale];
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
      setError(reason instanceof Error ? reason.message : copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => { void load(); }, [load]);

  async function applyTemplate(): Promise<void> {
    if (!event || !templateId || event.status !== "draft") return;
    if (layout && !window.confirm(copy.confirmReplace)) return;
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
      setMessage(copy.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!event) return <p className="rounded-2xl bg-violet-50 p-5 text-violet-900">{eventsCopy.saveStepFirst}</p>;

  return <div className="grid gap-7">
    <div>
      <h2 className="text-xl font-bold text-zinc-900">{copy.title}</h2>
      <p className="mt-1 text-sm text-zinc-600">{copy.description}</p>
    </div>
    <div className="grid gap-4 md:grid-cols-2" aria-label={copy.title}>
      <button aria-pressed={view === "ordinary"} className={`rounded-2xl border-2 p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${view === "ordinary" ? "border-violet-600 bg-violet-50" : "border-zinc-200 bg-white hover:border-violet-300"}`} onClick={() => setView("ordinary")} type="button">
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">{copy.freeEntry}</span>
        <span className="mt-3 block text-lg font-bold">{copy.ticketsOnly}</span>
        <span className="mt-2 block text-sm text-zinc-600">{copy.ticketsHint}</span>
      </button>
      <button aria-pressed={view === "hall"} className={`rounded-2xl border-2 p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${view === "hall" ? "border-violet-600 bg-violet-50" : "border-zinc-200 bg-white hover:border-violet-300"}`} onClick={() => setView("hall")} type="button">
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">{copy.hall}</span>
        <span className="mt-3 block text-lg font-bold">{copy.hallTitle}</span>
        <span className="mt-2 block text-sm text-zinc-600">{copy.hallHint}</span>
      </button>
    </div>
    {loading ? <p className="text-sm text-zinc-600">{copy.loading}</p> : null}
    {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : null}
    {message ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{message}</p> : null}
    {!loading && view === "ordinary" ? <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      {layout ? <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{copy.existingHall}</p> : null}
      <TicketTypesManager event={event} />
    </div> : null}
    {!loading && view === "hall" ? <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
        <div><h3 className="font-bold">{layout ? copy.hallSaved : copy.createHall}</h3><p className="mt-1 text-sm text-zinc-600">{layout ? `${layout.tables.length} ${copy.tables} · ${layout.rows?.length ?? 0} ${copy.rows}` : copy.hallSetup}</p></div>
        <Link className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600" href={`/organizer/venue-builder/${event.id}`}>{layout ? copy.openBuilder : copy.buildFromScratch}</Link>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="font-bold">{copy.templates}</h3>
        {templates.length === 0 ? <p className="mt-2 text-sm text-zinc-600">{copy.noTemplates}</p> : <div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid min-w-56 flex-1 gap-2 text-sm font-semibold">{copy.savedTemplate}<SelectPicker className="rounded-xl border border-zinc-300 px-4 py-3 font-normal" value={templateId} onChange={(change) => setTemplateId(change.currentTarget.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.templateName}</option>)}</SelectPicker></label><button className="rounded-xl border border-violet-600 px-5 py-3 text-sm font-semibold text-violet-800 disabled:opacity-40" disabled={busy || !templateId || event.status !== "draft"} onClick={() => void applyTemplate()} type="button">{copy.applyTemplate}</button></div>}
        {layout ? <p className="mt-3 text-xs text-zinc-600">{copy.replaceHint}</p> : null}
      </div>
      <p className="text-sm text-zinc-600">{copy.priceHint}</p>
      <details className="rounded-2xl border border-zinc-200 bg-white p-5"><summary className="cursor-pointer font-semibold">{copy.ordinaryTickets}</summary><TicketTypesManager event={event} /></details>
    </div> : null}
  </div>;
}
