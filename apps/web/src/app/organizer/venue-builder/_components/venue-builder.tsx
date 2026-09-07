"use client";

import {
  ru,
  type CreateTableRequest,
  type TableGeometry,
  type UpdateTableRequest,
  type VenueLayout,
  type VenueTable,
} from "@event-platform/shared-types";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { apiRequest } from "../../../(auth)/_lib/api";
import { BackLink } from "../../../../components/back-link";

export function VenueBuilder({ eventId }: { eventId: string }) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-10 sm:px-6">
      <ProtectedRoute><Editor eventId={eventId} /></ProtectedRoute>
    </main>
  );
}

function Editor({ eventId }: { eventId: string }) {
  const [layout, setLayout] = useState<VenueLayout | null>(null);
  const [templates, setTemplates] = useState<VenueLayout[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<VenueLayout>(`/api/organizer/events/${eventId}/venue-layout`).catch(() => null),
      apiRequest<{ items: VenueLayout[] }>("/api/organizer/venue-layout-templates?limit=50").catch(() => ({ items: [] })),
    ]).then(([loaded, templateList]) => {
      setLayout(loaded);
      setTemplates(templateList.items);
      setTemplateId(templateList.items[0]?.id ?? "");
    }).catch(() => setError(ru.venue.loadFailed)).finally(() => setLoading(false));
  }, [eventId]);

  const selected = useMemo(() => layout?.tables.find(({ id }) => id === selectedId) ?? null, [layout, selectedId]);
  const selectedGeometry = useMemo(() => layout?.layoutJson.tables.find(({ tableId }) => tableId === selectedId) ?? null, [layout, selectedId]);

  async function createLayout(): Promise<void> {
    await action(async () => setLayout(await apiRequest<VenueLayout>(`/api/organizer/events/${eventId}/venue-layout`, { method: "POST", body: JSON.stringify({}) })));
  }

  async function addTable(): Promise<void> {
    if (!layout) return;
    const number = Math.max(0, ...layout.tables.map((table) => table.number)) + 1;
    const offset = (layout.tables.length % 8) * 90;
    const input: CreateTableRequest = {
      number, name: `Стол ${number}`, seats: 4, price: 0, deposit: 0, currency: "KZT",
      geometry: { x: 30 + offset, y: 30 + Math.floor(layout.tables.length / 8) * 90, width: 72, height: 64 },
    };
    await action(async () => {
      const table = await apiRequest<VenueTable>(`/api/organizer/venue-layouts/${layout.id}/tables`, { method: "POST", body: JSON.stringify(input) });
      setLayout((current) => current ? {
        ...current,
        tables: [...current.tables, table],
        layoutJson: { ...current.layoutJson, tables: [...current.layoutJson.tables, { tableId: table.id, ...input.geometry }] },
      } : current);
      setSelectedId(table.id);
    });
  }

  async function saveLayout(): Promise<void> {
    if (!layout) return;
    await action(async () => {
      const saved = await apiRequest<VenueLayout>(`/api/organizer/venue-layouts/${layout.id}`, {
        method: "PATCH", body: JSON.stringify({ layoutJson: layout.layoutJson }),
      });
      setLayout(saved); setMessage(ru.venue.saved);
    });
  }

  async function saveTable(): Promise<void> {
    if (!selected) return;
    const body: UpdateTableRequest = {
      number: selected.number, name: selected.name, seats: selected.seats, price: selected.price,
      deposit: selected.deposit, currency: selected.currency, description: selected.description,
      status: selected.status === "unavailable" ? "unavailable" : "available",
    };
    await action(async () => replaceTable(await apiRequest<VenueTable>(`/api/organizer/tables/${selected.id}`, { method: "PATCH", body: JSON.stringify(body) })));
  }

  async function toggleAvailability(): Promise<void> {
    if (!selected || !["available", "unavailable"].includes(selected.status)) return;
    const status = selected.status === "available" ? "unavailable" : "available";
    await action(async () => replaceTable(await apiRequest<VenueTable>(`/api/organizer/tables/${selected.id}`, { method: "PATCH", body: JSON.stringify({ status }) })));
  }

  async function deleteTable(): Promise<void> {
    if (!selected || !layout || !window.confirm(`${ru.common.delete}: ${selected.name ?? selected.number}?`)) return;
    await action(async () => {
      await apiRequest(`/api/organizer/tables/${selected.id}`, { method: "DELETE" });
      setLayout({ ...layout, tables: layout.tables.filter(({ id }) => id !== selected.id), layoutJson: { ...layout.layoutJson, tables: layout.layoutJson.tables.filter(({ tableId }) => tableId !== selected.id) } });
      setSelectedId(null);
    });
  }

  async function saveTemplate(): Promise<void> {
    if (!layout) return;
    const name = window.prompt(ru.venue.templateName, layout.templateName)?.trim();
    if (!name) return;
    await action(async () => {
      const template = await apiRequest<VenueLayout>(`/api/organizer/venue-layouts/${layout.id}/templates`, { method: "POST", body: JSON.stringify({ name }) });
      setTemplates((items) => [template, ...items]); setTemplateId(template.id);
    });
  }

  async function applyTemplate(): Promise<void> {
    if (!templateId) return;
    await action(async () => {
      const applied = await apiRequest<VenueLayout>(`/api/organizer/events/${eventId}/venue-layout/apply-template`, { method: "POST", body: JSON.stringify({ templateId }) });
      setLayout(applied); setSelectedId(null);
    });
  }

  async function action(work: () => Promise<void>): Promise<void> {
    setBusy(true); setError(null); setMessage(null);
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : ru.venue.actionFailed); }
    finally { setBusy(false); }
  }

  function replaceTable(table: VenueTable): void {
    setLayout((current) => current ? { ...current, tables: current.tables.map((item) => item.id === table.id ? table : item) } : current);
  }

  function patchSelected(patch: Partial<VenueTable>): void {
    if (!selectedId) return;
    setLayout((current) => current ? { ...current, tables: current.tables.map((table) => table.id === selectedId ? { ...table, ...patch } : table) } : current);
  }

  function patchGeometry(patch: Partial<TableGeometry>): void {
    if (!selectedId) return;
    setLayout((current) => current ? { ...current, layoutJson: { ...current.layoutJson, tables: current.layoutJson.tables.map((geometry) => geometry.tableId === selectedId ? { ...geometry, ...patch } : geometry) } } : current);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, geometry: TableGeometry): void {
    if (!layout) return;
    const canvas = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!canvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: geometry.tableId, offsetX: event.clientX - canvas.left - geometry.x, offsetY: event.clientY - canvas.top - geometry.y };
    setSelectedId(geometry.tableId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>, geometry: TableGeometry): void {
    if (!layout || drag.current?.id !== geometry.tableId) return;
    const canvas = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!canvas) return;
    patchGeometry({
      x: clamp(Math.round(event.clientX - canvas.left - drag.current.offsetX), 0, layout.layoutJson.canvas.width - geometry.width),
      y: clamp(Math.round(event.clientY - canvas.top - drag.current.offsetY), 0, layout.layoutJson.canvas.height - geometry.height),
    });
  }

  if (loading) return <p>{ru.common.loading}</p>;

  return (
    <section>
      <BackLink href={`/organizer/events/${eventId}`} />
      <h1 className="mt-6 text-3xl font-semibold">{ru.venue.title}</h1>
      <p className="mt-2 text-zinc-600">{ru.venue.description}</p>
      {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}

      {!layout ? (
        <button className="mt-8 rounded-xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-40" disabled={busy} onClick={() => void createLayout()}>{ru.venue.createLayout}</button>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="rounded-xl bg-black px-4 py-2 font-semibold text-white" disabled={busy} onClick={() => void addTable()}>{ru.venue.addTable}</button>
            <button className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold" disabled={busy} onClick={() => void saveLayout()}>{ru.venue.saveLayout}</button>
            <button className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold" disabled={busy} onClick={() => void saveTemplate()}>{ru.venue.saveTemplate}</button>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-auto rounded-2xl border border-zinc-300 bg-zinc-100 p-3">
              <div className="relative bg-white shadow-inner" style={{ width: layout.layoutJson.canvas.width, height: layout.layoutJson.canvas.height }}>
                {layout.layoutJson.tables.map((geometry) => {
                  const table = layout.tables.find(({ id }) => id === geometry.tableId);
                  if (!table) return null;
                  return (
                    <button
                      aria-label={`${table.name ?? ru.venue.fields.number} ${table.number}`}
                      className={`absolute touch-none rounded-lg border-2 p-1 text-xs font-semibold shadow-sm ${selectedId === table.id ? "border-blue-600 bg-blue-100" : table.status === "unavailable" ? "border-zinc-400 bg-zinc-300" : "border-emerald-500 bg-emerald-100"}`}
                      key={table.id}
                      onPointerDown={(event) => startDrag(event, geometry)}
                      onPointerMove={(event) => moveDrag(event, geometry)}
                      onPointerUp={() => { drag.current = null; }}
                      style={{ left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height, transform: `rotate(${geometry.rotation ?? 0}deg)` }}
                      type="button"
                    >
                      {table.name ?? `№ ${table.number}`}<br />{table.seats} мест
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{ru.venue.selected}</h2>
              {!selected || !selectedGeometry ? <p className="mt-3 text-sm text-zinc-500">{ru.venue.noSelection}</p> : (
                <div className="mt-4 grid gap-3">
                  <NumberField label={ru.venue.fields.number} value={selected.number} onChange={(number) => patchSelected({ number })} />
                  <TextField label={ru.venue.fields.name} value={selected.name ?? ""} onChange={(name) => patchSelected({ name })} />
                  <NumberField label={ru.venue.fields.seats} value={selected.seats} onChange={(seats) => patchSelected({ seats })} />
                  <NumberField label={ru.venue.fields.price} value={selected.price} onChange={(price) => patchSelected({ price })} />
                  <NumberField label={ru.venue.fields.deposit} value={selected.deposit} onChange={(deposit) => patchSelected({ deposit })} />
                  <TextField label={ru.venue.fields.currency} value={selected.currency} onChange={(currency) => patchSelected({ currency })} />
                  <TextField label={ru.venue.fields.description} value={selected.description ?? ""} onChange={(description) => patchSelected({ description })} />
                  <p className="text-xs text-zinc-500">{ru.venue.positionHint}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label={ru.venue.fields.x} value={selectedGeometry.x} onChange={(x) => patchGeometry({ x })} />
                    <NumberField label={ru.venue.fields.y} value={selectedGeometry.y} onChange={(y) => patchGeometry({ y })} />
                    <NumberField label={ru.venue.fields.width} value={selectedGeometry.width} onChange={(width) => patchGeometry({ width })} />
                    <NumberField label={ru.venue.fields.height} value={selectedGeometry.height} onChange={(height) => patchGeometry({ height })} />
                    <NumberField label={ru.venue.fields.rotation} value={selectedGeometry.rotation ?? 0} onChange={(rotation) => patchGeometry({ rotation })} />
                  </div>
                  <span className="rounded-lg bg-zinc-100 px-3 py-2 text-sm">{ru.venue.statuses[selected.status]}</span>
                  <button className="rounded-xl bg-black px-4 py-2 font-semibold text-white" disabled={busy || !["available", "unavailable"].includes(selected.status)} onClick={() => void saveTable()}>{ru.venue.saveTable}</button>
                  <button className="rounded-xl border border-zinc-300 px-4 py-2" disabled={busy || !["available", "unavailable"].includes(selected.status)} onClick={() => void toggleAvailability()}>{selected.status === "available" ? ru.venue.disableTable : ru.venue.enableTable}</button>
                  <button className="text-sm text-red-700 underline" disabled={busy} onClick={() => void deleteTable()}>{ru.venue.deleteTable}</button>
                </div>
              )}
            </aside>
          </div>

          <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold">{ru.venue.templates}</h2>
            {templates.length === 0 ? <p className="mt-2 text-sm text-zinc-500">{ru.venue.noTemplates}</p> : (
              <div className="mt-3 flex flex-wrap gap-3">
                <select className="rounded-xl border border-zinc-300 px-4 py-2" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.templateName}</option>)}</select>
                <button className="rounded-xl border border-zinc-300 px-4 py-2 font-semibold" disabled={busy || !templateId} onClick={() => void applyTemplate()}>{ru.venue.applyTemplate}</button>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-xs font-semibold">{label}<input className="rounded-lg border border-zinc-300 px-3 py-2 font-normal" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1 text-xs font-semibold">{label}<input className="rounded-lg border border-zinc-300 px-3 py-2 font-normal" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(value, maximum)); }
