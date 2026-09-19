"use client";

import { EVENT_CATEGORIES, ru, type EventCategory, type PublicEventSummary } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { FavoriteButton } from "../components/favorite-button";
import { ErrorState } from "../components/ui";
import { fetchPublicEvents } from "../lib/public-events";

const CITY_OPTIONS = ["Алматы", "Астана", "Шымкент"];
const REFERENCE_POSTERS = Array.from({ length: 9 }, (_, index) => `/reference-events/event-${index + 1}.jpg`);
const CATEGORY_ICONS: Record<EventCategory, string> = { music: "♪", nightlife: "✦", festival: "✺", comedy: "☻", theatre: "◉", business: "▦", education: "⌁", workshop: "✎", sport: "◆", family: "♡", food: "◇", other: "＋" };

export default function HomePage() {
  const [events, setEvents] = useState<PublicEventSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("Алматы");

  useEffect(() => {
    let active = true;
    setEvents(null);
    setError(false);
    void Promise.allSettled([
      fetchPublicEvents({ sort: "popular", limit: 12, city: city || undefined }),
      fetchPublicEvents({ sort: "recent", limit: 12, city: city || undefined }),
    ]).then((results) => {
      if (!active) return;
      const successful = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (successful.length === 0) { setError(true); return; }
      const unique = new Map<string, PublicEventSummary>();
      for (const result of successful) for (const event of result.items) unique.set(event.id, event);
      setEvents([...unique.values()]);
      setTotal(Math.max(...successful.map((result) => result.total), unique.size));
    });
    return () => { active = false; };
  }, [city]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (city) params.set("city", city);
    window.location.assign(`/events?${params.toString()}`);
  }

  const featured = events?.[0] ?? null;
  const catalog = useMemo(() => events?.slice(featured ? 1 : 0, 9) ?? [], [events, featured]);

  return <main className="min-h-screen bg-[#f9f9ff] text-[#151c27]">
    <section className="relative overflow-hidden bg-[#f0f3ff] px-4 py-9 sm:px-8 lg:px-10 lg:py-11">
      <div className="pointer-events-none absolute -right-32 -top-40 h-96 w-96 rounded-full bg-[#d3bbff]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-[#dce2f7]/60 blur-3xl" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]"><span>Культурная афиша сезона</span><span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#7b7485]" /><span className="inline-flex items-center gap-1.5 rounded bg-[#e7eefe] px-2 py-1 text-[#151c27]"><span className="h-2 w-2 rounded-full bg-[#0c7550]" />{total || "—"} событий онлайн</span></div>
            <h1 className="mt-3 max-w-4xl text-[2rem] font-bold leading-[1.15] tracking-[-0.03em] sm:text-5xl">Афиша событий в {city || "Казахстане"}</h1>
          </div>
          <label className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 shadow-sm"><PinIcon /><span className="text-sm text-[#4a4453]">Локация:</span><select className="cursor-pointer bg-transparent text-base font-bold outline-none" onChange={(event) => setCity(event.target.value)} value={city}><option value="">Все города</option>{CITY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
        </div>

        <form className="mt-6 flex flex-col gap-2 rounded-xl bg-white p-1.5 shadow-sm md:flex-row" onSubmit={submit}>
          <label className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5"><SearchIcon /><span className="sr-only">Поиск событий</span><input className="w-full bg-transparent text-[15px] outline-none placeholder:text-[#77717f]" maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder="Найти концерт, спектакль или вечеринку..." value={search} /></label>
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#5b21b6] px-6 font-semibold text-white transition hover:bg-[#420093] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc] focus-visible:ring-offset-2" type="submit"><TuneIcon />Искать</button>
        </form>

        <nav aria-label="Категории событий" className="mt-5 flex gap-2 overflow-x-auto pb-1">
          <Link className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#151c27] px-4 py-2 text-sm font-semibold text-white shadow-sm" href="/events"><span aria-hidden="true">▦</span>Все{total ? <span className="rounded bg-white/15 px-1.5 font-mono text-[11px]">{total}</span> : null}</Link>
          {EVENT_CATEGORIES.slice(0, 7).map((category) => <Link className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-[#4a4453] shadow-sm transition hover:bg-[#e7eefe] hover:text-[#151c27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc]" href={`/events?category=${category}${city ? `&city=${encodeURIComponent(city)}` : ""}`} key={category}><span aria-hidden="true" className="text-base text-[#713dcc]">{CATEGORY_ICONS[category]}</span>{ru.events.categories[category]}</Link>)}
        </nav>
      </div>
    </section>

    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 lg:px-10">
      {error ? <ErrorState message={ru.publicEvent.loadFailed} onRetry={() => window.location.reload()} /> : null}
      {!events && !error ? <HomeSkeleton /> : null}
      {events ? <>
        {featured ? <FeaturedEvent event={featured} /> : <EmptyCatalog />}
        <CatalogFilters city={city} />
        {catalog.length > 0 ? <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="text-2xl font-bold tracking-[-0.015em]">Актуальные события</h2><span className="rounded-full bg-[#e2e8f8] px-2.5 py-1 font-mono text-xs font-semibold text-[#4a4453]">{catalog.length}</span></div><p className="inline-flex items-center gap-2 text-sm text-[#4a4453]"><span className="h-2 w-2 rounded-full bg-[#68dba9]" />Живое бронирование мест</p></div>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{catalog.map((event, index) => <CatalogEventCard event={event} index={index + 1} key={event.id} />)}</div>
          <div className="mt-9 flex justify-center"><Link className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-[#ccc3d6] bg-white px-6 font-semibold transition hover:border-[#713dcc] hover:text-[#581db3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc]" href="/events">Все мероприятия <ArrowIcon /></Link></div>
        </section> : null}
      </> : null}
    </div>
    <HomeFooter />
  </main>;
}

function FeaturedEvent({ event }: { event: PublicEventSummary }) {
  return <article className="relative overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(37,0,89,0.08)]"><div className="grid min-h-[390px] lg:grid-cols-12"><div className="relative z-10 order-2 flex flex-col justify-between p-6 sm:p-10 lg:order-1 lg:col-span-7"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-[#5b21b6] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">Выбор редакции</span><AvailabilityBadge status={event.saleStatus} /><span className="font-mono text-sm text-[#4a4453]">{ru.events.categories[event.category]}</span></div><h2 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-[-0.025em] sm:text-4xl">{event.title}</h2>{event.announcement ? <p className="mt-4 max-w-2xl text-[15px] leading-6 text-[#4a4453]">{event.announcement}</p> : null}</div><div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><CalendarIcon />{formatEventDate(event)}<span className="text-[#7b7485]">·</span>{event.venueName}</p><p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">{event.paymentMode === "deposit" ? "Депозит" : "Билеты"}</p><p className="text-2xl font-bold text-[#581db3]">{formatPrice(event)}</p></div><Link className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#5b21b6] px-6 font-semibold text-white transition hover:bg-[#420093] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc] focus-visible:ring-offset-2" href={`/events/${event.id}`}>Выбрать места <ArrowIcon /></Link></div></div><div className="relative order-1 min-h-64 overflow-hidden bg-[#dce2f3] lg:order-2 lg:col-span-5 lg:min-h-full"><PosterImage alt="" fallbackIndex={0} src={event.posterUrl} /><div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/75 via-transparent lg:bg-gradient-to-r lg:from-white lg:via-transparent" /></div></div><FavoriteButton eventId={event.id} /></article>;
}

function CatalogFilters({ city }: { city: string }) {
  return <section className="mt-6 rounded-xl bg-white p-4 shadow-sm" aria-label="Быстрые фильтры"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">Дата:</span><FilterLink href="/events" active>Все даты</FilterLink><FilterLink href="/events?datePreset=today">Сегодня</FilterLink><FilterLink href="/events?datePreset=weekend">На выходных</FilterLink><FilterLink href="/events">Календарь</FilterLink></div><div className="flex flex-wrap items-center gap-4"><div className="flex items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">Оплата:</span><div className="flex rounded-lg bg-[#f0f3ff] p-0.5"><FilterLink href="/events" active>Любая цена</FilterLink><FilterLink href="/events?free=true">Бесплатные</FilterLink><FilterLink href="/events?paymentMode=deposit">Депозит</FilterLink></div></div><label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">Сортировка:<select className="rounded-lg bg-[#f0f3ff] px-3 py-2 text-sm font-medium normal-case tracking-normal text-[#151c27] outline-none" defaultValue="popular" onChange={(event) => window.location.assign(`/events?sort=${event.target.value}`)}><option value="popular">По популярности</option><option value="recent">Сначала новые</option></select></label></div></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eef0f8] pt-3 text-sm"><span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">Применено:</span>{city ? <span className="rounded-md bg-[#e7eefe] px-2.5 py-1">Город: {city}</span> : null}<span className="rounded-md bg-[#d9dff5] px-2.5 py-1 text-[#5c6274]">Все события</span><Link className="ml-auto font-semibold text-[#581db3] hover:underline" href="/events">Сбросить все</Link></div></section>;
}

function FilterLink({ href, active = false, children }: { href: string; active?: boolean; children: ReactNode }) { return <Link className={`rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-[#e2e8f8] font-semibold text-[#151c27] shadow-sm" : "text-[#4a4453] hover:bg-[#f0f3ff] hover:text-[#151c27]"}`} href={href}>{children}</Link>; }

function CatalogEventCard({ event, index }: { event: PublicEventSummary; index: number }) {
  return <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><Link className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#713dcc]" href={`/events/${event.id}`}><div className="relative aspect-[4/3] overflow-hidden bg-[#dce2f3]"><PosterImage alt="" fallbackIndex={index} src={event.posterUrl} /><div className="absolute left-2 top-2"><AvailabilityBadge status={event.saleStatus} /></div><span className="absolute bottom-2 left-2 max-w-[75%] truncate rounded bg-white/90 px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] backdrop-blur">{ru.events.categories[event.category]}</span></div><div className="flex flex-1 flex-col justify-between gap-4 p-4"><div><p className="flex items-center gap-1.5 font-mono text-xs text-[#4a4453]"><CalendarIcon />{formatEventDate(event)}</p><h3 className="mt-2 line-clamp-2 text-lg font-bold leading-6 transition group-hover:text-[#581db3]">{event.title}</h3><p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-[#4a4453]"><PinIcon /><span className="truncate">{event.venueName}</span></p></div><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">{event.paymentMode === "deposit" ? "Депозит" : "Стоимость"}</p><p className="mt-0.5 font-bold">{formatPrice(event)}</p></div><span className="rounded-lg bg-[#e7eefe] px-3 py-2 text-sm font-semibold transition group-hover:bg-[#5b21b6] group-hover:text-white">Билеты</span></div></div></Link><FavoriteButton eventId={event.id} /></article>;
}

function AvailabilityBadge({ status }: { status: PublicEventSummary["saleStatus"] }) { const styles = status === "few_left" ? "bg-[#ffdad6] text-[#93000a]" : status === "available" ? "bg-[#005439] text-white" : "bg-[#e2e8f8] text-[#4a4453]"; return <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${styles}`}>{ru.publicEvent.saleStatuses[status]}</span>; }

function PosterImage({ src, fallbackIndex, alt }: { src: string | null; fallbackIndex: number; alt: string }) { const fallback = REFERENCE_POSTERS[fallbackIndex % REFERENCE_POSTERS.length] ?? REFERENCE_POSTERS[0]!; const [source, setSource] = useState(src || fallback); useEffect(() => setSource(src || fallback), [src, fallback]); return <img alt={alt} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" onError={() => setSource(fallback)} src={source} />; }

function EmptyCatalog() { return <div className="rounded-2xl bg-white p-10 text-center shadow-sm"><h2 className="text-2xl font-bold">События скоро появятся</h2><p className="mt-2 text-[#4a4453]">Пока можно посмотреть всю афишу или изменить город.</p><Link className="mt-5 inline-flex rounded-lg bg-[#5b21b6] px-5 py-3 font-semibold text-white" href="/events">Открыть афишу</Link></div>; }
function HomeSkeleton() { return <div aria-label="Загрузка событий" className="space-y-6"><div className="h-[390px] animate-pulse rounded-2xl bg-[#e2e8f8]" /><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-80 animate-pulse rounded-xl bg-[#e2e8f8]" key={index} />)}</div></div>; }
function HomeFooter() { return <footer className="mt-14 border-t border-[#e2e8f8] bg-white"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-10"><div><p className="text-lg font-extrabold tracking-tight text-[#581db3]">TICKET</p><p className="mt-3 max-w-xs leading-6 text-[#4a4453]">События, билеты и любимые места — в одном понятном сервисе.</p></div><FooterColumn title="Гостям" links={[["Афиша", "/events"], ["Избранное", "/favorites"], ["Мои мероприятия", "/my-events"]]} /><FooterColumn title="Организаторам" links={[["Кабинет организатора", "/organizer/events"], ["Создать мероприятие", "/organizer/events/new"]]} /><div><p className="font-bold">Помощь</p><p className="mt-3 leading-6 text-[#4a4453]">Билеты также доступны в Telegram после подтверждённой покупки.</p></div></div><div className="border-t border-[#eef0f8] px-4 py-5 text-center text-xs text-[#77717f]">© 2026 TICKET. Все права защищены.</div></footer>; }
function FooterColumn({ title, links }: { title: string; links: [string, string][] }) { return <div><p className="font-bold">{title}</p><ul className="mt-3 space-y-2 text-[#4a4453]">{links.map(([label, href]) => <li key={href}><Link className="hover:text-[#581db3] hover:underline" href={href}>{label}</Link></li>)}</ul></div>; }

function formatPrice(event: PublicEventSummary): string { if (event.startingAmount === null) return "Цена уточняется"; if (event.startingAmount === 0) return "Бесплатно"; const currency = event.startingCurrency === "KZT" || !event.startingCurrency ? "₸" : event.startingCurrency; return `от ${(event.startingAmount / 100).toLocaleString("ru-RU")} ${currency}`; }
function formatEventDate(event: PublicEventSummary): string { const date = new Date(`${event.date}T00:00:00Z`); const formatted = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(date); return `${formatted}, ${event.time.slice(0, 5)}`; }

function SearchIcon() { return <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-[#4a4453]" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>; }
function TuneIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M10 14v6" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>; }
function PinIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#713dcc]" fill="none" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2"/></svg>; }
function CalendarIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#713dcc]" fill="none" viewBox="0 0 24 24"><rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5"/><path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>; }
function ArrowIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>; }
