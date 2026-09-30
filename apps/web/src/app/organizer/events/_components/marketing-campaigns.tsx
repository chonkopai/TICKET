"use client";

import { INTL_LOCALES, localeUrl } from "../../../../lib/locale";

import type { MarketingCampaignPreview, MarketingCampaignStatus } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { apiRequest } from "../../../(auth)/_lib/api";
import { useLocale } from "../../../../components/locale-provider";
import { MARKETING_COPY } from "../../../../lib/marketing-copy";

export function MarketingCampaigns({ eventId }: { eventId: string }) {
  return <ProtectedRoute><CampaignComposer eventId={eventId} /></ProtectedRoute>;
}

function CampaignComposer({ eventId }: { eventId: string }) {
  const locale = useLocale();
  const copy = MARKETING_COPY[locale];
  const path = `/api/organizer/events/${eventId}/campaigns`;
  const [preview, setPreview] = useState<MarketingCampaignPreview | null>(null);
  const [history, setHistory] = useState<MarketingCampaignStatus[]>([]);
  const [draft, setDraft] = useState<MarketingCampaignStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    const [nextPreview, nextHistory] = await Promise.all([
      apiRequest<MarketingCampaignPreview>(`${path}/preview`),
      apiRequest<MarketingCampaignStatus[]>(path),
    ]);
    setPreview(nextPreview);
    setHistory(nextHistory);
    return nextHistory;
  }, [path]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void Promise.all([
      apiRequest<MarketingCampaignPreview>(`${path}/preview`, { signal: controller.signal }),
      apiRequest<MarketingCampaignStatus[]>(path, { signal: controller.signal }),
    ]).then(([p, h]) => { if (active) { setPreview(p); setHistory(h); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason, copy.failed)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [path, copy]);

  useEffect(() => {
    if (!history.some((item) => item.status === "queued" || item.status === "sending")) return;
    const timer = setInterval(() => { if (!document.hidden) void refresh().catch(() => undefined); }, 10_000);
    return () => clearInterval(timer);
  }, [history, refresh]);

  async function saveDraft(): Promise<MarketingCampaignStatus | null> {
    if (!message.trim()) { setError(copy.enterMessage); return null; }
    if (draft) {
      if (draft.message === message.trim()) return draft;
      const updated = await apiRequest<MarketingCampaignStatus>(`${path}/${draft.id}`, { method: "PATCH", body: JSON.stringify({ message: message.trim() }) });
      setDraft(updated); return updated;
    }
    const key = requestKey.current ?? crypto.randomUUID();
    requestKey.current = key;
    try {
      const created = await apiRequest<MarketingCampaignStatus>(path, { method: "POST", body: JSON.stringify({ message: message.trim(), requestKey: key }) });
      requestKey.current = null; setDraft(created); setHistory((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      return created;
    } catch (reason) {
      const list = await refresh().catch(() => null);
      const found = list?.find((item) => item.requestKey === key);
      if (found) { requestKey.current = null; setDraft(found); return found; }
      throw reason;
    }
  }

  async function action(task: () => Promise<void>): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { await task(); } catch (reason) { setError(errorText(reason, copy.failed)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  function mediaUrl(value: string): string { return new URL(value, process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").toString(); }

  return <main className="min-h-screen bg-[#f9f9ff] px-4 py-6 text-[#1d2430] sm:px-6">
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={localeUrl(`/organizer/events/${eventId}`, locale)} className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#5523ba] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5523ba]">← {copy.back}</Link>
      <header><h1 className="text-2xl font-bold sm:text-3xl">{copy.title}</h1><p className="mt-1 text-sm text-[#5c6472]">{copy.intro}</p></header>
      <section className="rounded-2xl border border-[#e3dff2] bg-white p-5 shadow-sm sm:p-7" aria-label={copy.campaign}>
        <h2 className="text-lg font-bold">{copy.newCampaign}</h2>
        {preview ? <p className="mt-2 rounded-xl bg-[#f3efff] p-3 text-sm"><strong>{preview.eventTitle}</strong><br />{copy.availableNow}: {preview.eligibleCount} {copy.recipients}. {copy.rechecked}</p> : null}
        <label htmlFor="campaign-message" className="mt-5 block text-sm font-semibold">{copy.message}</label>
        <textarea id="campaign-message" rows={5} maxLength={draft?.imageUrl ? 900 : 2000} value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} className="mt-2 w-full rounded-xl border border-[#d9d8e9] bg-[#f7f7ff] px-3 py-3" placeholder={copy.placeholder} />
        <p className="text-right text-xs text-[#647086]">{message.length} / {draft?.imageUrl ? 900 : 2000}{draft?.imageUrl ? ` · ${copy.imageCaption}` : ""}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || !message.trim()} onClick={() => void action(async () => { await saveDraft(); setNotice(copy.draftSaved); })} className="rounded-xl border border-[#cfc5ee] px-4 py-2 text-sm font-semibold disabled:opacity-50">{copy.saveDraft}</button>
          <label className="cursor-pointer rounded-xl border border-[#cfc5ee] px-4 py-2 text-sm font-semibold focus-within:outline focus-within:outline-2 focus-within:outline-[#5523ba]">{copy.addImage}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy || !message.trim()} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void action(async () => { const saved = await saveDraft(); if (!saved) return; const form = new FormData(); form.append("image", file); const updated = await apiRequest<MarketingCampaignStatus>(`${path}/${saved.id}/image`, { method: "POST", body: form }); setDraft(updated); setHistory((items) => [updated, ...items.filter((item) => item.id !== updated.id)]); setNotice(copy.imageSaved); }); event.target.value = ""; }} /></label>
        </div>
        {draft?.imageUrl ? <img src={mediaUrl(draft.imageUrl)} alt={copy.imageAlt} className="mt-4 max-h-60 rounded-xl object-contain" /> : null}
        <div className="mt-5 rounded-xl border border-[#e9e8f3] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#647086]">{copy.preview}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.trim() || copy.enterMessage}</p></div>
        {loading ? <p className="mt-4 text-sm" role="status">{copy.loading}</p> : null}
        {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
        {notice ? <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-900" role="status">{notice}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy || loading || !preview?.eligibleCount || !message.trim()} onClick={() => void action(async () => {
          const saved = await saveDraft(); if (!saved) return;
          const current = await apiRequest<MarketingCampaignPreview>(`${path}/preview`); setPreview(current);
          if (!current.eligibleCount) { setError(copy.noneEligible); return; }
          if (!window.confirm(`${copy.confirm} ${current.eligibleCount} ${copy.forRecipients} «${current.eventTitle}»?`)) return;
          try {
            const sent = await apiRequest<MarketingCampaignStatus>(`${path}/${saved.id}/send`, { method: "POST" });
            setHistory((items) => [sent, ...items.filter((item) => item.id !== sent.id)]); setDraft(null); setMessage(""); setNotice(copy.queueNotice);
          } catch (reason) {
            const state = await apiRequest<MarketingCampaignStatus>(`${path}/${saved.id}`).catch(() => null);
            if (state && state.status !== "draft") { setHistory((items) => [state, ...items.filter((item) => item.id !== state.id)]); setDraft(null); setMessage(""); setNotice(copy.acceptedNotice); }
            else throw reason;
          }
        })} className="rounded-xl bg-[#5b21c8] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? copy.processing : copy.submit}</button><button type="button" onClick={() => void action(async () => { await refresh(); setNotice(copy.audienceUpdated); })} disabled={busy} className="rounded-xl border border-[#d9d8e9] px-4 py-3 text-sm font-semibold">{copy.refreshAudience}</button></div>
        <p className="mt-3 text-xs text-[#647086]">{copy.limits}</p>
      </section>
      <section className="rounded-2xl border border-[#e3dff2] bg-white p-5 shadow-sm sm:p-7"><h2 className="text-lg font-bold">{copy.history}</h2>
        {history.length === 0 ? <p className="mt-3 text-sm text-[#647086]">{copy.empty}</p> : <ol className="mt-3 space-y-3">{history.map((item) => <li key={item.id} className="rounded-xl border border-[#e9e8f3] p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{copy.statuses[item.status]}</strong><span>{new Date(item.createdAt).toLocaleString(INTL_LOCALES[locale])}</span></div><p className="mt-2 whitespace-pre-wrap break-words">{item.message}</p><p className="mt-2 text-[#526070]">{copy.audience}: {item.audienceCount} · {copy.queued}: {item.counts.queued} · {copy.telegramAccepted}: {item.counts.accepted} · {copy.failedCount}: {item.counts.failed} · {copy.uncertain}: {item.counts.uncertain}</p>{item.failureReasons.length ? <p className="mt-1 text-[#9a3412]">{item.failureReasons.map((reason) => `${reason.code} (${reason.count})`).join(", ")}</p> : null}{item.status === "draft" ? <button type="button" disabled={busy} onClick={() => { setDraft(item); setMessage(item.message); setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mt-3 font-semibold text-[#5523ba]">{copy.continueDraft}</button> : null}</li>)}</ol>}
      </section>
    </div>
  </main>;
}

function errorText(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback; }
