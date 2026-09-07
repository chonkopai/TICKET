"use client";
import { quickRu, ru } from "@event-platform/shared-types";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../../(auth)/_lib/api";
import { BackLink } from "../../../../../components/back-link";

type Purchase = { id: string; name: string | null; guestContact: { telegramId?: string } | null; amount: number; currency: string; status: string; tickets: Array<{ id: string; status: string }>; booking: { id: string; status: string } | null };
export default function PurchasesPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState(""); const [page, setPage] = useState(1); const [rows, setRows] = useState<Purchase[] | null>(null); const [error, setError] = useState(false);
  useEffect(() => { void params.then(p => setId(p.id)); }, [params]);
  useEffect(() => { if (!id) return; let stopped = false; setRows(null); setError(false); void apiRequest<{ items: Purchase[] }>(`/api/organizer/events/${id}/purchases?page=${page}`).then(result => { if (!stopped) setRows(result.items); }).catch(() => { if (!stopped) setError(true); }); return () => { stopped = true; }; }, [id, page]);
  return <main className="mx-auto max-w-4xl space-y-5 p-6"><BackLink href={`/organizer/events/${id}`} /><h1 className="text-3xl font-semibold">{quickRu.purchases}</h1>{error ? <p role="alert">{quickRu.error}</p> : !rows ? <p>{ru.common.loading}</p> : rows.length === 0 ? <p>{ru.guest.empty}</p> : rows.map(row => <article key={row.id} className="rounded-xl border p-4"><h2 className="font-semibold">{row.name ?? "—"}</h2>{row.guestContact?.telegramId && <p>Telegram: {row.guestContact.telegramId}</p>}<p>{row.amount / 100} {row.currency} · {(ru.checkout.paymentStatuses as Record<string, string>)[row.status] ?? row.status}</p>{row.tickets.map(t => <p key={t.id}>{ru.guest.ticket}: {(quickRu.ticketStatuses as Record<string, string>)[t.status] ?? t.status}</p>)}{row.booking && <p>{ru.guest.table}: {(ru.guest.statuses as Record<string, string>)[row.booking.status] ?? row.booking.status}</p>}</article>)}<div className="flex gap-5"><button disabled={page === 1} onClick={() => setPage(page - 1)}>{ru.common.previous}</button><button disabled={!rows || rows.length < 20} onClick={() => setPage(page + 1)}>{ru.common.next}</button></div></main>;
}
