"use client";

import { INTL_LOCALES } from "../lib/locale";

import type { EventChatMessage, EventChatPage } from "@event-platform/shared-types";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../app/(auth)/_lib/api";
import { quickRequest } from "../app/quick/api";
import { useLocale } from "./locale-provider";
import { ORDER_CHAT_COPY } from "../lib/order-chat-copy";

export function OrderChat({ eventId, orderId, mode, accessToken }: { eventId: string; orderId: string; mode: "guest" | "organizer" | "anonymous"; accessToken?: string }) {
  const locale = useLocale();
  const copy = ORDER_CHAT_COPY[locale];
  const path = mode === "organizer" ? `/api/organizer/events/${eventId}/orders/${orderId}/chat` : `/api/me/events/${eventId}/orders/${orderId}/chat`;
  const quickPath = `events/${eventId}/orders/${orderId}/chat`;
  const load = useCallback((before?: string) => mode === "anonymous" ? quickRequest<EventChatPage>(`${quickPath}${before ? `?before=${encodeURIComponent(before)}` : ""}`, accessToken) : apiRequest<EventChatPage>(`${path}${before ? `?before=${encodeURIComponent(before)}` : ""}`), [accessToken, mode, path, quickPath]);
  const markRead = useCallback(() => mode === "anonymous" ? quickRequest(`${quickPath}/read`, accessToken, {}) : apiRequest(`${path}/read`, { method: "POST" }), [accessToken, mode, path, quickPath]);
  const [items, setItems] = useState<EventChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef(false);
  const messageKey = useRef<string | null>(null);
  const cursorInitialized = useRef(false);
  const refresh = useCallback(async () => {
    const page = await load();
    setItems((previous) => {
      const byId = new Map(previous.map((item) => [item.id, item]));
      page.items.forEach((item) => byId.set(item.id, item));
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    });
    if (!cursorInitialized.current) { setCursor(page.nextCursor); cursorInitialized.current = true; }
    await markRead();
  }, [load, markRead]);
  useEffect(() => {
    let active = true;
    setLoaded(false); setItems([]); setCursor(null); setError(null); cursorInitialized.current = false;
    void refresh().catch((reason) => { if (active) setError(errorText(reason, copy.failed)); }).finally(() => { if (active) setLoaded(true); });
    const timer = setInterval(() => { if (active) void refresh().catch(() => undefined); }, 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh, copy]);
  async function older(): Promise<void> {
    if (!cursor) return;
    try {
      const page = await load(cursor);
      setItems((previous) => [...page.items.filter((item) => !previous.some((existing) => existing.id === item.id)), ...previous]);
      setCursor(page.nextCursor);
    } catch (reason) { setError(errorText(reason, copy.failed)); }
  }
  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending.current || !draft.trim()) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const requestKey = messageKey.current ?? crypto.randomUUID(); messageKey.current = requestKey;
      const saved = mode === "anonymous"
        ? await quickRequest<EventChatMessage>(quickPath, accessToken, { text: draft.trim(), requestKey })
        : await apiRequest<EventChatMessage>(path, { method: "POST", body: JSON.stringify({ text: draft.trim(), requestKey }) });
      setItems((previous) => previous.some((item) => item.id === saved.id) ? previous : [...previous, saved]);
      setDraft(""); messageKey.current = null;
      void refresh().catch(() => undefined);
    } catch (reason) { setError(errorText(reason, copy.failed)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="mt-6 border-t border-[#e7e3ed] dark:border-ticket-border pt-5" aria-label={copy.label}><h3 className="text-base font-bold">{copy.title}</h3><p className="mt-1 text-xs text-[#6b7280] dark:text-ticket-muted">{copy.hint}</p>
    {cursor ? <button type="button" className="mt-3 text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent" onClick={() => void older()}>{copy.older}</button> : null}
    {!loaded ? <p className="mt-3 text-sm" role="status">{copy.loading}</p> : items.length === 0 ? <p className="mt-3 text-sm text-[#6b7280] dark:text-ticket-muted">{copy.empty}</p> : <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto" aria-live="polite">{items.map((item) => <li key={item.id} className={`rounded-xl px-3 py-2 text-sm ${item.sender === mode ? "ml-8 bg-[#efe9ff] dark:bg-ticket-raised" : "mr-8 bg-[#f1f3f8] dark:bg-ticket-raised"}`}><p className="whitespace-pre-wrap break-words">{item.text}</p><p className="mt-1 text-[11px] text-[#6b7280] dark:text-ticket-muted">{item.sender === "organizer" ? copy.organizer : copy.guest} · {new Date(item.createdAt).toLocaleString(INTL_LOCALES[locale])}</p></li>)}</ol>}
    {error ? <p className="mt-3 rounded-lg bg-red-50 dark:bg-ticket-danger-soft p-2 text-sm text-red-800 dark:text-ticket-danger" role="alert">{error}</p> : null}
    <form className="mt-4 flex flex-col gap-2" onSubmit={(event) => void send(event)}><label className="text-sm font-semibold" htmlFor={`chat-${mode}-${orderId}`}>{copy.yourMessage}</label><textarea id={`chat-${mode}-${orderId}`} className="rounded-xl border border-[#d9d8e9] dark:border-ticket-border p-3 text-sm" value={draft} onChange={(event) => { setDraft(event.target.value); messageKey.current = null; }} maxLength={2000} rows={3} disabled={busy} /><button type="submit" className="self-start rounded-xl bg-[#5b21b6] dark:bg-ticket-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !draft.trim()}>{busy ? copy.sending : copy.send}</button></form>
  </section>;
}

function errorText(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
