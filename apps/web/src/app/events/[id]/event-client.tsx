"use client";

import { INTL_LOCALES, localeFromBrowser } from "../../../lib/locale";

import { type EventLocale, type PublicEvent, type PublicVenueLayout, type PublicVenueSeat } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { FavoriteButton } from "../../../components/favorite-button";
import { useDisplayCurrency } from "../../../components/currency-provider";
import { FittedSvgText } from "../../../components/fitted-svg-text";
import { rememberRecentlyViewed } from "../../../lib/local-preferences";
import { CheckoutPanel } from "./checkout-panel";
import { ContentLanguageNote } from "../../../components/content-language-note";
import { useLocale } from "../../../components/locale-provider";
import { EVENT_COPY } from "./event-copy";
import { HOME_COPY } from "../../home-copy";

function useEventCopy() { return EVENT_COPY[useLocale()]; }

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const FALLBACK_IMAGES = ["/reference-events/event-1.jpg", "/reference-events/event-4.jpg", "/reference-events/event-6.jpg"];
type CartPrefill = { tickets?: Array<{ ticketTypeId: string; quantity: number }>; tableId?: string | null; seatIds?: string[] };

export default function PublicEventPage({ id }: { id: string }) {
  const copy = useEventCopy();
  const locale = useLocale();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [layout, setLayout] = useState<PublicVenueLayout | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [ticketQuantities, setTicketQuantities] = useState<Record<string, number>>({});
  const changeTicket = (id: string, quantity: number) => setTicketQuantities((current) => {
    const next = { ...current };
    if (quantity <= 0) delete next[id]; else next[id] = quantity;
    return next;
  });
  const [error, setError] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const eventResponse = await fetch(`/api/events/${encodeURIComponent(id)}?locale=${localeFromBrowser()}`);
      if (!eventResponse.ok) throw new Error("EVENT_NOT_FOUND");
      const nextEvent = await eventResponse.json() as PublicEvent;
      const nextLayout = await fetch(`/api/events/${encodeURIComponent(id)}/venue-layout`)
        .then((response) => response.ok ? response.json() as Promise<PublicVenueLayout | null> : null)
        .catch(() => null);
      if (active) {
        setEvent(nextEvent);
        setLayout(nextLayout);
        const search = new URLSearchParams(window.location.search);
        let cart: CartPrefill | null = null;
        try { cart = JSON.parse(search.get("cart") ?? "null") as CartPrefill | null; } catch { /* Ignore malformed shared link. */ }
        const retained = Array.isArray(cart?.seatIds) ? cart.seatIds : search.get("seats")?.split(",") ?? [];
        if (retained.length <= 10 && nextLayout?.seats) setSelectedSeatIds(retained.filter((seatId) => nextLayout.seats?.some((seat) => seat.id === seatId && seat.availability === "available")));
        if (cart?.tableId && nextEvent.tables.some((table) => table.id === cart.tableId && table.availability === "available")) setSelectedTableId(cart.tableId);
        if (Array.isArray(cart?.tickets)) setTicketQuantities(Object.fromEntries(cart.tickets.filter((entry) => nextEvent.ticketTypes.some((ticket) => ticket.id === entry.ticketTypeId && ticket.status === "active" && ticket.remaining >= entry.quantity) && Number.isInteger(entry.quantity) && entry.quantity >= 1 && entry.quantity <= 10).map((entry) => [entry.ticketTypeId, entry.quantity])));
        rememberRecentlyViewed(nextEvent.id);
      }
    })().catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [id]);

  async function share(): Promise<void> {
    if (navigator.share) { await navigator.share(event ? { title: event.title, url: window.location.href } : { url: window.location.href }).catch(() => undefined); return; }
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const refreshAvailability = useCallback(async (): Promise<void> => {
    if (!event) return;
    const [eventResponse, layoutResponse] = await Promise.all([
      fetch(`/api/events/${encodeURIComponent(event.id)}?locale=${localeFromBrowser()}`, { cache: "no-store" }),
      fetch(`/api/events/${encodeURIComponent(event.id)}/venue-layout`, { cache: "no-store" }),
    ]);
    if (eventResponse.status === 404) { setError(true); return; }
    if (!eventResponse.ok) throw new Error(copy.refreshFailed);
    const [nextEvent, nextLayout] = await Promise.all([eventResponse.json() as Promise<PublicEvent>, layoutResponse.ok ? layoutResponse.json() as Promise<PublicVenueLayout | null> : Promise.resolve(null)]);
    setEvent(nextEvent);
    setLayout(nextLayout);
    setSelectedSeatIds((current) => current.filter((id) => nextLayout?.seats?.some((seat) => seat.id === id && seat.availability === "available")));
    setSelectedTableId((current) => current && nextEvent.tables.some((table) => table.id === current && table.availability === "available") ? current : null);
    setTicketQuantities((current) => Object.fromEntries(Object.entries(current).filter(([id, quantity]) => nextEvent.ticketTypes.some((ticket) => ticket.id === id && ticket.status === "active" && ticket.remaining >= quantity))));
    setSyncError(false);
  }, [event?.id]);

  useEffect(() => {
    if (!event?.id || error) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let polling = false;
    const poll = async () => {
      if (!active || polling) return;
      polling = true;
      if (document.visibilityState === "visible") {
        try { await refreshAvailability(); failures = 0; }
        catch { failures = Math.min(3, failures + 1); if (active) setSyncError(true); }
      }
      polling = false;
      if (active) timer = setTimeout(poll, 30_000 * (failures + 1));
    };
    timer = setTimeout(poll, 30_000);
    const visible = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void poll(); } };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [event?.id, error, refreshAvailability]);

  if (error) return <main className="mx-auto min-h-screen max-w-4xl px-5 py-16"><div className="rounded-2xl bg-white p-10 text-center shadow-sm"><h1 className="text-2xl font-bold">{copy.notFound}</h1><Link className="mt-5 inline-flex rounded-lg bg-[#5b21b6] px-5 py-3 font-semibold text-white" href="/">{copy.returnToEvents}</Link></div></main>;
  if (!event) return <EventPageSkeleton />;

  const hasHall = Boolean(layout && (layout.tables.length > 0 || layout.rows.length > 0 || (layout.layoutJson.version === 2 && (layout.layoutJson.editor?.objects.length ?? 0) > 0)));
  const canChooseSeats = Boolean(layout && (layout.rows.length > 0 || layout.tables.some((table) => table.saleMode === "per_seat") || layout.seats?.some((seat) => !seat.tableId)));
  const hero = resolveMedia(event.posterUrl, FALLBACK_IMAGES[0]!);

  return <main className="min-h-screen bg-[#f9f9ff] text-[#151c27]">
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-8 lg:px-10">
      {syncError ? <div aria-live="polite" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{copy.syncFailed} <button className="font-bold underline" onClick={() => void refreshAvailability().catch(() => setSyncError(true))} type="button">{copy.retry}</button></div> : null}
      <nav aria-label={copy.breadcrumbs} className="mb-5 flex items-center gap-2 text-sm text-[#4a4453]"><Link className="hover:text-[#581db3] hover:underline" href="/">{copy.catalog}</Link><span aria-hidden="true">/</span><span className="truncate">{event.title}</span></nav>

      <section className="relative min-h-[420px] overflow-hidden rounded-2xl bg-[#151c27] shadow-[0_12px_34px_rgba(37,0,89,0.14)]">
        <img alt="" className="absolute inset-0 h-full w-full object-cover" onError={(image) => { image.currentTarget.src = FALLBACK_IMAGES[0]!; }} src={hero} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#121824]/95 via-[#121824]/70 to-[#121824]/10" />
        <div className="relative flex min-h-[420px] max-w-4xl flex-col justify-end p-6 text-white sm:p-10 lg:p-12">
          <div className="mb-auto flex flex-wrap gap-2"><span className="rounded bg-[#5b21b6] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]">{HOME_COPY[locale].categories[event.category]}</span><span className="rounded bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] backdrop-blur">{event.city}</span>{hasHall ? <span className="rounded bg-[#85f8c4] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#003b27]">{canChooseSeats ? copy.seatMapSelection : copy.hallMap}</span> : null}</div>
          <h1 className="max-w-4xl text-4xl font-bold leading-[1.08] tracking-[-0.035em] sm:text-5xl lg:text-6xl">{event.title}</h1>
          <div className="mt-3"><ContentLanguageNote contentLocale={event.contentLocale} /></div>
          {event.announcement ? <p className="mt-4 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">{event.announcement}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold"><MetaChip icon="calendar">{formatEventDate(event, locale)}</MetaChip><MetaChip icon="pin">{event.venueName}</MetaChip><MetaChip icon="clock">{event.timezone}</MetaChip></div>
        </div>
        <div className="absolute right-16 top-4 flex gap-2"><button aria-label={copy.share} className="flex h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-semibold text-[#151c27] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3bbff]" onClick={() => void share()} type="button"><ShareIcon />{copied ? copy.copied : <span className="hidden sm:inline">{copy.share}</span>}</button></div>
        <FavoriteButton eventId={event.id} />
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <ContentCard icon="spark" title={copy.about}><RichText text={event.description ?? event.announcement} /></ContentCard>
          <Gallery event={event} />
        </div>
        <CheckoutPanel event={event} layout={layout} selectedSeatIds={selectedSeatIds} selectedTableId={selectedTableId} onTableChange={setSelectedTableId} ticketQuantities={ticketQuantities} onTicketChange={changeTicket} onClearSeats={() => setSelectedSeatIds([])} onRefreshAvailability={refreshAvailability} />
      </div>

      {hasHall && layout ? <VenueSection layout={layout} event={event} paymentMode={event.paymentMode} canChooseSeats={canChooseSeats} selectedSeatIds={selectedSeatIds} onChange={setSelectedSeatIds} selectedTableId={selectedTableId} onTableChange={setSelectedTableId} ticketQuantities={ticketQuantities} onTicketChange={changeTicket} /> : null}

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

function VenueSection({ layout, event, paymentMode, canChooseSeats, selectedSeatIds, onChange, selectedTableId, onTableChange, ticketQuantities, onTicketChange }: { layout: PublicVenueLayout; event: PublicEvent; paymentMode: PublicEvent["paymentMode"]; canChooseSeats: boolean; selectedSeatIds: string[]; onChange: (ids: string[]) => void; selectedTableId: string | null; onTableChange: (id: string | null) => void; ticketQuantities: Record<string, number>; onTicketChange: (id: string, quantity: number) => void }) {
  const copy = useEventCopy();
  const { formatMoney } = useDisplayCurrency();
  const selected = new Set(selectedSeatIds);
  const [selectionError, setSelectionError] = useState("");
  const json = layout.layoutJson;
  const isV2 = json.version === 2;
  const width = isV2 ? json.room.widthM : json.canvas.width;
  const height = isV2 ? json.room.heightM : json.canvas.height;
  const dimensions = isV2 ? `${width.toFixed(1)} × ${height.toFixed(1)} ${copy.metres}` : `${width} × ${height} px`;
  const seatCount = layout.seats?.length ?? layout.rows.reduce((total, row) => total + row.seats.length, 0) + layout.tables.reduce((total, table) => total + table.seatRecords.length, 0);
  const initialZoom = seatCount > 300 ? 1.6 : 1;
  const [mapZoom, setMapZoom] = useState(initialZoom);
  const mapViewport = useRef<HTMLDivElement>(null);
  const zoomFocus = useRef<{ x: number; y: number; previous: number } | null>(null);
  const zoomValue = useRef(mapZoom);
  useEffect(() => {
    const viewport = mapViewport.current;
    if (!viewport) return;
    const focus = zoomFocus.current;
    zoomValue.current = mapZoom;
    const frame = requestAnimationFrame(() => {
      if (focus) {
        const ratio = mapZoom / focus.previous;
        viewport.scrollLeft = (viewport.scrollLeft + focus.x) * ratio - focus.x;
        viewport.scrollTop = (viewport.scrollTop + focus.y) * ratio - focus.y;
        zoomFocus.current = null;
      } else if (mapZoom === initialZoom) viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [mapZoom, initialZoom]);
  useEffect(() => {
    const viewport = mapViewport.current;
    if (!viewport) return;
    let pinch: { distance: number; zoom: number } | null = null;
    const distance = (touches: TouchList) => Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);
    const start = (event: TouchEvent) => { pinch = event.touches.length === 2 ? { distance: distance(event.touches), zoom: zoomValue.current } : null; };
    const move = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      const next = Math.max(.6, Math.min(3, Number((pinch.zoom * distance(event.touches) / pinch.distance).toFixed(2))));
      if (next === zoomValue.current) return;
      const bounds = viewport.getBoundingClientRect();
      zoomFocus.current = { x: (event.touches[0]!.clientX + event.touches[1]!.clientX) / 2 - bounds.left, y: (event.touches[0]!.clientY + event.touches[1]!.clientY) / 2 - bounds.top, previous: zoomValue.current };
      zoomValue.current = next;
      setMapZoom(next);
    };
    const end = (event: TouchEvent) => { if (event.touches.length < 2) pinch = null; };
    viewport.addEventListener("touchstart", start, { passive: true });
    viewport.addEventListener("touchmove", move, { passive: false });
    viewport.addEventListener("touchend", end);
    viewport.addEventListener("touchcancel", end);
    return () => { viewport.removeEventListener("touchstart", start); viewport.removeEventListener("touchmove", move); viewport.removeEventListener("touchend", end); viewport.removeEventListener("touchcancel", end); };
  }, []);
  const changeZoom = (next: number) => {
    const viewport = mapViewport.current;
    if (viewport) zoomFocus.current = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2, previous: mapZoom };
    setMapZoom(next);
  };
  const toggle = (seat: PublicVenueSeat | (PublicVenueLayout["tables"][number]["seatRecords"][number])) => {
    if (seat.availability !== "available") return;
    if (selected.has(seat.id)) { setSelectionError(""); onChange(selectedSeatIds.filter((id) => id !== seat.id)); return; }
    const firstSelected = layout.seats?.find((item) => item.id === selectedSeatIds[0]);
    const nextSeat = layout.seats?.find((item) => item.id === seat.id);
    if (firstSelected && nextSeat && firstSelected.currency !== nextSeat.currency) { setSelectionError(copy.mixedCurrencies); return; }
    if (selectedSeatIds.length < 10) { setSelectionError(""); onChange([...selectedSeatIds, seat.id]); }
  };
  const selectedLabels = selectedSeatIds.map((id) => {
    const canonical = layout.seats?.find((seat) => seat.id === id);
    if (canonical) return { id, label: canonical.rowId ? `${layout.rows.find((row) => row.id === canonical.rowId)?.name || `${copy.row} ${layout.rows.find((row) => row.id === canonical.rowId)?.number ?? ""}`} · ${copy.seat} ${canonical.number}` : canonical.tableId ? `${copy.table} ${layout.tables.find((table) => table.id === canonical.tableId)?.number ?? ""} · ${copy.seat} ${canonical.number}` : canonical.label, tariff: canonical.tariffName, amount: paymentMode === "deposit" ? canonical.deposit : canonical.price, currency: canonical.currency };
    for (const table of layout.tables) {
      const seat = table.seatRecords.find((item) => item.id === id);
      if (seat) return { id, label: `${copy.table} ${table.number} · ${copy.seat} ${seat.number}`, tariff: table.typeLabel, amount: paymentMode === "deposit" ? table.deposit : table.price, currency: table.currency };
    }
    for (const row of layout.rows) {
      const seat = row.seats.find((item) => item.id === id);
      if (seat) return { id, label: `${copy.row} ${row.number} · ${copy.seat} ${seat.number}`, tariff: row.typeLabel, amount: paymentMode === "deposit" ? row.deposit : row.price, currency: row.currency };
    }
    return { id, label: copy.selectedSeat, tariff: null, amount: null, currency: "" };
  });
  const chosenTable = selectedTableId ? event.tables.find((table) => table.id === selectedTableId) : null;
  const chosenZones = event.ticketTypes.filter((ticket) => (ticketQuantities[ticket.id] ?? 0) > 0);
  const chooseTable = (id: string) => { const table = event.tables.find((item) => item.id === id && item.saleMode === "whole_table" && item.availability === "available"); if (table) onTableChange(selectedTableId === id ? null : id); };
  const chooseZone = (id: string) => { const ticket = event.ticketTypes.find((item) => item.venueObjectId === id && item.status === "active" && item.remaining > 0); if (ticket) onTicketChange(ticket.id, (ticketQuantities[ticket.id] ?? 0) ? 0 : 1); };

  return <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce2f3] bg-white shadow-sm" id="venue-plan">
    <div className="flex flex-col justify-between gap-4 border-b border-[#e2e8f8] p-5 sm:flex-row sm:items-center sm:p-7"><div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#581db3]">{copy.interactiveMap}</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.02em]">{copy.chooseSeat}</h2><p className="mt-1 text-sm text-[#4a4453]">{copy.selectionHint}</p></div><div className="flex flex-col items-start gap-2 sm:items-end"><span className="rounded-lg bg-[#f0f3ff] px-3 py-1.5 font-mono text-xs font-semibold text-[#4a4453]">{copy.dimensions} {dimensions}</span>{canChooseSeats ? <div className="flex flex-wrap gap-3 text-xs text-[#4a4453]"><Legend color="#713dcc" label={copy.available} /><Legend color="#5b21b6" label={copy.selected} /><Legend color="#dce2f3" label={copy.unavailable} /></div> : null}</div></div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative min-w-0 bg-[#f0f3ff]"><div aria-label={copy.mapZoom} className="absolute left-6 top-6 z-10 flex items-center rounded-xl border border-[#dce2f3] bg-white/95 p-1 shadow-lg backdrop-blur-sm sm:left-10 sm:top-10"><button aria-label={copy.zoomOut} className="grid h-9 w-9 place-items-center rounded-lg text-lg font-bold hover:bg-[#f0f3ff] disabled:opacity-35" disabled={mapZoom <= .6} onClick={() => changeZoom(Math.max(.6, Number((mapZoom - .2).toFixed(1))))} type="button">−</button><button aria-label={copy.zoomReset} className="min-w-14 rounded-lg px-2 py-2 font-mono text-xs font-semibold hover:bg-[#f0f3ff]" onClick={() => changeZoom(initialZoom)} type="button">{Math.round(mapZoom * 100)}%</button><button aria-label={copy.zoomIn} className="grid h-9 w-9 place-items-center rounded-lg text-lg font-bold hover:bg-[#f0f3ff] disabled:opacity-35" disabled={mapZoom >= 3} onClick={() => changeZoom(Math.min(3, Number((mapZoom + .2).toFixed(1))))} type="button">+</button></div><div className="max-h-[75vh] overflow-auto p-4 sm:p-8" ref={mapViewport}><svg aria-label={copy.hallMap} className="mx-auto block rounded-2xl bg-white shadow-inner" role="group" style={{ width: `${mapZoom * 100}%`, minWidth: `${620 * mapZoom}px` }} viewBox={`0 0 ${width} ${height}`}>
        {isV2 && json.editor ? [...json.editor.objects].sort((a,b) => a.zIndex - b.zIndex || (a.type === "seat" ? 1 : 0) - (b.type === "seat" ? 1 : 0)).map((object) => {
          const seat = layout.seats?.find((s) => s.id === object.id);
          const seatIsPartOfWholeTable = seat?.tableId ? layout.tables.some((table) => table.id === seat.tableId && table.saleMode === "whole_table") : false;
          const color = object.colorOverride ? object.color : json.editor!.tariffs.find((t) => t.id === object.tariffId)?.color ?? object.color;
          const table = event.tables.find((item) => item.id === object.id && item.saleMode === "whole_table");
          const zone = object.type === "zone" ? event.ticketTypes.find((item) => item.venueObjectId === object.id) : null;
          const interactive = Boolean(table || zone);
          const available = table ? table.availability === "available" : zone ? zone.status === "active" && zone.remaining > 0 : false;
          const active = table ? selectedTableId === table.id : zone ? Boolean((ticketQuantities[zone.id] ?? 0)) : false;
          const activate = () => table ? chooseTable(table.id) : zone ? chooseZone(object.id) : undefined;
          return <g key={object.id} transform={`translate(${object.x} ${object.y}) rotate(${object.rotation})`} {...(interactive ? { role: "button", tabIndex: available ? 0 : -1, "aria-label": `${table?.name ?? (table ? `${copy.table} ${table.number}` : zone?.name)} · ${available ? copy.seatAvailable : copy.seatUnavailable}`, "aria-pressed": active, onClick: activate, onKeyDown: (key: React.KeyboardEvent<SVGGElement>) => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); activate(); } }, className: available ? "cursor-pointer outline-none focus-visible:opacity-70" : "cursor-not-allowed" } : {})}>
            {interactive ? <title>{table?.name ?? (table ? `${copy.table} ${table.number}` : zone?.name)} · {available ? copy.seatAvailable : copy.seatUnavailable}</title> : null}
            {object.type === "seat" ? seat && !seatIsPartOfWholeTable ? <SeatNode cx={0} cy={0} number={seat.number} available={seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={.225} tariffColor={color} /> : null : object.type === "zone" ? <polygon points={object.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={available ? color : "#dce2f3"} fillOpacity={object.opacity} stroke={active ? "#5b21b6" : color} strokeWidth={active ? .1 : .03} /> : object.type === "table_round" ? <circle r={object.width / 2} fill={active ? "#f0e8ff" : available || !table ? "white" : "#e2e8f8"} stroke={active ? "#5b21b6" : color} strokeWidth={active ? .1 : .03} /> : object.type === "row" ? null : <rect x={-object.width/2} y={-object.height/2} width={object.width} height={object.height} rx={.1} fill={object.type === "prop" || object.type === "entrance" ? color : active ? "#f0e8ff" : available || !table ? "white" : "#e2e8f8"} stroke={active ? "#5b21b6" : color} strokeWidth={active ? .1 : .03} />}
            {object.type === "row" ? <text textAnchor="middle" dominantBaseline="middle" transform={`translate(${-object.width / 2 - .22} 0) rotate(-90)`} fontSize={.18} fontWeight="400" fill="#202632">{object.name}</text> : object.type !== "seat" && <FittedSvgText text={object.name} maxWidth={object.width * (object.type === "table_round" ? .68 : .88)} maxHeight={(object.type === "table_round" ? object.width * .68 : object.height * .7)} fontSize={.25} fontWeight="700" fill={object.type === "prop" || object.type === "entrance" ? "white" : "#202632"} />}
          </g>;
        }) : null}
        {isV2 && !json.editor && json.stage ? <g transform={`rotate(${json.stage.rotation ?? 0} ${json.stage.x + json.stage.width / 2} ${json.stage.y + json.stage.height / 2})`}><rect fill="#151c27" height={json.stage.height} rx="0.25" width={json.stage.width} x={json.stage.x} y={json.stage.y} /><FittedSvgText text={json.stage.label} fill="white" fontSize={.38} fontWeight="700" maxWidth={json.stage.width * .88} maxHeight={json.stage.height * .7} x={json.stage.x + json.stage.width / 2} y={json.stage.y + json.stage.height / 2} /></g> : null}
        {!(isV2 && json.editor) && json.tables.map((geometry) => {
          const table = layout.tables.find((item) => item.id === geometry.tableId);
          if (!table) return null;
          const available = table.status === "available";
          const rx = "shape" in geometry && geometry.shape === "round" ? geometry.width / 2 : 0.22;
          const whole = table.saleMode === "whole_table";
          const active = selectedTableId === table.id;
          return <g key={table.id} transform={`rotate(${geometry.rotation ?? 0} ${geometry.x + geometry.width / 2} ${geometry.y + geometry.height / 2})`} {...(whole ? { role: "button", tabIndex: available ? 0 : -1, "aria-label": `${table.name ?? `${copy.table} ${table.number}`} · ${available ? copy.seatAvailable : copy.seatUnavailable}`, "aria-pressed": active, onClick: () => chooseTable(table.id), onKeyDown: (key: React.KeyboardEvent<SVGGElement>) => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); chooseTable(table.id); } }, className: available ? "cursor-pointer outline-none focus-visible:opacity-70" : "cursor-not-allowed" } : {})}><rect fill={active ? "#e8dcff" : available ? "#f0f3ff" : "#e2e8f8"} height={geometry.height} rx={rx} stroke={active ? "#5b21b6" : available ? "#713dcc" : "#a8adbb"} strokeWidth={isV2 ? active ? 0.1 : 0.06 : active ? 4 : 2} width={geometry.width} x={geometry.x} y={geometry.y} /><FittedSvgText text={table.name ?? `${copy.table} ${table.number}`} fill="#151c27" fontSize={isV2 ? .34 : 16} fontWeight="700" maxWidth={geometry.width * ("shape" in geometry && geometry.shape === "round" ? .68 : .88)} maxHeight={geometry.height * ("shape" in geometry && geometry.shape === "round" ? .68 : .7)} x={geometry.x + geometry.width / 2} y={geometry.y + geometry.height / 2} />{isV2 && table.saleMode === "per_seat" && "seats" in geometry ? geometry.seats.map((spot) => { const seat = table.seatRecords.find((item) => item.number === spot.number); if (!seat) return null; const cx = geometry.x + geometry.width * spot.x / 100; const cy = geometry.y + geometry.height * spot.y / 100; return <SeatNode cx={cx} cy={cy} key={seat.id} number={seat.number} available={seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={0.24} />; }) : null}</g>;
        })}
        {isV2 && !json.editor ? json.rows.map((geometry) => { const row = layout.rows.find((item) => item.id === geometry.rowId); if (!row) return null; return <g key={row.id} transform={`rotate(${geometry.rotation ?? 0} ${geometry.x + geometry.width / 2} ${geometry.y + geometry.height / 2})`}><text fill="#4a4453" fontSize="0.18" fontWeight="400" textAnchor="middle" dominantBaseline="middle" transform={`translate(${geometry.x - .22} ${geometry.y + geometry.height / 2}) rotate(-90)`}>{row.name || `${copy.row} ${row.number}`}</text>{row.seats.slice(0, geometry.seatCount).map((seat, index) => <SeatNode cx={geometry.x + (index + 0.5) * geometry.width / geometry.seatCount} cy={geometry.y + geometry.height / 2} key={seat.id} number={seat.number} available={seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={0.22} />)}</g>; }) : null}
      </svg></div></div>
      <div className="border-t border-[#e2e8f8] p-5 lg:border-l lg:border-t-0">
        <h3 className="font-bold">{copy.yourSelection}</h3>
        {selectionError ? <p className="mt-2 text-sm text-red-700" role="alert">{selectionError}</p> : null}
        {!selectedSeatIds.length && !chosenTable && !chosenZones.length ? <p className="mt-2 text-sm leading-6 text-[#4a4453]">{copy.noSelection}</p> : null}
        <ul className="mt-4 space-y-2">
          {selectedLabels.map((seat) => <li className="flex items-start justify-between gap-2 rounded-lg bg-[#f7f2ff] p-2.5 text-xs" key={seat.id}><span className="min-w-0"><strong className="block break-words text-[#202632]">{seat.label}</strong>{seat.tariff ? <span className="block break-words text-[#4a4453]">{seat.tariff}</span> : null}{seat.amount !== null ? <span className="block font-semibold text-[#581db3]">{formatMoney(seat.amount, seat.currency)}</span> : null}</span><button aria-label={`${copy.remove} ${seat.label}`} className="rounded px-2 py-1 font-bold text-[#581db3] hover:bg-[#ebddff] focus-visible:outline-2 focus-visible:outline-[#713dcc]" onClick={() => onChange(selectedSeatIds.filter((id) => id !== seat.id))} type="button">×</button></li>)}
          {chosenTable ? <li className="rounded-xl bg-[#f7f2ff] p-3 text-sm" key={chosenTable.id}><strong>{chosenTable.name ?? `${copy.table} ${chosenTable.number}`}</strong><p>{copy.wholeTable} · {chosenTable.seats} {copy.seats}</p><p className="font-semibold text-[#581db3]">{formatMoney(chosenTable.payment.amountDue, chosenTable.currency)}</p><button className="mt-1 text-[#581db3] underline" onClick={() => onTableChange(null)} type="button">{copy.remove}</button></li> : null}
          {chosenZones.map((zone) => <li className="rounded-xl bg-[#f7f2ff] p-3 text-sm" key={zone.id}><strong>{zone.name}</strong><p>{copy.remaining} {zone.remaining}</p><div className="mt-2 flex items-center gap-3"><button aria-label={`${copy.decrease} ${zone.name}`} className="grid h-9 w-9 place-items-center rounded-lg border bg-white" onClick={() => onTicketChange(zone.id, Math.max(0, (ticketQuantities[zone.id] ?? 0) - 1))} type="button">−</button><span aria-live="polite">{(ticketQuantities[zone.id] ?? 0)}</span><button aria-label={`${copy.increase} ${zone.name}`} className="grid h-9 w-9 place-items-center rounded-lg border bg-white disabled:opacity-40" disabled={(ticketQuantities[zone.id] ?? 0) >= Math.min(10, zone.remaining)} onClick={() => onTicketChange(zone.id, (ticketQuantities[zone.id] ?? 0) + 1)} type="button">+</button></div><p className="mt-2 font-semibold text-[#581db3]">{formatMoney(zone.payment.amountDue * (ticketQuantities[zone.id] ?? 0), zone.currency)}</p><button className="mt-1 text-[#581db3] underline" onClick={() => onTicketChange(zone.id, 0)} type="button">{copy.remove}</button></li>)}
        </ul>
        <a className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#5b21b6] px-4 py-3 font-semibold text-white" href="#tickets">{copy.checkout}</a>
      </div>
    </div>
  </section>;
}

function SeatNode({ cx, cy, number, available, selected, onClick, size, tariffColor }: { cx: number; cy: number; number: number; available: boolean; selected: boolean; onClick: () => void; size: number; tariffColor?: string }) {
  const copy = useEventCopy();
  return <g aria-label={`${copy.seat} ${number}${selected ? `, ${copy.seatSelected}` : available ? `, ${copy.seatAvailable}` : `, ${copy.seatUnavailable}`}`} aria-pressed={selected} className={`group outline-none ${available ? "cursor-pointer" : "cursor-not-allowed"}`} onClick={onClick} role="button" tabIndex={available ? 0 : -1} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}>
    <title>{`${copy.seat} ${number}${selected ? ` · ${copy.seatSelected}` : available ? ` · ${copy.seatAvailable}` : ` · ${copy.seatUnavailable}`}`}</title>
    <circle className="pointer-events-none opacity-0 group-focus-visible:opacity-100" cx={cx} cy={cy} fill="none" r={size * 1.35} stroke="#2563eb" strokeWidth={size / 7} />
    <circle cx={cx} cy={cy} fill={selected ? "#5b21b6" : available ? tariffColor ?? "#d3bbff" : "#dce2f3"} r={size} stroke={selected ? "#250059" : available ? tariffColor ?? "#713dcc" : "#a8adbb"} strokeWidth={size / 5} />
    <text dominantBaseline="central" fill={selected || (available && tariffColor) ? "white" : "#151c27"} fontSize={size * 0.9} fontWeight="700" pointerEvents="none" textAnchor="middle" x={cx} y={cy}>{number}</text>
    {selected ? <circle cx={cx + size * .8} cy={cy - size * .8} fill="white" r={size * .36} stroke="#250059" strokeWidth={size * .08} /> : null}
    {selected ? <text dominantBaseline="central" fill="#250059" fontSize={size * .45} fontWeight="700" pointerEvents="none" textAnchor="middle" x={cx + size * .8} y={cy - size * .8}>✓</text> : null}
  </g>;
}
function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>; }

function ContentCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ebddff] text-[#581db3]">{icon === "spark" ? "✦" : "•"}</span><h2 className="text-2xl font-bold tracking-[-0.02em]">{title}</h2></div><div className="mt-5">{children}</div></section>; }
function RichText({ text }: { text: string | null }) { const copy = useEventCopy(); return text ? <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#4a4453]">{text}</p> : <p className="text-[#4a4453]">{copy.descriptionSoon}</p>; }

function Gallery({ event }: { event: PublicEvent }) { const copy = useEventCopy(); const images = [resolveMedia(event.posterUrl, FALLBACK_IMAGES[0]!), FALLBACK_IMAGES[1]!, FALLBACK_IMAGES[2]!]; return <section className="rounded-2xl border border-[#dce2f3] bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-bold">{copy.gallery}</h2><div className="mt-4 grid h-64 min-h-0 grid-cols-2 grid-rows-1 gap-2 overflow-hidden rounded-xl sm:h-72 sm:grid-cols-3 sm:grid-rows-2"><img alt={copy.galleryAtmosphere} className="col-span-2 min-h-0 h-full w-full object-cover sm:row-span-2" onError={(image) => { image.currentTarget.src = FALLBACK_IMAGES[0]!; }} src={images[0]} /><img alt={copy.galleryDetail} className="hidden min-h-0 h-full w-full object-cover sm:block" src={images[1]} /><img alt={copy.galleryGuests} className="hidden min-h-0 h-full w-full object-cover sm:block" src={images[2]} /></div></section>; }

function ProgramCard({ text, eventTime }: { text: string | null; eventTime: string }) { const copy = useEventCopy(); const items = parseProgram(text, eventTime, copy); return <section className="rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-3"><span className="text-[#713dcc]">◷</span><div><h2 className="text-2xl font-bold">{copy.program}</h2><p className="text-sm text-[#4a4453]">{copy.schedule}</p></div></div><ol className="relative mt-6 space-y-3 border-l-2 border-[#ebddff] pl-5">{items.map((item, index) => <li className="relative rounded-lg bg-[#f9f9ff] px-4 py-3" key={`${item.time}-${index}`}><span className="absolute -left-[27px] top-5 h-3 w-3 rounded-full bg-[#713dcc] ring-4 ring-white" /><div className="flex gap-3"><time className="shrink-0 font-mono text-sm font-bold text-[#581db3]">{item.time}</time><span className="text-sm font-semibold">{item.label}</span></div></li>)}</ol></section>; }

function LocationCard({ event }: { event: PublicEvent }) { const copy = useEventCopy(); return <section className="flex flex-col rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">{copy.location}</h2><p className="mt-1 text-sm text-[#4a4453]">{event.venueName} · {event.address}</p></div><a className="rounded-lg bg-[#5b21b6] px-4 py-2 text-sm font-semibold text-white" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venueName}, ${event.address}`)}`} rel="noreferrer" target="_blank">{copy.openMap}</a></div><div className="relative mt-5 min-h-64 flex-1 overflow-hidden rounded-xl border border-[#dce2f3] bg-[#f0f3ff]"><div className="absolute inset-x-0 top-[30%] h-8 rotate-[-4deg] bg-white" /><div className="absolute bottom-[24%] left-0 right-0 h-6 rotate-[3deg] bg-white" /><div className="absolute bottom-0 left-[36%] top-0 w-7 rotate-[8deg] bg-white" /><div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5b21b6] text-xl text-white shadow-lg">●</span><span className="mt-2 rounded-lg bg-[#151c27] px-3 py-2 text-center text-xs font-semibold text-white shadow">{event.venueName}</span></div></div></section>; }

function TermsCard({ event }: { event: PublicEvent }) { const copy = useEventCopy(); const terms = [[copy.visitRules, event.rules], [copy.visitTerms, event.visitTerms], [copy.cancellationTerms, event.cancellationTerms], ...(event.paymentMode === "deposit" ? [[copy.depositTerms, event.depositTerms]] : []), [copy.extraConditions, event.extraConditions]] as [string, string | null][]; return <section className="rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm sm:p-8"><h2 className="text-2xl font-bold">{copy.terms}</h2><div className="mt-4 divide-y divide-[#e2e8f8]">{terms.filter(([, text]) => text).map(([title, text]) => <details className="group py-4" key={title}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold"><span>{title}</span><span className="text-[#713dcc] transition group-open:rotate-45">＋</span></summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#4a4453]">{text}</p></details>)}</div></section>; }

function OrganizerCard({ event }: { event: PublicEvent }) { const copy = useEventCopy(); return <aside className="rounded-2xl border border-[#dce2f3] bg-white p-6 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453]">{copy.organizer}</p><div className="mt-4 flex items-center gap-3">{event.organizer.photoUrl ? <img alt="" className="h-12 w-12 rounded-full object-cover" onError={(image) => { image.currentTarget.src = FALLBACK_IMAGES[2]!; }} src={resolveMedia(event.organizer.photoUrl, FALLBACK_IMAGES[2]!)} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ebddff] font-bold text-[#581db3]">{event.organizer.name?.slice(0, 1) || "T"}</span>}<div><h2 className="font-bold">{event.organizer.name || copy.organizerTeam}</h2>{event.organizer.personName && event.organizer.personName !== event.organizer.name ? <p className="text-sm text-[#4a4453]">{event.organizer.personName}</p> : null}<p className="text-sm text-[#4a4453]">{copy.verifiedOrganizer}</p></div></div><p className="mt-4 text-sm text-[#4a4453]">{event.organizer.contact ?? copy.contactUnavailable}</p></aside>; }

function MetaChip({ icon, children }: { icon: "calendar" | "pin" | "clock"; children: React.ReactNode }) { return <span className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-2 backdrop-blur">{icon === "pin" ? "⌖" : icon === "clock" ? "◷" : "▣"}{children}</span>; }
function ShareIcon() { return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="2"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" stroke="currentColor" strokeWidth="2"/></svg>; }

function parseProgram(value: string | null, fallbackTime: string, copy: typeof EVENT_COPY[EventLocale]): Array<{ time: string; label: string }> { if (!value) return [{ time: fallbackTime.slice(0, 5), label: copy.eventStart }]; const chunks = value.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean); return chunks.slice(0, 8).map((part, index) => { const match = part.match(/^(\d{1,2}:\d{2})\s*[—–-]?\s*(.*)$/); return match ? { time: match[1]!, label: match[2] || copy.programStep } : { time: index === 0 ? fallbackTime.slice(0, 5) : "—", label: part }; }); }
function formatEventDate(event: PublicEvent, locale: EventLocale): string { const date = new Date(`${event.date}T00:00:00Z`); return `${new Intl.DateTimeFormat(INTL_LOCALES[locale], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date)}, ${event.time.slice(0, 5)}`; }
function resolveMedia(value: string | null, fallback: string): string { if (!value) return fallback; try { return new URL(value, API_URL).toString(); } catch { return fallback; } }
function EventPageSkeleton() { return <main className="mx-auto min-h-screen max-w-7xl animate-pulse px-4 py-8 sm:px-8"><div className="h-5 w-52 rounded bg-[#e2e8f8]" /><div className="mt-5 h-[420px] rounded-2xl bg-[#dce2f3]" /><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"><div className="h-96 rounded-2xl bg-[#e2e8f8]"/><div className="h-96 rounded-2xl bg-[#e2e8f8]"/></div></main>; }
