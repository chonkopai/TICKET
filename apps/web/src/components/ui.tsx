import { ru, type PublicEventSummary } from "@event-platform/shared-types";
import Link from "next/link";
import type { ReactNode } from "react";

import { FavoriteButton } from "./favorite-button";

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto min-h-screen w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12 ${className}`}>{children}</main>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {description ? <p className="mt-3 max-w-2xl text-zinc-600">{description}</p> : null}
    </div>
    {action}
  </div>;
}

export function EventCard({ event }: { event: PublicEventSummary }) {
  const price = event.startingAmount === 0 ? ru.publicEvent.freePrice : event.startingAmount === null ? null : `${ru.publicEvent.fromPrice} ${formatMoney(event.startingAmount, event.startingCurrency ?? "KZT")}`;
  const availability = ru.publicEvent.saleStatuses[event.saleStatus];
  return <article className="group relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
    <Link className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600" href={`/events/${event.id}`}>
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-indigo-100 via-white to-amber-100">
        {event.posterUrl ? <img alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" src={event.posterUrl} /> : <div aria-hidden="true" className="flex h-full items-end p-5"><span className="text-3xl font-semibold text-indigo-900">{event.title.slice(0, 1)}</span></div>}
        <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm">{event.category ? ru.events.categories[event.category] : ""}</span>
      </div>
      <div className="p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-indigo-700">{formatLocalDate(event.date)}</p>
        <p className="mt-1 text-sm font-medium text-zinc-600">{event.time} · {event.timezone}</p>
        <h3 className="mt-3 line-clamp-2 text-xl font-semibold leading-tight group-hover:text-indigo-700">{event.title}</h3>
        <p className="mt-3 truncate text-sm text-zinc-600">{event.city} · {event.venueName}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-800">{event.paymentMode === "deposit" ? ru.checkout.deposit : ru.checkout.fullPayment}</span>{price ? <span className="font-semibold text-zinc-900">{price}</span> : <span className="font-semibold text-zinc-700">{ru.publicEvent.priceUnavailable}</span>}</div>
        <div className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold"><span className={event.saleStatus === "sold_out" || event.saleStatus === "sales_ended" ? "text-red-700" : event.saleStatus === "few_left" ? "text-amber-700" : "text-emerald-700"}>{availability}</span><span className="text-zinc-500">{availabilityCount(event)}</span></div>
      </div>
    </Link>
    <FavoriteButton eventId={event.id} />
  </article>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center"><h2 className="text-xl font-semibold">{title}</h2>{description ? <p className="mx-auto mt-2 max-w-md text-zinc-600">{description}</p> : null}{action ? <div className="mt-5">{action}</div> : null}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900"><p>{message}</p>{onRetry ? <button className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700" onClick={onRetry} type="button">Повторить</button> : null}</div>;
}

export function LoadingGrid({ count = 6 }: { count?: number }) {
  return <div aria-label="Загрузка" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: count }, (_, index) => <div aria-hidden="true" className="overflow-hidden rounded-3xl border border-zinc-200 bg-white" key={index}><div className="aspect-[16/9] animate-pulse bg-zinc-200" /><div className="space-y-3 p-5"><div className="h-5 w-3/4 animate-pulse rounded bg-zinc-200" /><div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100" /></div></div>)}</div>;
}

function formatMoney(value: number, currency: string): string {
  return `${(value / 100).toLocaleString("ru-RU")} ${currency}`;
}

function formatLocalDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function availabilityCount(event: PublicEventSummary): string {
  if (event.saleStatus === "sold_out" || event.saleStatus === "sales_ended") return "";
  const labels: string[] = [];
  if (event.remainingTickets > 0) labels.push(`${event.remainingTickets} ${ru.publicEvent.availability.tickets}`);
  if (event.remainingTables > 0) labels.push(`${event.remainingTables} ${ru.publicEvent.availability.tables}`);
  return labels.join(" · ");
}
