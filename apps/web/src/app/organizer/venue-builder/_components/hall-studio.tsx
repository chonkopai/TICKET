"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { arrangeSeats, ru, effectivePrice, hallEditorSchema, metres, newHallObject, rotatePoint, type HallObject, type OrganizerEvent, type VenueLayout } from "@event-platform/shared-types";
import { apiRequest } from "../../../(auth)/_lib/api";
import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { attachSeat, availableFitArea, capacity, changeCommand, fitView, importLayout, removeObjects, snapDimension, titles, updateObject, warnings, wallSnap, zoomView, type Command, type FitArea, type HallState, type View } from "./hall-state";

type Tool = HallObject["type"] | "cursor" | "ruler";
const tools: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: "cursor", icon: "↖", label: "Курсор", key: "V" }, { id: "table_round", icon: "○", label: "Круглый стол", key: "C" },
  { id: "table_rect", icon: "▭", label: "Прямоугольный", key: "R" }, { id: "seat", icon: "▣", label: "Кресло", key: "S" },
  { id: "row", icon: "▤", label: "Ряд кресел", key: "W" }, { id: "prop", icon: "▰", label: "Сцена", key: "E" },
  { id: "entrance", icon: "⇥", label: "Вход / выход", key: "D" }, { id: "zone", icon: "⬡", label: "Полигон зоны", key: "Z" },
  { id: "ruler", icon: "∠", label: "Линейка", key: "M" },
];
const button = "rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-40";
const input = "mt-1 w-full rounded-lg border border-violet-100 bg-[#f3f2fc] px-3 py-2 text-sm outline-violet-500";
const money = (n: number) => new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 2 }).format(n / 100) + " ₸";
type Gesture = { kind: "pan" | "move" | "resize" | "rotate" | "marquee" | "row" | "vertex"; start: { x: number; y: number }; state: HallState; view: View; ids: string[]; handle?: number; vertex?: number };

export function HallStudio({ eventId }: { eventId: string }) {
  return <ProtectedRoute><Studio eventId={eventId} /></ProtectedRoute>;
}
export function Studio({ eventId, initial, request = apiRequest }: { eventId: string; initial?: { layout: VenueLayout; event: OrganizerEvent }; request?: typeof apiRequest }) {
  const [layout, setLayout] = useState<VenueLayout | null>(initial?.layout ?? null);
  const [event, setEvent] = useState<OrganizerEvent | null>(initial?.event ?? null);
  const [state, setState] = useState<HallState>(() => initial ? importLayout(initial.layout) : { room: { widthM: 24, heightM: 16 }, editor: { version: 1, objects: [], tariffs: [] } });
  const stateRef = useRef(state); stateRef.current = state;
  const [view, setView] = useState<View>({ pxPerMetre: 20, panX: 0, panY: 0 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("cursor");
  const [tab, setTab] = useState<"object" | "hall">("object");
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
  const [dockPosition, setDockPosition] = useState<{ x: number; y: number } | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [, historyTick] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const inspectorDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dock = useRef<HTMLDivElement>(null);
  const dockDrag = useRef<{ x: number; y: number; left: number; top: number; width: number; height: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches=useRef(new Map<number,{x:number;y:number}>());
  const pinch=useRef<{distance:number;view:View;centre:{x:number;y:number}}|null>(null);
  const manualView = useRef(false);
  const space = useRef(false);
  const clipboard = useRef<HallObject[]>([]);
  const history = useRef<{ undo: Command[]; redo: Command[] }>({ undo: [], redo: [] });
  const saving = useRef(false);
  const editable = event?.status === "draft" && !stale;
  const selected = state.editor.objects.find((o) => o.id === selection[0]);
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
  const inspectorHeight = Math.max(280, size.h - 148);
  const panelX = Math.max(12, Math.min(size.w - inspectorWidth - 12, inspectorPosition?.x ?? size.w - inspectorWidth - 12));
  const panelY = Math.max(12, Math.min(size.h - inspectorHeight - 12, inspectorPosition?.y ?? 72));
  // Floating controls occupy the top of the workspace; fitting uses the largest uncovered rectangle.
  const fitBase: FitArea = desktop
    ? { x: 16, y: 136, width: Math.max(1, size.w - 32), height: Math.max(1, size.h - 220) }
    : { x: 16, y: size.w < 640 ? 244 : 160, width: Math.max(1, size.w - 32), height: size.w < 640 ? 420 : 500 };
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
  function clampDock(x: number, y: number, width: number, height: number) {
    return { x: Math.max(12, Math.min(window.innerWidth - width - 12, x)), y: Math.max(12, Math.min(window.innerHeight - height - 12, y)) };
  }
  function startDockDrag(e: ReactPointerEvent<HTMLButtonElement>) {
    const rect = dock.current?.getBoundingClientRect();
    if (!rect) return;
    dockDrag.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDock(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dockDrag.current;
    if (!drag) return;
    setDockPosition(clampDock(drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y, drag.width, drag.height));
  }
  useEffect(() => {
    const keepDockVisible = () => {
      const rect = dock.current?.getBoundingClientRect();
      if (rect) setDockPosition((position) => position ? clampDock(position.x, position.y, rect.width, rect.height) : null);
    };
    window.addEventListener("resize", keepDockVisible);
    return () => window.removeEventListener("resize", keepDockVisible);
  }, []);
  function commit(next: HallState, previous = stateRef.current) {
    if (!editable || JSON.stringify(previous) === JSON.stringify(next)) return;
    const command = changeCommand(previous, next);
    history.current.undo.push(command); if (history.current.undo.length > 150) history.current.undo.shift(); history.current.redo = [];
    setState(command.apply(previous)); setDirty(true); setError(""); historyTick((n) => n + 1);
  }
  function undo(redo = false) {
    if (!editable) return;
    const from = redo ? history.current.redo : history.current.undo, to = redo ? history.current.undo : history.current.redo;
    const command = from.pop(); if (!command) return;
    setState((s) => (redo ? command : command.invert()).apply(s)); to.push(command); setDirty(true); historyTick((n) => n + 1);
  }
  const save = useCallback(async () => {
    if (!layout || !editable || saving.current || gesture.current) return;
    const snapshot = stateRef.current;
    const parsed = hallEditorSchema.safeParse(snapshot.editor);
    if (!parsed.success) { setError(`Схема не сохранена: ${parsed.error.issues[0]?.message}`); return; }
    saving.current = true; setBusy(true); setError("");
    try {
      const updated = await request<VenueLayout>(`/api/organizer/venue-layouts/${layout.id}`, { method: "PATCH", body: JSON.stringify({ revision: layout.revision, layoutJson: { version: 2, room: snapshot.room, editor: snapshot.editor, tables: [], rows: [] } }) });
      setLayout(updated); setSavedAt(Date.now());
      if (JSON.stringify(snapshot) === JSON.stringify(stateRef.current)) setDirty(false);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось сохранить схему";
      setError(message); if (message === ru.venue.errors.staleRevision || /revision|перезагруз|обнов.*схем|измен|reload/i.test(message)) setStale(true);
    } finally { saving.current = false; setBusy(false); }
  }, [layout, editable, request]);
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
    object.name = isTable ? `Стол ${sequence}` : `${titles[type]} ${sequence}`;
    if (type === "table_round") object.height = object.width;
    if (type === "prop") { object.width = 6; object.height = 2; object.description = ""; }
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
        next = updateObject(next, o.id, { rotation: metres(((angle + 540) % 360) - 180) });
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
      const o = { ...newHallObject(crypto.randomUUID(), "row", (p.x + g.start.x) / 2, (p.y + g.start.y) / 2), width: metres(length), rotation: metres(Math.atan2(p.y - g.start.y, p.x - g.start.x) * 180 / Math.PI), name: "Ряд" };
      const seats = Array.from({ length: 3 }, (_, i) => ({ ...newHallObject(crypto.randomUUID(), "seat", o.x, o.y), parentId: o.id, attachedOrder: i, number: i + 1 }));
      commit({ ...state, editor: arrangeSeats({ ...state.editor, objects: [...state.editor.objects, o, ...seats] }, o.id) }); setSelection([o.id]); setTool("cursor");
    } else if (g.kind !== "pan") {
      let next = stateRef.current;
      if (g.kind === "move") for (const id of g.ids) if (next.editor.objects.find((o) => o.id === id)?.type === "seat" && !g.ids.includes(next.editor.objects.find((o) => o.id === id)?.parentId ?? "")) next = attachSeat(next, id).state;
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
    const tables = state.editor.objects.filter((o) => o.type.startsWith("table_"));
    const seats = state.editor.objects.filter((o) => o.type === "seat");
    const total = state.editor.objects.reduce((sum, o) => {
      const parent = state.editor.objects.find((p) => p.id === o.parentId);
      if (o.type.startsWith("table_") && o.saleMode === "whole_table") return sum + (effectivePrice(o, state.editor) ?? 0);
      if (o.type === "seat" && (!parent || parent.type === "row" || parent.saleMode === "per_seat")) return sum + (effectivePrice(o, state.editor) ?? (parent ? effectivePrice(parent, state.editor) : null) ?? 0);
      if (o.type === "zone") return sum + o.capacity * (effectivePrice(o, state.editor) ?? 0);
      return sum;
    }, 0);
    return { tables: tables.length, seats: seats.length, total };
  }, [state.editor]);
  if (loading) return <main className="p-8" role="status">Загружаем конструктор…</main>;
  if (!layout) return <main className="p-8"><p role="alert">{error}</p><button className={button} onClick={() => void load()}>Повторить</button></main>;
  const worldLeft = -view.panX / view.pxPerMetre, worldTop = -view.panY / view.pxPerMetre;
  return <main className="bg-[#faf9ff] text-[#202632]">
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-violet-100 bg-white px-5 py-1.5">
      <div><p className="text-[10px] font-bold tracking-widest text-slate-500">ПАНЕЛЬ ОРГАНИЗАТОРА / КОНСТРУКТОР ЗАЛА</p><h1 className="text-lg font-bold">{event?.title || "Схема зала"}</h1></div>
      <Link href="/organizer/events" className={button}>Мои мероприятия ↗</Link>
    </header>
    <section className="relative min-h-[1140px] overflow-hidden bg-[#faf9ff] lg:h-[calc(100dvh-100px)] lg:min-h-[650px]" aria-label="Конструктор схемы зала">
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap justify-between gap-2">
        <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-violet-100 bg-white/95 p-1.5 shadow-sm"><Link href={`/organizer/events/${eventId}?step=5`} className={button}>← К шагу 5</Link><span className="hidden max-w-64 truncate text-sm md:block">{layout.templateName}</span><span className="pr-3 text-xs text-slate-500" role="status">{busy ? "Сохранение…" : dirty ? "Есть изменения" : savedAt ? `Автосохранение ${Math.max(0, Math.floor((now - savedAt) / 1000))} сек назад` : "Схема загружена"}</span></div>
        <div className="pointer-events-auto flex items-center rounded-full border border-violet-100 bg-white p-1.5 shadow-sm"><Link href={`/organizer/events/${eventId}/preview`} className={button}>Предпросмотр</Link><button disabled={!editable || busy} onClick={() => void save()} className={`${button} bg-violet-800 text-white hover:bg-violet-900`}>Сохранить схему</button><button className={button} onClick={() => setInspectorOpen((open) => !open)} aria-label={inspectorOpen ? "Скрыть инспектор" : "Показать инспектор"} aria-expanded={inspectorOpen} aria-controls="hall-inspector">☷</button></div>
      </div>
      <div className="absolute left-4 top-[122px] md:top-[70px] z-10 flex max-w-[calc(100%-32px)] flex-wrap gap-x-5 gap-y-1 rounded-full bg-white/95 px-4 py-2 text-xs shadow-sm lg:max-w-[calc(100%-410px)]">
        <span>Габариты: <b className="font-mono">{state.room.widthM.toFixed(1)} × {state.room.heightM.toFixed(1)} м</b></span><span>Столиков: <b>{stats.tables}</b></span><span>Мест: <b>{stats.seats}</b></span><span>Тарифов: <b>{state.editor.tariffs.length}</b></span><span className="font-mono text-violet-800">При аншлаге: {money(stats.total)}</span>
      </div>
      <div className="absolute inset-0">
        <svg ref={svg} className="h-full w-full touch-none select-none outline-none" tabIndex={0} role="application" aria-label="План зала. V — курсор, пробел — перемещение, Ctrl+0 — вписать зал" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { if (gesture.current) setState(gesture.current.state); gesture.current = null; setMarquee(null); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const type = e.dataTransfer.getData("application/ticket-tool") as Tool; if (tools.some((t) => t.id === type)) place(type, snapped(world(e))); }} onDoubleClick={(e) => {
          const target = e.target as Element, id = target.closest("[data-object]")?.getAttribute("data-object");
          if (id && editable) { const o = state.editor.objects.find((o) => o.id === id); if (o?.type === "zone" && target.tagName.toLowerCase() === "polygon") {
            const p=world(e), local=rotatePoint(p.x-o.x,p.y-o.y,-o.rotation); let edge=0,best=Infinity;
            o.points.forEach((a,i)=>{const b=o.points[(i+1)%o.points.length]!,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((local.x-a.x)*dx+(local.y-a.y)*dy)/(dx*dx+dy*dy||1)));const d=Math.hypot(local.x-a.x-t*dx,local.y-a.y-t*dy);if(d<best){best=d;edge=i;}});
            patch(id,{points:[...o.points.slice(0,edge+1),{x:metres(local.x),y:metres(local.y)},...o.points.slice(edge+1)]});
          } else setInline(id); }
        }}>
          <defs><filter id="hall-floor-shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy={3 / view.pxPerMetre} stdDeviation={5 / view.pxPerMetre} floodColor="#574482" floodOpacity=".14" /></filter><filter id="hall-table-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy=".08" stdDeviation=".09" floodColor="#475569" floodOpacity=".24" /></filter><pattern id="hall-minor" width="0.5" height="0.5" patternUnits="userSpaceOnUse"><path d="M .5 0 H 0 V .5" fill="none" stroke="#dedbec" strokeWidth={0.65 / view.pxPerMetre} /></pattern><pattern id="hall-major" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill={view.pxPerMetre >= 15 ? "url(#hall-minor)" : "#faf9ff"} /><path d="M 5 0 H 0 V 5" fill="none" stroke="#bcb4d4" strokeWidth={1 / view.pxPerMetre} /></pattern></defs>
          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.pxPerMetre})`}>
            <rect x={worldLeft} y={worldTop} width={size.w / view.pxPerMetre} height={size.h / view.pxPerMetre} fill="url(#hall-major)" />
            <rect x={0} y={0} width={state.room.widthM} height={state.room.heightM} fill="#f3f4f6" stroke="#8c72bd" strokeWidth={2 / view.pxPerMetre} rx="0.15" filter="url(#hall-floor-shadow)" />
            {Array.from({ length: Math.ceil(state.room.widthM / 5) + 1 }, (_, i) => <text key={`x${i}`} x={i * 5} y={-0.25} fontSize={11 / view.pxPerMetre} fill="#756b8b" fontFamily="monospace">{i * 5}.0 м</text>)}
            {Array.from({ length: Math.ceil(state.room.heightM / 5) + 1 }, (_, i) => <text key={`y${i}`} x={-0.15} y={i * 5} textAnchor="end" fontSize={11 / view.pxPerMetre} fill="#756b8b" fontFamily="monospace">{i * 5}.0</text>)}
            {sortedObjects.map((o) => <CanvasObject key={o.id} object={o} selected={selection.includes(o.id)} warning={warningIds.has(o.id)} highlight={guide?.target === o.id ? guide.rejected ? "#dc2626" : "#16a34a" : undefined} color={o.colorOverride ? o.color : state.editor.tariffs.find((t) => t.id === o.tariffId)?.color ?? o.color} />)}
            {selection.map((id) => { const o = state.editor.objects.find((o) => o.id === id); if (!o) return null; const w = o.width, h = o.type === "table_round" ? o.width : o.height; const handleSize = 8 / view.pxPerMetre; return <g key={id} data-object={id} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`}>
              <rect x={-w / 2 - .05} y={-h / 2 - .05} width={w + .1} height={h + .1} fill="none" stroke="#7c3aed" strokeWidth={1.5 / view.pxPerMetre} strokeDasharray={`${4 / view.pxPerMetre} ${3 / view.pxPerMetre}`} pointerEvents="none" />
              {editable && !o.locked && <>
                {o.type !== "seat" && [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]].map(([x,y], i) => <rect key={i} data-handle={i} x={x! * w / 2 - handleSize / 2} y={y! * h / 2 - handleSize / 2} width={handleSize} height={handleSize} fill={i % 2 === 0 ? "#5b21b6" : "#ffffff"} stroke="#5b21b6" strokeWidth={1.3 / view.pxPerMetre} className="cursor-nwse-resize" />)}
                <line x1={0} y1={-h / 2} x2={0} y2={-h / 2 - 24 / view.pxPerMetre} stroke="#7c3aed" strokeWidth={1 / view.pxPerMetre} />
                <circle data-handle="rotate" cx={0} cy={-h / 2 - 24 / view.pxPerMetre} r={6 / view.pxPerMetre} fill="white" stroke="#5b21b6" strokeWidth={1.5 / view.pxPerMetre} className="cursor-grab" />
                {o.type === "row" && <g role="button" tabIndex={0} aria-label="Добавить место в ряд" aria-disabled={state.editor.objects.filter((s)=>s.parentId===o.id).length>=capacity(o)} transform={`translate(${o.width/2+24/view.pxPerMetre} 0)`} onPointerDown={(e)=>e.stopPropagation()} onClick={()=>addSeat(o)} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();addSeat(o);}}}><title>Добавить место — минимум 0,45 м на кресло</title><circle r={14/view.pxPerMetre} fill="#5b21b6"/><text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={20/view.pxPerMetre}>+</text></g>}
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

        {inline && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 rounded-xl bg-white p-2 shadow-lg"><input autoFocus aria-label="Название объекта" className={input} defaultValue={state.editor.objects.find((o) => o.id === inline)?.name} onKeyDown={(e) => { if (e.key === "Enter") { patch(inline, { name: e.currentTarget.value }); setInline(null); } if (e.key === "Escape") setInline(null); }} onBlur={(e) => { patch(inline, { name: e.currentTarget.value }); setInline(null); }} /></div>}
      </div>
      <div className="absolute left-4 top-[194px] md:top-[112px] z-10 flex rounded-full bg-white/95 p-1 shadow-sm lg:top-[112px]"><button className={button} onClick={fit}>Вписать зал</button><button className={button} aria-label="Уменьшить" onClick={() => { manualView.current = true; setView(zoomView(view, -1, size.w / 2, size.h / 2)); }}>−</button><button className={button} aria-label="Увеличить" onClick={() => { manualView.current = true; setView(zoomView(view, 1, size.w / 2, size.h / 2)); }}>+</button><button className={button} aria-pressed={snap} onClick={() => setSnap(!snap)}>Привязка {snap ? "●" : "○"}</button></div>
      <div className="absolute bottom-auto left-4 top-[620px] rounded-xl border border-violet-100 bg-white/95 p-3 font-mono text-xs shadow-sm lg:bottom-24 lg:top-auto"><b>Север зала ↑</b><p className="mt-1">2,0 м = {view.pxPerMetre * 2} px (1:{Math.round(1000 / view.pxPerMetre)})</p><p className="mt-1 text-slate-500">X: {cursor.x.toFixed(2)} м · Y: {cursor.y.toFixed(2)} м</p></div>
      {inspectorOpen && <aside id="hall-inspector" className="absolute left-3 right-3 top-[700px] z-20 max-h-[360px] overflow-y-auto rounded-2xl border border-violet-100 bg-white shadow-xl md:top-[720px] lg:left-auto lg:right-auto lg:top-auto lg:max-h-none lg:w-[356px]" style={desktop ? { left: panelX, top: panelY, height: inspectorHeight } : undefined} aria-label="Инспектор">
        <div className="sticky top-0 z-10 rounded-t-2xl border-b border-violet-100 bg-[#f8f7ff] p-3"><div className="mb-2 flex items-center gap-2"><button type="button" className="cursor-grab touch-none rounded-lg px-2 py-1 text-violet-700 hover:bg-violet-100 active:cursor-grabbing disabled:cursor-default" aria-label="Переместить инспектор" title="Перетащите инспектор" disabled={!desktop} onPointerDown={startInspectorDrag} onPointerMove={moveInspector} onPointerUp={(e) => { inspectorDrag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { inspectorDrag.current = null; }}>⠿</button><h2 className="flex-1 text-lg font-bold">Инспектор</h2><button className="rounded-lg px-2 py-1 text-xs text-violet-700 hover:bg-violet-100" onClick={() => setInspectorPosition(null)} title="Вернуть инспектор справа">Сброс</button><button className="rounded-lg px-2 py-1 text-slate-500 hover:bg-violet-100" onClick={() => setInspectorOpen(false)} aria-label="Скрыть инспектор">×</button></div><div className="flex rounded-lg bg-[#eeecfa] p-1" role="tablist" onKeyDown={(e)=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const next=e.key==="Home"?"object":e.key==="End"?"hall":tab==="object"?"hall":"object";setTab(next);document.getElementById(`hall-tab-${next}`)?.focus();}}}><button id="hall-tab-object" aria-controls="hall-inspector-panel" tabIndex={tab==="object"?0:-1} role="tab" aria-selected={tab === "object"} onClick={() => setTab("object")} className={`${button} flex-1 ${tab === "object" ? "bg-white text-violet-800 shadow-sm" : ""}`}>Свойства объекта</button><button id="hall-tab-hall" aria-controls="hall-inspector-panel" tabIndex={tab==="hall"?0:-1} role="tab" aria-selected={tab === "hall"} onClick={() => setTab("hall")} className={`${button} flex-1 ${tab === "hall" ? "bg-white text-violet-800 shadow-sm" : ""}`}>Зал и зоны</button></div></div>
        <fieldset id="hall-inspector-panel" role="tabpanel" aria-labelledby={`hall-tab-${tab}`} disabled={!editable} className="space-y-3 p-3">
          {tab === "object" ? selected ? <Inspector object={selected} state={state} patch={patch} commit={commit} select={(id) => setSelection([id])} addSeat={addSeat} duplicate={() => duplicate()} remove={() => { commit(removeObjects(state, selection)); setSelection([]); }} /> : <div className="py-10 text-center text-sm text-slate-500"><p className="mb-3 text-3xl text-violet-500">↖</p>Выберите объект на плане<br />или перетащите инструмент из панели</div> : <>
            <h3 className="font-semibold">Параметры зала</h3><div className="grid grid-cols-2 gap-3"><Field label="Ширина, м" value={state.room.widthM} min={2} max={200} onValue={(n) => commit({ ...state, room: { ...state.room, widthM: n } })} /><Field label="Глубина, м" value={state.room.heightM} min={2} max={200} onValue={(n) => commit({ ...state, room: { ...state.room, heightM: n } })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />Привязка к сетке 0,5 м</label>
            <h3 className="border-t border-violet-100 pt-4 font-semibold">Ценовые тарифы</h3>
            {state.editor.tariffs.map((tariff) => <div key={tariff.id} className="space-y-2 rounded-xl bg-violet-50 p-3"><TextField label="Название тарифа" value={tariff.name} onValue={(name) => commit({ ...state, editor: { ...state.editor, tariffs: state.editor.tariffs.map((t) => t.id === tariff.id ? { ...t, name } : t) } })} /><div className="flex items-end gap-2"><ColorField label="Цвет тарифа" value={tariff.color} onValue={(color) => commit({ ...state, editor: { ...state.editor, tariffs: state.editor.tariffs.map((t) => t.id === tariff.id ? { ...t, color } : t) } })} /><Field label="Цена, ₸" value={tariff.price / 100} min={0} max={20_000_000} onValue={(price) => commit({ ...state, editor: { ...state.editor, tariffs: state.editor.tariffs.map((t) => t.id === tariff.id ? { ...t, price: Math.round(price * 100) } : t) } })} /><button className={button} title="Удаление доступно после переназначения всех объектов" disabled={state.editor.objects.some((o) => o.tariffId === tariff.id)} onClick={() => commit({ ...state, editor: { ...state.editor, tariffs: state.editor.tariffs.filter((t) => t.id !== tariff.id) } })}>×</button></div></div>)}
            <button className={`${button} w-full bg-violet-100 text-violet-800`} onClick={() => commit({ ...state, editor: { ...state.editor, tariffs: [...state.editor.tariffs, { id: crypto.randomUUID(), name: `Тариф ${state.editor.tariffs.length + 1}`, color: "#5B21B6", price: 0 }] } })}>+ Добавить тариф</button>
            <h3 className="border-t border-violet-100 pt-4 font-semibold">Проверка схемы · {issues.length}</h3>{issues.length ? issues.map((issue, i) => <button key={i} className="block text-left text-xs text-amber-800 hover:underline" onClick={() => { setSelection([issue.id]); setTab("object"); }}>{issue.text}</button>) : <p className="text-sm text-emerald-700">Замечаний нет</p>}
          </>}
        </fieldset>
      </aside>}
      <div ref={dock} className={`fixed inset-x-3 bottom-6 z-30 flex items-center gap-1 overflow-x-auto rounded-2xl border border-violet-100 bg-white/95 p-1.5 shadow-xl w-[calc(100%-24px)] lg:inset-x-auto lg:w-max lg:max-w-[calc(100%-32px)] lg:rounded-full ${dockPosition ? "" : "lg:left-1/2 lg:-translate-x-1/2"}`} style={dockPosition ? { left: dockPosition.x, top: dockPosition.y, right: "auto", bottom: "auto" } : undefined} aria-label="Панель инструментов зала">
        <button type="button" className="sticky left-0 z-10 shrink-0 cursor-grab touch-none rounded-xl bg-violet-50 px-2 py-1.5 text-violet-700 hover:bg-violet-100 active:cursor-grabbing" aria-label="Переместить панель инструментов" title="Перетащите панель. Стрелки — переместить, Home — вернуть вниз" onPointerDown={startDockDrag} onPointerMove={moveDock} onPointerUp={(e) => { dockDrag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { dockDrag.current = null; }} onKeyDown={(e) => { if (e.key === "Home") { e.preventDefault(); setDockPosition(null); } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); const rect = dock.current?.getBoundingClientRect(); if (!rect) return; const step = e.shiftKey ? 50 : 20; setDockPosition(clampDock(rect.left + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0), rect.top + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0), rect.width, rect.height)); } }}>⠿</button>
        <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-30" aria-label="Вернуть панель инструментов вниз" disabled={!dockPosition} onClick={() => setDockPosition(null)} title="Вернуть панель вниз">↙</button>
        <button className={button} disabled={!editable || !history.current.undo.length} onClick={() => undo()} title="Отменить Ctrl+Z">↶</button><button className={button} disabled={!editable || !history.current.redo.length} onClick={() => undo(true)} title="Повторить Ctrl+Shift+Z">↷</button><span className="mx-1 h-6 border-l border-violet-100" />
        {tools.map((t) => <span key={t.id} className="flex shrink-0 items-center gap-1">{["table_round", "ruler"].includes(t.id) && <span className="mx-1 h-6 border-l border-violet-100" aria-hidden="true" />}<button draggable={editable && !["cursor", "ruler", "zone"].includes(t.id)} onDragStart={(e) => e.dataTransfer.setData("application/ticket-tool", t.id)} className={`${button} shrink-0 whitespace-nowrap px-2 py-1.5 ${tool === t.id ? "bg-violet-800 text-white hover:bg-violet-900" : ""}`} aria-pressed={tool === t.id} title={`${t.label} (${t.key}) — перетащите или выберите и нажмите на план`} onClick={() => setTool(t.id)}><span className="mr-1 text-base">{t.icon}</span><span className="text-xs">{t.label}</span></button></span>)}
        <button className={`${button} shrink-0`} onClick={() => setShowTemplates(!showTemplates)}>Шаблоны</button>
      </div>
      {showTemplates && <div className="absolute bottom-24 left-4 z-30 w-80 rounded-2xl bg-white p-4 shadow-xl"><h3 className="font-bold">Шаблоны зала</h3><p className="my-2 text-xs text-slate-500">Вставляются копии объектов с новыми идентификаторами.</p>{templates.map((t) => <button key={t.id} className={`${button} block w-full text-left`} onClick={() => { const imported = importLayout(t); const tariffIds = new Map(imported.editor.tariffs.map((tariff) => [tariff.id, crypto.randomUUID()])); const ids = new Map(imported.editor.objects.map((o) => [o.id, crypto.randomUUID()])); commit({ ...state, editor: { version: 1, tariffs: [...state.editor.tariffs, ...imported.editor.tariffs.map((tariff) => ({ ...tariff, id: tariffIds.get(tariff.id)! }))], objects: [...state.editor.objects, ...imported.editor.objects.map((o) => ({ ...o, id: ids.get(o.id)!, parentId: o.parentId ? ids.get(o.parentId)! : null, tariffId: o.tariffId ? tariffIds.get(o.tariffId)! : null }))] } }); setShowTemplates(false); }}>{t.templateName}</button>)}<input className={input} aria-label="Название шаблона" placeholder="Название шаблона" value={templateName} onChange={(e) => setTemplateName(e.target.value)} /><button className={button} disabled={dirty || busy || !templateName.trim()} onClick={() => void saveTemplate()}>Сохранить текущий зал</button><button className={button} disabled={dirty || busy || !templateName.trim() || !selection.length} onClick={() => void saveTemplate(true)}>Сохранить выделение</button></div>}
    </section>
    {(error || !editable) && <div className="relative z-20 border-t border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">{error || "Структуру схемы можно менять только в черновике"}{stale && <button className={button} onClick={() => { if (window.confirm("Загрузить актуальную схему? Несохранённые изменения будут потеряны.")) void load(); }}>Загрузить актуальную схему</button>}</div>}
    <footer className="flex justify-between px-5 py-3 text-xs text-slate-500"><b>TICKET Organizer Studio</b><span>Метры · KZT · {state.editor.objects.length} объектов</span></footer>
  </main>;
}

function rowPath(o: HallObject): string {
  if (Math.abs(o.curvature) < 0.001) return `M ${-o.width/2} 0 L ${o.width/2} 0`;
  const sag=Math.abs(o.curvature), r=o.width**2/(8*sag)+sag/2;
  return `M ${-o.width/2} 0 A ${r} ${r} 0 ${sag>o.width/2?1:0} ${o.curvature>0?0:1} ${o.width/2} 0`;
}

const CanvasObject = memo(function CanvasObject({ object: o, selected, warning, highlight, color }: { object: HallObject; selected: boolean; warning: boolean; highlight?: string | undefined; color: string }) {
  const stroke = highlight || (warning ? "#dc2626" : selected ? "#7c3aed" : color);
  const table = o.type === "table_round" || o.type === "table_rect";
  const tableStroke = highlight || (warning ? "#dc2626" : selected ? "#7c3aed" : "#d1d5db");
  const labelSize = table ? Math.min(.38, Math.max(.16, o.width / Math.max(4, o.name.length * .62))) : Math.min(.3, Math.max(.13, o.width / Math.max(8, o.name.length)));
  return <g data-object={o.id} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`} className={o.locked ? "cursor-not-allowed" : "cursor-move"}>
    <title>{o.name || titles[o.type]}{o.locked ? " · заблокировано" : ""}</title>
    {o.type === "seat" ? <><rect x={-.225} y={-.225} width={.45} height={.45} rx={.15} fill={color} stroke={stroke} strokeWidth={selected || warning ? .04 : .01} /><path d="M -.18 -.14 Q 0 -.23 .18 -.14" fill="none" stroke="#ffffffaa" strokeWidth={.025} /><text y={.075} fontSize={.2} fill="white" textAnchor="middle" transform={`rotate(${-o.rotation})`}>{o.number}</text></> : o.type === "table_round" ? <circle r={o.width / 2} fill="white" stroke={tableStroke} strokeWidth={selected || warning || highlight ? .04 : .02} filter="url(#hall-table-shadow)" /> : o.type === "zone" ? <polygon points={o.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={color} fillOpacity={o.opacity} stroke={stroke} strokeWidth={.03} /> : o.type === "row" ? <path d={rowPath(o)} stroke={stroke} strokeWidth={.55} strokeOpacity={.12} fill="none" /> : <rect x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} rx={o.type === "entrance" ? .02 : .12} fill={o.type === "prop" || o.type === "entrance" ? color : "white"} stroke={o.type === "table_rect" ? tableStroke : stroke} strokeWidth={selected || warning || highlight ? .04 : .02} filter={o.type === "table_rect" ? "url(#hall-table-shadow)" : undefined} />}
    {o.type !== "seat" && <text textAnchor="middle" dominantBaseline="middle" y={o.type === "row" ? -.48 : 0} fontSize={labelSize} fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fill={o.type === "prop" || o.type === "entrance" ? "white" : "#202632"}>{o.type === "entrance" ? `${o.entranceType === "in" ? "→" : o.entranceType === "out" ? "←" : "↔"} ` : ""}{o.name}</text>}
    {o.type === "prop" && <text y={.3} textAnchor="middle" fontSize={.18} fill="#e9d5ff">{o.description}</text>}
  </g>;
});
function Field({ label, value, onValue, min = .1, max = 200, step = .1 }: { label: string; value: number; onValue: (n: number) => void; min?: number; max?: number; step?: number }) {
  const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(value)), [value]);
  return <label className="block text-xs text-slate-600">{label}<input type="number" className={`${input} font-mono`} value={draft} min={min} max={max} step={step} onChange={(e) => setDraft(e.target.value)} onBlur={() => { const n = Number(draft); if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onValue(metres(n)); else setDraft(String(value)); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(String(value)); e.currentTarget.blur(); } }} /></label>;
}
function ColorField({label,value,onValue}:{label:string;value:string;onValue:(value:string)=>void}) {
  const [draft,setDraft]=useState(value);useEffect(()=>setDraft(value),[value]);
  return <input aria-label={label} type="color" value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)onValue(draft);}} />;
}
function TextField({ label, value, onValue }: { label: string; value: string; onValue: (n: string) => void }) {
  const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]);
  return <label className="block text-xs text-slate-600">{label}<input className={input} maxLength={120} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onValue(draft); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>;
}
function Inspector({ object: o, state, patch, commit, select, addSeat, duplicate, remove }: { object: HallObject; state: HallState; patch: (id: string, p: Partial<HallObject>) => void; commit: (s: HallState) => void; select: (id: string) => void; addSeat: (o: HallObject, side?: HallObject["side"]) => void; duplicate: () => void; remove: () => void }) {
  const table = o.type.startsWith("table_");
  const children = state.editor.objects.filter((s) => s.parentId === o.id).sort((a,b) => a.number - b.number);
  const sold = o.type === "seat" || o.type === "zone" || o.type === "row" || table;
  return <>
    <div className="rounded-xl bg-[#f3f1fc] p-3"><div className="mb-2 flex justify-between text-[10px] uppercase text-violet-800"><b>Выбранный элемент</b><span className="font-mono">#{o.id.slice(0,8)}</span></div><TextField label={`${titles[o.type]} · название`} value={o.name} onValue={(name) => patch(o.id, { name })} /><p className="mt-1 text-xs text-slate-500">{o.width.toFixed(1)} × {o.height.toFixed(1)} м</p></div>
    <div className="flex justify-between"><label className="flex items-center gap-2 text-xs">Цвет<ColorField label="Цвет объекта" value={o.color} onValue={(color) => patch(o.id, { color, colorOverride: true })} /></label><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={o.locked} onChange={(e) => patch(o.id, { locked: e.target.checked })} />Заблокировать</label></div>
    {o.type !== "seat" && <div className="grid grid-cols-2 gap-3"><Field label={o.type === "table_round" ? "Диаметр, м" : "Ширина / длина, м"} value={o.width} onValue={(width) => patch(o.id, { width, ...(o.type === "table_round" ? { height: width } : {}) })} />{o.type !== "table_round" && <Field label="Глубина, м" value={o.height} onValue={(height) => patch(o.id, { height })} />}</div>}

    {table && <><Field label="Отступ кресел от края, м" value={o.seatOffset} min={.225} max={3} step={.05} onValue={(seatOffset) => patch(o.id, { seatOffset })} /><label className="block text-xs">Способ продажи<select className={input} value={o.saleMode} onChange={(e) => patch(o.id, { saleMode: e.target.value as HallObject["saleMode"] })}><option value="whole_table">Стол целиком</option><option value="per_seat">По местам</option></select></label></>}
    {o.type === "row" && <><div className="flex items-center justify-between"><span className="text-sm">Мест: {children.length} / {capacity(o)}</span><button className={button} disabled={!children.length} onClick={() => commit(removeObjects(state, [children.at(-1)!.id]))}>−</button><button className={button} disabled={children.length >= capacity(o)} onClick={() => addSeat(o)}>+</button></div><label className="flex gap-2 text-xs"><input type="checkbox" checked={o.curvature !== 0} onChange={(e) => patch(o.id, { curvature: e.target.checked ? .5 : 0 })} />Дуга</label>{o.curvature !== 0 && <Field label="Прогиб дуги, м" value={o.curvature} min={-100} max={100} onValue={(curvature) => patch(o.id, { curvature })} />}<Field label="Первый номер" value={o.startNumber} min={1} max={999000} step={1} onValue={(startNumber) => patch(o.id, { startNumber: Math.round(startNumber) })} /><label className="flex gap-2 text-xs"><input type="checkbox" checked={o.reverse} onChange={(e) => patch(o.id, { reverse: e.target.checked })} />Нумерация справа налево</label></>}
    {table && <><div className="flex justify-between text-xs font-bold uppercase"><span>Места за столом · {children.length}</span><button className="text-violet-700" onClick={() => addSeat(o)}>+ Место</button></div>{o.type === "table_rect" && <div className="grid grid-cols-2 gap-1">{([['top','Сверху'],['right','Справа'],['bottom','Снизу'],['left','Слева']] as const).map(([side,label]) => <button key={side} className={`${button} bg-violet-50`} onClick={() => addSeat(o, side)} disabled={children.filter((s) => s.side === side).length >= capacity(o, side)}>+ {label}</button>)}</div>}{children.map((s) => <div key={s.id} draggable onDragStart={(e) => e.dataTransfer.setData("application/ticket-seat", s.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const other = state.editor.objects.find((a) => a.id === e.dataTransfer.getData("application/ticket-seat") && a.parentId === o.id); if (!other) return; const objects = state.editor.objects.map((a) => a.id === other.id ? { ...a, attachedOrder: s.attachedOrder } : a.id === s.id ? { ...a, attachedOrder: other.attachedOrder } : a); commit({ ...state, editor: arrangeSeats({ ...state.editor, objects }, o.id) }); }} className="rounded-xl bg-[#f4f2fd] p-3"><div className="mb-2 flex items-center gap-2"><button onClick={() => select(s.id)} className="grid h-6 w-6 place-items-center rounded-full bg-emerald-900 text-xs text-white">{s.number}</button><span className="flex-1 text-xs">Место {s.number}</span><span title="Перетащите для перестановки">⠿</span><button aria-label={`Удалить место ${s.number}`} onClick={() => commit(removeObjects(state, [s.id]))} className="text-red-700">×</button></div><TextField label="Имя места" value={s.name} onValue={(name) => patch(s.id, { name })} />{o.saleMode === "per_seat" && <Field label="Цена, ₸" value={(effectivePrice(s, state.editor) ?? effectivePrice(o, state.editor) ?? 0) / 100} min={0} max={20_000_000} onValue={(price) => patch(s.id, { price: Math.round(price * 100) })} />}</div>)}{o.type === "table_round" && <button className={`${button} w-full bg-violet-50`} onClick={() => commit({ ...state, editor: arrangeSeats(state.editor, o.id) })}>Авто-расстановка по окружности</button>}</>}
    {sold && !(o.type === "seat" && state.editor.objects.find((p) => p.id === o.parentId)?.saleMode === "whole_table" && state.editor.objects.find((p) => p.id === o.parentId)?.type !== "row") && <div className="space-y-3 border-t border-violet-100 pt-4"><label className="block text-xs">Ценовой тариф<select className={input} value={o.tariffId ?? ""} onChange={(e) => patch(o.id, { tariffId: e.target.value || null, price: null, colorOverride: false })}><option value="">Без тарифа</option>{state.editor.tariffs.map((t) => <option key={t.id} value={t.id}>{t.name} — {money(t.price)}</option>)}</select></label><Field label={`Цена, ₸${o.price !== null && o.tariffId ? " · изменена" : ""}`} value={(effectivePrice(o, state.editor) ?? 0) / 100} min={0} max={20_000_000} step={1} onValue={(price) => patch(o.id, { price: Math.round(price * 100) })} />{o.price !== null && <button className="text-xs text-violet-700" onClick={() => patch(o.id, { price: null })}>Наследовать цену тарифа / родителя</button>}<Field label="Депозит, ₸" value={o.deposit / 100} min={0} max={20_000_000} onValue={(deposit) => patch(o.id, { deposit: Math.round(deposit * 100) })} /></div>}
    {o.type === "seat" && <><p className="text-sm">Статус: {o.locked ? "заблокировано" : "свободно"}</p>{o.parentId && <button className={button} onClick={() => select(o.parentId!)}>↗ Перейти к столу / ряду</button>}</>}
    {o.type === "zone" && <><Field label="Вместимость" value={o.capacity} min={0} max={100000} step={1} onValue={(capacity) => patch(o.id, { capacity: Math.round(capacity) })} /><Field label="Непрозрачность" value={o.opacity} min={.05} max={1} step={.05} onValue={(opacity) => patch(o.id, { opacity })} /><p className="font-mono text-sm">Площадь: {(Math.abs(o.points.reduce((sum,p,i) => { const n = o.points[(i+1)%o.points.length]!; return sum + p.x*n.y - n.x*p.y; },0))/2).toFixed(2)} м²</p><p className="text-xs text-slate-500">Перетащите вершину. Двойной щелчок по краю добавляет вершину. Выберите вершину и нажмите Delete для удаления.</p></>}
    {o.type === "prop" && <TextField label="Описание объекта" value={o.description} onValue={(description) => patch(o.id, { description })} />}
    {o.type === "entrance" && <label className="block text-xs">Тип прохода<select className={input} value={o.entranceType} onChange={(e) => patch(o.id, { entranceType: e.target.value as HallObject["entranceType"] })}><option value="in">Вход</option><option value="out">Выход</option><option value="both">Вход-выход</option></select></label>}
    <details><summary className="cursor-pointer text-xs text-slate-500">Положение и поворот</summary><div className="grid grid-cols-3 gap-2"><Field label="X, м" value={o.x} min={-1000} max={1000} onValue={(x) => patch(o.id, { x })} /><Field label="Y, м" value={o.y} min={-1000} max={1000} onValue={(y) => patch(o.id, { y })} /><Field label="Поворот, °" value={o.rotation} min={-180} max={180} step={1} onValue={(rotation) => patch(o.id, { rotation })} /></div></details>
    <div className="flex gap-2 border-t border-violet-100 pt-4"><button className={`${button} flex-1 bg-violet-50`} onClick={duplicate}>Дублировать</button><button className={`${button} text-red-700`} onClick={remove}>Удалить</button></div>
  </>;
}
