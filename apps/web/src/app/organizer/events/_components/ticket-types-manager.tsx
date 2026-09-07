"use client";

import {
  isoToZonedInput,
  ru,
  zonedInputToIso,
  type CreateTicketTypeRequest,
  type OrganizerEvent,
  type OrganizerTicketType,
  type OrganizerTicketTypeList,
  type TicketTypeStatus,
} from "@event-platform/shared-types";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { apiRequest } from "../../../(auth)/_lib/api";

interface TicketTypeFormValues {
  name: string;
  price: string;
  deposit: string;
  currency: string;
  quantityTotal: string;
  description: string;
  salesStartAt: string;
  salesEndAt: string;
  restrictions: string;
  status: TicketTypeStatus;
}

const EMPTY_FORM: TicketTypeFormValues = {
  name: "",
  price: "0",
  deposit: "0",
  currency: "KZT",
  quantityTotal: "0",
  description: "",
  salesStartAt: "",
  salesEndAt: "",
  restrictions: "",
  status: "draft",
};

export function TicketTypesManager({ event }: { event: OrganizerEvent }) {
  const [items, setItems] = useState<OrganizerTicketType[]>([]);
  const [editing, setEditing] = useState<OrganizerTicketType | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<OrganizerTicketTypeList>(
        `/api/organizer/events/${event.id}/ticket-types?page=1&limit=50`,
      );
      setItems(result.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ru.ticketTypes.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => { void load(); }, [load]);

  async function remove(item: OrganizerTicketType): Promise<void> {
    if (!window.confirm(ru.ticketTypes.deleteConfirm)) return;
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/api/organizer/ticket-types/${item.id}`, { method: "DELETE" });
      setMessage(ru.ticketTypes.deleted);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ru.ticketTypes.actionFailed);
    }
  }

  return (
    <section className="mt-10 rounded-3xl border border-black/10 bg-white p-7 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{ru.ticketTypes.title}</h2>
          <p className="mt-2 text-sm text-zinc-600">{ru.ticketTypes.description}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {ru.ticketTypes.timezoneHint} {event.timezone}
          </p>
        </div>
        <button
          className="rounded-xl bg-black px-4 py-2 font-semibold text-white"
          onClick={() => setEditing(editing === "new" ? null : "new")}
          type="button"
        >
          {editing === "new" ? ru.ticketTypes.close : ru.ticketTypes.create}
        </button>
      </div>

      {editing ? (
        <TicketTypeForm
          event={event}
          item={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setMessage(ru.ticketTypes.saved);
            await load();
          }}
        />
      ) : null}

      {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}
      {loading ? <p className="mt-6 text-zinc-600">{ru.common.loading}</p> : null}
      {!loading && items.length === 0 ? <p className="mt-6 text-zinc-600">{ru.ticketTypes.empty}</p> : null}

      <div className="mt-6 grid gap-4">
        {items.map((item) => (
          <article className="rounded-2xl border border-zinc-200 p-5" key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold">
                  {ru.ticketTypes.statuses[item.status]}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{item.name}</h3>
                <p className="mt-1 text-sm text-zinc-600">{formatMoney(item.price, item.currency)}</p>
                {item.salesStartAt || item.salesEndAt ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatWindow(item, event.timezone)}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-3">
                <button className="text-sm underline" onClick={() => setEditing(item)} type="button">
                  {ru.ticketTypes.edit}
                </button>
                <button className="text-sm text-red-700 underline" onClick={() => void remove(item)} type="button">
                  {ru.common.delete}
                </button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(ru.ticketTypes.counters) as Array<keyof typeof ru.ticketTypes.counters>).map((key) => (
                <div className="rounded-xl bg-zinc-50 px-3 py-2" key={key}>
                  <div className="text-xs text-zinc-500">{ru.ticketTypes.counters[key]}</div>
                  <div className="font-semibold">{item.counters[key]}</div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TicketTypeForm({
  event,
  item,
  onCancel,
  onSaved,
}: {
  event: OrganizerEvent;
  item: OrganizerTicketType | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<TicketTypeFormValues>(() => item ? toForm(item, event.timezone) : EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof TicketTypeFormValues>(key: K, value: TicketTypeFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function save(formEvent: FormEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = toPayload(values, event.timezone);
      await apiRequest(
        item ? `/api/organizer/ticket-types/${item.id}` : `/api/organizer/events/${event.id}/ticket-types`,
        { method: item ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ru.ticketTypes.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-6 grid gap-5 rounded-2xl bg-zinc-50 p-5" onSubmit={(formEvent) => void save(formEvent)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ru.ticketTypes.fields.name} required value={values.name} onChange={(value) => update("name", value)} />
        <SelectField label={ru.ticketTypes.fields.status} value={values.status} onChange={(value) => update("status", value as TicketTypeStatus)} />
        <Field label={ru.ticketTypes.fields.price} min="0" required type="number" value={values.price} onChange={(value) => update("price", value)} />
        {event.paymentMode === "deposit" ? <Field label={ru.ticketTypes.fields.deposit} min="1" required type="number" value={values.deposit} onChange={(value) => update("deposit", value)} /> : null}
        <Field label={ru.ticketTypes.fields.currency} required value={values.currency} onChange={(value) => update("currency", value.toUpperCase())} />
        <Field label={ru.ticketTypes.fields.quantityTotal} min="0" required type="number" value={values.quantityTotal} onChange={(value) => update("quantityTotal", value)} />
      </div>
      <p className="text-xs text-zinc-500">{ru.ticketTypes.moneyHint}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ru.ticketTypes.fields.salesStartAt} type="datetime-local" value={values.salesStartAt} onChange={(value) => update("salesStartAt", value)} />
        <Field label={ru.ticketTypes.fields.salesEndAt} type="datetime-local" value={values.salesEndAt} onChange={(value) => update("salesEndAt", value)} />
      </div>
      <Area label={ru.ticketTypes.fields.description} value={values.description} onChange={(value) => update("description", value)} />
      <Area label={ru.ticketTypes.fields.restrictions} value={values.restrictions} onChange={(value) => update("restrictions", value)} />
      {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      <div className="flex gap-3">
        <button className="rounded-xl bg-black px-4 py-2 font-semibold text-white disabled:opacity-40" disabled={busy} type="submit">
          {busy ? ru.common.saving : ru.common.save}
        </button>
        <button className="rounded-xl border border-zinc-300 px-4 py-2" disabled={busy} onClick={onCancel} type="button">
          {ru.common.cancel}
        </button>
      </div>
    </form>
  );
}

function Field({ label, min, onChange, required = false, type = "text", value }: { label: string; min?: string; onChange: (value: string) => void; required?: boolean; type?: string; value: string }) {
  return <label className="grid gap-2 text-sm font-semibold">{label}<input className="rounded-xl border border-zinc-300 bg-white px-4 py-3 font-normal" min={min} onInput={(input) => onChange(input.currentTarget.value)} required={required} type={type} value={value} /></label>;
}

function SelectField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: TicketTypeStatus }) {
  return <label className="grid gap-2 text-sm font-semibold">{label}<select className="rounded-xl border border-zinc-300 bg-white px-4 py-3 font-normal" onChange={(input) => onChange(input.currentTarget.value)} value={value}>{(Object.keys(ru.ticketTypes.statuses) as TicketTypeStatus[]).map((status) => <option key={status} value={status}>{ru.ticketTypes.statuses[status]}</option>)}</select></label>;
}

function Area({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="grid gap-2 text-sm font-semibold">{label}<textarea className="min-h-24 rounded-xl border border-zinc-300 bg-white px-4 py-3 font-normal" onInput={(input) => onChange(input.currentTarget.value)} value={value} /></label>;
}

function toForm(item: OrganizerTicketType, timezone: string): TicketTypeFormValues {
  return {
    name: item.name,
    price: String(item.price),
    deposit: String(item.deposit),
    currency: item.currency,
    quantityTotal: String(item.quantityTotal),
    description: item.description ?? "",
    salesStartAt: item.salesStartAt ? isoToZonedInput(item.salesStartAt, timezone) : "",
    salesEndAt: item.salesEndAt ? isoToZonedInput(item.salesEndAt, timezone) : "",
    restrictions: item.restrictions ?? "",
    status: item.status,
  };
}

function toPayload(values: TicketTypeFormValues, timezone: string): CreateTicketTypeRequest {
  return {
    name: values.name,
    price: Number(values.price),
    deposit: eventPaymentDeposit(values),
    currency: values.currency,
    quantityTotal: Number(values.quantityTotal),
    description: optional(values.description),
    salesStartAt: values.salesStartAt ? zonedInputToIso(values.salesStartAt, timezone) : null,
    salesEndAt: values.salesEndAt ? zonedInputToIso(values.salesEndAt, timezone) : null,
    restrictions: optional(values.restrictions),
    status: values.status,
  };
}

function eventPaymentDeposit(values: TicketTypeFormValues): number {
  return Number(values.deposit);
}

function optional(value: string): string | null { return value.trim() || null; }

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value / 100);
}

function formatWindow(item: OrganizerTicketType, timezone: string): string {
  const start = item.salesStartAt ? formatInZone(item.salesStartAt, timezone) : "—";
  const end = item.salesEndAt ? formatInZone(item.salesEndAt, timezone) : "—";
  return `${start} — ${end}`;
}

function formatInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(iso));
}
