"use client";

import { ru, type PublicEvent, type PublicVenueLayout, type PublicVenueSeat } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FavoriteButton } from "../../../components/favorite-button";
import { rememberRecentlyViewed } from "../../../lib/local-preferences";
import { CheckoutPanel } from "./checkout-panel";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const FALLBACK_IMAGES = ["/reference-events/event-1.jpg", "/reference-events/event-4.jpg", "/reference-events/event-6.jpg"];

export default function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [layout, setLayout] = useState<PublicVenueLayout | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void params.then(async ({ id }) => {
      const eventResponse = await fetch(`/api/events/${encodeURIComponent(id)}`);
      if (!eventResponse.ok) throw new Error("EVENT_NOT_FOUND");
      const nextEvent = await eventResponse.json() as PublicEvent;
      const nextLayout = await fetch(`/api/events/${encodeURIComponent(id)}/venue-layout`)
        .then((response) => response.ok ? response.json() as Promise<PublicVenueLayout | null> : null)
        .catch(() => null);
      if (active) { setEvent(nextEvent); setLayout(nextLayout); rememberRecentlyViewed(nextEvent.id); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [params]);

  async function share(): Promise<void> {
    if (navigator.share) { await navigator.share(event ? { title: event.title, url: window.location.href } : { url: window.location.href }).catch(() => undefined); return; }
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (error) return <main className="mx-auto min-h-screen max-w-4xl px-5 py-16"><div className="rounded-2xl bg-white p-10 text-center shadow-sm"><h1 className="text-2xl font-bold">{ru.publicEvent.notFound}</h1><Link className="mt-5 inline-flex rounded-lg bg-[#5b21b6] px-5 py-3 font-semibold text-white" href="/">Вернуться в афишу</Link></div></main>;
  if (!event) return <EventPageSkeleton />;

  const hasHall = Boolean(layout && (layout.tables.length > 0 || layout.rows.length > 0 || (layout.layoutJson.version === 2 && (layout.layoutJson.editor?.objects.length ?? 0) > 0)));
  const hero = resolveMedia(event.posterUrl, FALLBACK_IMAGES[0]!);

  return <main className="min-h-screen bg-[#f9f9ff] text-[#151c27]">
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-8 lg:px-10">
      <nav aria-label="Хлебные крошки" className="mb-5 flex items-center gap-2 text-sm text-[#4a4453]"><Link className="hover:text-[#581db3] hover:underline" href="/">Афиша</Link><span aria-hidden="true">/</span><span className="truncate">{event.title}</span></nav>

      <section className="relative min-h-[420px] overflow-hidden rounded-2xl bg-[#151c27] shadow-[0_12px_34px_rgba(37,0,89,0.14)]">
        <img alt="" className="absolute inset-0 h-full w-full object-cover" onError={(image) => { image.currentTarget.src = FALLBACK_IMAGES[0]!; }} src={hero} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#121824]/95 via-[#121824]/70 to-[#121824]/10" />
        <div className="relative flex min-h-[420px] max-w-4xl flex-col justify-end p-6 text-white sm:p-10 lg:p-12">
          <div className="mb-auto flex flex-wrap gap-2"><span className="rounded bg-[#5b21b6] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]">{ru.events.categories[event.category]}</span><span className="rounded bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] backdrop-blur">{event.city}</span>{hasHall ? <span className="rounded bg-[#85f8c4] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#003b27]">Выбор мест на схеме</span> : null}</div>
          <h1 className="max-w-4xl text-4xl font-bold leading-[1.08] tracking-[-0.035em] sm:text-5xl lg:text-6xl">{event.title}</h1>
          {event.announcement ? <p className="mt-4 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">{event.announcement}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold"><MetaChip icon="calendar">{formatEventDate(event)}</MetaChip><MetaChip icon="pin">{event.venueName}</MetaChip><MetaChip icon="clock">{event.timezone}</MetaChip></div>
        </div>
        <div className="absolute right-16 top-4 flex gap-2"><button aria-label="Поделиться" className="flex h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-semibold text-[#151c27] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3bbff]" onClick={() => void share()} type="button"><ShareIcon />{copied ? "Ссылка скопирована" : <span className="hidden sm:inline">Поделиться</span>}</button></div>
        <FavoriteButton eventId={event.id} />
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <ContentCard icon="spark" title="О событии"><RichText text={event.description ?? event.announcement} /></ContentCard>
          <Gallery event={event} />
        </div>
        <CheckoutPanel event={event} layout={layout} selectedSeatIds={selectedSeatIds} onClearSeats={() => setSelectedSeatIds([])} />
      </div>

      {hasHall && layout ? <VenueSection layout={layout} selectedSeatIds={selectedSeatIds} onChange={setSelectedSeatIds} /> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ProgramCard text={event.program} eventTime={event.time} />
        <LocationCard event={event} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6"><TermsCard event={event} /></div>
        <OrganizerCard event={event} />
      </div>
    </div>
  </main>;
}

function VenueSection({ layout, selectedSeatIds, onChange }: { layout: PublicVenueLayout; selectedSeatIds: string[]; onChange: (ids: string[]) => void }) {
  const selected = new Set(selectedSeatIds);
  const json = layout.layoutJson;
  const isV2 = json.version === 2;
  const width = isV2 ? json.room.widthM : json.canvas.width;
  const height = isV2 ? json.room.heightM : json.canvas.height;
  const toggle = (seat: PublicVenueSeat | (PublicVenueLayout["tables"][number]["seatRecords"][number])) => {
    if (seat.availability !== "available") return;
    if (selected.has(seat.id)) onChange(selectedSeatIds.filter((id) => id !== seat.id));
    else if (selectedSeatIds.length < 10) onChange([...selectedSeatIds, seat.id]);
  };
  const selectedLabels = selectedSeatIds.map((id) => {
    const canonical = layout.seats?.find((seat) => seat.id === id);
    if (canonical) return { id, label: canonical.label };
    for (const table of layout.tables) {
      const seat = table.seatRecords.find((item) => item.id === id);
      if (seat) return { id, label: `Стол ${table.number} · место ${seat.number}` };
    }
    for (const row of layout.rows) {
      const seat = row.seats.find((item) => item.id === id);
      if (seat) return { id, label: `Ряд ${row.number} · место ${seat.number}` };
    }
    return { id, label: "Выбранное место" };
  });

  return <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce2f3] bg-white shadow-sm" id="venue-plan">
    <div className="flex flex-col justify-between gap-4 border-b border-[#e2e8f8] p-5 sm:flex-row sm:items-center sm:p-7"><div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#581db3]">Интерактивная схема</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.02em]">Выберите места в зале</h2><p className="mt-1 text-sm text-[#4a4453]">Можно выбрать до 10 мест. Доступность проверяется при оформлении.</p></div><div className="flex flex-wrap gap-3 text-xs text-[#4a4453]"><Legend color="#713dcc" label="Свободно" /><Legend color="#5b21b6" label="Выбрано" /><Legend color="#dce2f3" label="Недоступно" /></div></div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="overflow-auto bg-[#f0f3ff] p-4 sm:p-8"><svg aria-label="Схема зала" className="mx-auto min-w-[620px] rounded-2xl bg-white shadow-inner" role="img" viewBox={`0 0 ${width} ${height}`}>
        {isV2 && json.editor ? [...json.editor.objects].sort((a,b) => a.zIndex - b.zIndex || (a.type === "seat" ? 1 : 0) - (b.type === "seat" ? 1 : 0)).map((object) => {
          const seat = layout.seats?.find((s) => s.id === object.id);
          const color = object.colorOverride ? object.color : json.editor!.tariffs.find((t) => t.id === object.tariffId)?.color ?? object.color;
          return <g key={object.id} transform={`translate(${object.x} ${object.y}) rotate(${object.rotation})`}>
            {object.type === "seat" ? seat ? <SeatNode cx={0} cy={0} number={seat.number} available={seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={.225} /> : null : object.type === "zone" ? <polygon points={object.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={color} fillOpacity={object.opacity} stroke={color} strokeWidth={.03} /> : object.type === "table_round" ? <circle r={object.width / 2} fill="white" stroke={color} strokeWidth={.03} /> : object.type === "row" ? null : <rect x={-object.width/2} y={-object.height/2} width={object.width} height={object.height} rx={.1} fill={object.type === "prop" || object.type === "entrance" ? color : "white"} stroke={color} strokeWidth={.03} />}
            {object.type !== "seat" && <text textAnchor="middle" y={object.type === "row" ? -.4 : .1} fontSize={.25} fill={object.type === "prop" || object.type === "entrance" ? "white" : "#202632"}>{object.name}</text>}
          </g>;
        }) : null}
        {isV2 && !json.editor && json.stage ? <g transform={`rotate(${json.stage.rotation ?? 0} ${json.stage.x + json.stage.width / 2} ${json.stage.y + json.stage.height / 2})`}><rect fill="#151c27" height={json.stage.height} rx="0.25" width={json.stage.width} x={json.stage.x} y={json.stage.y} /><text fill="white" fontSize="0.38" fontWeight="700" textAnchor="middle" x={json.stage.x + json.stage.width / 2} y={json.stage.y + json.stage.height / 2 + 0.12}>{json.stage.label}</text></g> : null}
        {!(isV2 && json.editor) && json.tables.map((geometry) => {
          const table = layout.tables.find((item) => item.id === geometry.tableId);
          if (!table) return null;
          const available = table.status === "available";
          const rx = "shape" in geometry && geometry.shape === "round" ? geometry.width / 2 : 0.22;
          return <g key={table.id} transform={`rotate(${geometry.rotation ?? 0} ${geometry.x + geometry.width / 2} ${geometry.y + geometry.height / 2})`}><rect fill={available ? "#f0f3ff" : "#e2e8f8"} height={geometry.height} rx={rx} stroke={available ? "#713dcc" : "#a8adbb"} strokeWidth={isV2 ? 0.06 : 2} width={geometry.width} x={geometry.x} y={geometry.y} /><text fill="#151c27" fontSize={isV2 ? 0.34 : 16} fontWeight="700" textAnchor="middle" x={geometry.x + geometry.width / 2} y={geometry.y + geometry.height / 2}>{`Стол ${table.number}`}</text>{isV2 && "seats" in geometry ? geometry.seats.map((spot) => { const seat = table.seatRecords.find((item) => item.number === spot.number); if (!seat) return null; const cx = geometry.x + geometry.width * spot.x / 100; const cy = geometry.y + geometry.height * spot.y / 100; return <SeatNode cx={cx} cy={cy} key={seat.id} number={seat.number} available={seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={0.24} />; }) : null}</g>;
        })}
        {isV2 && !json.editor ? json.rows.map((geometry) => { const row = layout.rows.find((item) => item.id === geometry.rowId); if (!row) return null; return <g key={row.id} transform={`rotate(${geometry.rotation ?? 0} ${geometry.x + geometry.width / 2} ${geometry.y + geometry.height / 2})`}><text fill="#4a4453" fontSize="0.3" fontWeight="700" x={geometry.x} y={geometry.y - 0.18}>{`Ряд ${row.number}`}</text>{row.seats.slice(0, geometry.seatCount).map((seat, index) => <SeatNode cx={geometry.x + (index + 0.5) * geometry.width / geometry.seatCount} cy={geometry.y + geometry.height / 2} key={seat.id} number={seat.number} available={seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={0.22} />)}</g>; }) : null}
      </svg></div>
      <div className="border-t border-[#e2e8f8] p-5 lg:border-l lg:border-t-0"><h3 className="font-bold">Ваш выбор</h3>{selectedSeatIds.length ? <><p className="mt-2 text-sm text-[#4a4453]">Выбрано мест: {selectedSeatIds.length}</p><div className="mt-4 flex flex-wrap gap-2">{selectedLabels.map((seat) => <span className="rounded-md bg-[#ebddff] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#581db3]" key={seat.id}>{seat.label}</span>)}</div><button className="mt-5 text-sm font-semibold text-[#581db3] hover:underline" onClick={() => onChange([])} type="button">Очистить выбор</button></> : <p className="mt-2 text-sm leading-6 text-[#4a4453]">Нажмите на свободное место на схеме. Выбранные места появятся здесь и в блоке оформления.</p>}<a className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#5b21b6] px-4 py-3 font-semibold text-white" href="#tickets">Перейти к оформлению</a></div>
    </div>
  </section>;
}

function SeatNode({ cx, cy, number, available, selected, onClick, size }: { cx: number; cy: number; number: number; available: boolean; selected: boolean; onClick: () => void; size: number }) { return <g aria-label={`Место ${number}${available ? "" : ", недоступно"}`} className={available ? "cursor-pointer" : "cursor-not-allowed"} onClick={onClick} role="button" tabIndex={available ? 0 : -1} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}><circle cx={cx} cy={cy} fill={selected ? "#5b21b6" : available ? "#d3bbff" : "#dce2f3"} r={size} stroke={selected ? "#250059" : available ? "#713dcc" : "#a8adbb"} strokeWidth={size / 5} /><text dominantBaseline="central" fill={selected ? "white" : "#151c27"} fontSize={size * 0.9} fontWeight="700" textAnchor="middle" x={cx} y={cy}>{number}</text></g>; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>; }

function ContentCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ebddff] text-[#581db3]">{icon === "spark" ? "✦" : "•"}</span><h2 className="text-2xl font-bold tracking-[-0.02em]">{title}</h2></div><div className="mt-5">{children}</div></section>; }
function RichText({ text }: { text: string | null }) { return text ? <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#4a4453]">{text}</p> : <p className="text-[#4a4453]">Описание скоро появится.</p>; }

function Gallery({ event }: { event: PublicEvent }) { const images = [resolveMedia(event.posterUrl, FALLBACK_IMAGES[0]!), FALLBACK_IMAGES[1]!, FALLBACK_IMAGES[2]!]; return <section className="rounded-2xl border border-[#dce2f3] bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-bold">Фотогалерея</h2><div className="mt-4 grid h-64 grid-cols-2 gap-2 sm:h-72 sm:grid-cols-3"><img alt="Атмосфера мероприятия" className="col-span-2 h-full w-full rounded-xl object-cover sm:col-span-2 sm:row-span-2" onError={(image) => { image.currentTarget.src = FALLBACK_IMAGES[0]!; }} src={images[0]} /><img alt="Деталь мероприятия" className="hidden h-full w-full rounded-xl object-cover sm:block" src={images[1]} /><img alt="Гости мероприятия" className="hidden h-full w-full rounded-xl object-cover sm:block" src={images[2]} /></div></section>; }

function ProgramCard({ text, eventTime }: { text: string | null; eventTime: string }) { const items = parseProgram(text, eventTime); return <section className="rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-3"><span className="text-[#713dcc]">◷</span><div><h2 className="text-2xl font-bold">Программа</h2><p className="text-sm text-[#4a4453]">Расписание события</p></div></div><ol className="relative mt-6 space-y-3 border-l-2 border-[#ebddff] pl-5">{items.map((item, index) => <li className="relative rounded-lg bg-[#f9f9ff] px-4 py-3" key={`${item.time}-${index}`}><span className="absolute -left-[27px] top-5 h-3 w-3 rounded-full bg-[#713dcc] ring-4 ring-white" /><div className="flex gap-3"><time className="shrink-0 font-mono text-sm font-bold text-[#581db3]">{item.time}</time><span className="text-sm font-semibold">{item.label}</span></div></li>)}</ol></section>; }

function LocationCard({ event }: { event: PublicEvent }) { return <section className="flex flex-col rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">Локация и проезд</h2><p className="mt-1 text-sm text-[#4a4453]">{event.venueName} · {event.address}</p></div><a className="rounded-lg bg-[#5b21b6] px-4 py-2 text-sm font-semibold text-white" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venueName}, ${event.address}`)}`} rel="noreferrer" target="_blank">Открыть карту</a></div><div className="relative mt-5 min-h-64 flex-1 overflow-hidden rounded-xl border border-[#dce2f3] bg-[#f0f3ff]"><div className="absolute inset-x-0 top-[30%] h-8 rotate-[-4deg] bg-white" /><div className="absolute bottom-[24%] left-0 right-0 h-6 rotate-[3deg] bg-white" /><div className="absolute bottom-0 left-[36%] top-0 w-7 rotate-[8deg] bg-white" /><div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5b21b6] text-xl text-white shadow-lg">●</span><span className="mt-2 rounded-lg bg-[#151c27] px-3 py-2 text-center text-xs font-semibold text-white shadow">{event.venueName}</span></div></div></section>; }

function TermsCard({ event }: { event: PublicEvent }) { const terms = [["Правила посещения", event.rules], ["Условия посещения", event.visitTerms], ["Условия отмены", event.cancellationTerms], ...(event.paymentMode === "deposit" ? [["Условия депозита", event.depositTerms]] : []), ["Дополнительные условия", event.extraConditions]] as [string, string | null][]; return <section className="rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm sm:p-8"><h2 className="text-2xl font-bold">Правила и условия</h2><div className="mt-4 divide-y divide-[#e2e8f8]">{terms.filter(([, text]) => text).map(([title, text]) => <details className="group py-4" key={title}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold"><span>{title}</span><span className="text-[#713dcc] transition group-open:rotate-45">＋</span></summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#4a4453]">{text}</p></details>)}</div></section>; }

function OrganizerCard({ event }: { event: PublicEvent }) { return <aside className="rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">Организатор</p><div className="mt-4 flex items-center gap-3">{event.organizer.photoUrl ? <img alt="" className="h-12 w-12 rounded-full object-cover" onError={(image) => { image.currentTarget.src = FALLBACK_IMAGES[2]!; }} src={resolveMedia(event.organizer.photoUrl, FALLBACK_IMAGES[2]!)} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ebddff] font-bold text-[#581db3]">{event.organizer.name?.slice(0, 1) || "T"}</span>}<div><h2 className="font-bold">{event.organizer.name || "Команда мероприятия"}</h2><p className="text-sm text-[#4a4453]">Подтверждённый организатор</p></div></div><p className="mt-4 text-sm text-[#4a4453]">{event.organizer.contact ?? ru.publicEvent.contactUnavailable}</p></aside>; }

function MetaChip({ icon, children }: { icon: "calendar" | "pin" | "clock"; children: React.ReactNode }) { return <span className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-2 backdrop-blur">{icon === "pin" ? "⌖" : icon === "clock" ? "◷" : "▣"}{children}</span>; }
function ShareIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="2"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" stroke="currentColor" strokeWidth="2"/></svg>; }

function parseProgram(value: string | null, fallbackTime: string): Array<{ time: string; label: string }> { if (!value) return [{ time: fallbackTime.slice(0, 5), label: "Начало мероприятия" }]; const chunks = value.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean); return chunks.slice(0, 8).map((part, index) => { const match = part.match(/^(\d{1,2}:\d{2})\s*[—–-]?\s*(.*)$/); return match ? { time: match[1]!, label: match[2] || "Этап программы" } : { time: index === 0 ? fallbackTime.slice(0, 5) : "—", label: part }; }); }
function formatEventDate(event: PublicEvent): string { const date = new Date(`${event.date}T00:00:00Z`); return `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date)}, ${event.time.slice(0, 5)}`; }
function resolveMedia(value: string | null, fallback: string): string { if (!value) return fallback; try { return new URL(value, API_URL).toString(); } catch { return fallback; } }
function EventPageSkeleton() { return <main className="mx-auto min-h-screen max-w-7xl animate-pulse px-4 py-8 sm:px-8"><div className="h-5 w-52 rounded bg-[#e2e8f8]" /><div className="mt-5 h-[420px] rounded-2xl bg-[#dce2f3]" /><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"><div className="h-96 rounded-2xl bg-[#e2e8f8]"/><div className="h-96 rounded-2xl bg-[#e2e8f8]"/></div></main>; }
