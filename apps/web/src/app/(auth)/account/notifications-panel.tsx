"use client";

import { INTL_LOCALES, localeUrl } from "../../../lib/locale";

import type { AccountNotificationList, NotificationPreferences } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "../_lib/api";
import { useLocale } from "../../../components/locale-provider";
import { NOTIFICATIONS_COPY } from "../../../lib/notifications-copy";

export function NotificationsPanel({ linked, preferences, busy, onLink, onChange }: { linked: boolean; preferences: NotificationPreferences | null; busy: boolean; onLink: () => void; onChange: (key: keyof NotificationPreferences, value: boolean) => void }) {
  const locale = useLocale();
  const copy = NOTIFICATIONS_COPY[locale];
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [list, setList] = useState<AccountNotificationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const generation = useRef(0);

  const reload = useCallback(async (quiet = false): Promise<boolean> => {
    const current = ++generation.current;
    if (!quiet) setList(null);
    try {
      const result = await apiRequest<AccountNotificationList>(`/me/notifications?page=${page}&limit=10&unreadOnly=${unreadOnly}`);
      if (current !== generation.current) return false;
      setList(result); setError(null);
      return true;
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : copy.loadFailed);
      return false;
    }
  }, [page, unreadOnly, copy]);

  useEffect(() => {
    void reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") {
        failures = await reload(true) ? 0 : Math.min(failures + 1, 3);
      }
      if (alive) timer = setTimeout(poll, 30_000 * (failures + 1));
    };
    timer = setTimeout(poll, 30_000);
    const visible = () => { if (document.visibilityState === "visible") void reload(true); };
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; generation.current++; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [reload]);

  async function read(id: string): Promise<void> {
    if (reading) return;
    setReading(id); setError(null);
    try { await apiRequest<{ readAt: string }>(`/me/notifications/${id}/read`, { method: "PATCH" }); await reload(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : copy.readFailed); }
    finally { setReading(null); }
  }

  return <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
    <div className="space-y-5">
      <div className="rounded-2xl bg-[#26123f] p-6 text-white"><p className="text-sm font-bold uppercase tracking-wider text-[#cdb9ee]">{copy.bot}</p><h2 className="mt-2 text-2xl font-bold">{linked ? copy.linked : copy.connect}</h2><p className="mt-3 text-sm text-white/70">{copy.botHint}</p>{!linked ? <button className="mt-6 rounded-xl bg-white px-5 py-3 font-bold text-[#5b21b6] disabled:opacity-50" disabled={busy} onClick={onLink} type="button">{copy.connectBot}</button> : <span className="mt-6 inline-flex rounded-full bg-emerald-400/20 px-3 py-1 text-sm font-bold text-emerald-200">{copy.active}</span>}</div>
      <div className="rounded-2xl border border-[#ded8e7] bg-white p-6"><h2 className="text-xl font-bold">{copy.settings}</h2><p className="mt-2 text-sm text-[#665d70]">{copy.settingsHint}</p><div className="mt-4 divide-y divide-[#ece7f1]">{preferences ? <><Toggle label={copy.ticketDelivery} description={copy.ticketDeliveryHint} checked={preferences.transactionalTicketDelivery} onChange={(value) => onChange("transactionalTicketDelivery", value)} /><Toggle label={copy.reminders} description={copy.remindersHint} checked={preferences.eventReminders} onChange={(value) => onChange("eventReminders", value)} /><Toggle label={copy.marketing} description={copy.marketingHint} checked={preferences.marketingAnnouncements} onChange={(value) => onChange("marketingAnnouncements", value)} /></> : <p className="py-4 text-sm text-[#665d70]">{copy.loading}</p>}</div></div>
    </div>
    <div className="min-w-0 rounded-2xl border border-[#ded8e7] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{copy.inbox}</h2><p className="mt-1 text-sm text-[#665d70]">{list ? `${copy.unreadCount}: ${list.unreadCount}` : copy.refreshing}</p></div><button className="rounded-lg border border-[#d2cadc] px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }} type="button">{unreadOnly ? copy.showAll : copy.unreadOnly}</button></div>
      {error ? <div aria-live="polite" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error} <button className="ml-2 font-bold underline" onClick={() => void reload()} type="button">{copy.retry}</button></div> : null}
      {!list ? <p className="mt-5 text-sm text-[#665d70]">{copy.loading}</p> : list.items.length ? <div className="mt-5 divide-y divide-[#ece7f1]">{list.items.map((item) => <article className={`py-4 ${item.readAt ? "opacity-75" : ""}`} key={item.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="font-bold">{item.eventTitle || "TICKET"}</p>{!item.readAt ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#6425bd]" aria-label={copy.unread} /> : null}</div><p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#51485c]">{item.text}</p><p className="mt-2 text-xs text-[#80758d]">{new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</p></div><div className="flex shrink-0 flex-col gap-2 text-right">{item.eventId ? <Link className="text-xs font-semibold text-[#5b21b6] underline" href={localeUrl(item.type === "event.cancellation" || item.type === "refund.succeeded" ? "/my-events" : `/events/${item.eventId}`, locale)}>{item.type === "event.cancellation" || item.type === "refund.succeeded" ? copy.myEvents : copy.event}</Link> : null}{!item.readAt ? <button className="text-xs font-semibold text-[#5b21b6] underline disabled:opacity-50" disabled={reading !== null} onClick={() => void read(item.id)} type="button">{copy.markRead}</button> : null}</div></div></article>)}</div> : <p className="mt-6 rounded-xl bg-[#f7f4fb] p-5 text-sm text-[#665d70]">{unreadOnly ? copy.noUnread : copy.empty}</p>}
      {list && list.total > list.limit ? <nav aria-label={copy.pages} className="mt-5 flex items-center justify-between gap-3"><button className="rounded-lg border border-[#d2cadc] px-3 py-2 text-sm disabled:opacity-40" disabled={page === 1} onClick={() => setPage(page - 1)} type="button">{copy.back}</button><span className="text-sm text-[#665d70]">{page}</span><button className="rounded-lg border border-[#d2cadc] px-3 py-2 text-sm disabled:opacity-40" disabled={!list.hasNext} onClick={() => setPage(page + 1)} type="button">{copy.next}</button></nav> : null}
    </div>
  </div>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 py-4"><span><span className="block font-bold">{label}</span><span className="mt-1 block text-sm text-[#665d70]">{description}</span></span><input className="h-5 w-5 accent-[#6425bd]" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
