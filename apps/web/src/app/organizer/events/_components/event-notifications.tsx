"use client";

import { INTL_LOCALES, localeUrl } from "../../../../lib/locale";

import { SelectPicker } from "../../../../components/option-picker";

import { EVENT_NOTIFICATION_TYPES, type EventNotificationPreview, type EventNotificationStatus, type EventNotificationType } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { apiRequest } from "../../../(auth)/_lib/api";
import { useLocale } from "../../../../components/locale-provider";
import { EVENT_NOTIFICATION_COPY } from "../../../../lib/event-notification-copy";

export function EventNotifications({ eventId }: { eventId: string }) {
  return <ProtectedRoute><Composer eventId={eventId} /></ProtectedRoute>;
}

function Composer({ eventId }: { eventId: string }) {
  const locale = useLocale();
  const copy = EVENT_NOTIFICATION_COPY[locale];
  const labels = copy.labels;
  const [type, setType] = useState<EventNotificationType>("important");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<EventNotificationPreview | null>(null);
  const [history, setHistory] = useState<EventNotificationStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    const list = await apiRequest<EventNotificationStatus[]>(`/api/organizer/events/${eventId}/notifications`);
    setHistory(list);
    return list;
  }, [eventId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void Promise.all([
      apiRequest<EventNotificationPreview>(`/api/organizer/events/${eventId}/notifications/preview?type=${type}`, { signal: controller.signal }),
      apiRequest<EventNotificationStatus[]>(`/api/organizer/events/${eventId}/notifications`, { signal: controller.signal }),
    ]).then(([nextPreview, list]) => { if (active) { setPreview(nextPreview); setHistory(list); } })
      .catch((reason) => { if (active) setError(errorText(reason, copy.error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [eventId, type, copy]);

  useEffect(() => {
    if (!history.some((item) => item.status === "queued" || item.status === "sending")) return;
    const timer = setInterval(() => { void refresh().catch(() => undefined); }, 10_000);
    return () => clearInterval(timer);
  }, [history, refresh]);

  async function submit(): Promise<void> {
    if (inFlight.current || busy || !preview || !message.trim() || message.trim().length > 2000) return;
    if (!window.confirm(`${copy.confirm} «${preview.eventTitle}»? ${copy.recipients}: ${preview.audienceCount}, ${copy.telegramAvailable}: ${preview.reachableCount}. ${copy.queuedHint}`)) return;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    const key = requestKey.current ?? crypto.randomUUID();
    requestKey.current = key;
    try {
      const queued = await apiRequest<EventNotificationStatus>(`/api/organizer/events/${eventId}/notifications`, { method: "POST", body: JSON.stringify({ type, message: message.trim(), requestKey: key }) });
      setNotice(queued.reachableCount ? copy.queued : copy.noRecipients);
      setMessage(""); requestKey.current = null;
      setHistory((previous) => [queued, ...previous.filter((item) => item.id !== queued.id)]);
      void refresh().catch(() => undefined);
    } catch (reason) {
      try {
        const list = await refresh();
        if (list.some((item) => item.requestKey === key)) { setNotice(copy.accepted); setMessage(""); requestKey.current = null; }
        else setError(errorText(reason, copy.error));
      } catch { setError(`${errorText(reason, copy.error)} ${copy.checkHistory}`); }
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f9f9ff] px-4 py-6 text-[#1d2430] sm:px-6">
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={localeUrl(`/organizer/events/${eventId}`, locale)} className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#5523ba] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5523ba]">← {copy.back}</Link>
      <Link href={localeUrl(`/organizer/events/${eventId}/campaigns`, locale)} className="ml-2 inline-flex rounded-lg bg-[#eee8ff] px-4 py-2 text-sm font-semibold text-[#5523ba] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5523ba]">{copy.campaigns}</Link>
      <header><h1 className="text-2xl font-bold sm:text-3xl">{copy.title}</h1><p className="mt-1 text-sm text-[#5c6472]">{copy.intro}</p></header>
      <section className="rounded-2xl border border-[#e3dff2] bg-white p-5 shadow-sm sm:p-7" aria-label={copy.compose}>
        <label className="block text-sm font-semibold" htmlFor="notification-type">{copy.reason}</label>
        <SelectPicker id="notification-type" value={type} onChange={(event) => { setType(event.target.value as EventNotificationType); requestKey.current = null; }} disabled={busy} className="mt-2 w-full rounded-xl border border-[#d9d8e9] bg-[#f7f7ff] px-3 py-3">
          {EVENT_NOTIFICATION_TYPES.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
        </SelectPicker>
        <label className="mt-5 block text-sm font-semibold" htmlFor="notification-message">{copy.message}</label>
        <textarea id="notification-message" value={message} onChange={(event) => { setMessage(event.target.value); requestKey.current = null; }} maxLength={2000} rows={6} disabled={busy} className="mt-2 w-full rounded-xl border border-[#d9d8e9] px-3 py-3" placeholder={copy.placeholder} />
        <p className="text-right text-xs text-[#647086]">{message.length} / 2000</p>
        {preview ? <div className="mt-4 rounded-xl bg-[#f3efff] p-4 text-sm"><p className="font-semibold">{preview.eventTitle}</p><p className="mt-1">{copy.buyers}: {preview.audienceCount} · {copy.telegramAvailable}: {preview.reachableCount} · {copy.unreachable}: {preview.unreachableCount}</p><p className="mt-2 whitespace-pre-wrap break-words">{message.trim() || copy.preview}</p></div> : null}
        {loading ? <p className="mt-4 text-sm" role="status">{copy.loading}</p> : null}
        {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
        {notice ? <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-900" role="status">{notice}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => void submit()} disabled={busy || loading || !preview || preview.reachableCount === 0 || !message.trim()} className="rounded-xl bg-[#5b21c8] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? copy.queueing : copy.submit}</button><button type="button" onClick={() => { setError(null); setLoading(true); void Promise.all([apiRequest<EventNotificationPreview>(`/api/organizer/events/${eventId}/notifications/preview?type=${type}`), refresh()]).then(([value]) => setPreview(value)).catch((reason) => setError(errorText(reason, copy.error))).finally(() => setLoading(false)); }} disabled={busy} className="rounded-xl border border-[#d9d8e9] px-4 py-3 text-sm font-semibold">{copy.refresh}</button></div>
      </section>
      <section className="rounded-2xl border border-[#e3dff2] bg-white p-5 shadow-sm sm:p-7" aria-label={copy.history}><h2 className="text-lg font-bold">{copy.history}</h2>
        {history.length === 0 ? <p className="mt-3 text-sm text-[#647086]">{copy.empty}</p> : <ol className="mt-3 space-y-3">{history.map((item) => <li key={item.id} className="rounded-xl border border-[#e9e8f3] p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{item.type === "ticket.resend" ? copy.ticketResend : labels[item.type]}</strong><span>{new Date(item.createdAt).toLocaleString(INTL_LOCALES[locale])}</span></div><p className="mt-2 whitespace-pre-wrap break-words">{item.message}</p><p className="mt-2 text-[#526070]">{copy.inQueue}: {item.counts.queued} · {copy.telegramAccepted}: {item.counts.accepted} · {copy.rejected}: {item.counts.failed} · {copy.uncertain}: {item.counts.uncertain}</p>{item.failureReasons.length ? <p className="mt-1 text-[#9a3412]">{copy.reasons}: {item.failureReasons.map((reason) => `${copy.reasonLabels[reason.code] ?? copy.reasonLabels.default} (${reason.count})`).join(", ")}</p> : null}</li>)}</ol>}
      </section>
    </div>
  </main>;
}

function errorText(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback; }
