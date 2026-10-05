"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import { INTL_LOCALES } from "../lib/locale";
import { KK_MONTHS } from "../lib/kazakh-date";

const COPY = {
  ru: { button: "Календарь", range: "Выбрать диапазон дат в календаре", dialog: "Выберите даты событий", choose: "Выберите даты", hint: "Выберите начало и конец периода", prev: "Предыдущий месяц", next: "Следующий месяц", end: "выберите конец", none: "Даты не выбраны", clear: "Очистить даты" },
  kk: { button: "Күнтізбе", range: "Күнтізбеден күндер аралығын таңдау", dialog: "Іс-шара күндерін таңдаңыз", choose: "Күндерді таңдаңыз", hint: "Аралықтың басы мен соңын таңдаңыз", prev: "Алдыңғы ай", next: "Келесі ай", end: "соңғы күнді таңдаңыз", none: "Күндер таңдалмаған", clear: "Күндерді тазалау" },
  en: { button: "Calendar", range: "Choose a date range in the calendar", dialog: "Choose event dates", choose: "Choose dates", hint: "Choose the start and end of the period", prev: "Previous month", next: "Next month", end: "choose end", none: "No dates selected", clear: "Clear dates" },
} as const;

type Props = {
  from?: string | undefined;
  to?: string | undefined;
  onChange: (from: string | undefined, to: string | undefined) => void;
  iconOnly?: boolean;
};


function dateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function startMonth(value?: string): Date {
  const parsed = value ? new Date(`${value}T00:00:00Z`) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function AfishaCalendar({ from, to, onChange, iconOnly = false }: Props) {
  const copy = COPY[useLocale()];
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startMonth(from));
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  function select(date: string) {
    if (!from || to || date < from) {
      onChange(date, undefined);
    } else {
      onChange(from, date);
      setOpen(false);
    }
  }

  function move(offset: number) {
    setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1)));
  }

  return <div className="relative" ref={container}>
    <button aria-expanded={open} aria-haspopup="dialog" aria-label={copy.range} className={iconOnly ? `inline-flex size-11 items-center justify-center rounded-xl text-violet-700 dark:text-ticket-accent transition hover:bg-violet-50 dark:hover:bg-ticket-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent ${from ? "bg-violet-50 dark:bg-ticket-accent-soft" : ""}` : `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition ${from ? "bg-violet-100 dark:bg-ticket-accent-soft font-semibold text-violet-800 dark:text-ticket-accent" : "text-slate-600 dark:text-ticket-muted hover:bg-slate-100 dark:hover:bg-ticket-raised"}`} onClick={() => { if (!open) setMonth(startMonth(from)); setOpen((value) => !value); }} type="button">{iconOnly ? <CalendarGlyph large /> : <>{copy.button} <CalendarGlyph /></>}</button>
    {open ? <div aria-label={copy.dialog} className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,560px)] rounded-2xl border border-slate-200 dark:border-ticket-border bg-white dark:bg-ticket-surface p-4 shadow-xl" role="dialog">
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-semibold text-slate-900 dark:text-ticket-text">{copy.choose}</p><p className="text-xs text-slate-500 dark:text-ticket-muted">{copy.hint}</p></div><div className="flex gap-1"><button aria-label={copy.prev} className="rounded-full border border-slate-200 dark:border-ticket-border px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-ticket-raised" onClick={() => move(-1)} type="button">‹</button><button aria-label={copy.next} className="rounded-full border border-slate-200 dark:border-ticket-border px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-ticket-raised" onClick={() => move(1)} type="button">›</button></div></div>
      <div className="grid gap-5 sm:grid-cols-2">{[0, 1].map((offset) => <CalendarMonth from={from} key={offset} month={new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1))} onSelect={select} to={to} />)}</div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-ticket-border pt-3 text-xs"><span className="text-slate-500 dark:text-ticket-muted">{from ? `${from}${to ? ` — ${to}` : ` — ${copy.end}`}` : copy.none}</span><button className="rounded-lg px-2 py-1 font-semibold text-violet-700 dark:text-ticket-accent hover:bg-violet-50 dark:hover:bg-ticket-accent-soft" onClick={() => { onChange(undefined, undefined); setOpen(false); }} type="button">{copy.clear}</button></div>
    </div> : null}
  </div>;
}

function CalendarMonth({ month, from, to, onSelect }: { month: Date; from?: string | undefined; to?: string | undefined; onSelect: (date: string) => void }) {
  const currentLocale = useLocale();
  const locale = INTL_LOCALES[currentLocale];
  const weekdays = currentLocale === "kk" ? ["Дс", "Сс", "Ср", "Бс", "Жм", "Сб", "Жс"] : Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, index + 1))));
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const padding = (month.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return <div><p className="mb-2 text-center text-sm font-semibold capitalize text-slate-800 dark:text-ticket-text">{currentLocale === "kk" ? `${KK_MONTHS[monthIndex]} ${year}` : new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}</p><div className="grid grid-cols-7 gap-0.5 text-center text-xs">{weekdays.map((day) => <span className="py-1 font-semibold text-slate-400 dark:text-ticket-dim" key={day}>{day}</span>)}{Array.from({ length: padding }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => { const date = dateString(year, monthIndex, index + 1); const edge = date === from || date === to; const inRange = Boolean(from && to && date > from && date < to); return <button aria-label={date} aria-pressed={edge} className={`aspect-square rounded-lg text-xs transition focus-visible:outline-2 focus-visible:outline-violet-600 dark:focus-visible:outline-ticket-accent ${edge ? "bg-violet-600 dark:bg-ticket-primary font-bold text-white" : inRange ? "bg-violet-100 dark:bg-ticket-accent-soft text-violet-900 dark:text-ticket-accent" : "text-slate-700 dark:text-ticket-muted hover:bg-slate-100 dark:hover:bg-ticket-raised"}`} key={date} onClick={() => onSelect(date)} type="button">{index + 1}</button>; })}</div></div>;
}

function CalendarGlyph({ large = false }: { large?: boolean }) { return <svg aria-hidden="true" className={large ? "h-5 w-5" : "h-3.5 w-3.5"} fill="none" viewBox="0 0 24 24"><rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" /><path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>; }
