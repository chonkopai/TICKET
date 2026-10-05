"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import { INTL_LOCALES } from "../lib/locale";
import { KK_MONTHS, KK_WEEKDAYS, KK_WEEKDAYS_FULL } from "../lib/kazakh-date";

type DateChoice = { iso: string; day: number; weekday: string; label: string };
type MonthGroup = { key: string; label: string; days: DateChoice[] };
const DATE_STRIP_COPY = {
  ru: { choose: "Выберите дату события; прокрутите для следующих дат", previous: "Предыдущие даты", next: "Следующие даты" },
  kk: { choose: "Іс-шара күнін таңдаңыз; келесі күндерге жылжытыңыз", previous: "Алдыңғы күндер", next: "Келесі күндер" },
  en: { choose: "Choose an event date; scroll for more dates", previous: "Previous dates", next: "Next dates" },
} as const;

function upcomingMonths(locale: string): MonthGroup[] {
  const kazakh = locale.startsWith("kk");
  const dayName = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
  const fullDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" });
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Almaty", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const value = (part: string) => Number(parts.find((item) => item.type === part)?.value);
  const start = Date.UTC(value("year"), value("month") - 1, value("day"));
  const groups: MonthGroup[] = [];

  for (let offset = 0; offset < 120; offset++) {
    const date = new Date(start + offset * 86_400_000);
    const iso = date.toISOString().slice(0, 10);
    const key = iso.slice(0, 7);
    const month = kazakh ? KK_MONTHS[date.getUTCMonth()] : monthName.format(date);
    if (groups.at(-1)?.key !== key) groups.push({ key, label: `${month}${date.getUTCFullYear() !== value("year") ? ` ${date.getUTCFullYear()}` : ""}`, days: [] });
    groups.at(-1)!.days.push({ iso, day: date.getUTCDate(), weekday: kazakh ? KK_WEEKDAYS[date.getUTCDay()]! : dayName.format(date), label: kazakh ? `${date.getUTCFullYear()} жылғы ${date.getUTCDate()} ${month}, ${KK_WEEKDAYS_FULL[date.getUTCDay()]}` : fullDate.format(date) });
  }
  return groups;
}

export function DateStrip({ from, to, todaySelected, onSelect }: {
  from?: string | undefined;
  to?: string | undefined;
  todaySelected?: boolean | undefined;
  onSelect: (date: string) => void;
}) {
  const locale = useLocale();
  const copy = DATE_STRIP_COPY[locale];
  const [months, setMonths] = useState<MonthGroup[]>([]);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => setMonths(upcomingMonths(INTL_LOCALES[locale])), [locale]);
  const updateScrollState = () => {
    const element = viewport.current;
    if (!element) return;
    setCanBack(element.scrollLeft > 2);
    setCanForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
  };

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    return () => observer.disconnect();
  }, [months]);

  const scroll = (direction: number) => viewport.current?.scrollBy({ left: direction * viewport.current.clientWidth * 0.75, behavior: "smooth" });
  const firstDay = months[0]?.days[0]?.iso;

  return <div className="group/dates relative min-w-0 flex-1">
    <div aria-label={copy.choose} className="flex h-[72px] gap-2 overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onScroll={updateScrollState} ref={viewport}>
      {months.map((month) => <div className="shrink-0" key={month.key}>
        <p className="sticky left-0 z-10 h-6 w-max bg-[#fafbff] dark:bg-ticket-bg px-2 text-[11px] font-semibold capitalize leading-6 text-slate-700 dark:text-ticket-muted">{month.label}</p>
        <div className="flex gap-0.5">{month.days.map((date) => {
          const selected = date.iso === from || date.iso === to || (todaySelected && date.iso === firstDay);
          const inRange = Boolean(from && to && date.iso > from && date.iso < to);
          return <button aria-label={date.label} aria-pressed={selected} className={`flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-xs leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent ${selected ? "bg-violet-600 dark:bg-ticket-primary font-bold text-white shadow-sm" : inRange ? "bg-violet-50 dark:bg-ticket-accent-soft text-violet-800 dark:text-ticket-accent" : "text-slate-600 dark:text-ticket-muted hover:bg-slate-100 dark:hover:bg-ticket-raised hover:text-slate-900 dark:hover:text-ticket-text"}`} key={date.iso} onClick={() => onSelect(date.iso)} type="button"><span className={`font-medium capitalize ${selected ? "text-white" : [0, 6].includes(new Date(`${date.iso}T00:00:00Z`).getUTCDay()) ? "text-violet-700 dark:text-ticket-accent" : ""}`}>{date.weekday}</span><span className="text-sm font-semibold">{date.day}</span></button>;
        })}</div>
      </div>)}
    </div>
    {canBack ? <button aria-label={copy.previous} className="pointer-events-none absolute left-0 top-6 z-10 flex size-12 items-center justify-center bg-transparent text-violet-700 dark:text-ticket-accent opacity-0 transition hover:scale-110 focus-visible:pointer-events-auto focus-visible:scale-110 focus-visible:opacity-100 focus-visible:outline-none group-hover/dates:pointer-events-auto group-hover/dates:opacity-100 group-focus-within/dates:pointer-events-auto group-focus-within/dates:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100" onClick={() => scroll(-1)} type="button"><DateArrow direction="left" /></button> : null}
    {canForward ? <button aria-label={copy.next} className="pointer-events-none absolute right-0 top-6 z-10 flex size-12 items-center justify-center bg-transparent text-violet-700 dark:text-ticket-accent opacity-0 transition hover:scale-110 focus-visible:pointer-events-auto focus-visible:scale-110 focus-visible:opacity-100 focus-visible:outline-none group-hover/dates:pointer-events-auto group-hover/dates:opacity-100 group-focus-within/dates:pointer-events-auto group-focus-within/dates:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100" onClick={() => scroll(1)} type="button"><DateArrow direction="right" /></button> : null}
  </div>;
}

function DateArrow({ direction }: { direction: "left" | "right" }) {
  return <svg aria-hidden="true" className="size-7 drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]" fill="none" viewBox="0 0 28 28"><path d={direction === "left" ? "m18 5-9 9 9 9" : "m10 5 9 9-9 9"} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.7" /></svg>;
}
