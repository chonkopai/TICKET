"use client";

import {
  EVENT_CATEGORIES,
  ru,
  type CreateEventRequest,
  type EventCategory,
  type EventStatus,
  type OrganizerEvent,
  type OrganizerEventPreview,
} from "@event-platform/shared-types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { apiRequest } from "../../../(auth)/_lib/api";
import { BackLink } from "../../../../components/back-link";
import { TicketTypesManager } from "./ticket-types-manager";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEPS = ru.events.wizardStepLabels;

interface FormValues extends CreateEventRequest {
  timezone: string;
  announcement: string;
  description: string;
  program: string;
  rules: string;
  visitTerms: string;
  cancellationTerms: string;
  paymentMode: "deposit" | "full_payment";
  showFullAmountForDeposit: boolean;
  depositTerms: string;
  extraConditions: string;
}

const EMPTY_FORM: FormValues = {
  title: "", category: "other", city: "Алматы", date: "", time: "", timezone: "Asia/Almaty",
  venueName: "", address: "", announcement: "", description: "", program: "", rules: "",
  visitTerms: "", cancellationTerms: "", paymentMode: "full_payment", showFullAmountForDeposit: false,
  depositTerms: "", extraConditions: "",
};

export function EventForm({ eventId }: { eventId?: string | undefined }) {
  return <main className="mx-auto min-h-screen max-w-4xl px-6 py-12"><ProtectedRoute><EventEditor eventId={eventId} /></ProtectedRoute></main>;
}

function EventEditor({ eventId }: { eventId?: string | undefined }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [event, setEvent] = useState<OrganizerEvent | null>(null);
  const [preview, setPreview] = useState<OrganizerEventPreview | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [dirty, setDirty] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const hydrated = useRef(false);
  const activeEventId = event?.id ?? eventId;

  useEffect(() => {
    if (!eventId) { setLoading(false); return; }
    apiRequest<OrganizerEvent>(`/api/organizer/events/${eventId}`)
      .then((loaded) => { setEvent(loaded); setValues(toFormValues(loaded)); hydrated.current = true; })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : ru.events.loadFailed))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    function warnBeforeLeaving(browserEvent: BeforeUnloadEvent): void {
      if (!dirty) return;
      browserEvent.preventDefault();
      browserEvent.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => {
    if (!event || !hydrated.current || !dirty || busy || step === 4 || step === 5) return;
    const timer = window.setTimeout(() => { void saveCurrentStep(true); }, 1200);
    return () => window.clearTimeout(timer);
  }, [values, step, event, dirty, busy]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage(null);
  }

  function validateStep(target: Step): boolean {
    const errors: Record<string, string> = {};
    if (target === 0) {
      const required: Array<[keyof FormValues, string]> = [
        ["title", ru.events.fields.title], ["city", ru.events.fields.city], ["date", ru.events.fields.date],
        ["time", ru.events.fields.time], ["timezone", ru.events.fields.timezone],
        ["venueName", ru.events.fields.venueName], ["address", ru.events.fields.address],
      ];
      for (const [field, label] of required) {
        const value = values[field];
        if (typeof value === "string" && !value.trim()) errors[field] = `${label}: ${ru.events.errors.fieldRequired}`;
      }
      if (!values.category) errors.category = ru.events.errors.categoryRequired;
    }
    if (target === 3 && values.paymentMode === "deposit" && !values.depositTerms.trim()) errors.depositTerms = `${ru.events.fields.depositTerms}: ${ru.events.errors.fieldRequired}`;
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(`event-${first}`)?.focus();
    return Object.keys(errors).length === 0;
  }

  async function saveCurrentStep(silent = false): Promise<boolean> {
    if (!validateStep(step)) return false;
    // The resources and review steps contain links/preview actions, not event fields.
    // Never send an empty PATCH (the API correctly rejects EVENT_UPDATE_EMPTY).
    if (step >= 4) {
      if (!silent) setMessage(ru.events.saved);
      return true;
    }
    setBusy(!silent); setAutoSaving(silent); setError(null); if (!silent) setMessage(null);
    try {
      const payload = activeEventId ? toStepPayload(values, step) : toPayload(values);
      const saved = activeEventId
        ? await apiRequest<OrganizerEvent>(`/api/organizer/events/${activeEventId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiRequest<OrganizerEvent>("/api/organizer/events", { method: "POST", body: JSON.stringify(payload) });
      setEvent(saved); setDirty(false);
      if (!activeEventId) router.replace(`/organizer/events/${saved.id}`);
      if (!silent) setMessage(ru.events.saved);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ru.events.saveFailed);
      return false;
    } finally { setBusy(false); setAutoSaving(false); }
  }

  async function saveAndContinue(): Promise<void> {
    const saved = await saveCurrentStep();
    if (saved) setStep((current) => Math.min(5, current + 1) as Step);
  }

  async function lifecycle(action: "publish" | "cancel" | "complete"): Promise<void> {
    if (!event || (action === "publish" && !validateAll())) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const updated = await apiRequest<OrganizerEvent>(`/api/organizer/events/${event.id}/${action}`, { method: "POST" });
      setEvent(updated); setValues(toFormValues(updated)); setMessage(ru.events.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : ru.events.actionFailed); }
    finally { setBusy(false); }
  }

  function validateAll(): boolean {
    for (const item of [0, 1, 2, 3] as Step[]) {
      if (!validateStep(item)) {
        setStep(item);
        return false;
      }
    }
    return true;
  }

  async function uploadPoster(): Promise<void> {
    if (!event || !poster) return;
    setBusy(true); setError(null);
    try { setEvent(await uploadPosterFile(event.id, poster)); setPoster(null); setMessage(ru.events.posterUploaded); }
    catch (reason) { setError(reason instanceof Error ? reason.message : ru.events.posterUploadFailed); }
    finally { setBusy(false); }
  }

  async function removePoster(): Promise<void> {
    if (!event) return;
    setBusy(true); setError(null);
    try { setEvent(await apiRequest<OrganizerEvent>(`/api/organizer/events/${event.id}/poster`, { method: "DELETE" })); setMessage(ru.events.posterRemoved); }
    catch (reason) { setError(reason instanceof Error ? reason.message : ru.events.actionFailed); }
    finally { setBusy(false); }
  }

  async function loadPreview(): Promise<void> {
    if (!activeEventId) { setError(ru.events.previewNeedsSave); return; }
    setBusy(true); setError(null);
    try { setPreview(await apiRequest<OrganizerEventPreview>(`/api/organizer/events/${activeEventId}/preview`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : ru.events.previewFailed); }
    finally { setBusy(false); }
  }

  async function deleteDraft(): Promise<void> {
    if (!event || !window.confirm(ru.events.deleteConfirm)) return;
    setBusy(true); setError(null);
    try { await apiRequest(`/api/organizer/events/${event.id}`, { method: "DELETE" }); router.replace("/organizer/events"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : ru.events.actionFailed); setBusy(false); }
  }

  async function goToStep(target: Step): Promise<void> {
    if (!event && target > 0) {
      setStep(0);
      setError(ru.events.saveStepFirst);
      return;
    }
    if (event && dirty && target > step && step < 4) {
      const saved = await saveCurrentStep();
      if (!saved) return;
    }
    setError(null);
    setStep(target);
  }

  if (loading) return <p className="text-zinc-600">{ru.common.loading}</p>;
  return <section>
    <BackLink href="/organizer/events" />
    <div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">{ru.events.eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{eventId ? ru.events.formEditTitle : ru.events.formCreateTitle}</h1><p className="mt-3 text-zinc-600">{ru.events.formDescription}</p></div>{event ? <Status status={event.status} /> : null}</div>
    <nav aria-label={ru.events.wizardSteps} className="mt-8 overflow-x-auto pb-2"><ol className="flex min-w-max gap-2">{STEPS.map((title, index) => <li key={title}><button className={`rounded-xl px-3 py-2 text-sm font-semibold ${step === index ? "bg-black text-white" : "border border-zinc-200 bg-white text-zinc-600"}`} onClick={() => void goToStep(index as Step)} type="button"><span className="mr-1">{index + 1}.</span>{title}</button></li>)}</ol></nav>
    <form className="mt-6 grid gap-6 rounded-3xl border border-black/10 bg-white p-7 shadow-sm" onSubmit={(formEvent) => { formEvent.preventDefault(); void saveAndContinue(); }}>
      {step === 0 ? <Basics values={values} errors={fieldErrors} update={update} /> : null}
      {step === 1 ? <Description values={values} update={update} poster={poster} setPoster={setPoster} event={event} busy={busy} onUpload={() => void uploadPoster()} onRemove={() => void removePoster()} /> : null}
      {step === 2 ? <Terms values={values} update={update} /> : null}
      {step === 3 ? <Payment values={values} update={update} errors={fieldErrors} /> : null}
      {step === 4 ? <Resources event={event} activeEventId={activeEventId} /> : null}
      {step === 5 ? <Review values={values} event={event} preview={preview} onPreview={() => void loadPreview()} /> : null}
      {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{message}</p> : null}
      {autoSaving ? <p className="text-sm text-zinc-500" role="status">{ru.events.autoSaving}</p> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-5"><button className="rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold disabled:opacity-40" disabled={busy || step === 0} onClick={() => setStep((current) => Math.max(0, current - 1) as Step)} type="button">{ru.events.previousStep}</button>{step < 5 ? <button className="rounded-xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-40" disabled={busy} type="submit">{busy ? ru.common.saving : ru.events.saveContinue}</button> : <button className="rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold" disabled={busy} onClick={() => void saveCurrentStep()} type="button">{ru.common.save}</button>}{step === 5 && event ? <button className="rounded-xl border border-indigo-300 px-5 py-3 font-semibold text-indigo-800 disabled:opacity-40" disabled={busy} onClick={() => void loadPreview()} type="button">{ru.events.preview}</button> : null}{event?.status === "draft" ? <button className="rounded-xl border border-emerald-300 px-5 py-3 font-semibold text-emerald-800 disabled:opacity-40" disabled={busy} onClick={() => void lifecycle("publish")} type="button">{ru.events.publish}</button> : null}{event?.status === "published" ? <><button className="rounded-xl border border-blue-300 px-5 py-3 font-semibold text-blue-800 disabled:opacity-40" disabled={busy} onClick={() => void lifecycle("complete")} type="button">{ru.events.complete}</button><button className="rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-800 disabled:opacity-40" disabled={busy} onClick={() => void lifecycle("cancel")} type="button">{ru.events.cancelEvent}</button></> : null}{event?.status === "draft" ? <button className="ml-auto text-sm text-red-700 underline disabled:opacity-40" disabled={busy} onClick={() => void deleteDraft()} type="button">{ru.events.deleteDraft}</button> : null}</div>
    </form>
    {event ? <TicketTypesManager event={event} /> : null}
  </section>;
}

function Basics({ values, update, errors }: { values: FormValues; update: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void; errors: Record<string, string> }) { return <div className="grid gap-5"><TextField id="event-title" label={ru.events.fields.title} required value={values.title} error={errors.title} onChange={(value) => update("title", value)} /><div className="grid gap-5 sm:grid-cols-2"><SelectField id="event-category" label={ru.events.fields.category} required value={values.category} error={errors.category} options={EVENT_CATEGORIES.map((category) => ({ value: category, label: ru.events.categories[category] }))} onChange={(value) => update("category", value as EventCategory)} /><TextField id="event-city" label={ru.events.fields.city} required value={values.city} error={errors.city} onChange={(value) => update("city", value)} /></div><div className="grid gap-5 sm:grid-cols-3"><TextField id="event-date" label={ru.events.fields.date} required type="date" value={values.date} error={errors.date} onChange={(value) => update("date", value)} /><TextField id="event-time" label={ru.events.fields.time} required type="time" value={values.time} error={errors.time} onChange={(value) => update("time", value)} /><TextField id="event-timezone" label={ru.events.fields.timezone} required value={values.timezone} error={errors.timezone} onChange={(value) => update("timezone", value)} /></div><div className="grid gap-5 sm:grid-cols-2"><TextField id="event-venueName" label={ru.events.fields.venueName} required value={values.venueName} error={errors.venueName} onChange={(value) => update("venueName", value)} /><TextField id="event-address" label={ru.events.fields.address} required value={values.address} error={errors.address} onChange={(value) => update("address", value)} /></div></div>; }

function Description({ values, update, poster, setPoster, event, busy, onUpload, onRemove }: { values: FormValues; update: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void; poster: File | null; setPoster: (file: File | null) => void; event: OrganizerEvent | null; busy: boolean; onUpload: () => void; onRemove: () => void }) {
  const [selectedPosterUrl, setSelectedPosterUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!poster) { setSelectedPosterUrl(null); return; }
    const objectUrl = URL.createObjectURL(poster);
    setSelectedPosterUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [poster]);
  return <div className="grid gap-5"><TextArea label={ru.events.fields.announcement} value={values.announcement} onChange={(value) => update("announcement", value)} /><TextArea label={ru.events.fields.description} value={values.description} onChange={(value) => update("description", value)} /><TextArea label={ru.events.fields.program} value={values.program} onChange={(value) => update("program", value)} /><div><label className="block text-sm font-semibold" htmlFor="poster">{ru.events.fields.poster}</label>{event?.posterUrl ? <img alt={ru.events.missingPosterAlt} className="mt-3 max-h-80 rounded-2xl object-cover" src={posterUrl(event.posterUrl)} /> : null}{selectedPosterUrl ? <div className="mt-3"><p className="text-xs font-semibold text-zinc-600">{ru.events.posterSelectedPreview}</p><img alt={ru.events.missingPosterAlt} className="mt-2 max-h-80 rounded-2xl object-cover" src={selectedPosterUrl} /></div> : null}<input accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-sm" id="poster" onChange={(input) => setPoster(input.target.files?.[0] ?? null)} type="file" />{poster ? <button className="mt-3 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={busy || !event} onClick={onUpload} type="button">{ru.events.uploadPoster}</button> : null}<p className="mt-2 text-xs text-zinc-500">{ru.events.posterHint}</p>{event?.posterUrl ? <button className="mt-3 block text-sm text-red-700 underline disabled:opacity-40" disabled={busy} onClick={onRemove} type="button">{ru.events.removePoster}</button> : null}</div></div>;
}

function Terms({ values, update }: { values: FormValues; update: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void }) { return <div className="grid gap-5"><TextArea label={ru.events.fields.rules} value={values.rules} onChange={(value) => update("rules", value)} /><TextArea label={ru.events.fields.visitTerms} value={values.visitTerms} onChange={(value) => update("visitTerms", value)} /><TextArea label={ru.events.fields.cancellationTerms} value={values.cancellationTerms} onChange={(value) => update("cancellationTerms", value)} /><TextArea label={ru.events.fields.extraConditions} value={values.extraConditions} onChange={(value) => update("extraConditions", value)} /><p className="text-sm text-zinc-500">{ru.events.termsHint}</p></div>; }

function Payment({ values, update, errors }: { values: FormValues; update: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void; errors: Record<string, string> }) { return <fieldset className="grid gap-4"><legend className="text-sm font-semibold">{ru.events.fields.paymentMode}</legend><label className="flex items-center gap-3"><input checked={values.paymentMode === "full_payment"} name="paymentMode" onChange={() => update("paymentMode", "full_payment")} type="radio" />{ru.events.paymentModes.full_payment}</label><label className="flex items-center gap-3"><input checked={values.paymentMode === "deposit"} name="paymentMode" onChange={() => update("paymentMode", "deposit")} type="radio" />{ru.events.paymentModes.deposit}</label>{values.paymentMode === "deposit" ? <><label className="flex items-center gap-3 font-medium"><input checked={values.showFullAmountForDeposit} onChange={(input) => update("showFullAmountForDeposit", input.target.checked)} type="checkbox" />{ru.events.fields.showFullAmountForDeposit}</label><div><TextArea id="event-depositTerms" label={ru.events.fields.depositTerms} value={values.depositTerms} onChange={(value) => update("depositTerms", value)} />{errors.depositTerms ? <p className="text-xs font-normal text-red-700">{errors.depositTerms}</p> : null}</div></> : <p className="text-sm text-zinc-500">{ru.events.fullPaymentHint}</p>}</fieldset>; }

function Resources({ event, activeEventId }: { event: OrganizerEvent | null; activeEventId: string | undefined }) { if (!activeEventId) return <p className="rounded-2xl bg-zinc-50 p-5 text-zinc-600">{ru.events.saveStepFirst}</p>; return <div className="grid gap-4"><h2 className="text-xl font-semibold">{ru.events.resourcesTitle}</h2><p className="text-zinc-600">{ru.events.resourcesDescription}</p><div className="flex flex-wrap gap-3"><Link className="rounded-xl border border-zinc-300 bg-white px-4 py-3 font-semibold" href={`/organizer/venue-builder/${activeEventId}`}>{ru.venue.open}</Link><span className="rounded-xl bg-zinc-100 px-4 py-3 text-sm">{event?.status === "published" ? ru.events.publishedResources : ru.events.resourcesHint}</span></div></div>; }

function Review({ values, event, preview, onPreview }: { values: FormValues; event: OrganizerEvent | null; preview: OrganizerEventPreview | null; onPreview: () => void }) { return <div className="grid gap-5"><h2 className="text-xl font-semibold">{ru.events.reviewTitle}</h2><dl className="grid gap-3 rounded-2xl bg-zinc-50 p-5 sm:grid-cols-2"><Summary label={ru.events.fields.title} value={values.title || "—"} /><Summary label={ru.events.fields.category} value={ru.events.categories[values.category]} /><Summary label={ru.events.fields.city} value={values.city || "—"} /><Summary label={ru.events.fields.date} value={`${values.date || "—"} ${values.time || ""}`} /><Summary label={ru.events.fields.venueName} value={values.venueName || "—"} /><Summary label={ru.events.fields.paymentMode} value={ru.events.paymentModes[values.paymentMode]} /></dl><p className="text-sm text-zinc-600">{ru.events.reviewHint}</p>{event ? <button className="w-fit rounded-xl border border-indigo-300 px-4 py-3 font-semibold text-indigo-800" onClick={onPreview} type="button">{ru.events.preview}</button> : null}{preview ? <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><p className="font-semibold">{preview.status === "draft" ? ru.events.previewDraftBanner : ru.events.previewPublishedBanner}</p><p className="mt-2 text-sm text-zinc-700">{preview.title} · {preview.city} · {preview.venueName}</p><p className="mt-2 text-sm text-zinc-600">{preview.ticketTypes.length} {ru.events.previewTickets}, {preview.tables.length} {ru.events.previewTables}</p></div> : null}</div>; }

function Summary({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-900">{value}</dd></div>; }
function TextField({ id, label, onChange, required = false, type = "text", value, error }: { id: string; label: string; onChange: (value: string) => void; required?: boolean; type?: string; value: string; error?: string | undefined }) { return <label className="grid gap-2 text-sm font-semibold" htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}<input aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="rounded-xl border border-zinc-300 px-4 py-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" id={id} onChange={(input) => onChange(input.currentTarget.value)} required={required} type={type} value={value} />{error ? <p className="text-xs font-normal text-red-700" id={`${id}-error`}>{error}</p> : null}</label>; }
function SelectField({ id, label, onChange, required = false, value, options, error }: { id: string; label: string; onChange: (value: string) => void; required?: boolean; value: string; options: Array<{ value: string; label: string }>; error?: string | undefined }) { return <label className="grid gap-2 text-sm font-semibold" htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}<select aria-invalid={Boolean(error)} className="rounded-xl border border-zinc-300 bg-white px-4 py-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" id={id} onChange={(input) => onChange(input.currentTarget.value)} required={required} value={value}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error ? <p className="text-xs font-normal text-red-700">{error}</p> : null}</label>; }
function TextArea({ id, label, onChange, value }: { id?: string; label: string; onChange: (value: string) => void; value: string }) { return <label className="grid gap-2 text-sm font-semibold" htmlFor={id}>{label}<textarea className="min-h-28 rounded-xl border border-zinc-300 px-4 py-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" id={id} onChange={(input) => onChange(input.currentTarget.value)} value={value} /></label>; }
function Status({ status }: { status: EventStatus }) { return <span className="rounded-full bg-zinc-200 px-4 py-2 text-sm font-semibold">{ru.events.statuses[status]}</span>; }
function toFormValues(event: OrganizerEvent): FormValues { return { title: event.title, category: event.category, city: event.city, date: event.date, time: event.time, timezone: event.timezone, venueName: event.venueName, address: event.address, announcement: event.announcement ?? "", description: event.description ?? "", program: event.program ?? "", rules: event.rules ?? "", visitTerms: event.visitTerms ?? "", cancellationTerms: event.cancellationTerms ?? "", paymentMode: event.paymentMode, showFullAmountForDeposit: event.showFullAmountForDeposit, depositTerms: event.depositTerms ?? "", extraConditions: event.extraConditions ?? "" }; }
function toPayload(values: FormValues): CreateEventRequest { return { ...values, title: values.title.trim(), category: values.category, city: values.city.trim(), announcement: optional(values.announcement), description: optional(values.description), program: optional(values.program), rules: optional(values.rules), visitTerms: optional(values.visitTerms), cancellationTerms: optional(values.cancellationTerms), showFullAmountForDeposit: values.paymentMode === "deposit" && values.showFullAmountForDeposit, depositTerms: values.paymentMode === "deposit" ? optional(values.depositTerms) : null, extraConditions: optional(values.extraConditions) }; }
function toStepPayload(values: FormValues, step: Step): Partial<CreateEventRequest> { if (step === 0) return { title: values.title, category: values.category, city: values.city, date: values.date, time: values.time, timezone: values.timezone, venueName: values.venueName, address: values.address }; if (step === 1) return { announcement: optional(values.announcement), description: optional(values.description), program: optional(values.program) }; if (step === 2) return { rules: optional(values.rules), visitTerms: optional(values.visitTerms), cancellationTerms: optional(values.cancellationTerms), extraConditions: optional(values.extraConditions) }; if (step === 3) return { paymentMode: values.paymentMode, showFullAmountForDeposit: values.paymentMode === "deposit" && values.showFullAmountForDeposit, depositTerms: values.paymentMode === "deposit" ? optional(values.depositTerms) : null }; return {}; }
function optional(value: string): string | null { const trimmed = value.trim(); return trimmed.length ? trimmed : null; }
async function uploadPosterFile(eventId: string, poster: File): Promise<OrganizerEvent> { const form = new FormData(); form.set("poster", poster); return apiRequest<OrganizerEvent>(`/api/organizer/events/${eventId}/poster`, { method: "POST", body: form }); }
function posterUrl(path: string): string { return new URL(path, API_URL).toString(); }
