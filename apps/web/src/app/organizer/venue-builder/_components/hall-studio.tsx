"use client";
import { ThemeToggle } from "../../../../components/theme-toggle";

import { SelectPicker } from "../../../../components/option-picker";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TARIFF_COLORS, tariffColor, hallObjectPaint, hallTariff, hallTextColor, UNAVAILABLE_HALL_COLOR, arrangeSeats, ru, effectivePrice, hallEditorSchema, metres, newHallObject, rotatePoint, type HallObject, type OrganizerEvent, type VenueLayout,type EventLocale,type CurrencyCapability } from "@event-platform/shared-types";
import { FittedSvgText } from "../../../../components/fitted-svg-text";
import { CountedField } from "../../../../components/event-creation/counted-field";
import { MoneyField } from "../../../../components/event-creation/money-field";
import { apiRequest } from "../../../(auth)/_lib/api";
import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { attachSeat, availableFitArea, capacity, changeCommand, fitView, importLayout, moveRoundSeatOnOrbit, pointWithinRow, removeObjects, ROUND_SEAT_ARC_METRES, snapDimension, titles, updateObject, warnings, wallSnap, zoomView, type Command, type FitArea, type HallState, type View } from "./hall-state";

type Tool = HallObject["type"] | "cursor" | "ruler";
type IconName = "ticket" | "cloud" | "minus" | "plus" | "eye" | "save" | "person" | "back" | "undo" | "redo" | "check" | "cursor" | "roundTable" | "rectTable" | "chair" | "row" | "stage" | "door" | "zone" | "ruler" | "templates" | "tune" | "close" | "edit" | "copy" | "lock" | "unlock" | "trash" | "alignTop" | "alignCenter" | "distribute" | "flip";
const tools: { id: Tool; icon: IconName; label: string; key: string }[] = [
  { id: "cursor", icon: "cursor", label: "Курсор", key: "V" }, { id: "table_round", icon: "roundTable", label: "Круглый стол", key: "C" },
  { id: "table_rect", icon: "rectTable", label: "Прямоугольный стол", key: "R" }, { id: "seat", icon: "chair", label: "Кресло", key: "S" },
  { id: "row", icon: "row", label: "Ряд кресел", key: "W" }, { id: "prop", icon: "stage", label: "Сцена", key: "E" },
  { id: "entrance", icon: "door", label: "Вход / выход", key: "D" }, { id: "zone", icon: "zone", label: "Полигон зоны", key: "Z" },
  { id: "ruler", icon: "ruler", label: "Линейка", key: "M" },
];
const button = "rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-violet-100 dark:hover:bg-ticket-accent-soft focus-visible:outline-2 focus-visible:outline-violet-600 dark:focus-visible:outline-ticket-accent disabled:opacity-40";
const input = "mt-1 w-full rounded-lg border border-violet-100 dark:border-ticket-accent bg-[#f3f2fc] dark:bg-ticket-raised px-3 py-2 text-sm outline-violet-500 dark:outline-ticket-accent";
const formatHallMoney=(n:number,currency:string,locale:EventLocale)=>new Intl.NumberFormat(locale,{style:"currency",currency}).format(n/100);
export interface DraftStudioOptions {currency:CurrencyCapability;locale:EventLocale;onFinish:()=>Promise<void>;backHref:string}
function presentDraftLocale(state:HallState,locale:EventLocale):HallState{return {...state,editor:{...state.editor,tariffs:state.editor.tariffs.map(tariff=>({...tariff,name:tariff.localized?.[locale]?.name??"",description:tariff.localized?.[locale]?.description??""}))}};}
const tableRotation = (angle: number, type: HallObject["type"]) => {
  const normalized = ((angle + 540) % 360) - 180;
  if (type !== "table_rect" && type !== "table_round") return metres(normalized);
  const nearestTen = Math.round(normalized / 10) * 10;
  return metres(Math.abs(normalized - nearestTen) <= 2 ? nearestTen : normalized);
};
type Gesture = { kind: "pan" | "move" | "resize" | "rotate" | "marquee" | "row" | "vertex"; start: { x: number; y: number }; state: HallState; view: View; ids: string[]; handle?: number; vertex?: number };

export function HallStudio({ eventId }: { eventId: string }) {
  return <ProtectedRoute><Studio eventId={eventId} /></ProtectedRoute>;
}
export function Studio({ eventId, initial, request = apiRequest,draftStudio }: { eventId: string; initial?: { layout: VenueLayout; event: Pick<OrganizerEvent,"status"|"title"|"currency"|"sourceLocale"> }; request?: typeof apiRequest;draftStudio?:DraftStudioOptions }) {
  const router = useRouter();
  const [layout, setLayout] = useState<VenueLayout | null>(initial?.layout ?? null);
  const [event, setEvent] = useState<Pick<OrganizerEvent,"status"|"title"|"currency"|"sourceLocale"> | null>(initial?.event ?? null);
  const [state, setState] = useState<HallState>(() => initial ? importLayout(initial.layout) : { room: { widthM: 24, heightM: 16 }, editor: { version: 1, objects: [], tariffs: [] } });
  const stateRef = useRef(state); stateRef.current = state;
  const [view, setView] = useState<View>({ pxPerMetre: 20, panX: 0, panY: 0 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("cursor");
  const [tab, setTab] = useState<"object" | "hall">("hall");
  const [snap, setSnap] = useState(true);
  const [loading, setLoading] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const [ruler, setRuler] = useState<{ x: number; y: number }[]>([]);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [guide, setGuide] = useState<{ x?: number; y?: number; target?: string | undefined; rejected?: boolean } | null>(null);
  const [vertexSelection, setVertexSelection] = useState<{id:string; index:number} | null>(null);
  const [inline, setInline] = useState<string | null>(null);
  const [templates, setTemplates] = useState<VenueLayout[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorPosition, setInspectorPosition] = useState<{ x: number; y: number } | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [, historyTick] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const inspectorDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches=useRef(new Map<number,{x:number;y:number}>());
  const pinch=useRef<{distance:number;view:View;centre:{x:number;y:number}}|null>(null);
  const manualView = useRef(false);
  const space = useRef(false);
  const clipboard = useRef<HallObject[]>([]);
  const history = useRef<{ undo: Command[]; redo: Command[] }>({ undo: [], redo: [] });
  const saving = useRef(false);
  const currency=draftStudio?.currency.code??event?.currency??layout?.tables[0]?.currency??layout?.rows[0]?.currency??"KZT",contentLocale=draftStudio?.locale??event?.sourceLocale??"ru";
  const draftWords={ru:{back:"К черновику",hall:"Конструктор зала",save:"Сохранить схему",done:"Готово",name:"Название тарифа",description:"Описание тарифа",add:"Добавить тариф",tariff:"Тариф"},en:{back:"Back to draft",hall:"Hall editor",save:"Save hall",done:"Done",name:"Tariff name",description:"Tariff description",add:"Add tariff",tariff:"Tariff"},kk:{back:"Жобаға оралу",hall:"Зал редакторы",save:"Залды сақтау",done:"Дайын",name:"Тариф атауы",description:"Тариф сипаттамасы",add:"Тариф қосу",tariff:"Тариф"}}[contentLocale];
  const canonical=!!draftStudio||layout?.canonicalVersion===3;
  const money=(n:number)=>formatHallMoney(n,currency,contentLocale);
  const editable = event?.status === "draft" && !stale;
  useEffect(()=>{if(draftStudio)setState(state=>presentDraftLocale(state,draftStudio.locale));},[draftStudio?.locale]);
  const selected = state.editor.objects.find((o) => o.id === selection[0]);
  const activeRoundTable = selected?.type === "table_round" ? selected : selected?.type === "seat" ? state.editor.objects.find((o) => o.id === selected.parentId && o.type === "table_round") : undefined;
  const issues = useMemo(() => warnings(state), [state]);
  const warningIds = useMemo(() => new Set(issues.filter((i) => i.text.includes("границами") || i.text.includes("пересечение")).map((i) => i.id)), [issues]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const e = await request<OrganizerEvent>(`/api/organizer/events/${eventId}`);
      let l: VenueLayout;
      try { l = await request<VenueLayout>(`/api/organizer/events/${eventId}/venue-layout`); }
      catch (reason) {
        if (!(reason instanceof Error) || !/не найден|not found/i.test(reason.message) || e.status !== "draft") throw reason;
        l = await request<VenueLayout>(`/api/organizer/events/${eventId}/venue-layout`, { method: "POST", body: JSON.stringify({ layoutJson: { version: 2, room: { widthM: 24, heightM: 16 }, tables: [], rows: [] } }) });
      }
      setEvent(e); setLayout(l); setState(importLayout(l)); setDirty(false); setStale(false); setSavedAt(null);
      history.current = { undo: [], redo: [] }; historyTick((n) => n + 1); manualView.current = false;
      const t = await request<{ items: VenueLayout[] }>("/api/organizer/venue-layout-templates?limit=50"); setTemplates(t.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить схему"); }
    finally { setLoading(false); }
  }, [eventId, request]);
  useEffect(() => { if (!initial) void load(); }, [load, initial]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height }); });
    observer.observe(svg.current); return () => observer.disconnect();
  }, [loading]);
  const desktop = size.w >= 1024;
  const inspectorWidth = 356;
  const inspectorHeight = Math.max(280, size.h - 24);
  const panelX = Math.max(12, Math.min(size.w - inspectorWidth - 12, inspectorPosition?.x ?? size.w - inspectorWidth - 12));
  const panelY = Math.max(12, Math.min(size.h - inspectorHeight - 12, inspectorPosition?.y ?? 12));
  // Floating controls occupy the top of the workspace; fitting uses the largest uncovered rectangle.
  const fitBase: FitArea = desktop
    ? { x: 76, y: 72, width: Math.max(1, size.w - 92), height: Math.max(1, size.h - 88) }
    : { x: 62, y: 72, width: Math.max(1, size.w - 74), height: size.w < 640 ? 520 : 580 };
  const fitArea = desktop ? availableFitArea(fitBase, inspectorOpen ? { x: panelX, y: panelY, width: inspectorWidth, height: inspectorHeight } : null, state.room) : fitBase;
  useEffect(() => { if (!manualView.current) setView(fitView(size.w, size.h, state.room, fitArea)); }, [size, state.room, fitArea.x, fitArea.y, fitArea.width, fitArea.height]);
  function fit() { manualView.current = false; setView(fitView(size.w, size.h, state.room, fitArea)); }
  function startInspectorDrag(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!desktop) return;
    inspectorDrag.current = { x: e.clientX, y: e.clientY, left: panelX, top: panelY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveInspector(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = inspectorDrag.current;
    if (!drag) return;
    setInspectorPosition({ x: Math.max(12, Math.min(size.w - inspectorWidth - 12, drag.left + e.clientX - drag.x)), y: Math.max(12, Math.min(size.h - inspectorHeight - 12, drag.top + e.clientY - drag.y)) });
  }
  function commit(next: HallState, previous = stateRef.current) {
    if (!editable) return;
    if(canonical)next={...next,editor:{...next.editor,tariffs:next.editor.tariffs.map(tariff=>{const old=previous.editor.tariffs.find(value=>value.id===tariff.id);return !old||old.name!==tariff.name||old.description!==tariff.description?{...tariff,localized:{...tariff.localized,[contentLocale]:{name:tariff.name,description:tariff.description??""}}}:tariff;})}};
    if (JSON.stringify(previous) === JSON.stringify(next)) {
      if (JSON.stringify(stateRef.current) !== JSON.stringify(next)) setState(next);
      return;
    }
    const command = changeCommand(previous, next);
    history.current.undo.push(command); if (history.current.undo.length > 150) history.current.undo.shift(); history.current.redo = [];
    setState(command.apply(previous)); setDirty(true); setError(""); historyTick((n) => n + 1);
  }
  function undo(redo = false) {
    if (!editable) return;
    const from = redo ? history.current.redo : history.current.undo, to = redo ? history.current.undo : history.current.redo;
    const command = from.pop(); if (!command) return;
    setState((s) => {const next=(redo ? command : command.invert()).apply(s);return canonical?presentDraftLocale(next,contentLocale):next;}); to.push(command); setDirty(true); historyTick((n) => n + 1);
  }
  const save = useCallback(async (saveLatest = false): Promise<boolean> => {
    if (!layout || !editable || saving.current || gesture.current) return false;
    saving.current = true; setBusy(true); setError("");
    try {
      let revision = layout.revision;
      for (let attempt = 0; attempt < (saveLatest ? 3 : 1); attempt += 1) {
        const snapshot = stateRef.current;
        const parsed = hallEditorSchema.safeParse(canonical?{...snapshot.editor,objects:snapshot.editor.objects.map(object=>({...object,name:"",description:""})),tariffs:snapshot.editor.tariffs.map(tariff=>({...tariff,name:"Tariff"}))}:snapshot.editor);
        if (!parsed.success) { setError(`Схема не сохранена: ${parsed.error.issues[0]?.message}`); return false; }
        const updated = await request<VenueLayout>(`/api/organizer/venue-layouts/${layout.id}`, { method: "PATCH", body: JSON.stringify({ revision, layoutJson: { version: 2, room: snapshot.room, editor: {...snapshot.editor,objects:snapshot.editor.objects.map(({deposit:_legacy,...object})=>object)}, tables: [], rows: [] } }) });
        revision = updated.revision;
        setLayout(updated); setSavedAt(Date.now());
        if (JSON.stringify(snapshot) === JSON.stringify(stateRef.current)) { setDirty(false); return true; }
      }
      setError("Схема изменилась во время сохранения. Повторите действие.");
      return false;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось сохранить схему";
      setError(message); if (message === ru.venue.errors.staleRevision || /revision|перезагруз|обнов.*схем|измен|reload/i.test(message)) setStale(true);
      return false;
    } finally { saving.current = false; setBusy(false); }
  }, [layout, editable, request,draftStudio]);
  async function finish() {
    if (await save(true)){if(draftStudio)await draftStudio.onFinish();else router.push(`/organizer/events/${eventId}/edit?step=5`);}
  }
  useEffect(() => { if (!dirty || busy || error || !editable) return; const timer = setTimeout(() => void save(), 1500); return () => clearTimeout(timer); }, [state, dirty, busy, error, editable, save]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);

  function patch(id: string, value: Partial<HallObject>) { commit(updateObject(stateRef.current, id, value)); }
  function copyObjects() { clipboard.current = state.editor.objects.filter((o) => selection.includes(o.id) || (o.parentId && selection.includes(o.parentId))); }
  function duplicate(source = state.editor.objects.filter((o) => selection.includes(o.id) || (o.parentId && selection.includes(o.parentId)))) {
    const ids = new Map(source.map((o) => [o.id, crypto.randomUUID()]));
    const objects = source.map((o) => ({ ...o, id: ids.get(o.id)!, parentId: o.parentId ? ids.get(o.parentId) ?? null : null, x: metres(o.x + 0.5), y: metres(o.y + 0.5), attachedOrder: o.attachedOrder + state.editor.objects.length }));
    commit({ ...state, editor: { ...state.editor, objects: [...state.editor.objects, ...objects] } }); setSelection(objects.filter((o) => !o.parentId).map((o) => o.id));
  }
  function addSeat(parent: HallObject, side: HallObject["side"] = "top") {
    const seats = state.editor.objects.filter((o) => o.parentId === parent.id && (parent.type !== "table_rect" || o.side === side));
    if (seats.length >= capacity(parent, side)) { setError("На этой стороне недостаточно места: минимум 0,45 м на кресло"); return; }
    const seat = { ...newHallObject(crypto.randomUUID(), "seat", parent.x, parent.y), parentId: parent.id, side, attachedOrder: Math.max(0, ...state.editor.objects.map((o) => o.attachedOrder)) + 1 };
    commit({ ...state, editor: arrangeSeats({ ...state.editor, objects: [...state.editor.objects, seat] }, parent.id) });
  }
  function place(type: Tool, p: { x: number; y: number }) {
    if (!editable || type === "cursor") return;
    if (type === "ruler") { setRuler((points) => points.length === 1 ? [...points, p] : [p]); return; }
    if (type === "zone") { if (draftPoints.length >= 3 && Math.hypot(p.x - draftPoints[0]!.x, p.y - draftPoints[0]!.y) < 0.4) finishZone(); else setDraftPoints((points) => [...points, p]); return; }
    let object = newHallObject(crypto.randomUUID(), type, p.x, p.y);
    const isTable = type === "table_round" || type === "table_rect";
    const sequence = isTable
      ? state.editor.objects.filter((o) => o.type === "table_round" || o.type === "table_rect").length + 1
      : state.editor.objects.filter((o) => o.type === type).length + 1;
    object.name = isTable ? `Стол ${sequence}` : type === "entrance" ? "Вход" : type === "row" ? `Ряд ${sequence}` : `${titles[type]} ${sequence}`;
    if (type === "table_round") object.height = object.width;
    if (type === "prop") { object.width = 6; object.height = 2; object.description = "Зона артистов / Президиум"; }
    if (type === "entrance") object=wallSnap({...object,width:1,height:.2},state.room);
    let next = { ...state, editor: { ...state.editor, objects: [...state.editor.objects, object] } };
    if (type === "seat") next = attachSeat(next, object.id).state;
    if (type === "row") {
      const seats = Array.from({ length: 3 }, (_, i) => ({ ...newHallObject(crypto.randomUUID(), "seat", p.x, p.y), parentId: object.id, attachedOrder: i, number: i + 1 }));
      next.editor = arrangeSeats({ ...next.editor, objects: [...next.editor.objects, ...seats] }, object.id);
    }
    commit(next); setSelection([object.id]); setTool("cursor"); setTab("object");
  }
  function finishZone() {
    if (draftPoints.length < 3) return;
    const minX = Math.min(...draftPoints.map((p) => p.x)), maxX = Math.max(...draftPoints.map((p) => p.x));
    const minY = Math.min(...draftPoints.map((p) => p.y)), maxY = Math.max(...draftPoints.map((p) => p.y));
    const x = metres((minX + maxX) / 2), y = metres((minY + maxY) / 2);
    const o = { ...newHallObject(crypto.randomUUID(), "zone", x, y), name: "Стоячая зона", width: metres(Math.max(0.1, maxX - minX)), height: metres(Math.max(0.1, maxY - minY)), points: draftPoints.map((p) => ({ x: metres(p.x - x), y: metres(p.y - y) })) };
    commit({ ...state, editor: { ...state.editor, objects: [...state.editor.objects, o] } }); setDraftPoints([]); setTool("cursor"); setSelection([o.id]);
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName))) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") { space.current = true; e.preventDefault(); }
      if (mod && e.key === "0") { e.preventDefault(); fit(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(e.shiftKey); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); undo(true); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
      else if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copyObjects(); }
      else if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); duplicate(clipboard.current); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault();
        if(vertexSelection) { const o=state.editor.objects.find((o)=>o.id===vertexSelection.id); if(o && o.points.length>3) patch(o.id,{points:o.points.filter((_,i)=>i!==vertexSelection.index)}); setVertexSelection(null); }
        else { commit(removeObjects(state, selection)); setSelection([]); } }
      else if (e.key === "Escape") { setTool("cursor"); setDraftPoints([]); setRuler([]); setSelection([]); }
      else if (e.key === "Enter" && tool === "zone") finishZone();
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault(); const step = e.shiftKey ? 0.5 : 0.1;
        let next = state;
        for (const o of state.editor.objects.filter((o) => selection.includes(o.id) && !o.locked && !(o.parentId && selection.includes(o.parentId)))) next = updateObject(next, o.id, { x: metres(o.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0)), y: metres(o.y + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0)) });
        commit(next);
      } else if (!mod) { const t = tools.find((t) => t.key.toLowerCase() === e.key.toLowerCase()); if (t) setTool(t.id); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; };
    const blur = () => { space.current = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  });
  const screen = (e: { clientX: number; clientY: number }) => { const rect = svg.current!.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const world = (e: { clientX: number; clientY: number }, v = view) => { const p = screen(e); return { x: metres((p.x - v.panX) / v.pxPerMetre), y: metres((p.y - v.panY) / v.pxPerMetre) }; };
  const snapped = (p: { x: number; y: number }, alt = false) => snap && !alt ? { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 } : p;
  function pointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.button !== 1) return;
    if(e.pointerType==="touch") {
      touches.current.set(e.pointerId,screen(e));
      if(touches.current.size===2){const [a,b]=[...touches.current.values()];pinch.current={distance:Math.hypot(a!.x-b!.x,a!.y-b!.y),view,centre:{x:(a!.x+b!.x)/2,y:(a!.y+b!.y)/2}};if(gesture.current)setState(gesture.current.state);gesture.current=null;manualView.current=true;svg.current!.setPointerCapture(e.pointerId);return;}
    }
    const p = world(e), target = e.target as Element;
    const id = target.closest("[data-object]")?.getAttribute("data-object");
    const handleText = target.getAttribute("data-handle"), vertexText = target.getAttribute("data-vertex");
    svg.current!.setPointerCapture(e.pointerId);
    if (e.button === 1 || space.current) { manualView.current = true; gesture.current = { kind: "pan", start: screen(e), state, view, ids: [] }; return; }
    if (tool !== "cursor") {
      if (tool === "row") gesture.current = { kind: "row", start: p, state, view, ids: [] };
      else place(tool, snapped(p, e.altKey));
      return;
    }
    if (id) {
      const ids = e.shiftKey ? selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id] : selection.includes(id) ? selection : [id];
      setSelection(ids); setTab("object"); setVertexSelection(vertexText !== null ? {id,index:Number(vertexText)} : null);
      if (!editable || state.editor.objects.find((o) => o.id === id)?.locked) return;
      gesture.current = { kind: vertexText !== null ? "vertex" : handleText === "rotate" ? "rotate" : handleText !== null ? "resize" : "move", start: p, state, view, ids, ...(handleText && handleText !== "rotate" ? { handle: Number(handleText) } : {}), ...(vertexText !== null ? { vertex: Number(vertexText) } : {}) };
    } else { if (!e.shiftKey) setSelection([]); gesture.current = { kind: "marquee", start: p, state, view, ids: e.shiftKey ? selection : [] }; }
  }
  function pointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if(e.pointerType==="touch" && touches.current.has(e.pointerId))touches.current.set(e.pointerId,screen(e));
    if(pinch.current && touches.current.size===2){const [a,b]=[...touches.current.values()],p=pinch.current;const distance=Math.hypot(a!.x-b!.x,a!.y-b!.y),centre={x:(a!.x+b!.x)/2,y:(a!.y+b!.y)/2};const scale=Math.max(5,Math.min(400,Math.floor(p.view.pxPerMetre*distance/p.distance/5)*5));setView({pxPerMetre:scale,panX:centre.x-(p.centre.x-p.view.panX)*scale/p.view.pxPerMetre,panY:centre.y-(p.centre.y-p.view.panY)*scale/p.view.pxPerMetre});return;}
    const p = world(e); setCursor(p);
    const g = gesture.current; if (!g) return;
    if (g.kind === "pan") { const s = screen(e); setView({ ...g.view, panX: g.view.panX + s.x - g.start.x, panY: g.view.panY + s.y - g.start.y }); return; }
    if (g.kind === "marquee" || g.kind === "row") { setMarquee({ x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y), width: Math.abs(p.x - g.start.x), height: Math.abs(p.y - g.start.y) }); return; }
    let next = g.state;
    const dx = p.x - g.start.x, dy = p.y - g.start.y;
    const roots = g.state.editor.objects.filter((o) => g.ids.includes(o.id) && !o.locked && !(o.parentId && g.ids.includes(o.parentId)));
    for (const o of roots) {
      if (g.kind === "move") {
        const parent = g.state.editor.objects.find((item) => item.id === o.parentId);
        if (o.type === "seat" && parent?.type === "table_round" && !g.ids.includes(parent.id)) {
          next = moveRoundSeatOnOrbit(stateRef.current, o.id, p);
          stateRef.current = next;
          setGuide(null);
          continue;
        }
        const position = snapped({ x: metres(o.x + dx), y: metres(o.y + dy) }, e.altKey);
        const aligned: { x?: number; y?: number } = {};
        if (!e.altKey) for (const other of g.state.editor.objects.filter((a) => a.id !== o.id && !g.ids.includes(a.id) && a.type !== "seat")) {
          const extent=(item:HallObject)=>{const r=item.rotation*Math.PI/180;return{w:Math.abs(item.width*Math.cos(r))+Math.abs(item.height*Math.sin(r)),h:Math.abs(item.width*Math.sin(r))+Math.abs(item.height*Math.cos(r))};};
          const a=extent(o),b=extent(other);
          for(const edge of [-.5,0,.5]) for(const ownEdge of [-.5,0,.5]) {
            const gx=other.x+edge*b.w,gy=other.y+edge*b.h;
            if(Math.abs(position.x+ownEdge*a.w-gx)<.08){position.x=metres(gx-ownEdge*a.w);aligned.x=gx;}
            if(Math.abs(position.y+ownEdge*a.h-gy)<.08){position.y=metres(gy-ownEdge*a.h);aligned.y=gy;}
          }
        }
        next = updateObject(next, o.id, o.type === "entrance" ? wallSnap({...o,...position},state.room) : position); setGuide(aligned);
        if (o.type === "seat") { const attached = attachSeat(next, o.id); setGuide({ target: attached.target ?? undefined, rejected: attached.rejected }); /* Attach only at pointer-up; keep the drag under the pointer. */ }
      } else if (g.kind === "rotate") {
        const angle = Math.atan2(p.y - o.y, p.x - o.x) * 180 / Math.PI + 90;
        next = updateObject(next, o.id, { rotation: tableRotation(angle, o.type) });
      } else if (g.kind === "vertex" && o.type === "zone") {
        const local = rotatePoint(p.x - o.x, p.y - o.y, -o.rotation);
        next = updateObject(next, o.id, { points: o.points.map((point, i) => i === g.vertex ? { x: metres(local.x), y: metres(local.y) } : point) });
      } else if (g.kind === "resize") {
        const local = rotatePoint(p.x - o.x, p.y - o.y, -o.rotation);
        const handle = g.handle ?? 4;
        let width = [1, 5].includes(handle) ? o.width : snapDimension(Math.abs(local.x) * 2);
        let height = [3, 7].includes(handle) ? o.height : snapDimension(Math.abs(local.y) * 2);
        if (o.type === "table_round") height = width = Math.max(width, height);
        if (o.type === "row") { width = Math.max(width, next.editor.objects.filter((s) => s.parentId === o.id).length * 0.45); height = o.height; }
        next = updateObject(next, o.id, { width: metres(width), height: metres(height) });
      }
    }
    setState(next);
  }
  function pointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    touches.current.delete(e.pointerId); if(pinch.current){if(touches.current.size<2)pinch.current=null;return;}
    const g = gesture.current; gesture.current = null; setMarquee(null); setGuide(null); if (!g) return;
    if (g.kind === "marquee") {
      const p = world(e); setSelection([...new Set([...g.ids, ...state.editor.objects.filter((o) => o.x >= Math.min(g.start.x, p.x) && o.x <= Math.max(g.start.x, p.x) && o.y >= Math.min(g.start.y, p.y) && o.y <= Math.max(g.start.y, p.y)).map((o) => o.id)])]);
    } else if (g.kind === "row") {
      const p = world(e), length = Math.max(1.35, Math.hypot(p.x - g.start.x, p.y - g.start.y));
      const rowNumber = state.editor.objects.filter((o) => o.type === "row").length + 1;
      const o = { ...newHallObject(crypto.randomUUID(), "row", (p.x + g.start.x) / 2, (p.y + g.start.y) / 2), width: metres(length), rotation: metres(Math.atan2(p.y - g.start.y, p.x - g.start.x) * 180 / Math.PI), name: `Ряд ${rowNumber}` };
      const seats = Array.from({ length: 3 }, (_, i) => ({ ...newHallObject(crypto.randomUUID(), "seat", o.x, o.y), parentId: o.id, attachedOrder: i, number: i + 1 }));
      commit({ ...state, editor: arrangeSeats({ ...state.editor, objects: [...state.editor.objects, o, ...seats] }, o.id) }); setSelection([o.id]); setTool("cursor");
    } else if (g.kind !== "pan") {
      let next = stateRef.current;
      if (g.kind === "move") {
        const end = world(e);
        const movedPixels = Math.hypot(end.x - g.start.x, end.y - g.start.y) * g.view.pxPerMetre;
        if (movedPixels < 3) { setState(g.state); return; }
        const movedObjects = new Map(next.editor.objects.map((o) => [o.id, o]));
        const detachedFromRows: string[] = [], tableSeats: string[] = [];
        const rowsToArrange = new Set<string>();
        for (const id of g.ids) {
          const current = movedObjects.get(id), original = g.state.editor.objects.find((o) => o.id === id);
          if (current?.type !== "seat" || !original || g.ids.includes(original.parentId ?? "")) continue;
          const originalParent = g.state.editor.objects.find((o) => o.id === original.parentId);
          if (originalParent?.type === "row") {
            rowsToArrange.add(originalParent.id);
            if (!pointWithinRow(originalParent, current)) detachedFromRows.push(id);
          } else if (originalParent?.type !== "table_round") tableSeats.push(id);
        }
        if (detachedFromRows.length) next = { ...next, editor: { ...next.editor, objects: next.editor.objects.map((o) => detachedFromRows.includes(o.id) ? { ...o, parentId: null, side: null } : o) } };
        for (const rowId of rowsToArrange) next = { ...next, editor: arrangeSeats(next.editor, rowId) };
        for (const id of [...detachedFromRows, ...tableSeats]) next = attachSeat(next, id).state;
      }
      commit(next, g.state);
    }
  }
  // Native wheel listener is explicitly non-passive so Ctrl+wheel zoom does not zoom the browser.
  useEffect(() => {
    const element = svg.current; if (!element) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); manualView.current = true;
      const rect = element.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 40) && e.deltaX === 0) setView((v) => zoomView(v, -e.deltaY, e.clientX - rect.left, e.clientY - rect.top));
      else setView((v) => ({ ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY }));
    };
    element.addEventListener("wheel", wheel, { passive: false }); return () => element.removeEventListener("wheel", wheel);
  }, [loading]);
  async function saveTemplate(selectionOnly=false) {
    if(!layout || dirty || busy || !templateName.trim())return;
    try{const t=await request<VenueLayout>(`/api/organizer/venue-layouts/${layout.id}/templates`,{method:"POST",body:JSON.stringify({name:templateName,...(selectionOnly?{objectIds:selection}:{})})});setTemplates([...templates,t]);setTemplateName("");}
    catch(e){setError(e instanceof Error?e.message:"Ошибка шаблона");}
  }
  const sortedObjects = useMemo(() => [...state.editor.objects].sort((a, b) => a.zIndex - b.zIndex || (a.type === "seat" ? 1 : 0) - (b.type === "seat" ? 1 : 0)), [state.editor.objects]);
  const stats = useMemo(() => {
    const tables = state.editor.objects.filter((o) => o.type === "table_rect" || o.type === "table_round");
    const seats = state.editor.objects.filter((o) => o.type === "seat");
    const total = state.editor.objects.reduce((sum, object) => {
      const parent = state.editor.objects.find((candidate) => candidate.id === object.parentId);
      if ((object.type === "table_rect" || object.type === "table_round") && object.saleMode === "whole_table") return sum + (effectivePrice(object, state.editor) ?? 0);
      if (object.type === "seat" && (!parent || parent.type === "row" || parent.saleMode === "per_seat")) return sum + (effectivePrice(object, state.editor) ?? (parent ? effectivePrice(parent, state.editor) : null) ?? 0);
      if (object.type === "zone") return sum + object.capacity * (effectivePrice(object, state.editor) ?? 0);
      return sum;
    }, 0);
    return { tables: tables.length, seats: seats.length, total };
  }, [state.editor]);
  if (loading) return <main className="p-8"><div className="flex justify-end"><ThemeToggle /></div><p role="status">Загружаем конструктор…</p></main>;
  if (!layout) return <main className="p-8"><div className="flex justify-end"><ThemeToggle /></div><p role="alert">{error}</p><button className={button} onClick={() => void load()}>Повторить</button></main>;
  const worldLeft = -view.panX / view.pxPerMetre, worldTop = -view.panY / view.pxPerMetre;
  const hallName = layout.templateName?.trim() || event?.title?.trim() || "Основной зал";
  const saveStatus = busy ? "Сохранение…" : dirty ? "Есть изменения" : savedAt ? `Автосохранение ${Math.max(0, Math.floor((now - savedAt) / 1000))} сек назад` : "Схема загружена";
  return <main className="bg-[#f8f9ff] dark:bg-ticket-bg text-[#0b1c30] dark:text-ticket-text">
    <header className="flex h-14 items-center justify-between gap-2 border-b border-[#e5eefe] dark:border-ticket-border bg-white/95 dark:bg-ticket-surface/95 px-3 shadow-[0_1px_8px_rgba(11,28,48,0.06)] backdrop-blur-xl md:px-4">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Link href={draftStudio?.backHref??"/organizer/events"} onClick={event=>{if(draftStudio){event.preventDefault();void finish();}}} className="hidden shrink-0 items-center gap-2 font-bold uppercase tracking-wide text-[#4a00c1] dark:text-ticket-accent sm:flex" aria-label={draftStudio?"TICKET":"TICKET — панель организатора"}><StudioIcon name="ticket" className="h-6 w-6" /><span className="hidden lg:inline">TICKET</span></Link>
        <span className="hidden h-5 w-px shrink-0 bg-[#d3e4fe] dark:bg-ticket-raised sm:block" />
        <Link href={draftStudio?.backHref??`/organizer/events/${eventId}/edit?step=5`} onClick={(event)=>{if(draftStudio){event.preventDefault();void finish();}}} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eff4ff] dark:bg-ticket-raised hover:bg-[#e5eeff] dark:hover:bg-ticket-hover" title={draftStudio?draftWords.back:"К шагу 5"} aria-label={draftStudio?draftWords.back:"К шагу 5"}><StudioIcon name="back" className="h-4 w-4" /></Link>
        <div className="min-w-0"><p className="hidden truncate text-[11px] text-[#565e74] dark:text-ticket-muted xl:block">{draftStudio?draftWords.hall:"Панель организатора / Конструктор зала"}</p><h1 className="truncate text-sm font-bold sm:text-base">{hallName}</h1></div>
        <span className="hidden shrink-0 rounded-full bg-[#e5eeff] dark:bg-ticket-raised px-2 py-1 font-mono text-[11px] text-[#565e74] dark:text-ticket-muted md:inline">{state.room.widthM.toFixed(1)} × {state.room.heightM.toFixed(1)} м</span>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[#eff4ff] dark:bg-ticket-raised px-2 py-1 text-[11px] font-semibold text-[#494456] dark:text-ticket-muted 2xl:flex" role="status"><StudioIcon name="cloud" className="h-3.5 w-3.5 text-[#00645b] dark:text-ticket-success" />{saveStatus}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <div className="hidden items-center rounded-lg bg-[#eff4ff] dark:bg-ticket-raised p-0.5 lg:flex"><button className="grid h-7 w-7 place-items-center rounded hover:bg-[#dce9ff] dark:hover:bg-ticket-hover disabled:opacity-30" disabled={!editable || !history.current.undo.length} onClick={() => undo()} title="Отменить (Ctrl+Z)" aria-label="Отменить"><StudioIcon name="undo" className="h-[18px] w-[18px]" /></button><button className="grid h-7 w-7 place-items-center rounded hover:bg-[#dce9ff] dark:hover:bg-ticket-hover disabled:opacity-30" disabled={!editable || !history.current.redo.length} onClick={() => undo(true)} title="Повторить (Ctrl+Y)" aria-label="Повторить"><StudioIcon name="redo" className="h-[18px] w-[18px]" /></button></div>
        <div className="hidden items-center rounded-lg bg-[#eff4ff] dark:bg-ticket-raised p-0.5 sm:flex"><button className="grid h-7 w-7 place-items-center rounded hover:bg-[#dce9ff] dark:hover:bg-ticket-hover" aria-label="Уменьшить" onClick={() => { manualView.current = true; setView(zoomView(view, -1, size.w / 2, size.h / 2)); }}><StudioIcon name="minus" className="h-[18px] w-[18px]" /></button><button className="min-w-12 px-1 text-xs font-semibold" onClick={fit} title="Вписать зал (Ctrl+0)">{Math.round(view.pxPerMetre / Math.max(5, fitView(size.w, size.h, state.room, fitArea).pxPerMetre) * 100)}%</button><button className="grid h-7 w-7 place-items-center rounded hover:bg-[#dce9ff] dark:hover:bg-ticket-hover" aria-label="Увеличить" onClick={() => { manualView.current = true; setView(zoomView(view, 1, size.w / 2, size.h / 2)); }}><StudioIcon name="plus" className="h-[18px] w-[18px]" /></button></div>
        <button type="button" className={`hidden h-8 w-8 place-items-center rounded-lg sm:grid ${snap ? "bg-[#e8deff] dark:bg-ticket-raised text-[#4a00c1] dark:text-ticket-accent" : "bg-[#eff4ff] dark:bg-ticket-raised text-[#565e74] dark:text-ticket-muted"}`} onClick={() => setSnap(!snap)} aria-pressed={snap} title="Привязка к сетке 0,5 м" aria-label="Привязка к сетке"><StudioIcon name="tune" className="h-[18px] w-[18px]" /></button>
        {!draftStudio?<Link href={`/organizer/events/${eventId}/preview`} className="hidden min-h-9 items-center gap-1.5 rounded-lg bg-[#eff4ff] dark:bg-ticket-raised px-3 text-sm font-semibold transition hover:bg-[#e5eeff] dark:hover:bg-ticket-hover xl:inline-flex"><StudioIcon name="eye" className="h-[18px] w-[18px]" />Предпросмотр</Link>:null}
        <button disabled={!editable || busy} onClick={() => void save()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#6320ee] dark:bg-ticket-primary px-2.5 text-sm font-semibold text-white transition hover:bg-[#4a00c1] dark:hover:bg-ticket-primary-hover disabled:opacity-50"><StudioIcon name="save" className="h-[18px] w-[18px]" /><span className="hidden xl:inline">{draftStudio?draftWords.save:"Сохранить схему"}</span></button>
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#6320ee] dark:bg-ticket-primary px-3 text-xs font-semibold text-white hover:bg-[#4a00c1] dark:hover:bg-ticket-primary-hover" onClick={() => void finish()} disabled={!editable || busy}><StudioIcon name="check" className="h-[18px] w-[18px]" />{draftStudio?draftWords.done:"Готово"}</button>
        {!draftStudio?<button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-[#4a00c1] dark:bg-ticket-primary text-white" aria-label="Профиль организатора"><StudioIcon name="person" className="h-[18px] w-[18px]" /></button>:null}
      </div>
    </header>
    <section className="relative min-h-[900px] overflow-hidden bg-[#f8f9ff] dark:bg-ticket-bg lg:h-[calc(100dvh-56px)] lg:min-h-[650px]" aria-label="Конструктор схемы зала">
      <div className="absolute inset-0">
        <svg ref={svg} className="h-full w-full touch-none select-none outline-none" tabIndex={0} role="application" aria-label="План зала. V — курсор, пробел — перемещение, Ctrl+0 — вписать зал" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { if (gesture.current) setState(gesture.current.state); gesture.current = null; setMarquee(null); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const type = e.dataTransfer.getData("application/ticket-tool") as Tool; if (tools.some((t) => t.id === type)) place(type, snapped(world(e))); }} onDoubleClick={(e) => {
          const target = e.target as Element, id = target.closest("[data-object]")?.getAttribute("data-object");
          if (id && editable) { const o = state.editor.objects.find((o) => o.id === id); if (o?.type === "zone" && target.tagName.toLowerCase() === "polygon") {
            const p=world(e), local=rotatePoint(p.x-o.x,p.y-o.y,-o.rotation); let edge=0,best=Infinity;
            o.points.forEach((a,i)=>{const b=o.points[(i+1)%o.points.length]!,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((local.x-a.x)*dx+(local.y-a.y)*dy)/(dx*dx+dy*dy||1)));const d=Math.hypot(local.x-a.x-t*dx,local.y-a.y-t*dy);if(d<best){best=d;edge=i;}});
            patch(id,{points:[...o.points.slice(0,edge+1),{x:metres(local.x),y:metres(local.y)},...o.points.slice(edge+1)]});
          } else setInline(id); }
        }}>
          <defs><filter id="hall-floor-shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy={3 / view.pxPerMetre} stdDeviation={5 / view.pxPerMetre} floodColor="#574482" floodOpacity=".14" /></filter><filter id="hall-table-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy=".08" stdDeviation=".09" floodColor="#475569" floodOpacity=".24" /></filter><pattern id="hall-minor" width="0.5" height="0.5" patternUnits="userSpaceOnUse"><path d="M .5 0 H 0 V .5" fill="none" stroke="var(--ticket-grid-minor)" strokeWidth={0.65 / view.pxPerMetre} /></pattern><pattern id="hall-major" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill={view.pxPerMetre >= 15 ? "url(#hall-minor)" : "var(--ticket-bg)"} /><path d="M 5 0 H 0 V 5" fill="none" stroke="var(--ticket-grid-major)" strokeWidth={1 / view.pxPerMetre} /></pattern></defs>
          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.pxPerMetre})`}>
            <rect x={worldLeft} y={worldTop} width={size.w / view.pxPerMetre} height={size.h / view.pxPerMetre} fill="url(#hall-major)" />
            <rect x={0} y={0} width={state.room.widthM} height={state.room.heightM} fill="var(--ticket-hall-floor)" stroke="#8c72bd" strokeWidth={2 / view.pxPerMetre} rx="0.15" filter="url(#hall-floor-shadow)" />
            {activeRoundTable && state.editor.objects.some((o) => o.parentId === activeRoundTable.id && o.type === "seat") && <circle cx={activeRoundTable.x} cy={activeRoundTable.y} r={activeRoundTable.width / 2 + activeRoundTable.seatOffset} fill="none" stroke="#7c3aed" strokeWidth={2 / view.pxPerMetre} strokeDasharray={`${2 / view.pxPerMetre} ${5 / view.pxPerMetre}`} strokeLinecap="round" pointerEvents="none" aria-label="Траектория перемещения кресел вокруг круглого стола" />}
            <g pointerEvents="none">
              <rect x={state.room.widthM / 2 - 1.65} y={-0.34} width={3.3} height={0.54} rx={0.12} fill="var(--ticket-surface)" opacity={0.96} />
              <text x={state.room.widthM / 2} y={0} textAnchor="middle" fontSize={11 / view.pxPerMetre} fontWeight="600" fill="var(--ticket-muted)">Ширина зала: {state.room.widthM.toFixed(1)} м</text>
            </g>
            {Array.from({ length: Math.ceil(state.room.widthM / 5) + 1 }, (_, i) => <text key={`x${i}`} x={i * 5} y={-0.25} fontSize={11 / view.pxPerMetre} fill="var(--ticket-muted)" fontFamily="monospace">{i * 5}.0 м</text>)}
            {Array.from({ length: Math.ceil(state.room.heightM / 5) + 1 }, (_, i) => <text key={`y${i}`} x={-0.15} y={i * 5} textAnchor="end" fontSize={11 / view.pxPerMetre} fill="var(--ticket-muted)" fontFamily="monospace">{i * 5}.0</text>)}
            {sortedObjects.map((o) => <CanvasObject key={o.id} object={o} selected={selection.includes(o.id)} warning={warningIds.has(o.id)} highlight={guide?.target === o.id ? guide.rejected ? "#dc2626" : "#16a34a" : undefined} paint={hallObjectPaint(o, state.editor)} />)}
            {selection.map((id) => { const o = state.editor.objects.find((o) => o.id === id); if (!o) return null; const w = o.width, h = o.type === "table_round" ? o.width : o.height; const handleSize = 8 / view.pxPerMetre; return <g key={id} data-object={id} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`}>
              <rect x={-w / 2 - .05} y={-h / 2 - .05} width={w + .1} height={h + .1} fill="none" stroke="#7c3aed" strokeWidth={1.5 / view.pxPerMetre} strokeDasharray={`${4 / view.pxPerMetre} ${3 / view.pxPerMetre}`} pointerEvents="none" />
              {editable && !o.locked && <>
                {o.type !== "seat" && [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]].map(([x,y], i) => <rect key={i} data-handle={i} x={x! * w / 2 - handleSize / 2} y={y! * h / 2 - handleSize / 2} width={handleSize} height={handleSize} fill={i % 2 === 0 ? "#5b21b6" : "#ffffff"} stroke="#5b21b6" strokeWidth={1.3 / view.pxPerMetre} className="cursor-nwse-resize" />)}
                <line x1={0} y1={-h / 2} x2={0} y2={-h / 2 - 24 / view.pxPerMetre} stroke="#7c3aed" strokeWidth={1 / view.pxPerMetre} />
                <circle data-handle="rotate" cx={0} cy={-h / 2 - 24 / view.pxPerMetre} r={6 / view.pxPerMetre} fill="white" stroke="#5b21b6" strokeWidth={1.5 / view.pxPerMetre} className="cursor-grab" />
                {o.type === "row" && <g role="button" tabIndex={0} aria-label="Добавить место в ряд" aria-disabled={state.editor.objects.filter((s)=>s.parentId===o.id).length>=capacity(o)} transform={`translate(${o.width/2+24/view.pxPerMetre} 0)`} onPointerDown={(e)=>{e.preventDefault();e.stopPropagation();}} onPointerUp={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();addSeat(o);}} onDoubleClick={(e)=>e.stopPropagation()} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();addSeat(o);}}}><title>Добавить место — минимум 0,45 м на кресло</title><circle r={14/view.pxPerMetre} fill="#5b21b6"/><text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={20/view.pxPerMetre}>+</text></g>}
                {o.type === "zone" && o.points.map((p,i) => <circle key={i} data-vertex={i} cx={p.x} cy={p.y} r={6 / view.pxPerMetre} fill="#5b21b6" onContextMenu={(e) => { e.preventDefault(); if (o.points.length > 3) patch(o.id, { points: o.points.filter((_,index) => index !== i) }); }} />)}
              </>}
            </g>; })}
            {guide?.x !== undefined && <line x1={guide.x} x2={guide.x} y1={worldTop} y2={worldTop + size.h / view.pxPerMetre} stroke="#f43f5e" strokeWidth={1 / view.pxPerMetre} />}
            {guide?.y !== undefined && <line y1={guide.y} y2={guide.y} x1={worldLeft} x2={worldLeft + size.w / view.pxPerMetre} stroke="#f43f5e" strokeWidth={1 / view.pxPerMetre} />}
            {marquee && <rect {...marquee} fill="#8b5cf622" stroke="#7c3aed" strokeWidth={1 / view.pxPerMetre} pointerEvents="none" />}
            {draftPoints.length > 0 && <polyline points={[...draftPoints, cursor].map((p) => `${p.x},${p.y}`).join(" ")} fill="#8b5cf622" stroke="#7c3aed" strokeWidth={2 / view.pxPerMetre} pointerEvents="none" />}
            {ruler.length > 0 && <><line x1={ruler[0]!.x} y1={ruler[0]!.y} x2={(ruler[1] ?? cursor).x} y2={(ruler[1] ?? cursor).y} stroke="#be123c" strokeWidth={2 / view.pxPerMetre} /><text x={ruler[0]!.x} y={ruler[0]!.y - .3} fontSize={14 / view.pxPerMetre} fill="#be123c">{Math.hypot((ruler[1] ?? cursor).x - ruler[0]!.x, (ruler[1] ?? cursor).y - ruler[0]!.y).toFixed(2)} м</text></>}
          </g>
        </svg>

        {inline && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 rounded-xl bg-white dark:bg-ticket-surface p-2 shadow-lg"><input autoFocus aria-label="Название объекта" className={input} defaultValue={state.editor.objects.find((o) => o.id === inline)?.name} onKeyDown={(e) => { if (e.key === "Enter") { patch(inline, { name: e.currentTarget.value }); setInline(null); } if (e.key === "Escape") setInline(null); }} onBlur={(e) => { patch(inline, { name: e.currentTarget.value }); setInline(null); }} /></div>}
      </div>
      <div className="absolute left-[68px] top-3 z-10 flex max-w-[calc(100%-88px)] items-center gap-1 overflow-x-auto rounded-xl border border-[#e5eefe] dark:border-ticket-border bg-white/95 dark:bg-ticket-surface/95 p-1.5 text-xs shadow-[0_5px_18px_rgba(11,28,48,0.10)] backdrop-blur lg:max-w-[calc(100%-448px)]">
        <button className="shrink-0 rounded-lg px-3 py-2 font-semibold transition hover:bg-[#eff4ff] dark:hover:bg-ticket-hover" onClick={fit}>Вписать зал</button><span className="h-5 shrink-0 border-l border-[#d3e4fe] dark:border-ticket-border" aria-hidden="true" />
        <span className="flex shrink-0 items-center gap-1.5 px-2 text-[#565e74] dark:text-ticket-muted" role="status"><StudioIcon name="cloud" className="h-3.5 w-3.5 text-[#00645b] dark:text-ticket-success" />{saveStatus}</span><span className="h-5 shrink-0 border-l border-[#d3e4fe] dark:border-ticket-border" aria-hidden="true" />
        <span className="shrink-0 px-2">Столиков: <b>{stats.tables}</b></span><span className="shrink-0 px-2">Мест: <b>{stats.seats}</b></span><span className="shrink-0 px-2">Тарифов: <b>{state.editor.tariffs.length}</b></span><span className="shrink-0 px-2 font-mono font-semibold text-[#4a00c1] dark:text-ticket-accent">При аншлаге: {money(stats.total)}</span>
      </div>
      <div className="absolute bottom-4 left-[76px] z-10 rounded-xl border border-[#e5eefe] dark:border-ticket-border bg-white/95 dark:bg-ticket-surface/95 p-3 font-mono text-xs shadow-[0_5px_18px_rgba(11,28,48,0.10)]"><b>Север зала: 0°</b><p className="mt-1 text-[#565e74] dark:text-ticket-muted">Масштаб: 1 м = {view.pxPerMetre} px (1:{Math.round(1000 / view.pxPerMetre)})</p><p className="mt-1 text-[#7a7488] dark:text-ticket-muted">X: {cursor.x.toFixed(2)} м · Y: {cursor.y.toFixed(2)} м</p></div>
      {inspectorOpen && <aside id="hall-inspector" className="absolute left-3 right-3 top-[650px] z-20 max-h-[420px] overflow-y-auto rounded-2xl border border-[#e5eefe] dark:border-ticket-border bg-white dark:bg-ticket-surface shadow-[0_12px_32px_rgba(11,28,48,0.14)] md:top-[690px] lg:left-auto lg:right-auto lg:top-auto lg:max-h-none lg:w-[356px]" style={desktop ? { left: panelX, top: panelY, height: inspectorHeight } : undefined} aria-label="Инспектор">
        <div className="sticky top-0 z-10 rounded-t-2xl border-b border-[#e5eefe] dark:border-ticket-border bg-white/95 dark:bg-ticket-surface/95 p-3 backdrop-blur"><div className="mb-2 flex items-center gap-2"><button type="button" className="cursor-grab touch-none rounded-lg p-1 text-[#565e74] dark:text-ticket-muted hover:bg-[#eff4ff] dark:hover:bg-ticket-hover active:cursor-grabbing disabled:cursor-default" aria-label="Переместить инспектор" title="Перетащите инспектор" disabled={!desktop} onPointerDown={startInspectorDrag} onPointerMove={moveInspector} onPointerUp={(e) => { inspectorDrag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { inspectorDrag.current = null; }}><StudioIcon name="tune" className="h-[18px] w-[18px]" /></button><h2 className="flex-1 text-lg font-bold">Инспектор</h2><button className="rounded-lg px-2 py-1 text-xs font-semibold text-[#4a00c1] dark:text-ticket-accent hover:bg-[#eff4ff] dark:hover:bg-ticket-hover" onClick={() => setInspectorPosition(null)} title="Вернуть инспектор справа">Сброс</button><button className="grid h-7 w-7 place-items-center rounded-lg text-[#565e74] dark:text-ticket-muted hover:bg-[#eff4ff] dark:hover:bg-ticket-hover" onClick={() => setInspectorOpen(false)} aria-label="Скрыть инспектор"><StudioIcon name="close" className="h-[18px] w-[18px]" /></button></div><div className="flex rounded-xl bg-[#eff4ff] dark:bg-ticket-raised p-1 text-xs" role="tablist" onKeyDown={(e)=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const next=e.key==="Home"?"hall":e.key==="End"?"object":tab==="object"?"hall":"object";setTab(next);document.getElementById(`hall-tab-${next}`)?.focus();}}}><button id="hall-tab-hall" aria-controls="hall-inspector-panel" tabIndex={tab==="hall"?0:-1} role="tab" aria-selected={tab === "hall"} onClick={() => setTab("hall")} className={`${button} flex-1 ${tab === "hall" ? "bg-white dark:bg-ticket-surface text-[#4a00c1] dark:text-ticket-accent shadow-sm" : "text-[#565e74] dark:text-ticket-muted"}`}>Слои &amp; Зоны</button><button id="hall-tab-object" aria-controls="hall-inspector-panel" tabIndex={tab==="object"?0:-1} role="tab" aria-selected={tab === "object"} onClick={() => setTab("object")} className={`${button} flex-1 ${tab === "object" ? "bg-white dark:bg-ticket-surface text-[#4a00c1] dark:text-ticket-accent shadow-sm" : "text-[#565e74] dark:text-ticket-muted"}`}>Свойства объекта</button></div></div>
        <fieldset id="hall-inspector-panel" role="tabpanel" aria-labelledby={`hall-tab-${tab}`} disabled={!editable} className="space-y-3 p-3">
          {tab === "object" ? selected ? <Inspector object={selected} state={state} currency={currency} contentLocale={contentLocale} draftMode={canonical} patch={patch} commit={commit} select={(id) => setSelection([id])} addSeat={addSeat} duplicate={() => duplicate()} remove={() => { commit(removeObjects(state, selection)); setSelection([]); }} /> : <div className="py-10 text-center text-sm text-slate-500 dark:text-ticket-muted"><p className="mb-3 text-3xl text-violet-500 dark:text-ticket-accent">↖</p>Выберите объект на плане<br />или перетащите инструмент из панели</div> : <>
            <h3 className="font-semibold">Параметры зала</h3><div className="grid grid-cols-2 gap-3"><Field label="Ширина, м" value={state.room.widthM} min={2} max={200} onValue={(n) => commit({ ...state, room: { ...state.room, widthM: n } })} /><Field label="Глубина, м" value={state.room.heightM} min={2} max={200} onValue={(n) => commit({ ...state, room: { ...state.room, heightM: n } })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />Привязка к сетке 0,5 м</label>
            <h3 className="border-t border-violet-100 dark:border-ticket-accent pt-4 font-semibold">Ценовые тарифы</h3>
            {state.editor.tariffs.map((tariff) => <div key={tariff.id} className="space-y-2 rounded-xl bg-violet-50 dark:bg-ticket-accent-soft p-3">{canonical?<><CountedField label={draftWords.name} max={60} value={tariff.name} onChange={(name)=>commit({...state,editor:{...state.editor,tariffs:state.editor.tariffs.map(t=>t.id===tariff.id?{...t,name}:t)}})}/><CountedField label={draftWords.description} max={300} value={tariff.description??""} onChange={(description)=>commit({...state,editor:{...state.editor,tariffs:state.editor.tariffs.map(t=>t.id===tariff.id?{...t,description}:t)}})}/></>:<TextField label="Название тарифа" value={tariff.name} onValue={(name) => commit({ ...state, editor: { ...state.editor, tariffs: state.editor.tariffs.map((t) => t.id === tariff.id ? { ...t, name } : t) } })} /> }<TariffPalette value={tariffColor(tariff.color, state.editor.tariffs.indexOf(tariff))} onValue={(color) => commit({ ...state, editor: { ...state.editor, tariffs: state.editor.tariffs.map((t) => t.id === tariff.id ? { ...t, color } : t) } })} /><div className="flex items-end gap-2"><MoneyField label="Цена" value={canonical&&tariff.draftAmount!==undefined?tariff.draftAmount:tariff.price} currency={draftStudio?.currency??{code:currency,exponent:2}} onChange={(price)=>commit({...state,editor:{...state.editor,tariffs:state.editor.tariffs.map(t=>t.id===tariff.id?{...t,price:price??0,...(canonical?{draftAmount:price}:{})}:t)}})}/><button className={button} title="Удаление доступно после переназначения всех объектов" disabled={state.editor.objects.some((o) => o.tariffId === tariff.id)} onClick={() => commit({ ...state, editor: { ...state.editor, tariffs: state.editor.tariffs.filter((t) => t.id !== tariff.id) } })}>×</button></div></div>)}
            <button className={`${button} w-full bg-violet-100 dark:bg-ticket-accent-soft text-violet-800 dark:text-ticket-accent`} onClick={() => commit({ ...state, editor: { ...state.editor, tariffs: [...state.editor.tariffs, { id: crypto.randomUUID(), name: `${draftWords.tariff} ${state.editor.tariffs.length + 1}`, color: TARIFF_COLORS.find(item => !state.editor.tariffs.some(t => tariffColor(t.color) === item.color))?.color ?? TARIFF_COLORS[state.editor.tariffs.length % 10]!.color, price: 0 }] } })}>+ {draftWords.add}</button>
            <h3 className="border-t border-violet-100 dark:border-ticket-accent pt-4 font-semibold">Проверка схемы · {issues.length}</h3>{issues.length ? issues.map((issue, i) => <button key={i} className="block text-left text-xs text-amber-800 dark:text-ticket-warning hover:underline" onClick={() => { setSelection([issue.id]); setTab("object"); }}>{issue.text}</button>) : <p className="text-sm text-emerald-700 dark:text-ticket-success">Замечаний нет</p>}
          </>}
        </fieldset>
      </aside>}
      <nav className="absolute bottom-3 left-2 top-3 z-20 flex w-12 flex-col items-center gap-1 overflow-visible rounded-xl border border-[#e5eefe] dark:border-ticket-border bg-white/95 dark:bg-ticket-surface/95 py-2 shadow-[0_6px_20px_rgba(11,28,48,0.12)] backdrop-blur" aria-label="Панель инструментов зала">
        {tools.map((t) => <span key={t.id} className="group relative flex shrink-0 flex-col items-center">{["table_round", "ruler"].includes(t.id) && <span className="mb-1 h-px w-7 bg-[#d3e4fe] dark:bg-ticket-raised" aria-hidden="true" />}<button draggable={editable && !["cursor", "ruler", "zone"].includes(t.id)} onDragStart={(e) => e.dataTransfer.setData("application/ticket-tool", t.id)} className={`grid h-9 w-9 place-items-center rounded-xl transition ${tool === t.id ? "bg-[#6320ee] dark:bg-ticket-primary text-white shadow-sm" : "text-[#494456] dark:text-ticket-muted hover:bg-[#e5eeff] dark:hover:bg-ticket-hover hover:text-[#0b1c30] dark:hover:text-ticket-text"}`} aria-pressed={tool === t.id} aria-label={`${t.label} (${t.key})`} title={`${t.label} (${t.key})`} onClick={() => setTool(t.id)}><StudioIcon name={t.icon} className="h-5 w-5" /></button><span className="pointer-events-none absolute left-12 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#213145] dark:bg-ticket-raised px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{t.label} ({t.key})</span></span>)}
        <span className="my-1 h-px w-7 bg-[#d3e4fe] dark:bg-ticket-raised" aria-hidden="true" />
        <span className="group relative"><button className={`grid h-9 w-9 place-items-center rounded-xl transition ${showTemplates ? "bg-[#e8deff] dark:bg-ticket-raised text-[#4a00c1] dark:text-ticket-accent" : "text-[#494456] dark:text-ticket-muted hover:bg-[#e5eeff] dark:hover:bg-ticket-hover"}`} disabled={!!draftStudio} onClick={() => setShowTemplates(!showTemplates)} aria-pressed={showTemplates} aria-label="Шаблоны рассадки" title="Шаблоны рассадки"><StudioIcon name="templates" className="h-5 w-5" /></button><span className="pointer-events-none absolute left-12 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#213145] dark:bg-ticket-raised px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">Шаблоны рассадки</span></span>
        {!inspectorOpen && <button className="mt-auto grid h-9 w-9 place-items-center rounded-xl text-[#4a00c1] dark:text-ticket-accent hover:bg-[#e8deff] dark:hover:bg-ticket-hover" onClick={() => setInspectorOpen(true)} aria-label="Показать инспектор" title="Показать инспектор"><StudioIcon name="tune" className="h-5 w-5" /></button>}
      </nav>
      {showTemplates && <div className="absolute left-16 top-4 z-30 w-80 rounded-2xl border border-[#e5eefe] dark:border-ticket-border bg-white dark:bg-ticket-surface p-4 shadow-xl"><h3 className="font-bold">Шаблоны зала</h3><p className="my-2 text-xs text-slate-500 dark:text-ticket-muted">Вставляются копии объектов с новыми идентификаторами.</p>{templates.map((t) => <button key={t.id} className={`${button} block w-full text-left`} onClick={() => { const imported = importLayout(t); const tariffIds = new Map(imported.editor.tariffs.map((tariff) => [tariff.id, crypto.randomUUID()])); const ids = new Map(imported.editor.objects.map((o) => [o.id, crypto.randomUUID()])); commit({ ...state, editor: { version: 1, tariffs: [...state.editor.tariffs, ...imported.editor.tariffs.map((tariff) => ({ ...tariff, id: tariffIds.get(tariff.id)! }))], objects: [...state.editor.objects, ...imported.editor.objects.map((o) => ({ ...o, id: ids.get(o.id)!, parentId: o.parentId ? ids.get(o.parentId)! : null, tariffId: o.tariffId ? tariffIds.get(o.tariffId)! : null }))] } }); setShowTemplates(false); }}>{t.templateName}</button>)}<input className={input} aria-label="Название шаблона" placeholder="Название шаблона" value={templateName} onChange={(e) => setTemplateName(e.target.value)} /><button className={button} disabled={dirty || busy || !templateName.trim()} onClick={() => void saveTemplate()}>Сохранить текущий зал</button><button className={button} disabled={dirty || busy || !templateName.trim() || !selection.length} onClick={() => void saveTemplate(true)}>Сохранить выделение</button></div>}
    </section>
    {(error || !editable) && <div className="relative z-20 border-t border-amber-200 dark:border-ticket-warning-border bg-amber-50 dark:bg-ticket-warning-soft p-3 text-sm text-amber-900 dark:text-ticket-warning" role="alert">{error || "Структуру схемы можно менять только в черновике"}{stale && <button className={button} onClick={() => { if (window.confirm("Загрузить актуальную схему? Несохранённые изменения будут потеряны.")) void load(); }}>Загрузить актуальную схему</button>}</div>}
  </main>;
}

function rowPath(o: HallObject): string {
  if (Math.abs(o.curvature) < 0.001) return `M ${-o.width/2} 0 L ${o.width/2} 0`;
  const sag=Math.abs(o.curvature), r=o.width**2/(8*sag)+sag/2;
  return `M ${-o.width/2} 0 A ${r} ${r} 0 ${sag>o.width/2?1:0} ${o.curvature>0?0:1} ${o.width/2} 0`;
}

const CanvasObject = memo(function CanvasObject({ object: o, selected, warning, highlight, paint }: { object: HallObject; selected: boolean; warning: boolean; highlight?: string | undefined; paint: ReturnType<typeof hallObjectPaint> }) {
  const { neutral, tariff } = paint;
  const color = o.locked && !neutral && ["seat", "row", "table_rect", "table_round", "zone"].includes(o.type) ? UNAVAILABLE_HALL_COLOR : paint.color;
  const tariffName = tariff?.name;
  const seatColor = color;
  const stroke = highlight || (warning ? "#dc2626" : selected ? "#151c27" : neutral ? "#94a3b8" : seatColor);
  const table = o.type === "table_round" || o.type === "table_rect";
  const tableStroke = highlight || (warning ? "#dc2626" : selected ? "#151c27" : neutral ? "#94a3b8" : color);
  const displayName = o.type === "row" && /^Ряд(?: \d+)?$/i.test(o.name) ? `${o.name.toUpperCase()} (ПАРТЕР)` : o.name;
  const tooltip = `${o.name || titles[o.type]}${table ? ` · ${o.width.toFixed(2)} × ${(o.type === "table_round" ? o.width : o.height).toFixed(2)} м${tariffName ? ` · ${tariffName}` : ""}` : ""}${o.locked ? " · заблокировано" : ""}`;
  return <g data-object={o.id} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`} className={o.locked ? "cursor-not-allowed" : "cursor-move"}>
    <title>{tooltip}</title>
    {o.type === "seat" ? <><rect x={-.225} y={-.225} width={.45} height={.45} rx={.15} fill={seatColor} stroke={stroke} strokeWidth={selected || warning ? .04 : .01} /><path d="M -.18 -.14 Q 0 -.23 .18 -.14" fill="none" stroke={hallTextColor(seatColor)} strokeWidth={.025} /><text y={.075} fontSize={.2} fill={hallTextColor(seatColor)} textAnchor="middle" transform={`rotate(${-o.rotation})`}>{o.number}</text></> : o.type === "table_round" ? <circle r={o.width / 2} fill={color} stroke={tableStroke} strokeWidth={selected || warning || highlight ? .04 : .02} filter="url(#hall-table-shadow)" /> : o.type === "zone" ? <polygon points={o.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={color} fillOpacity={o.opacity} stroke={stroke} strokeWidth={.03} /> : o.type === "row" ? <path d={rowPath(o)} stroke={stroke} strokeWidth={.55} strokeOpacity={.12} fill="none" /> : o.type === "entrance" ? <rect x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} rx={Math.min(.1, o.height / 2)} fill="#dce9ff" stroke={tableStroke} strokeWidth={selected || warning ? .04 : .01} /> : <rect x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} rx={.12} fill={o.type === "prop" || o.type === "table_rect" ? color : "white"} stroke={o.type === "table_rect" ? tableStroke : stroke} strokeWidth={selected || warning || highlight ? .04 : .02} filter={o.type === "table_rect" ? "url(#hall-table-shadow)" : undefined} />}
    {o.type === "row" ? <text textAnchor="middle" dominantBaseline="middle" transform={`translate(${-o.width / 2 - .22} 0) rotate(-90)`} fontSize={.18} fontFamily="Arial, Helvetica, sans-serif" fontWeight="400" fill="var(--ticket-text)">{displayName}</text> : o.type !== "seat" && <FittedSvgText text={`${o.type === "entrance" ? `${o.entranceType === "in" ? "→" : o.entranceType === "out" ? "←" : "↔"} ` : ""}${displayName}`} maxWidth={o.width * (o.type === "table_round" ? .68 : .88)} maxHeight={(o.type === "table_round" ? o.width * .68 : o.height * (o.type === "prop" && o.description ? .5 : .7))} y={o.type === "prop" && o.description ? -.12 : 0} fontSize={o.type === "entrance" ? .16 : table ? .38 : .3} fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fill={o.type === "prop" ? "white" : o.type === "entrance" ? "#005049" : hallTextColor(color)} />}
    {o.type === "prop" && <text y={.25} textAnchor="middle" fontSize={.16} fill="#e9d5ff">{o.description || "Зона артистов / Президиум"} ({o.width.toFixed(1)} × {o.height.toFixed(1)} м)</text>}
    {selected && table && <g transform={`translate(0 ${-((o.type === "table_round" ? o.width : o.height) / 2) - o.seatOffset - .65})`} pointerEvents="none"><rect x={-1.15} y={-.22} width={2.3} height={.4} rx={.08} fill="#213145" /><text y={.02} textAnchor="middle" dominantBaseline="middle" fontSize={.16} fontWeight="700" fill="white">{o.width.toFixed(2)} × {(o.type === "table_round" ? o.width : o.height).toFixed(2)} м{tariffName ? ` ${tariffName}` : ""}</text></g>}
  </g>;
});
function Field({ label, value, onValue, min = .1, max = 200, step = .1 }: { label: string; value: number; onValue: (n: number) => void; min?: number; max?: number; step?: number }) {
  const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(value)), [value]);
  return <label className="block text-xs text-slate-600 dark:text-ticket-muted">{label}<input type="number" className={`${input} font-mono`} value={draft} min={min} max={max} step={step} onChange={(e) => setDraft(e.target.value)} onBlur={() => { const n = Number(draft); if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onValue(metres(n)); else setDraft(String(value)); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(String(value)); e.currentTarget.blur(); } }} /></label>;
}
function TariffPalette({value,onValue}:{value:string;onValue:(value:string)=>void}) {
  return <div role="group" aria-label="Цвет тарифа" className="grid grid-cols-5 gap-2 py-2">{TARIFF_COLORS.map(item => <button key={item.color} type="button" aria-label={item.name} aria-pressed={value === item.color} title={item.name} className="grid h-8 w-full place-items-center rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500" style={{backgroundColor:item.color,color:hallTextColor(item.color),borderColor:value===item.color?"var(--ticket-text)":"transparent"}} onClick={()=>onValue(item.color)}>{value===item.color?"✓":null}</button>)}</div>;
}

function ColorField({label,value,onValue}:{label:string;value:string;onValue:(value:string)=>void}) {
  const [draft,setDraft]=useState(value);useEffect(()=>setDraft(value),[value]);
  return <input aria-label={label} type="color" value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)onValue(draft);}} />;
}
function TextField({ label, value, onValue, id }: { label: string; value: string; onValue: (n: string) => void; id?: string }) {
  const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]);
  return <label className="block text-xs text-slate-600 dark:text-ticket-muted">{label}<input id={id} className={input} maxLength={120} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onValue(draft); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>;
}
function Inspector({ object: o, state, patch, commit, select, addSeat, duplicate, remove,currency,contentLocale,draftMode }: { object: HallObject; state: HallState; patch: (id: string, p: Partial<HallObject>) => void; commit: (s: HallState) => void; select: (id: string) => void; addSeat: (o: HallObject, side?: HallObject["side"]) => void; duplicate: () => void; remove: () => void;currency:string;contentLocale:EventLocale;draftMode:boolean }) {
  const money=(n:number)=>formatHallMoney(n,currency,contentLocale);
  const table = o.type.startsWith("table_");
  const seating = table || o.type === "row";
  const children = state.editor.objects.filter((s) => s.parentId === o.id).sort((a,b) => a.number - b.number);
  const sold = o.type === "seat" || o.type === "zone" || o.type === "row" || table;
  const tariff = hallTariff(o, state.editor);
  const tariffSeatCount = tariff ? state.editor.objects.filter((item) => item.type === "seat" && hallTariff(item, state.editor)?.id === tariff.id).length : 0;
  const typeLabel: Record<HallObject["type"], string> = { table_rect: "Прямоугольный стол (Банкет)", table_round: "Круглый стол (Банкет)", seat: "Отдельное кресло", row: "Ряд кресел", zone: "Стоячая зона", prop: "Сцена / объект", entrance: "Вход / выход" };
  const removeLastSeat = () => { const last = children.at(-1); if (last) commit(removeObjects(state, [last.id])); };
  const rectSides = [["top", "сверху"], ["bottom", "снизу"], ["right", "справа"], ["left", "слева"]] as const;
  const nextRectSide = o.type === "table_rect" ? rectSides.find(([side]) => children.filter((seat) => seat.side === side).length < capacity(o, side))?.[0] : null;
  return <>
    <div className="rounded-xl bg-[#eff4ff] dark:bg-ticket-raised p-3">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#4a00c1] dark:bg-ticket-primary text-white"><StudioIcon name={o.type === "table_round" ? "roundTable" : o.type === "table_rect" ? "rectTable" : o.type === "seat" ? "chair" : o.type === "row" ? "row" : o.type === "zone" ? "zone" : o.type === "entrance" ? "door" : "stage"} className="h-6 w-6" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-1"><strong className="truncate text-base">{o.name || titles[o.type]}</strong><button className="grid h-7 w-7 place-items-center rounded text-[#565e74] dark:text-ticket-muted hover:bg-white dark:hover:bg-ticket-surface" onClick={() => document.getElementById(`inspector-name-${o.id}`)?.focus()} aria-label="Изменить название"><StudioIcon name="edit" className="h-[18px] w-[18px]" /></button></div><p className="truncate text-xs text-[#565e74] dark:text-ticket-muted">{typeLabel[o.type]}</p></div>{!sold && <ColorField label="Цвет объекта" value={o.color} onValue={(color) => patch(o.id, { color, colorOverride: true })} />}</div>
      <div className="mt-3">{draftMode?<CountedField label="Название объекта" max={120} value={o.name} onChange={(name)=>patch(o.id,{name})}/>:<TextField id={`inspector-name-${o.id}`} label="Название" value={o.name} onValue={(name) => patch(o.id, { name })} />}</div>
    </div>

    {o.type === "table_rect" && <section className="space-y-2 border-b border-[#e5eefe] dark:border-ticket-border pb-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#565e74] dark:text-ticket-muted">Добавить стул к столу</h3>
      <div className="grid grid-cols-2 gap-2">
        {rectSides.map(([side, direction]) => {
          const full = children.filter((seat) => seat.side === side).length >= capacity(o, side);
          return <button key={side} type="button" className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[#dce6ff] dark:border-ticket-border bg-[#eff4ff] dark:bg-ticket-raised px-2 text-xs font-semibold text-[#29105a] dark:text-ticket-accent hover:bg-[#dce9ff] dark:hover:bg-ticket-hover disabled:cursor-not-allowed disabled:opacity-40" disabled={full} onClick={() => addSeat(o, side)} title={full ? "На этой стороне больше нет места для стула" : `Добавить стул ${direction}`}><StudioIcon name="plus" className="h-4 w-4" />Добавить стул {direction}</button>;
        })}
      </div>
    </section>}

    <section className="space-y-2 border-b border-[#e5eefe] dark:border-ticket-border pb-3"><h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#565e74] dark:text-ticket-muted">Положение и размеры</h3><div className="grid grid-cols-2 gap-2"><Field label="X, м" value={o.x} min={-1000} max={1000} onValue={(x) => patch(o.id, { x })} /><Field label="Y, м" value={o.y} min={-1000} max={1000} onValue={(y) => patch(o.id, { y })} />{o.type !== "seat" && <><Field label={o.type === "table_round" ? "Диаметр, м" : "Ширина, м"} value={o.width} onValue={(width) => patch(o.id, { width, ...(o.type === "table_round" ? { height: width } : {}) })} />{o.type !== "table_round" && <Field label="Высота, м" value={o.height} onValue={(height) => patch(o.id, { height })} />}</>}<div className="col-span-2"><Field label="Угол поворота, °" value={o.rotation} min={-180} max={180} step={1} onValue={(rotation) => patch(o.id, { rotation: tableRotation(rotation, o.type) })} /></div></div></section>

    {seating && <section className="space-y-2 border-b border-[#e5eefe] dark:border-ticket-border pb-3"><div className="flex items-center justify-between"><h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#565e74] dark:text-ticket-muted">Параметры рассадки</h3><span className="rounded-full bg-[#89f5e7] dark:bg-ticket-success-soft px-2 py-0.5 text-[11px] font-bold text-[#00201d] dark:text-ticket-success">{children.length} {children.length === 1 ? "место" : "мест"}</span></div><div className="flex items-center justify-between"><span className="text-sm">Количество мест</span><div className="flex items-center rounded-lg bg-[#eff4ff] dark:bg-ticket-raised p-0.5"><button className="grid h-8 w-8 place-items-center rounded hover:bg-[#dce9ff] dark:hover:bg-ticket-hover disabled:opacity-30" disabled={!children.length} onClick={removeLastSeat} aria-label="Убрать последнее место"><StudioIcon name="minus" className="h-4 w-4" /></button><b className="min-w-8 text-center text-sm">{children.length}</b><button className="grid h-8 w-8 place-items-center rounded hover:bg-[#dce9ff] dark:hover:bg-ticket-hover disabled:opacity-30" disabled={o.type === "table_rect" ? !nextRectSide : children.length >= capacity(o)} onClick={() => addSeat(o, o.type === "table_rect" ? nextRectSide : "top")} aria-label="Добавить место"><StudioIcon name="plus" className="h-4 w-4" /></button></div></div><label className="block text-xs text-[#565e74] dark:text-ticket-muted">Авто-нумерация мест<SelectPicker className={input} value={o.type === "row" && o.reverse ? "reverse" : "clockwise"} onChange={(e) => { if (o.type === "row") patch(o.id, { reverse: e.target.value === "reverse" }); }}><option value="clockwise">{o.type === "row" ? "Слева направо" : "По часовой стрелке"}</option>{o.type === "row" && <option value="reverse">Справа налево</option>}</SelectPicker></label><div className="flex items-center justify-between text-sm"><span>{o.type === "table_round" ? "Минимум по окружности" : "Интервал кресел"}</span><b className="font-mono">{o.type === "table_round" ? `${ROUND_SEAT_ARC_METRES * 100} см` : "45 см"}</b></div>{o.type === "table_round" && <p className="text-xs text-[#565e74] dark:text-ticket-muted">Перетащите кресло по пунктирной окружности, чтобы направить места к сцене.</p>}{o.type === "table_round" && children.some((seat) => seat.orbitAngle !== undefined) && <button type="button" className="rounded-lg border border-[#dce6ff] dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 py-2 text-xs font-semibold text-[#4a00c1] dark:text-ticket-accent hover:bg-[#eff4ff] dark:hover:bg-ticket-hover" onClick={() => { const editor = { ...state.editor, objects: state.editor.objects.map((item) => item.parentId === o.id ? { ...item, orbitAngle: undefined } : item) }; commit({ ...state, editor: arrangeSeats(editor, o.id) }); }}>Распределить места равномерно</button>}{table && <><Field label="Отступ кресел от края, м" value={o.seatOffset} min={.225} max={3} step={.05} onValue={(seatOffset) => patch(o.id, { seatOffset })} /><label className="block text-xs text-[#565e74] dark:text-ticket-muted">Способ продажи<SelectPicker className={input} value={o.saleMode} onChange={(e) => patch(o.id, { saleMode: e.target.value as HallObject["saleMode"] })}><option value="whole_table">Стол целиком</option><option value="per_seat">По местам</option></SelectPicker></label></>}{o.type === "row" && <><label className="flex gap-2 text-xs"><input type="checkbox" checked={o.curvature !== 0} onChange={(e) => patch(o.id, { curvature: e.target.checked ? .5 : 0 })} />Дуга</label>{o.curvature !== 0 && <Field label="Прогиб дуги, м" value={o.curvature} min={-100} max={100} onValue={(curvature) => patch(o.id, { curvature })} />}<Field label="Первый номер" value={o.startNumber} min={1} max={999000} step={1} onValue={(startNumber) => patch(o.id, { startNumber: Math.round(startNumber) })} /></>}</section>}

    {sold && !(o.type === "seat" && state.editor.objects.find((p) => p.id === o.parentId)?.saleMode === "whole_table" && state.editor.objects.find((p) => p.id === o.parentId)?.type !== "row") && <section className="space-y-2 border-b border-[#e5eefe] dark:border-ticket-border pb-3"><h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#565e74] dark:text-ticket-muted">Ценовая категория / тариф</h3><label className="block text-xs text-[#565e74] dark:text-ticket-muted">Тариф<SelectPicker id={`inspector-tariff-${o.id}`} className={input} value={o.tariffId ?? ""} onChange={(e) => patch(o.id, { tariffId: e.target.value || null, price: null, colorOverride: false })}><option value="">Без тарифа</option>{state.editor.tariffs.map((t) => <option key={t.id} value={t.id}>{t.name} — {money(t.price)}</option>)}</SelectPicker></label>{tariff && <div className="rounded-xl bg-[#edf6f5] dark:bg-ticket-raised p-3"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: tariffColor(tariff.color, state.editor.tariffs.indexOf(tariff)) }} /><strong className="min-w-0 flex-1 truncate text-sm">{tariff.name}</strong><b className="text-sm text-[#4a00c1] dark:text-ticket-accent">{money(tariff.price)}</b></div><div className="mt-2 flex items-center justify-between text-[11px] text-[#565e74] dark:text-ticket-muted"><span>Доступно мест по тарифу: {tariffSeatCount}</span><button className="font-semibold text-[#4a00c1] dark:text-ticket-accent" type="button" onClick={() => document.getElementById(`inspector-tariff-${o.id}`)?.focus()}>Изменить</button></div></div>}{!draftMode?<><MoneyField label="Цена" value={effectivePrice(o,state.editor)??0} currency={{code:currency,exponent:2}} onChange={(price)=>patch(o.id,{price})}/>{o.price!==null?<button className="text-xs font-semibold text-[#4a00c1] dark:text-ticket-accent" onClick={()=>patch(o.id,{price:null})}>Наследовать цену тарифа / родителя</button>:null}</>:null}</section>}

    {table && <details className="rounded-xl bg-[#eff4ff] dark:bg-ticket-raised p-3"><summary className="cursor-pointer text-xs font-bold uppercase text-[#565e74] dark:text-ticket-muted">Места за столом · {children.length}</summary><div className="mt-2 space-y-2">{children.map((seat) => <button key={seat.id} onClick={() => select(seat.id)} className="flex w-full items-center gap-2 rounded-lg bg-white dark:bg-ticket-surface p-2 text-left text-xs"><span className="grid h-6 w-6 place-items-center rounded-full text-white" style={{backgroundColor:hallObjectPaint(seat,state.editor).color,color:hallTextColor(hallObjectPaint(seat,state.editor).color)}}>{seat.number}</span><span className="flex-1 truncate">{seat.name || `Место ${seat.number}`}</span><span>{money(effectivePrice(seat, state.editor) ?? effectivePrice(o, state.editor) ?? 0)}</span></button>)}</div>{o.type === "table_round" && <button className={`${button} mt-2 w-full bg-white dark:bg-ticket-surface`} onClick={() => commit({ ...state, editor: arrangeSeats(state.editor, o.id) })}>Авто-расстановка по окружности</button>}</details>}
    {o.type === "seat" && <><p className="text-sm">Статус: {o.locked ? "заблокировано" : "свободно"}</p>{o.parentId && <button className={button} onClick={() => select(o.parentId!)}>↗ Перейти к столу / ряду</button>}</>}
    {o.type === "zone" && <><Field label="Вместимость" value={o.capacity} min={0} max={100000} step={1} onValue={(capacity) => patch(o.id, { capacity: Math.round(capacity) })} /><Field label="Непрозрачность" value={o.opacity} min={.05} max={1} step={.05} onValue={(opacity) => patch(o.id, { opacity })} /><p className="font-mono text-sm">Площадь: {(Math.abs(o.points.reduce((sum,p,i) => { const n = o.points[(i+1)%o.points.length]!; return sum + p.x*n.y - n.x*p.y; },0))/2).toFixed(2)} м²</p><p className="text-xs text-[#565e74] dark:text-ticket-muted">Перетащите вершину. Двойной щелчок по краю добавляет вершину.</p></>}
    {!draftMode && o.type === "prop" && <TextField label="Подзаголовок объекта" value={o.description} onValue={(description) => patch(o.id, { description })} />}
    {o.type === "entrance" && <label className="block text-xs">Тип прохода<SelectPicker className={input} value={o.entranceType} onChange={(e) => patch(o.id, { entranceType: e.target.value as HallObject["entranceType"] })}><option value="in">Вход</option><option value="out">Выход</option><option value="both">Вход-выход</option></SelectPicker></label>}

    <section className="space-y-2"><h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#565e74] dark:text-ticket-muted">Выравнивание и действия</h3><div className="grid grid-cols-4 gap-1"><button className="grid h-10 place-items-center rounded-lg bg-[#eff4ff] dark:bg-ticket-raised hover:bg-[#dce9ff] dark:hover:bg-ticket-hover" onClick={() => patch(o.id, { y: o.height / 2 })} title="По верхнему краю" aria-label="По верхнему краю"><StudioIcon name="alignTop" className="h-5 w-5" /></button><button className="grid h-10 place-items-center rounded-lg bg-[#eff4ff] dark:bg-ticket-raised hover:bg-[#dce9ff] dark:hover:bg-ticket-hover" onClick={() => patch(o.id, { x: state.room.widthM / 2 })} title="По центру горизонтали" aria-label="По центру горизонтали"><StudioIcon name="alignCenter" className="h-5 w-5" /></button><button className="grid h-10 place-items-center rounded-lg bg-[#eff4ff] dark:bg-ticket-raised hover:bg-[#dce9ff] dark:hover:bg-ticket-hover" onClick={() => patch(o.id, { y: state.room.heightM / 2 })} title="По центру вертикали" aria-label="По центру вертикали"><StudioIcon name="distribute" className="h-5 w-5" /></button><button className="grid h-10 place-items-center rounded-lg bg-[#eff4ff] dark:bg-ticket-raised hover:bg-[#dce9ff] dark:hover:bg-ticket-hover" onClick={() => patch(o.id, { rotation: -o.rotation })} title="Отразить поворот" aria-label="Отразить поворот"><StudioIcon name="flip" className="h-5 w-5" /></button></div><div className="grid grid-cols-3 gap-1"><button className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#eff4ff] dark:bg-ticket-raised text-xs font-semibold hover:bg-[#dce9ff] dark:hover:bg-ticket-hover" onClick={duplicate}><StudioIcon name="copy" className="h-4 w-4" />Копия</button><button className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#eff4ff] dark:bg-ticket-raised text-xs font-semibold hover:bg-[#dce9ff] dark:hover:bg-ticket-hover" onClick={() => patch(o.id, { locked: !o.locked })} aria-pressed={o.locked}><StudioIcon name={o.locked ? "unlock" : "lock"} className="h-4 w-4" />Блок</button><button className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#ffdad6] dark:bg-ticket-raised text-xs font-semibold text-[#93000a] dark:text-ticket-danger hover:bg-[#ffc9c3] dark:hover:bg-ticket-danger-soft" onClick={remove}><StudioIcon name="trash" className="h-4 w-4" />Удалить</button></div></section>
  </>;
}

function StudioIcon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    ticket: <><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"/><path d="M9 7.5v9" strokeDasharray="2 2"/></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 9.5 4.5 4.5 0 0 0 7 18Z"/><path d="m9.5 13 2 2 3.5-4"/></>,
    minus: <path d="M5 12h14"/>, plus: <path d="M12 5v14M5 12h14"/>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    save: <><path d="M5 3h12l2 2v16H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>, person: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
    back: <path d="m15 18-6-6 6-6M9 12h11"/>, undo: <path d="m9 7-5 5 5 5M4 12h9a6 6 0 0 1 6 6"/>, redo: <path d="m15 7 5 5-5 5M20 12h-9a6 6 0 0 0-6 6"/>, check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    cursor: <path d="m5 3 13 9-6 .8-3.2 5.1L5 3Z"/>, roundTable: <circle cx="12" cy="12" r="8"/>, rectTable: <rect x="4" y="7" width="16" height="10" rx="1"/>,
    chair: <path d="M200-120q-17 0-28.5-11.5T160-160v-40q-50 0-85-35t-35-85v-200q0-50 35-85t85-35v-80q0-50 35-85t85-35h400q50 0 85 35t35 85v80q50 0 85 35t35 85v200q0 50-35 85t-85 35v40q0 17-11.5 28.5T760-120q-17 0-28.5-11.5T720-160v-40H240v40q0 17-11.5 28.5T200-120Zm-40-160h640q17 0 28.5-11.5T840-320v-200q0-17-11.5-28.5T800-560q-17 0-28.5 11.5T760-520v160H200v-160q0-17-11.5-28.5T160-560q-17 0-28.5 11.5T120-520v200q0 17 11.5 28.5T160-280Zm120-160h400v-80q0-27 11-49t29-39v-112q0-17-11.5-28.5T680-760H280q-17 0-28.5 11.5T240-720v112q18 17 29 39t11 49v80Z"/>, row: <><path d="M5 5h14M5 9h14M5 13h14M5 17h14M5 21h14"/><path d="M3 4v18M21 4v18"/></>,
    stage: <path d="M476.5-723.5Q453-700 420-700q-13 0-24-3.5T374-715q-24 8-38.5 29T321-640h519l-40 280H604v-80h127q5-30 8.5-60t8.5-60H212q5 30 8.5 60t8.5 60h127v80H160l-40-280h120q0-49 27-89t73-59q3-31 26-51.5t54-20.5q33 0 56.5 23.5T500-780q0 33-23.5 56.5ZM391-200h178l23-240H368l23 240Zm-71 80-30-312q-4-35 20-61.5t59-26.5h222q35 0 59 26.5t20 61.5l-30 312H320Z"/>, door: <path d="M160-80v-720q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v720H160Zm80-80h480v-640H240v640Zm380-260q25 0 42.5-17.5T680-480q0-25-17.5-42.5T620-540q-25 0-42.5 17.5T560-480q0 25 17.5 42.5T620-420Z"/>, zone: <><path d="m5 6 6-3 8 5-2 10-9 3-4-8 1-7Z"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="19" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="21" r="1" fill="currentColor"/></>, ruler: <><path d="m5 19 14-14 2 2L7 21l-2-2Z"/><path d="m10 14 2 2m1-5 2 2m1-5 2 2"/></>, templates: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M17.5 14v7M14 17.5h7"/></>,
    tune: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M10 14v6"/></>, close: <path d="m6 6 12 12M18 6 6 18"/>, edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 6.5 3.5 3.5"/></>, copy: <><rect x="8" y="8" width="11" height="12" rx="1"/><path d="M16 8V4H5v12h3"/></>, lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, unlock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.5-2"/></>, trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    alignTop: <><path d="M4 4h16M8 7v13M16 7v8"/><path d="M6 9h4M14 9h4"/></>, alignCenter: <><path d="M12 3v18M5 8h14M7 16h10"/></>, distribute: <><path d="M4 4v16M20 4v16M9 7v10M15 7v10"/></>, flip: <><path d="M12 3v18M5 7l5 5-5 5M19 7l-5 5 5 5"/></>,
  };
  const material = name === "chair" || name === "stage" || name === "door";
  return <svg aria-hidden="true" className={className} viewBox={material ? "0 -960 960 960" : "0 0 24 24"} {...(material ? { fill: "currentColor" } : common)}>{paths[name]}</svg>;
}
