"use client";

import { INTL_LOCALES, localeUrl } from "../../../../lib/locale";

import type { EventScanPreview, ManagementEventSummary, UseGroupPassResponse, UseTicketResponse } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { apiRequest } from "../../../(auth)/_lib/api";
import { useLocale } from "../../../../components/locale-provider";
import { SCANNER_COPY } from "../../../../lib/scanner-copy";

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

export function EventScanner({ eventId }: { eventId: string }) {
  return <ProtectedRoute><Scanner eventId={eventId} /></ProtectedRoute>;
}

function Scanner({ eventId }: { eventId: string }) {
  const locale = useLocale();
  const copy = SCANNER_COPY[locale];
  const [title, setTitle] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<EventScanPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraState, setCameraState] = useState<"off" | "starting" | "running">("off");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanSequence = useRef(0);
  const pending = useRef(false);

  const stopCamera = useCallback(() => {
    scanSequence.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState("off");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<ManagementEventSummary>(`/api/organizer/events/${eventId}/management-summary`, { signal: controller.signal })
      .then((summary) => { if (!controller.signal.aborted) setTitle(summary.event.title); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(message(reason, copy.inspectFailed)); });
    return () => controller.abort();
  }, [eventId, copy]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const inspect = useCallback(async (token: string) => {
    const trimmed = token.trim();
    if (pending.current) return;
    if (!/^[A-Za-z0-9_-]{43}$/.test(trimmed)) { setError(copy.invalidCode); return; }
    pending.current = true; setBusy(true); setError(null); setSuccess(null); setPreview(null);
    try {
      const result = await apiRequest<EventScanPreview>(`/api/organizer/tickets/events/${eventId}/inspect`, { method: "POST", body: JSON.stringify({ token: trimmed }) });
      stopCamera();
      setCode(trimmed); setPreview(result);
    } catch (reason) { setError(message(reason, copy.inspectFailed)); }
    finally { pending.current = false; setBusy(false); }
  }, [eventId, stopCamera, copy]);

  async function startCamera(): Promise<void> {
    if (cameraState !== "off") return;
    setError(null); setSuccess(null); setCameraState("starting");
    const detectorClass = (globalThis as typeof globalThis & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!detectorClass) { setCameraState("off"); setError(copy.qrUnsupported); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraState("off"); setError(copy.cameraUnavailable); return; }
    const sequence = ++scanSequence.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (sequence !== scanSequence.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stopCamera(); return; }
      video.srcObject = stream;
      await video.play();
      if (sequence !== scanSequence.current) return;
      setCameraState("running");
      const detector = new detectorClass({ formats: ["qr_code"] });
      const scan = async () => {
        if (sequence !== scanSequence.current) return;
        try {
          const matches = await detector.detect(video);
          if (sequence !== scanSequence.current) return;
          if (matches[0]?.rawValue) { await inspect(matches[0].rawValue); return; }
        } catch { /* A missed frame should not stop manual input or the camera. */ }
        if (sequence === scanSequence.current) timerRef.current = setTimeout(() => void scan(), 250);
      };
      void scan();
    } catch (reason) {
      stopCamera();
      setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? copy.cameraDenied : `${copy.cameraFailed}: ${message(reason, copy.inspectFailed)}`);
    }
  }

  async function admit(): Promise<void> {
    if (!preview || pending.current) return;
    pending.current = true; setBusy(true); setError(null); setSuccess(null);
    try {
      if (preview.kind === "ticket") {
        const result = await apiRequest<UseTicketResponse>(`/api/organizer/tickets/events/${eventId}/use`, { method: "POST", body: JSON.stringify({ qrToken: code }) });
        setSuccess(`${copy.ticketAdmitted}${result.ticket.seatLabel ? ` · ${result.ticket.seatLabel}` : ""}.`);
      } else {
        const result = await apiRequest<UseGroupPassResponse>(`/api/organizer/tickets/events/${eventId}/group-pass/use`, { method: "POST", body: JSON.stringify({ token: code, confirm: true }) });
        setSuccess(`${copy.groupAdmitted}: ${result.admitted}. ${copy.groupAdmittedHint}`);
      }
      setPreview(null); setCode("");
    } catch (reason) { setError(message(reason, copy.inspectFailed)); setPreview(null); }
    finally { pending.current = false; setBusy(false); }
  }

  function submitManual(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); void inspect(code); }
  const canAdmit = preview?.kind === "ticket" ? preview.ticket.status === "active" : preview?.kind === "group_pass" && preview.status === "active" && preview.remaining > 0;

  return <main className="min-h-screen bg-[#f9f9ff] px-4 py-6 text-[#151c27] sm:px-6">
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={localeUrl(`/organizer/events/${eventId}`, locale)} className="inline-flex rounded-lg px-3 py-2 text-sm font-semibold text-[#5b21b6] hover:bg-[#eee9ff]">← {copy.back}</Link>
      <section className="rounded-2xl border border-[#e5e1f4] bg-white p-5 shadow-sm sm:p-7">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        {title ? <p className="mt-1 text-sm text-slate-600">{title}</p> : null}
        <p className="mt-4 text-sm text-slate-600">{copy.hint}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={busy || cameraState === "starting"} onClick={() => cameraState === "off" ? void startCamera() : stopCamera()} className="rounded-lg bg-[#5b21b6] px-4 py-2 font-semibold text-white disabled:opacity-50">{cameraState === "off" ? copy.startCamera : cameraState === "starting" ? copy.startingCamera : copy.stopCamera}</button>
        </div>
        <video ref={videoRef} muted playsInline aria-label={copy.video} className={`mt-4 w-full rounded-xl bg-slate-900 ${cameraState === "off" ? "hidden" : "block"}`} />
        <form onSubmit={submitManual} className="mt-6 space-y-2"><label htmlFor="scan-code" className="block text-sm font-semibold">{copy.code}</label><div className="flex flex-col gap-2 sm:flex-row"><input id="scan-code" type="text" autoComplete="off" spellCheck={false} value={code} onChange={(event) => { setCode(event.target.value); setPreview(null); setSuccess(null); }} className="min-w-0 flex-1 rounded-lg border border-[#d7d7ea] px-3 py-2 font-mono text-sm" placeholder={copy.pasteCode} /><button type="submit" disabled={busy} className="rounded-lg border border-[#d7d7ea] px-4 py-2 font-semibold disabled:opacity-50">{copy.inspect}</button></div></form>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {success ? <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p> : null}
        {preview ? <div className="mt-5 rounded-xl border border-[#ded9f0] bg-[#f9f7ff] p-4"><h2 className="font-semibold">{preview.kind === "ticket" ? preview.ticket.ticketTypeName : `${copy.groupPass} · ${preview.tableLabel}`}</h2><p className="mt-1 text-sm">{preview.kind === "ticket" ? `${copy.status}: ${ticketStatus(preview.ticket.status, locale)}${preview.ticket.seatLabel ? ` · ${preview.ticket.seatLabel}` : ""}${preview.ticket.usedAt ? ` · ${copy.admission} ${new Date(preview.ticket.usedAt).toLocaleString(INTL_LOCALES[locale])}` : ""}` : `${copy.totalSeats}: ${preview.totalSeats} · ${copy.admitted}: ${preview.admitted} · ${copy.remaining}: ${preview.remaining}`}</p>{preview.kind === "group_pass" ? <p className="mt-2 text-sm text-amber-900">{copy.groupHint}</p> : null}{canAdmit ? <button type="button" disabled={busy} onClick={() => void admit()} className="mt-4 rounded-lg bg-[#5b21b6] px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? copy.admitting : preview.kind === "group_pass" ? `${copy.admitGroup}: ${preview.remaining}` : copy.admitTicket}</button> : <p className="mt-3 text-sm font-semibold text-red-800">{copy.codeUnusable}</p>}</div> : null}
      </section>
    </div>
  </main>;
}

function ticketStatus(value: string, locale: "ru" | "kk" | "en"): string { return SCANNER_COPY[locale].ticketStatuses[value] ?? value; }
function message(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback; }
