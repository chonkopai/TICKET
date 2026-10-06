"use client";

import { INTL_LOCALES } from "../lib/locale";

import { type EventLocale, type PublicEventSummary } from "@event-platform/shared-types";
import Link from "next/link";
import type { ReactNode } from "react";

import { AgeRestrictionBadge } from "./age-restriction-badge";
import { FavoriteButton } from "./favorite-button";
import { PublicFramedAsset } from "./public-event-media";
import { useDisplayCurrency } from "./currency-provider";
import { useLocale } from "./locale-provider";
import { HOME_COPY } from "../app/home-copy";

const UI_COPY: Record<EventLocale, { fullPayment: string; unavailable: string; retry: string; loading: string; tickets: string; tables: string; seats: string }> = {
  ru: { fullPayment: "Полная оплата", unavailable: "Недоступно", retry: "Повторить", loading: "Загрузка", tickets: "билетов", tables: "столов", seats: "мест" },
  kk: { fullPayment: "Толық төлем", unavailable: "Қолжетімсіз", retry: "Қайталау", loading: "Жүктелуде", tickets: "билет", tables: "үстел", seats: "орын" },
  en: { fullPayment: "Full payment", unavailable: "Unavailable", retry: "Retry", loading: "Loading", tickets: "tickets", tables: "tables", seats: "seats" },
};

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto min-h-screen w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12 ${className}`}>{children}</main>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {description ? <p className="mt-3 max-w-2xl text-zinc-600 dark:text-ticket-muted">{description}</p> : null}
    </div>
    {action}
  </div>;
}

export function EventCard({ event }: { event: PublicEventSummary }) {
  const locale = useLocale();
  const copy = HOME_COPY[locale];
  const ui = UI_COPY[locale];
  const { formatMoney } = useDisplayCurrency();
  const price = event.startingPrices.length > 1
    ? event.startingPrices.map((item) => `${item.amount === 0 ? copy.free : `${copy.from} ${formatMoney(item.amount, item.currency)}`} ${priceUnit(item.unit, locale)}`).join(" · ")
    : event.startingAmount === 0 ? copy.free : event.startingAmount === null ? null : `${copy.from} ${formatMoney(event.startingAmount, event.startingCurrency ?? "KZT")} ${priceUnit(event.startingUnit, locale)}`;
  const availability = copy.saleStatuses[event.saleStatus];
  return <article className="group relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-ticket-border bg-white dark:bg-ticket-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
    <Link className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600 dark:focus-visible:ring-ticket-accent" href={`/events/${event.id}`}>
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-indigo-100 dark:from-ticket-accent-soft via-white dark:via-ticket-surface to-amber-100 dark:to-ticket-warning-soft">
        {event.media?.find(asset => asset.isCard) ? <PublicFramedAsset asset={event.media.find(asset => asset.isCard)!} className="h-full w-full" /> : event.posterUrl ? <img alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" src={event.posterUrl} /> : <div aria-hidden="true" className="flex h-full items-end p-5"><span className="text-3xl font-semibold text-indigo-900 dark:text-ticket-accent">{event.title.slice(0, 1)}</span></div>}
        <span className="absolute left-4 top-4 rounded-full bg-white/90 dark:bg-ticket-surface/90 px-3 py-1 text-xs font-semibold text-zinc-800 dark:text-ticket-text shadow-sm">{event.category ? copy.categories[event.category] : ""}</span>
        <AgeRestrictionBadge age={event.ageRestriction} className="absolute bottom-3 right-4" />
      </div>
      <div className="p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-indigo-700 dark:text-ticket-accent">{formatLocalDate(event.date, locale)}</p>
        <p className="mt-1 text-sm font-medium text-zinc-600 dark:text-ticket-muted">{event.time} · {event.timezone}</p>
        <h3 className="mt-3 line-clamp-2 text-xl font-semibold leading-tight group-hover:text-indigo-700 dark:group-hover:text-ticket-accent">{event.title}</h3>
        <p className="mt-3 truncate text-sm text-zinc-600 dark:text-ticket-muted">{event.city} · {event.address}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full bg-indigo-50 dark:bg-ticket-accent-soft px-2.5 py-1 font-semibold text-indigo-800 dark:text-ticket-accent">{event.paymentMode === "deposit" ? copy.deposit : ui.fullPayment}</span>{price ? <span className="font-semibold text-zinc-900 dark:text-ticket-text">{price}</span> : <span className="font-semibold text-zinc-700 dark:text-ticket-muted">{event.saleStatus === "sold_out" || event.saleStatus === "sales_ended" || event.saleStatus === "temporarily_unavailable" ? availability : copy.priceUnknown}</span>}</div>
        <div className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold"><span className={event.saleStatus === "sold_out" || event.saleStatus === "sales_ended" ? "text-red-700 dark:text-ticket-danger" : event.saleStatus === "few_left" ? "text-amber-700 dark:text-ticket-warning" : "text-emerald-700 dark:text-ticket-success"}>{availability}</span><span className="text-zinc-500 dark:text-ticket-muted">{availabilityCount(event, locale)}</span></div>
      </div>
    </Link>
    <FavoriteButton eventId={event.id} />
  </article>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-zinc-300 dark:border-ticket-border bg-white dark:bg-ticket-surface p-10 text-center"><h2 className="text-xl font-semibold">{title}</h2>{description ? <p className="mx-auto mt-2 max-w-md text-zinc-600 dark:text-ticket-muted">{description}</p> : null}{action ? <div className="mt-5">{action}</div> : null}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const copy = UI_COPY[useLocale()];
  return <div className="rounded-2xl border border-red-200 dark:border-ticket-danger-border bg-red-50 dark:bg-ticket-danger-soft p-5 text-red-900 dark:text-ticket-danger"><p>{message}</p>{onRetry ? <button className="mt-3 rounded-xl border border-red-300 dark:border-ticket-danger-border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 dark:focus-visible:ring-ticket-danger-border" onClick={onRetry} type="button">{copy.retry}</button> : null}</div>;
}

export function LoadingGrid({ count = 6 }: { count?: number }) {
  const copy = UI_COPY[useLocale()];
  return <div aria-label={copy.loading} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: count }, (_, index) => <div aria-hidden="true" className="overflow-hidden rounded-3xl border border-zinc-200 dark:border-ticket-border bg-white dark:bg-ticket-surface" key={index}><div className="aspect-[16/9] animate-pulse bg-zinc-200 dark:bg-ticket-raised" /><div className="space-y-3 p-5"><div className="h-5 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-ticket-raised" /><div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-ticket-raised" /></div></div>)}</div>;
}

function priceUnit(unit: PublicEventSummary["startingUnit"], locale: EventLocale): string { const copy = HOME_COPY[locale]; return unit === "table" ? copy.tableUnit : unit === "seat" ? copy.seatUnit : copy.ticketUnit; }

function formatLocalDate(value: string, locale: EventLocale): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function availabilityCount(event: PublicEventSummary, locale: EventLocale): string {
  if (event.saleStatus === "sold_out" || event.saleStatus === "sales_ended" || event.saleStatus === "temporarily_unavailable") return "";
  const labels: string[] = [];
  const copy = UI_COPY[locale];
  if (event.remainingTickets > 0) labels.push(`${event.remainingTickets} ${copy.tickets}`);
  if (event.remainingTables > 0) labels.push(`${event.remainingTables} ${copy.tables}`);
  if (event.remainingSeats > 0) labels.push(`${event.remainingSeats} ${copy.seats}`);
  return labels.join(" · ");
}
