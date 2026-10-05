"use client";

import { localeFromBrowser } from "../../../lib/locale";

import { hallObjectPaint, tariffColor, hallTextColor, UNAVAILABLE_HALL_COLOR, TARIFF_COLORS, type EventLocale, type PublicEvent, type PublicVenueLayout, type PublicVenueSeat } from "@event-platform/shared-types";
import Link from "next/link";
import { EventHero } from "./event-hero";
import "./event-page.css";
import { useCallback, useEffect, useRef, useState } from "react";

import { PublicFramedAsset } from "../../../components/public-event-media";
import { EventStory, EventRefund } from "../../../components/event-presentation";
import { FavoriteButton } from "../../../components/favorite-button";
import { useDisplayCurrency } from "../../../components/currency-provider";
import { FittedSvgText } from "../../../components/fitted-svg-text";
import { rememberRecentlyViewed } from "../../../lib/local-preferences";
import { EventHeroDetails } from "./event-hero-details";
import { CheckoutPanel } from "./checkout-panel";
import { ContentLanguageNote } from "../../../components/content-language-note";
import { useLocale } from "../../../components/locale-provider";
import { EVENT_COPY } from "./event-copy";
import { fetchPublicVenueLayout } from "../../../lib/public-events";

function useEventCopy() { return EVENT_COPY[useLocale()]; }

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
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
      const nextLayout = await fetchPublicVenueLayout(id).catch(() => null);
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
  }, [id,locale]);

  async function share(): Promise<void> {
    if (navigator.share) { await navigator.share(event ? { title: event.title, url: window.location.href } : { url: window.location.href }).catch(() => undefined); return; }
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const refreshAvailability = useCallback(async (): Promise<void> => {
    if (!event) return;
    const [eventResponse, nextLayout] = await Promise.all([
      fetch(`/api/events/${encodeURIComponent(event.id)}?locale=${localeFromBrowser()}`, { cache: "no-store" }),
      fetchPublicVenueLayout(event.id),
    ]);
    if (eventResponse.status === 404) { setError(true); return; }
    if (!eventResponse.ok) throw new Error(copy.refreshFailed);
    const nextEvent = await eventResponse.json() as PublicEvent;
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

  if (error) return <main className="min-h-screen bg-[#10192b] dark:bg-ticket-bg px-5 pt-40 text-center text-white"><h1 className="text-2xl font-bold">{copy.notFound}</h1><Link className="mt-5 inline-flex rounded-full bg-[#5b21b6] dark:bg-ticket-primary px-5 py-3 font-semibold text-white" href="/">{copy.returnToEvents}</Link></main>;
  if (!event) return <EventPageSkeleton />;

  const hasHall = Boolean((!event.saleMode||event.saleMode==="paid_seated")&&layout && (layout.tables.length > 0 || layout.rows.length > 0 || (layout.layoutJson.version === 2 && (layout.layoutJson.editor?.objects.length ?? 0) > 0)));
  return <main className="min-h-screen bg-white dark:bg-ticket-surface text-[#151c27] dark:text-ticket-text">
    <EventHero event={event} galleryLabel={copy.gallery} actions={<>
      <div className="absolute right-16 top-0 z-10 sm:right-20 lg:right-24"><button aria-label={copied ? copy.copied : copy.share} title={copied ? copy.copied : copy.share} className="flex size-11 items-center justify-center rounded-full bg-black/25 text-white transition hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" onClick={() => void share()} type="button"><ShareIcon /></button><span className="sr-only" role="status">{copied ? copy.copied : ""}</span></div>
      <div className="relative -top-4"><FavoriteButton eventId={event.id} heroOverlay /></div>
    </>}>
      <h1 className="max-w-4xl font-bold tracking-[-0.035em]">{event.title}</h1>
      <div className="mt-2"><ContentLanguageNote contentLocale={event.contentLocale} /></div>
      {event.announcement ? <p className="event-hero-announcement mt-3 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">{event.announcement}</p> : null}
      <EventHeroDetails event={event} locale={locale} />
    </EventHero>

    <div className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:pt-10 sm:px-8 lg:px-10">
      {syncError ? <div aria-live="polite" className="mb-4 rounded-xl bg-amber-50 dark:bg-ticket-warning-soft px-4 py-3 text-sm text-amber-900 dark:text-ticket-warning">{copy.syncFailed} <button className="font-bold underline" onClick={() => void refreshAvailability().catch(() => setSyncError(true))} type="button">{copy.retry}</button></div> : null}
      <div className="event-details-grid items-start">
        <div>
          {event.creationVersion===2?<EventStory description={event.description} venueName="" address="" refundConditions={event.cancellationTerms} refundsAvailable={event.refundsAvailable??false} free={event.saleMode==="free"} locale={locale} showRefund={false}/>:event.description||event.announcement?<ContentCard icon="spark" title={copy.about}><RichText text={event.description ?? event.announcement} /></ContentCard>:null}
        </div>
        {hasHall && layout ? <VenueSection layout={layout} event={event} selectedSeatIds={selectedSeatIds} onChange={setSelectedSeatIds} selectedTableId={selectedTableId} onTableChange={setSelectedTableId} ticketQuantities={ticketQuantities} onTicketChange={changeTicket} /> : null}
        <div className="event-checkout"><CheckoutPanel event={event} layout={layout} selectedSeatIds={selectedSeatIds} selectedTableId={selectedTableId} onTableChange={setSelectedTableId} ticketQuantities={ticketQuantities} onTicketChange={changeTicket} onClearSeats={() => setSelectedSeatIds([])} onRefreshAvailability={refreshAvailability} /></div>
      </div>
      <div className="mt-12 space-y-10">
        {event.creationVersion===2?<EventRefund locale={locale} free={event.saleMode==="free"} available={event.refundsAvailable??false} conditions={event.cancellationTerms}/>:<TermsCard event={event}/>}
        <Gallery event={event}/>
      </div>

      <div className="mt-16 grid gap-12 lg:grid-cols-2">
        {event.program?<ProgramCard text={event.program} eventTime={event.time}/>:null}
        <LocationCard event={event} />
      </div>

      <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <OrganizerCard event={event} />
      </div>
    </div>
  </main>;
}

export function VenueSection({ layout, event, selectedSeatIds, onChange, selectedTableId, onTableChange, ticketQuantities, onTicketChange }: { layout: PublicVenueLayout; event: PublicEvent; selectedSeatIds: string[]; onChange: (ids: string[]) => void; selectedTableId: string | null; onTableChange: (id: string | null) => void; ticketQuantities: Record<string, number>; onTicketChange: (id: string, quantity: number) => void }) {
  const copy = useEventCopy();
  const { formatMoney } = useDisplayCurrency();
  const selected = new Set(selectedSeatIds);
  const [selectionError, setSelectionError] = useState("");
  const json = layout.layoutJson;
  const isV2 = json.version === 2;
  const legacyTariffs = [...layout.tables, ...layout.rows].filter((item, index, all) => all.findIndex(other => other.typeLabel === item.typeLabel && other.price === item.price && other.currency === item.currency) === index).map((item, index) => ({ name: item.typeLabel || copy.available, price: item.price, currency: item.currency, color: TARIFF_COLORS[index % TARIFF_COLORS.length]!.color }));
  const legacyColor = (item: { typeLabel: string | null; price: number | null; currency: string }) => legacyTariffs.find(tariff => tariff.name === (item.typeLabel || copy.available) && tariff.price === item.price && tariff.currency === item.currency)?.color ?? TARIFF_COLORS[0].color;
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
  const salesAvailable = event.paymentMode !== "deposit";
  const toggle = (seat: PublicVenueSeat | (PublicVenueLayout["tables"][number]["seatRecords"][number])) => {
    if (!salesAvailable || seat.availability !== "available") return;
    if (selected.has(seat.id)) { setSelectionError(""); onChange(selectedSeatIds.filter((id) => id !== seat.id)); return; }
    const firstSelected = layout.seats?.find((item) => item.id === selectedSeatIds[0]);
    const nextSeat = layout.seats?.find((item) => item.id === seat.id);
    if (firstSelected && nextSeat && firstSelected.currency !== nextSeat.currency) { setSelectionError(copy.mixedCurrencies); return; }
    if (selectedSeatIds.length < 10) { setSelectionError(""); onChange([...selectedSeatIds, seat.id]); }
  };
  const selectedLabels = selectedSeatIds.map((id) => {
    const canonical = layout.seats?.find((seat) => seat.id === id);
    if (canonical) return { id, label: canonical.rowId ? `${layout.rows.find((row) => row.id === canonical.rowId)?.name || `${copy.row} ${layout.rows.find((row) => row.id === canonical.rowId)?.number ?? ""}`} · ${copy.seat} ${canonical.number}` : canonical.tableId ? `${copy.table} ${layout.tables.find((table) => table.id === canonical.tableId)?.number ?? ""} · ${copy.seat} ${canonical.number}` : canonical.label, tariff: canonical.tariffName, amount: canonical.price, currency: canonical.currency };
    for (const table of layout.tables) {
      const seat = table.seatRecords.find((item) => item.id === id);
      if (seat) return { id, label: `${copy.table} ${table.number} · ${copy.seat} ${seat.number}`, tariff: table.typeLabel, amount: table.price, currency: table.currency };
    }
    for (const row of layout.rows) {
      const seat = row.seats.find((item) => item.id === id);
      if (seat) return { id, label: `${copy.row} ${row.number} · ${copy.seat} ${seat.number}`, tariff: row.typeLabel, amount: row.price, currency: row.currency };
    }
    return { id, label: copy.selectedSeat, tariff: null, amount: null, currency: "" };
  });
  const chosenTable = selectedTableId ? event.tables.find((table) => table.id === selectedTableId) : null;
  const chosenZones = event.ticketTypes.filter((ticket) => (ticketQuantities[ticket.id] ?? 0) > 0);
  const chooseTable = (id: string) => { if (!salesAvailable) return; const table = event.tables.find((item) => item.id === id && item.saleMode === "whole_table" && item.availability === "available"); if (table) onTableChange(selectedTableId === id ? null : id); };
  const chooseZone = (id: string) => { if (!salesAvailable) return; const ticket = event.ticketTypes.find((item) => item.venueObjectId === id && item.status === "active" && item.remaining > 0); if (ticket) onTicketChange(ticket.id, (ticketQuantities[ticket.id] ?? 0) ? 0 : 1); };

  return <section id="venue-plan">
    <div className="flex flex-col justify-between gap-4 pb-6 sm:flex-row sm:items-center"><div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#581db3] dark:text-ticket-accent">{copy.interactiveMap}</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.02em]">{copy.chooseSeat}</h2><p className="mt-1 text-sm text-[#4a4453] dark:text-ticket-muted">{copy.selectionHint}</p></div><div className="flex flex-col items-start gap-2 sm:items-end"><span className="rounded-lg bg-[#f0f3ff] dark:bg-ticket-raised px-3 py-1.5 font-mono text-xs font-semibold text-[#4a4453] dark:text-ticket-muted">{copy.dimensions} {dimensions}</span><div className="flex flex-wrap gap-3 text-xs text-[#4a4453] dark:text-ticket-muted"><span className="inline-flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded-full border-2 border-current text-[10px]">✓</span>{copy.selected}</span><Legend color={UNAVAILABLE_HALL_COLOR} label={copy.unavailable} /></div></div></div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative min-w-0 bg-[#f0f3ff] dark:bg-ticket-raised"><div aria-label={copy.mapZoom} className="absolute left-6 top-6 z-10 flex items-center rounded-xl border border-[#dce2f3] dark:border-ticket-border bg-white/95 dark:bg-ticket-surface/95 p-1 shadow-lg backdrop-blur-sm sm:left-10 sm:top-10"><button aria-label={copy.zoomOut} className="grid h-9 w-9 place-items-center rounded-lg text-lg font-bold hover:bg-[#f0f3ff] dark:hover:bg-ticket-hover disabled:opacity-35" disabled={mapZoom <= .6} onClick={() => changeZoom(Math.max(.6, Number((mapZoom - .2).toFixed(1))))} type="button">−</button><button aria-label={copy.zoomReset} className="min-w-14 rounded-lg px-2 py-2 font-mono text-xs font-semibold hover:bg-[#f0f3ff] dark:hover:bg-ticket-hover" onClick={() => changeZoom(initialZoom)} type="button">{Math.round(mapZoom * 100)}%</button><button aria-label={copy.zoomIn} className="grid h-9 w-9 place-items-center rounded-lg text-lg font-bold hover:bg-[#f0f3ff] dark:hover:bg-ticket-hover disabled:opacity-35" disabled={mapZoom >= 3} onClick={() => changeZoom(Math.min(3, Number((mapZoom + .2).toFixed(1))))} type="button">+</button></div><div className="max-h-[75vh] overflow-auto p-4 sm:p-8" ref={mapViewport}><svg aria-label={copy.hallMap} className="mx-auto block rounded-2xl bg-white dark:bg-ticket-surface shadow-inner" role="group" style={{ width: `${mapZoom * 100}%`, minWidth: `${620 * mapZoom}px` }} viewBox={`0 0 ${width} ${height}`}>
        {isV2 && json.editor ? [...json.editor.objects].sort((a,b) => a.zIndex - b.zIndex || (a.type === "seat" ? 1 : 0) - (b.type === "seat" ? 1 : 0)).map((object) => {
          const seat = layout.seats?.find((s) => s.id === object.id);
          const paint = hallObjectPaint(object, json.editor!);
          const seatIsPartOfWholeTable = object.type === "seat" && paint.neutral;
          const color = paint.color;
          const table = event.tables.find((item) => item.id === object.id && item.saleMode === "whole_table");
          const zone = object.type === "zone" ? event.ticketTypes.find((item) => item.venueObjectId === object.id) : null;
          const interactive = salesAvailable && Boolean(table || zone);
          const available = salesAvailable && (table ? table.availability === "available" : zone ? zone.status === "active" && zone.remaining > 0 : false);
          const active = table ? selectedTableId === table.id : zone ? Boolean((ticketQuantities[zone.id] ?? 0)) : false;
          const activate = () => { if (available) { if (table) chooseTable(table.id); else if (zone) chooseZone(object.id); } };
          const fill = paint.neutral ? "#FFFFFF" : interactive ? available ? color : UNAVAILABLE_HALL_COLOR : color;
          const outline = active ? "#151C27" : paint.neutral ? "#94A3B8" : interactive && !available ? "#9CA3AF" : color;
          return <g key={object.id} transform={`translate(${object.x} ${object.y}) rotate(${object.rotation})`} {...(interactive ? { role: "button", tabIndex: available ? 0 : -1, "aria-label": `${table?.name ?? (table ? `${copy.table} ${table.number}` : zone?.name)} · ${available ? copy.seatAvailable : copy.seatUnavailable}`, "aria-pressed": active, "aria-disabled": !available, onClick: activate, onKeyDown: (key: React.KeyboardEvent<SVGGElement>) => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); activate(); } }, className: available ? "cursor-pointer outline-none focus-visible:opacity-70" : "cursor-not-allowed" } : {})}>
            {interactive ? <title>{`${table?.name ?? (table ? `${copy.table} ${table.number}` : zone?.name)} · ${available ? copy.seatAvailable : copy.seatUnavailable}`}</title> : null}
            {object.type === "seat" ? seatIsPartOfWholeTable ? <NeutralSeat number={object.number} size={.225}/> : seat ? <SeatNode cx={0} cy={0} number={seat.number} available={salesAvailable && seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={.225} tariffColor={color} /> : null : object.type === "zone" ? <polygon points={object.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={fill} fillOpacity={Math.max(.55, object.opacity)} stroke={outline} strokeWidth={active ? .1 : .03} /> : object.type === "table_round" ? <circle r={object.width / 2} fill={fill} stroke={outline} strokeWidth={active ? .1 : .03} /> : object.type === "row" ? null : <rect x={-object.width/2} y={-object.height/2} width={object.width} height={object.height} rx={.1} fill={fill} stroke={outline} strokeWidth={active ? .1 : .03} />}
            {object.type === "row" ? <text textAnchor="middle" dominantBaseline="middle" transform={`translate(${-object.width / 2 - .22} 0) rotate(-90)`} fontSize={.18} fontWeight="400" fill="var(--ticket-text)">{object.name}</text> : object.type !== "seat" && <FittedSvgText text={object.name} maxWidth={object.width * (object.type === "table_round" ? .68 : .88)} maxHeight={(object.type === "table_round" ? object.width * .68 : object.height * .7)} fontSize={.25} fontWeight="700" fill={hallTextColor(fill)} />}
            {active && available ? <g pointerEvents="none" transform={`translate(${object.width/2} ${-object.height/2})`}><circle r={.16} fill="white" stroke="#151C27" strokeWidth={.025}/><text textAnchor="middle" dominantBaseline="central" fontSize={.2} fill="#151C27">✓</text></g> : null}
          </g>;
        }) : null}
        {isV2 && !json.editor && json.stage ? <g transform={`rotate(${json.stage.rotation ?? 0} ${json.stage.x + json.stage.width / 2} ${json.stage.y + json.stage.height / 2})`}><rect fill="#151c27" height={json.stage.height} rx="0.25" width={json.stage.width} x={json.stage.x} y={json.stage.y} /><FittedSvgText text={json.stage.label} fill="white" fontSize={.38} fontWeight="700" maxWidth={json.stage.width * .88} maxHeight={json.stage.height * .7} x={json.stage.x + json.stage.width / 2} y={json.stage.y + json.stage.height / 2} /></g> : null}
        {!(isV2 && json.editor) && json.tables.map((geometry) => {
          const table = layout.tables.find((item) => item.id === geometry.tableId);
          if (!table) return null;
          const available = salesAvailable && event.tables.some(item => item.id === table.id && item.availability === "available");
          const color = legacyColor(table);
          const rx = "shape" in geometry && geometry.shape === "round" ? geometry.width / 2 : 0.22;
          const whole = table.saleMode === "whole_table";
          const active = selectedTableId === table.id;
          return <g key={table.id} transform={`rotate(${geometry.rotation ?? 0} ${geometry.x + geometry.width / 2} ${geometry.y + geometry.height / 2})`} {...(whole ? { role: "button", tabIndex: available ? 0 : -1, "aria-label": `${table.name ?? `${copy.table} ${table.number}`} · ${available ? copy.seatAvailable : copy.seatUnavailable}`, "aria-pressed": available && active, "aria-disabled": !available, onClick: () => chooseTable(table.id), onKeyDown: (key: React.KeyboardEvent<SVGGElement>) => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); chooseTable(table.id); } }, className: available ? "cursor-pointer outline-none focus-visible:opacity-70" : "cursor-not-allowed" } : {})}><rect fill={whole ? available ? color : UNAVAILABLE_HALL_COLOR : "white"} height={geometry.height} rx={rx} stroke={active && available ? "#151C27" : whole && available ? color : "#94A3B8"} strokeWidth={isV2 ? active ? 0.1 : 0.06 : active ? 4 : 2} width={geometry.width} x={geometry.x} y={geometry.y} /><FittedSvgText text={table.name ?? `${copy.table} ${table.number}`} fill={whole && available ? hallTextColor(color) : "#151c27"} fontSize={isV2 ? .34 : 16} fontWeight="700" maxWidth={geometry.width * ("shape" in geometry && geometry.shape === "round" ? .68 : .88)} maxHeight={geometry.height * ("shape" in geometry && geometry.shape === "round" ? .68 : .7)} x={geometry.x + geometry.width / 2} y={geometry.y + geometry.height / 2} />{isV2 && "seats" in geometry ? geometry.seats.map((spot) => { const seat = table.seatRecords.find((item) => item.number === spot.number); if (!seat && !whole) return null; const cx = geometry.x + geometry.width * spot.x / 100; const cy = geometry.y + geometry.height * spot.y / 100; return whole ? <g key={spot.number} transform={`translate(${cx} ${cy})`}><NeutralSeat number={spot.number} size={.24}/></g> : seat ? <SeatNode cx={cx} cy={cy} key={seat.id} number={seat.number} available={salesAvailable && seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={0.24} tariffColor={color} /> : null; }) : null}</g>;
        })}
        {isV2 && !json.editor ? json.rows.map((geometry) => { const row = layout.rows.find((item) => item.id === geometry.rowId); if (!row) return null; return <g key={row.id} transform={`rotate(${geometry.rotation ?? 0} ${geometry.x + geometry.width / 2} ${geometry.y + geometry.height / 2})`}><text fill="var(--ticket-muted)" fontSize="0.18" fontWeight="400" textAnchor="middle" dominantBaseline="middle" transform={`translate(${geometry.x - .22} ${geometry.y + geometry.height / 2}) rotate(-90)`}>{row.name || `${copy.row} ${row.number}`}</text>{row.seats.slice(0, geometry.seatCount).map((seat, index) => <SeatNode cx={geometry.x + (index + 0.5) * geometry.width / geometry.seatCount} cy={geometry.y + geometry.height / 2} key={seat.id} number={seat.number} available={salesAvailable && seat.availability === "available"} selected={selected.has(seat.id)} onClick={() => toggle(seat)} size={0.22} tariffColor={legacyColor(row)} />)}</g>; }) : null}
      </svg></div></div>
      <div className="border-t border-[#e2e8f8] dark:border-ticket-border p-5 lg:border-l lg:border-t-0">
        {selectedSeatIds.length || chosenTable || chosenZones.length ? <h3 className="font-bold">{copy.yourSelection}</h3> : null}
        {selectionError ? <p className="mt-2 text-sm text-red-700 dark:text-ticket-danger" role="alert">{selectionError}</p> : null}
        {!selectedSeatIds.length && !chosenTable && !chosenZones.length ? <p className="mt-2 text-sm leading-6 text-[#4a4453] dark:text-ticket-muted">{copy.noSelection}</p> : null}
        <ul className="mt-4 space-y-2">
          {selectedLabels.map((seat) => <li className="flex items-start justify-between gap-2 rounded-lg bg-[#f7f2ff] dark:bg-ticket-raised p-2.5 text-xs" key={seat.id}><span className="min-w-0"><strong className="block break-words text-[#202632] dark:text-ticket-text">{seat.label}</strong>{seat.tariff ? <span className="block break-words text-[#4a4453] dark:text-ticket-muted">{seat.tariff}</span> : null}{seat.amount !== null ? <span className="block font-semibold text-[#581db3] dark:text-ticket-accent">{formatMoney(seat.amount, seat.currency)}</span> : null}</span><button aria-label={`${copy.remove} ${seat.label}`} className="rounded px-2 py-1 font-bold text-[#581db3] dark:text-ticket-accent hover:bg-[#ebddff] dark:hover:bg-ticket-hover focus-visible:outline-2 focus-visible:outline-[#713dcc] dark:focus-visible:outline-ticket-accent" onClick={() => onChange(selectedSeatIds.filter((id) => id !== seat.id))} type="button">×</button></li>)}
          {chosenTable ? <li className="rounded-xl bg-[#f7f2ff] dark:bg-ticket-raised p-3 text-sm" key={chosenTable.id}><strong>{chosenTable.name ?? `${copy.table} ${chosenTable.number}`}</strong><p>{copy.wholeTable} · {chosenTable.seats} {copy.seats}</p><p className="font-semibold text-[#581db3] dark:text-ticket-accent">{formatMoney(chosenTable.payment.amountDue, chosenTable.currency)}</p><button className="mt-1 text-[#581db3] dark:text-ticket-accent underline" onClick={() => onTableChange(null)} type="button">{copy.remove}</button></li> : null}
          {chosenZones.map((zone) => <li className="rounded-xl bg-[#f7f2ff] dark:bg-ticket-raised p-3 text-sm" key={zone.id}><strong>{zone.name}</strong><p>{copy.remaining} {zone.remaining}</p><div className="mt-2 flex items-center gap-3"><button aria-label={`${copy.decrease} ${zone.name}`} className="grid h-9 w-9 place-items-center rounded-lg border bg-white dark:bg-ticket-surface" onClick={() => onTicketChange(zone.id, Math.max(0, (ticketQuantities[zone.id] ?? 0) - 1))} type="button">−</button><span aria-live="polite">{(ticketQuantities[zone.id] ?? 0)}</span><button aria-label={`${copy.increase} ${zone.name}`} className="grid h-9 w-9 place-items-center rounded-lg border bg-white dark:bg-ticket-surface disabled:opacity-40" disabled={(ticketQuantities[zone.id] ?? 0) >= Math.min(10, zone.remaining)} onClick={() => onTicketChange(zone.id, (ticketQuantities[zone.id] ?? 0) + 1)} type="button">+</button></div><p className="mt-2 font-semibold text-[#581db3] dark:text-ticket-accent">{formatMoney(zone.payment.amountDue * (ticketQuantities[zone.id] ?? 0), zone.currency)}</p><button className="mt-1 text-[#581db3] dark:text-ticket-accent underline" onClick={() => onTicketChange(zone.id, 0)} type="button">{copy.remove}</button></li>)}
        </ul>
        {selectedSeatIds.length || chosenTable || chosenZones.length ? <a className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#5b21b6] dark:bg-ticket-primary px-4 py-3 font-semibold text-white" href="#tickets">{copy.checkout}</a> : null}
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-ticket-border dark:bg-ticket-raised" aria-label={copy.tariffs}>
      {isV2 && json.editor?.tariffs.length ? json.editor.tariffs.map((tariff, index) => <div key={tariff.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-ticket-surface"><span className="size-4 shrink-0 rounded-full" style={{backgroundColor:tariffColor(tariff.color,index)}}/><span>{tariff.name}</span><strong>{formatMoney(tariff.price,event.currency ?? layout.seats?.[0]?.currency ?? event.tables[0]?.currency ?? "KZT")}</strong></div>) : legacyTariffs.map((tariff,index) => <div key={index} className="flex items-center gap-2 text-sm"><Legend color={tariff.color} label={tariff.name}/><strong>{tariff.price === null ? "—" : formatMoney(tariff.price,tariff.currency)}</strong></div>)}
    </div>
  </section>;
}

function NeutralSeat({number,size}:{number:number;size:number}) { return <g aria-hidden="true"><circle r={size} fill="white" stroke="#94A3B8" strokeWidth={size/9}/><text textAnchor="middle" dominantBaseline="central" fontSize={size*.8} fill="#475569">{number}</text></g>; }

function SeatNode({ cx, cy, number, available, selected, onClick, size, tariffColor }: { cx: number; cy: number; number: number; available: boolean; selected: boolean; onClick: () => void; size: number; tariffColor?: string }) {
  const copy = useEventCopy();
  return <g aria-label={`${copy.seat} ${number}${available && selected ? `, ${copy.seatSelected}` : available ? `, ${copy.seatAvailable}` : `, ${copy.seatUnavailable}`}`} aria-pressed={available && selected} aria-disabled={!available} className={`group outline-none ${available ? "cursor-pointer" : "cursor-not-allowed"}`} onClick={() => { if (available) onClick(); }} role="button" tabIndex={available ? 0 : -1} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (available) onClick(); } }}>
    <title>{`${copy.seat} ${number}${available && selected ? ` · ${copy.seatSelected}` : available ? ` · ${copy.seatAvailable}` : ` · ${copy.seatUnavailable}`}`}</title>
    <circle className="pointer-events-none opacity-0 group-focus-visible:opacity-100" cx={cx} cy={cy} fill="none" r={size * 1.35} stroke="#2563eb" strokeWidth={size / 7} />
    <circle cx={cx} cy={cy} fill={available ? tariffColor ?? TARIFF_COLORS[0].color : UNAVAILABLE_HALL_COLOR} r={size} stroke={available && selected ? "#151C27" : available ? tariffColor ?? TARIFF_COLORS[0].color : "#9CA3AF"} strokeWidth={size / (available && selected ? 3 : 5)} />
    <text dominantBaseline="central" fill={available ? hallTextColor(tariffColor ?? TARIFF_COLORS[0].color) : "#475569"} fontSize={size * 0.9} fontWeight="700" pointerEvents="none" textAnchor="middle" x={cx} y={cy}>{number}</text>
    {selected && available ? <circle cx={cx + size * .8} cy={cy - size * .8} fill="white" r={size * .36} stroke="#250059" strokeWidth={size * .08} /> : null}
    {selected && available ? <text dominantBaseline="central" fill="#250059" fontSize={size * .45} fontWeight="700" pointerEvents="none" textAnchor="middle" x={cx + size * .8} y={cy - size * .8}>✓</text> : null}
  </g>;
}
function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>; }

function ContentCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) { return <section><div className="flex items-center gap-3"><span aria-hidden="true" className="text-lg text-[#6320ee] dark:text-ticket-accent">{icon === "spark" ? "✦" : "•"}</span><h2 className="text-2xl font-bold tracking-[-0.02em]">{title}</h2></div><div className="mt-5">{children}</div></section>; }
function RichText({ text }: { text: string | null }) { const copy = useEventCopy(); return text ? <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#4a4453] dark:text-ticket-muted">{text}</p> : <p className="text-[#4a4453] dark:text-ticket-muted">{copy.descriptionSoon}</p>; }

function Gallery({event}:{event:PublicEvent}){const copy=useEventCopy(),media=event.media?.filter(asset=>asset.galleryVisible)??[],urls=[...new Set([event.posterUrl,...(event.galleryUrls??[])].filter((url):url is string=>!!url))];if(!media.length&&!urls.length)return null;return <section><h2 className="text-xl font-bold">{copy.gallery}</h2><div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{media.length?media.map(asset=><figure key={asset.id}><PublicFramedAsset asset={asset} role="gallery" className="aspect-video rounded-xl" controls/></figure>):urls.map(url=><img key={url} alt="" className="aspect-video w-full rounded-xl object-cover" src={resolveMedia(url,"")}/>)}</div></section>;}

function ProgramCard({ text, eventTime }: { text: string | null; eventTime: string }) { const copy = useEventCopy(); const items = parseProgram(text, eventTime, copy); return <section><div className="flex items-center gap-3"><span className="text-[#713dcc] dark:text-ticket-accent"><EventMetaIcon icon="clock" /></span><div><h2 className="text-2xl font-bold">{copy.program}</h2><p className="text-sm text-[#4a4453] dark:text-ticket-muted">{copy.schedule}</p></div></div><ol className="relative mt-6 space-y-3 border-l-2 border-[#ebddff] dark:border-ticket-border pl-5">{items.map((item, index) => <li className="relative border-b border-slate-100 dark:border-ticket-border px-4 py-3" key={`${item.time}-${index}`}><span className="absolute -left-[27px] top-5 h-3 w-3 rounded-full bg-[#713dcc] dark:bg-ticket-primary ring-4 ring-white dark:ring-ticket-surface" /><div className="flex gap-3"><time className="shrink-0 font-mono text-sm font-bold text-[#581db3] dark:text-ticket-accent">{item.time}</time><span className="text-sm font-semibold">{item.label}</span></div></li>)}</ol></section>; }

function LocationCard({ event }: { event: PublicEvent }) {
  const copy = useEventCopy();
  const query = [event.address || event.venueName, event.city, event.countryCode].filter(Boolean).join(", ");
  const encodedQuery = encodeURIComponent(query);
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;
  const embedUrl = mapsKey
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsKey)}&q=${encodedQuery}`
    : `https://www.google.com/maps?q=${encodedQuery}&output=embed`;
  return <section className="flex flex-col">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">{copy.location}</h2><p className="mt-1 text-sm text-[#4a4453] dark:text-ticket-muted">{event.venueName} · {event.address}</p></div><a className="rounded-full bg-[#5b21b6] dark:bg-ticket-primary px-4 py-2 text-sm font-semibold text-white" href={`https://www.google.com/maps/search/?api=1&query=${encodedQuery}`} rel="noreferrer" target="_blank">{copy.openMap}</a></div>
    <div className="relative mt-5 min-h-64 flex-1 overflow-hidden rounded-xl bg-[#f0f3ff] dark:bg-ticket-raised"><iframe className="absolute inset-0 h-full w-full border-0" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" src={embedUrl} title={`${copy.location}: ${event.venueName}`} /></div>
  </section>;
}

function TermsCard({ event }: { event: PublicEvent }) { const copy = useEventCopy(); const terms = [[copy.visitRules, event.rules], [copy.visitTerms, event.visitTerms], [copy.cancellationTerms, event.cancellationTerms], ...(event.paymentMode === "deposit" ? [[copy.depositTerms, event.depositTerms]] : []), [copy.extraConditions, event.extraConditions]] as [string, string | null][]; return <section><h2 className="text-2xl font-bold">{copy.terms}</h2><div className="mt-4 divide-y divide-[#e2e8f8] dark:divide-ticket-border">{terms.filter(([, text]) => text).map(([title, text]) => <details className="group py-4" key={title}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold"><span>{title}</span><span className="text-[#713dcc] dark:text-ticket-accent transition group-open:rotate-45">＋</span></summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#4a4453] dark:text-ticket-muted">{text}</p></details>)}</div></section>; }

function OrganizerCard({ event }: { event: PublicEvent }) { const copy = useEventCopy(); return <aside><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a4453] dark:text-ticket-muted">{copy.organizer}</p><div className="mt-4 flex items-center gap-3">{event.organizer.photoUrl ? <img alt="" className="h-12 w-12 rounded-full object-cover" onError={(image) => { image.currentTarget.style.visibility = "hidden"; }} src={resolveMedia(event.organizer.photoUrl, "")} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ebddff] dark:bg-ticket-raised font-bold text-[#581db3] dark:text-ticket-accent">{event.organizer.name?.slice(0, 1) || "T"}</span>}<div><h2 className="font-bold">{event.organizer.name || copy.organizerTeam}</h2>{event.organizer.personName && event.organizer.personName !== event.organizer.name ? <p className="text-sm text-[#4a4453] dark:text-ticket-muted">{event.organizer.personName}</p> : null}<p className="text-sm text-[#4a4453] dark:text-ticket-muted">{copy.verifiedOrganizer}</p></div></div><p className="mt-4 text-sm text-[#4a4453] dark:text-ticket-muted">{event.organizer.contact ?? copy.contactUnavailable}</p></aside>; }


function ShareIcon() { return <svg aria-hidden="true" className="h-6 w-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]" fill="none" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="2"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" stroke="currentColor" strokeWidth="2"/></svg>; }

function parseProgram(value: string | null, fallbackTime: string, copy: typeof EVENT_COPY[EventLocale]): Array<{ time: string; label: string }> { if (!value) return [{ time: fallbackTime.slice(0, 5), label: copy.eventStart }]; const chunks = value.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean); return chunks.slice(0, 8).map((part, index) => { const match = part.match(/^(\d{1,2}:\d{2})\s*[—–-]?\s*(.*)$/); return match ? { time: match[1]!, label: match[2] || copy.programStep } : { time: index === 0 ? fallbackTime.slice(0, 5) : "—", label: part }; }); }

function resolveMedia(value: string | null, fallback: string): string { if (!value) return fallback; try { return new URL(value, API_URL).toString(); } catch { return fallback; } }
function EventPageSkeleton() { return <main className="min-h-screen animate-pulse bg-white dark:bg-ticket-surface"><div className="h-[470px] w-full bg-[#10192b] dark:bg-ticket-bg sm:h-[500px]" /><div className="mx-auto mt-12 grid max-w-7xl gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_360px] lg:px-10"><div className="h-64 rounded-xl bg-[#e2e8f8] dark:bg-ticket-raised"/><div className="h-64 rounded-xl bg-[#e2e8f8] dark:bg-ticket-raised"/></div></main>; }

function EventMetaIcon({ icon }: { icon: "calendar" | "pin" | "clock" }) {
  return <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {icon === "calendar" ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></> : icon === "pin" ? <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
  </svg>;
}
