"use client";

import {
  EVENT_AGE_RESTRICTIONS,
  EVENT_CATEGORIES,
  type CreateEventRequest,
  type EventCategory,
  type EventLocale,
  type EventStatus,
  type OrganizerEvent,
  type OrganizerEventPreview,
} from "@event-platform/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { apiRequest } from "../../../(auth)/_lib/api";
import { BackLink } from "../../../../components/back-link";
import { OptionPicker } from "../../../../components/option-picker";
import { SalesResources } from "./sales-resources";
import { EventLanguageEditor } from "./event-language-editor";
import { localeFromBrowser, localeUrl } from "../../../../lib/locale";
import { useLocale } from "../../../../components/locale-provider";
import { EVENTS_COPY } from "../../../../lib/events-copy";
import { COUNTRY_CODES, countryName } from "../../../../lib/countries";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEP_DESCRIPTIONS = {
  ru: ["Укажите название, категорию, площадку и время события.", "Добавьте описание программы и загрузите постер.", "Опишите условия посещения, правила и возврат билетов.", "Выберите способ оплаты и укажите условия депозита.", "Настройте билеты или интерактивную схему зала.", "Проверьте данные перед публикацией."],
  kk: ["Іс-шараның атауын, санатын, орнын және уақытын енгізіңіз.", "Бағдарламаны сипаттап, постер жүктеңіз.", "Қатысу, ережелер және қайтару шарттарын жазыңыз.", "Төлем тәсілі мен депозит шарттарын көрсетіңіз.", "Билеттерді немесе интерактивті зал сызбасын баптаңыз.", "Жарияламас бұрын деректерді тексеріңіз."],
  en: ["Enter the title, category, venue, and time.", "Describe the program and upload a poster.", "Set attendance rules and refund terms.", "Choose a payment method and add deposit terms.", "Set up tickets or an interactive venue map.", "Review the details before publishing."],
} as const;
const WIZARD_EXTRA: Record<EventLocale, { country: string; loading: string; saving: string; reopened: string; editing: string; creating: string; step: string; of: string; review: string; publishing: string; republish: string; allAges: string; chooseFile: string; noFile: string; fullPaymentDetail: string; depositDetail: string; event: string; newDraft: string; draftHint: string; publishHint: string; savedHint: string }> = {
  ru: { country: "Страна", loading: "Загрузка…", saving: "Сохранение…", reopened: "Событие снова опубликовано", editing: "Редактирование", creating: "Создание мероприятия", step: "Шаг", of: "из", review: "Перейти к проверке", publishing: "Публикуем…", republish: "Опубликовать снова", allAges: "Для всех возрастов (0+)", chooseFile: "Выбрать файл", noFile: "Файл не выбран", fullPaymentDetail: "Гость оплачивает стоимость билета или столика сразу.", depositDetail: "Гость вносит часть суммы при бронировании.", event: "Мероприятие", newDraft: "Новый черновик", draftHint: "Черновик появится после сохранения первого шага.", publishHint: "Публикацию подтверждает сервер после проверки обязательных данных и настроек продаж.", savedHint: "Предпросмотр и продажи используют только сохранённые данные мероприятия." },
  kk: { country: "Ел", loading: "Жүктелуде…", saving: "Сақталуда…", reopened: "Іс-шара қайта жарияланды", editing: "Өңдеу", creating: "Іс-шара жасау", step: "Қадам", of: "/", review: "Тексеруге өту", publishing: "Жариялануда…", republish: "Қайта жариялау", allAges: "Барлық жасқа (0+)", chooseFile: "Файл таңдау", noFile: "Файл таңдалмаған", fullPaymentDetail: "Қонақ билет немесе үстел құнын бірден толық төлейді.", depositDetail: "Қонақ брондау кезінде соманың бір бөлігін төлейді.", event: "Іс-шара", newDraft: "Жаңа нобай", draftHint: "Нобай бірінші қадам сақталған соң пайда болады.", publishHint: "Міндетті деректер мен сатылым баптаулары тексерілген соң сервер жариялауды растайды.", savedHint: "Алдын ала қарау мен сатылым тек сақталған деректерді пайдаланады." },
  en: { country: "Country", loading: "Loading…", saving: "Saving…", reopened: "Event published again", editing: "Editing", creating: "Creating event", step: "Step", of: "of", review: "Continue to review", publishing: "Publishing…", republish: "Publish again", allAges: "All ages (0+)", chooseFile: "Choose file", noFile: "No file selected", fullPaymentDetail: "Guests pay the full ticket or table price at checkout.", depositDetail: "Guests pay part of the amount when booking.", event: "Event", newDraft: "New draft", draftHint: "The draft will appear after you save the first step.", publishHint: "The server confirms publication after checking required details and sales settings.", savedHint: "Preview and sales use only saved event details." },
};

interface FormValues extends CreateEventRequest {
  countryCode: string;
  timezone: string;
  ageRestriction: NonNullable<CreateEventRequest["ageRestriction"]>;
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
  title: "", category: "other", countryCode: "KZ", city: "Алматы", date: "", time: "", timezone: "Asia/Almaty", ageRestriction: 0,
  venueName: "", address: "", announcement: "", description: "", program: "", rules: "",
  visitTerms: "", cancellationTerms: "", paymentMode: "full_payment", showFullAmountForDeposit: false,
  depositTerms: "", extraConditions: "",
};

export function EventForm({ eventId }: { eventId?: string | undefined }) {
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><ProtectedRoute><EventEditor eventId={eventId} /></ProtectedRoute></main>;
}

function EventEditor({ eventId }: { eventId?: string | undefined }) {
  const locale = useLocale();
  const events = EVENTS_COPY[locale];
  const extra = WIZARD_EXTRA[locale];
  const steps = events.wizardStepLabels;
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
  const revision = useRef(0);
  const lifecycleInFlight = useRef(false);
  const activeEventId = event?.id ?? eventId;
  const draftKey = `ticket-event-source-draft:${eventId ?? "new"}`;

  useEffect(() => {
    if (!eventId) {
      const draft = readLocalDraft(draftKey);
      if (draft) { setValues(draft); setDirty(true); }
      setLoading(false);
      return;
    }
    apiRequest<OrganizerEvent>(`/api/organizer/events/${eventId}`)
      .then((loaded) => { setEvent(loaded); const draft = readLocalDraft(draftKey); setValues(draft ?? toFormValues(loaded)); setDirty(Boolean(draft)); hydrated.current = true; const requested = Number(new URLSearchParams(window.location.search).get("step")); if (Number.isInteger(requested) && requested >= 1 && requested <= 6) setStep((requested - 1) as Step); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : events.loadFailed))
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
    revision.current += 1;
    setValues((current) => {
      const next = { ...current, [key]: value };
      sessionStorage.setItem(draftKey, JSON.stringify(next));
      return next;
    });
    setDirty(true);
    setMessage(null);
  }

  function validateStep(target: Step): boolean {
    const errors: Record<string, string> = {};
    if (target === 0) {
      const required: Array<[keyof FormValues, string]> = [
        ["title", events.fields.title], ["city", events.fields.city], ["date", events.fields.date],
        ["time", events.fields.time], ["timezone", events.fields.timezone],
        ["venueName", events.fields.venueName], ["address", events.fields.address],
      ];
      for (const [field, label] of required) {
        const value = values[field];
        if (typeof value === "string" && !value.trim()) errors[field] = `${label}: ${events.errors.fieldRequired}`;
      }
      if (!values.category) errors.category = events.errors.categoryRequired;
    }
    if (target === 3 && values.paymentMode === "deposit" && !values.depositTerms.trim()) errors.depositTerms = `${events.fields.depositTerms}: ${events.errors.fieldRequired}`;
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(`event-${first}`)?.focus();
    return Object.keys(errors).length === 0;
  }

  async function saveCurrentStep(silent = false): Promise<boolean> {
    if (!validateStep(step)) return false;
    // Resources and review save through their own actions; never claim an empty PATCH was saved.
    if (step >= 4) return true;
    setBusy(!silent); setAutoSaving(silent); setError(null); if (!silent) setMessage(null);
    const savingRevision = revision.current;
    try {
      const payload = activeEventId ? toStepPayload(values, step) : { ...toPayload(values), sourceLocale: localeFromBrowser() };
      const saved = activeEventId
        ? await apiRequest<OrganizerEvent>(`/api/organizer/events/${activeEventId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiRequest<OrganizerEvent>("/api/organizer/events", { method: "POST", body: JSON.stringify(payload) });
      setEvent(saved);
      if (revision.current === savingRevision) { setDirty(false); sessionStorage.removeItem(draftKey); }
      else if (!activeEventId) {
        const newerDraft = sessionStorage.getItem(draftKey);
        if (newerDraft) sessionStorage.setItem(`ticket-event-source-draft:${saved.id}`, newerDraft);
        sessionStorage.removeItem(draftKey);
      }
      if (!activeEventId) router.replace(localeUrl(`/organizer/events/${saved.id}/edit?step=2`, localeFromBrowser()));
      if (!silent) setMessage(events.saved);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : events.saveFailed);
      return false;
    } finally { setBusy(false); setAutoSaving(false); }
  }

  async function saveAndContinue(): Promise<void> {
    const saved = await saveCurrentStep();
    if (saved) {
      const next = Math.min(5, step + 1) as Step;
      setStep(next);
      if (activeEventId) {
        const url = new URL(window.location.href);
        url.searchParams.set("step", String(next + 1));
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }

  async function lifecycle(action: "publish" | "cancel" | "complete" | "reopen"): Promise<void> {
    if (!event || busy || lifecycleInFlight.current || (action === "publish" && !validateAll())) return;
    lifecycleInFlight.current = true;
    let navigatingAfterPublish = false;
    setBusy(true); setError(null); setMessage(null);
    try {
      const updated = await apiRequest<OrganizerEvent>(`/api/organizer/events/${event.id}/${action}`, { method: "POST" });
      if (action === "publish") {
        navigatingAfterPublish = true;
        router.replace("/organizer/events?published=1");
        return;
      }
      setEvent(updated); setValues(toFormValues(updated)); setMessage(action === "reopen" ? extra.reopened : events.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : events.actionFailed); }
    finally {
      // Keep the wizard inert until its route is replaced. This prevents a second
      // click from exposing a lifecycle action while navigation is still pending.
      if (!navigatingAfterPublish) { lifecycleInFlight.current = false; setBusy(false); }
    }
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
    try { setEvent(await uploadPosterFile(event.id, poster)); setPoster(null); setMessage(events.posterUploaded); }
    catch (reason) { setError(reason instanceof Error ? reason.message : events.posterUploadFailed); }
    finally { setBusy(false); }
  }

  async function removePoster(): Promise<void> {
    if (!event) return;
    setBusy(true); setError(null);
    try { setEvent(await apiRequest<OrganizerEvent>(`/api/organizer/events/${event.id}/poster`, { method: "DELETE" })); setMessage(events.posterRemoved); }
    catch (reason) { setError(reason instanceof Error ? reason.message : events.actionFailed); }
    finally { setBusy(false); }
  }

  async function loadPreview(): Promise<void> {
    if (!activeEventId) { setError(events.previewNeedsSave); return; }
    setBusy(true); setError(null);
    try { setPreview(await apiRequest<OrganizerEventPreview>(`/api/organizer/events/${activeEventId}/preview`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : events.previewFailed); }
    finally { setBusy(false); }
  }

  async function deleteDraft(): Promise<void> {
    if (!event || !window.confirm(events.deleteConfirm)) return;
    setBusy(true); setError(null);
    try { await apiRequest(`/api/organizer/events/${event.id}`, { method: "DELETE" }); router.replace("/organizer/events"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : events.actionFailed); setBusy(false); }
  }

  async function goToStep(target: Step): Promise<void> {
    if (!event && target > 0) {
      setStep(0);
      setError(events.saveStepFirst);
      return;
    }
    if (event && dirty && target > step && step < 4) {
      const saved = await saveCurrentStep();
      if (!saved) return;
    }
    setError(null);
    setStep(target);
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(target + 1));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  if (loading) return <p className="text-zinc-600">{extra.loading}</p>;
  return <section>
    <BackLink href="/organizer/events" />
    <div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">{events.eyebrow} / {eventId ? extra.editing : extra.creating}</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">{eventId ? events.formEditTitle : events.formCreateTitle}</h1>{event ? <Status status={event.status} /> : null}</div><p className="mt-3 text-zinc-600">{events.formDescription}</p></div>{event ? <span className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">ID: {event.id.slice(0, 8)}</span> : null}</div>
    <nav aria-label={events.wizardSteps} className="mt-8 overflow-x-auto rounded-2xl border border-violet-100 bg-violet-50/70 p-2"><ol className="flex min-w-max gap-1">{steps.map((title, index) => <li key={title}><button aria-current={step === index ? "step" : undefined} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${step === index ? "bg-violet-700 text-white shadow-sm" : index < step ? "text-emerald-800 hover:bg-white" : "text-zinc-600 hover:bg-white"}`} onClick={() => void goToStep(index as Step)} type="button"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${step === index ? "bg-white/20" : index < step ? "bg-emerald-100" : "bg-white"}`}>{index < step ? "✓" : index + 1}</span>{title}</button></li>)}</ol></nav>
    <div className="mt-7 border-b border-zinc-200 pb-5"><p className="text-xs font-bold uppercase tracking-widest text-violet-700">{extra.step} {step + 1} {extra.of} 6</p><h2 className="mt-2 text-2xl font-bold text-zinc-900 sm:text-3xl">{step + 1}. {steps[step]}</h2><p className="mt-2 text-sm text-zinc-600">{STEP_DESCRIPTIONS[locale][step]}</p></div>
    <div className="mt-6 grid gap-6">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="min-w-0 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      {step < 4 ? <form id="event-details-form" onSubmit={(formEvent) => { formEvent.preventDefault(); void saveAndContinue(); }}>
      {step === 0 ? <Basics values={values} errors={fieldErrors} update={update} /> : null}
      {step === 1 ? <Description values={values} update={update} poster={poster} setPoster={setPoster} event={event} busy={busy} onUpload={() => void uploadPoster()} onRemove={() => void removePoster()} /> : null}
      {step === 2 ? <Terms values={values} update={update} /> : null}
      {step === 3 ? <Payment values={values} update={update} errors={fieldErrors} /> : null}
      </form> : null}
      {step === 4 ? <SalesResources event={event} /> : null}
      {step === 5 ? <Review values={values} event={event} preview={preview} onPreview={() => void loadPreview()} /> : null}
      </div><StepSidebar step={step} event={event} values={values} /></div>
      <EventLanguageEditor event={event} step={step} sourceDirty={dirty} onSaveSource={() => saveCurrentStep()} />
      {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{message}</p> : null}
      {autoSaving ? <p className="text-sm text-zinc-500" role="status">{events.autoSaving}</p> : null}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><button className="rounded-xl bg-violet-50 px-5 py-3 font-semibold text-violet-900 disabled:opacity-40" disabled={busy || step === 0} onClick={() => void goToStep(Math.max(0, step - 1) as Step)} type="button">{events.previousStep}</button>{step < 5 ? <button className="ml-auto rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white disabled:opacity-40" disabled={busy} form={step < 4 ? "event-details-form" : undefined} onClick={step === 4 ? () => void saveAndContinue() : undefined} type={step < 4 ? "submit" : "button"}>{busy ? extra.saving : step === 4 ? extra.review : events.saveContinue}</button> : null}{step === 5 && event ? <button className="ml-auto rounded-xl border border-violet-300 px-5 py-3 font-semibold text-violet-800 disabled:opacity-40" disabled={busy} onClick={() => void loadPreview()} type="button">{events.preview}</button> : null}{step === 5 && event?.status === "draft" ? <button className="rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-40" disabled={busy} onClick={() => void lifecycle("publish")} type="button">{busy ? extra.publishing : events.publish}</button> : null}{event?.status === "draft" ? <button className="text-sm text-red-700 underline disabled:opacity-40" disabled={busy} onClick={() => void deleteDraft()} type="button">{events.deleteDraft}</button> : null}</div>
      {step === 5 && event?.status === "completed" ? <div className="flex justify-end rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><button className="rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-40" disabled={busy} onClick={() => void lifecycle("reopen")} type="button">{busy ? extra.publishing : extra.republish}</button></div> : null}
    </div>
  </section>;
}

function Basics({ values, update, errors }: { values: FormValues; update: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void; errors: Record<string, string> }) { const locale = useLocale(); const events = EVENTS_COPY[locale]; const extra = WIZARD_EXTRA[locale]; return <div className="grid gap-5"><TextField id="event-title" label={events.fields.title} required value={values.title} error={errors.title} onChange={(value) => update("title", value)} /><div className="grid gap-5 sm:grid-cols-3"><SelectField id="event-category" label={events.fields.category} required value={values.category} error={errors.category} options={EVENT_CATEGORIES.map((category) => ({ value: category, label: events.categories[category] }))} onChange={(value) => update("category", value as EventCategory)} /><SelectField id="event-country" label={extra.country} required value={values.countryCode ?? "KZ"} options={[...COUNTRY_CODES].sort((a, b) => countryName(a, locale).localeCompare(countryName(b, locale), locale)).map((code) => ({ value: code, label: countryName(code, locale) }))} onChange={(value) => update("countryCode", value)} /><TextField id="event-city" label={events.fields.city} required value={values.city} error={errors.city} onChange={(value) => update("city", value)} /></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><TextField id="event-date" label={events.fields.date} required type="date" value={values.date} error={errors.date} onChange={(value) => update("date", value)} /><TextField id="event-time" label={events.fields.time} required type="time" value={values.time} error={errors.time} onChange={(value) => update("time", value)} /><TextField id="event-timezone" label={events.fields.timezone} required value={values.timezone} error={errors.timezone} onChange={(value) => update("timezone", value)} /><SelectField id="event-ageRestriction" label={events.fields.ageRestriction} required value={String(values.ageRestriction)} options={EVENT_AGE_RESTRICTIONS.map((age) => ({ value: String(age), label: age === 0 ? extra.allAges : `${age}+` }))} onChange={(value) => update("ageRestriction", Number(value) as FormValues["ageRestriction"])} /></div><div className="grid gap-5 sm:grid-cols-2"><TextField id="event-venueName" label={events.fields.venueName} required value={values.venueName} error={errors.venueName} onChange={(value) => update("venueName", value)} /><TextField id="event-address" label={events.fields.address} required value={values.address} error={errors.address} onChange={(value) => update("address", value)} /></div></div>; }

function Description({ values, update, poster, setPoster, event, busy, onUpload, onRemove }: { values: FormValues; update: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void; poster: File | null; setPoster: (file: File | null) => void; event: OrganizerEvent | null; busy: boolean; onUpload: () => void; onRemove: () => void }) {
  const locale = useLocale();
  const events = EVENTS_COPY[locale];
  const extra = WIZARD_EXTRA[locale];
  const [selectedPosterUrl, setSelectedPosterUrl] = useState<string | null>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!poster) { setSelectedPosterUrl(null); return; }
    const objectUrl = URL.createObjectURL(poster);
    setSelectedPosterUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [poster]);
  return <div className="grid gap-5">
    <TextArea label={events.fields.announcement} value={values.announcement} onChange={(value) => update("announcement", value)} />
    <TextArea label={events.fields.description} value={values.description} onChange={(value) => update("description", value)} />
    <TextArea label={events.fields.program} value={values.program} onChange={(value) => update("program", value)} />
    <div>
      <p className="text-sm font-semibold">{events.fields.poster}</p>
      {event?.posterUrl ? <img alt={events.missingPosterAlt} className="mt-3 max-h-80 rounded-2xl object-cover" src={posterUrl(event.posterUrl)} /> : null}
      {selectedPosterUrl ? <div className="mt-3"><p className="text-xs font-semibold text-zinc-600">{events.posterSelectedPreview}</p><img alt={events.missingPosterAlt} className="mt-2 max-h-80 rounded-2xl object-cover" src={selectedPosterUrl} /></div> : null}
      <input accept="image/jpeg,image/png,image/webp" className="sr-only" id="poster" onChange={(input) => { setPoster(input.target.files?.[0] ?? null); input.currentTarget.value = ""; }} ref={posterInputRef} tabIndex={-1} type="file" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-40" disabled={busy} onClick={() => posterInputRef.current?.click()} type="button">{extra.chooseFile}</button>
        <span aria-live="polite" className="min-w-0 truncate text-sm text-zinc-600">{poster?.name ?? extra.noFile}</span>
      </div>
      {poster ? <button className="mt-3 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={busy || !event} onClick={onUpload} type="button">{events.uploadPoster}</button> : null}
      <p className="mt-2 text-xs text-zinc-500">{events.posterHint}</p>
      {event?.posterUrl ? <button className="mt-3 block text-sm text-red-700 underline disabled:opacity-40" disabled={busy} onClick={onRemove} type="button">{events.removePoster}</button> : null}
    </div>
  </div>;
}

function Terms({ values, update }: { values: FormValues; update: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void }) { const events = EVENTS_COPY[useLocale()]; return <div className="grid gap-5"><TextArea label={events.fields.rules} value={values.rules} onChange={(value) => update("rules", value)} /><TextArea label={events.fields.visitTerms} value={values.visitTerms} onChange={(value) => update("visitTerms", value)} /><TextArea label={events.fields.cancellationTerms} value={values.cancellationTerms} onChange={(value) => update("cancellationTerms", value)} /><TextArea label={events.fields.extraConditions} value={values.extraConditions} onChange={(value) => update("extraConditions", value)} /><p className="text-sm text-zinc-500">{events.termsHint}</p></div>; }

function Payment({ values, update, errors }: { values: FormValues; update: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void; errors: Record<string, string> }) {
  const locale = useLocale();
  const events = EVENTS_COPY[locale];
  const extra = WIZARD_EXTRA[locale];
  return <fieldset className="grid gap-5"><legend className="mb-3 text-sm font-semibold">{events.fields.paymentMode}</legend><div className="grid gap-3 sm:grid-cols-2"><label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-5 transition ${values.paymentMode === "full_payment" ? "border-violet-500 bg-violet-50 shadow-sm ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-violet-200"}`}><input checked={values.paymentMode === "full_payment"} className="mt-1 accent-violet-600" name="paymentMode" onChange={() => update("paymentMode", "full_payment")} type="radio" /><span><strong className="block text-base text-slate-900">{events.paymentModes.full_payment}</strong><span className="mt-1 block text-sm font-normal leading-5 text-slate-500">{extra.fullPaymentDetail}</span></span></label><label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-5 transition ${values.paymentMode === "deposit" ? "border-violet-500 bg-violet-50 shadow-sm ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-violet-200"}`}><input checked={values.paymentMode === "deposit"} className="mt-1 accent-violet-600" name="paymentMode" onChange={() => update("paymentMode", "deposit")} type="radio" /><span><strong className="block text-base text-slate-900">{events.paymentModes.deposit}</strong><span className="mt-1 block text-sm font-normal leading-5 text-slate-500">{extra.depositDetail}</span></span></label></div>{values.paymentMode === "deposit" ? <div className="grid gap-4 rounded-2xl border border-violet-100 bg-[#faf8ff] p-5"><label className="flex items-start gap-3 text-sm font-medium"><input checked={values.showFullAmountForDeposit} className="mt-1 accent-violet-600" onChange={(input) => update("showFullAmountForDeposit", input.target.checked)} type="checkbox" />{events.fields.showFullAmountForDeposit}</label><div><TextArea id="event-depositTerms" label={events.fields.depositTerms} value={values.depositTerms} onChange={(value) => update("depositTerms", value)} />{errors.depositTerms ? <p className="text-xs font-normal text-red-700">{errors.depositTerms}</p> : null}</div></div> : <p className="text-sm text-zinc-500">{events.fullPaymentHint}</p>}</fieldset>;
}

function Review({ values, event, preview, onPreview }: { values: FormValues; event: OrganizerEvent | null; preview: OrganizerEventPreview | null; onPreview: () => void }) { const events = EVENTS_COPY[useLocale()]; return <div className="grid gap-5"><h2 className="text-xl font-semibold">{events.reviewTitle}</h2><dl className="grid gap-3 rounded-2xl bg-zinc-50 p-5 sm:grid-cols-2"><Summary label={events.fields.title} value={values.title || "—"} /><Summary label={events.fields.category} value={events.categories[values.category]} /><Summary label={events.fields.city} value={values.city || "—"} /><Summary label={events.fields.date} value={`${values.date || "—"} ${values.time || ""}`} /><Summary label={events.fields.venueName} value={values.venueName || "—"} /><Summary label={events.fields.paymentMode} value={events.paymentModes[values.paymentMode]} /></dl><p className="text-sm text-zinc-600">{events.reviewHint}</p>{event ? <button className="w-fit rounded-xl border border-indigo-300 px-4 py-3 font-semibold text-indigo-800" onClick={onPreview} type="button">{events.preview}</button> : null}{preview ? <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><p className="font-semibold">{preview.status === "draft" ? events.previewDraftBanner : events.previewPublishedBanner}</p><p className="mt-2 text-sm text-zinc-700">{preview.title} · {preview.city} · {preview.venueName}</p><p className="mt-2 text-sm text-zinc-600">{preview.ticketTypes.length} {events.previewTickets}, {preview.tables.length} {events.previewTables}</p></div> : null}</div>; }

function StepSidebar({ step, event, values }: { step: Step; event: OrganizerEvent | null; values: FormValues }) {
  const locale = useLocale();
  const events = EVENTS_COPY[locale];
  const extra = WIZARD_EXTRA[locale];
  return <aside className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
    <p className="text-xs font-bold uppercase tracking-widest text-violet-700">{extra.event}</p>
    <h3 className="mt-3 break-words text-lg font-bold text-zinc-900">{values.title.trim() || extra.newDraft}</h3>
    {event ? <p className="mt-2 text-xs text-zinc-600">{events.statuses[event.status]} · {event.id.slice(0, 8)}</p> : <p className="mt-2 text-xs text-zinc-600">{extra.draftHint}</p>}
    <dl className="mt-5 grid gap-4 border-t border-zinc-200 pt-5 text-sm"><Summary label={events.fields.city} value={values.city || "—"} /><Summary label={events.fields.venueName} value={values.venueName || "—"} /><Summary label={events.fields.date} value={`${values.date || "—"} ${values.time || ""}`} /><Summary label={events.fields.timezone} value={values.timezone || "—"} /><Summary label={events.fields.ageRestriction} value={`${values.ageRestriction}+`} /></dl>
    {step === 1 && event?.posterUrl ? <img alt={events.missingPosterAlt} className="mt-5 aspect-video w-full rounded-xl object-cover" src={posterUrl(event.posterUrl)} /> : null}
    <p className="mt-5 rounded-xl bg-violet-50 p-4 text-xs leading-relaxed text-violet-900">{step === 5 ? extra.publishHint : extra.savedHint}</p>
  </aside>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-900">{value}</dd></div>; }
function TextField({ id, label, onChange, required = false, type = "text", value, error }: { id: string; label: string; onChange: (value: string) => void; required?: boolean; type?: string; value: string; error?: string | undefined }) { return <label className="grid gap-2 text-sm font-semibold" htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}<input aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="rounded-xl border border-zinc-300 px-4 py-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" id={id} onChange={(input) => onChange(input.currentTarget.value)} required={required} type={type} value={value} />{error ? <p className="text-xs font-normal text-red-700" id={`${id}-error`}>{error}</p> : null}</label>; }
function SelectField({ id, label, onChange, required = false, value, options, error }: { id: string; label: string; onChange: (value: string) => void; required?: boolean; value: string; options: Array<{ value: string; label: string }>; error?: string | undefined }) {
  return <div className="grid gap-2 text-sm font-semibold"><span id={`${id}-label`}>{label}{required ? <span aria-hidden="true"> *</span> : null}</span><OptionPicker id={id} label={label} value={value} options={options} onChange={onChange} />{error ? <p className="text-xs font-normal text-red-700" role="alert">{error}</p> : null}</div>;
}

function TextArea({ id, label, onChange, value }: { id?: string; label: string; onChange: (value: string) => void; value: string }) { return <label className="grid gap-2 text-sm font-semibold" htmlFor={id}>{label}<textarea className="min-h-28 rounded-xl border border-zinc-300 px-4 py-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" id={id} onChange={(input) => onChange(input.currentTarget.value)} value={value} /></label>; }
function Status({ status }: { status: EventStatus }) { const events = EVENTS_COPY[useLocale()]; return <span className="rounded-full bg-zinc-200 px-4 py-2 text-sm font-semibold">{events.statuses[status]}</span>; }
function toFormValues(event: OrganizerEvent): FormValues { return { title: event.title, category: event.category, countryCode: event.countryCode, city: event.city, date: event.date, time: event.time, timezone: event.timezone, ageRestriction: event.ageRestriction, venueName: event.venueName, address: event.address, announcement: event.announcement ?? "", description: event.description ?? "", program: event.program ?? "", rules: event.rules ?? "", visitTerms: event.visitTerms ?? "", cancellationTerms: event.cancellationTerms ?? "", paymentMode: event.paymentMode, showFullAmountForDeposit: event.showFullAmountForDeposit, depositTerms: event.depositTerms ?? "", extraConditions: event.extraConditions ?? "" }; }
function readLocalDraft(key: string): FormValues | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object" || !Object.entries(EMPTY_FORM).every(([field, sample]) => field === "countryCode" || typeof value[field] === typeof sample)) return null;
    return { ...EMPTY_FORM, ...value, countryCode: typeof value.countryCode === "string" ? value.countryCode : "KZ" } as FormValues;
  } catch { return null; }
}
function toPayload(values: FormValues): CreateEventRequest { return { ...values, title: values.title.trim(), category: values.category, city: values.city.trim(), announcement: optional(values.announcement), description: optional(values.description), program: optional(values.program), rules: optional(values.rules), visitTerms: optional(values.visitTerms), cancellationTerms: optional(values.cancellationTerms), showFullAmountForDeposit: values.paymentMode === "deposit" && values.showFullAmountForDeposit, depositTerms: values.paymentMode === "deposit" ? optional(values.depositTerms) : null, extraConditions: optional(values.extraConditions) }; }
function toStepPayload(values: FormValues, step: Step): Partial<CreateEventRequest> { if (step === 0) return { title: values.title, category: values.category, countryCode: values.countryCode, city: values.city, date: values.date, time: values.time, timezone: values.timezone, ageRestriction: values.ageRestriction, venueName: values.venueName, address: values.address }; if (step === 1) return { announcement: optional(values.announcement), description: optional(values.description), program: optional(values.program) }; if (step === 2) return { rules: optional(values.rules), visitTerms: optional(values.visitTerms), cancellationTerms: optional(values.cancellationTerms), extraConditions: optional(values.extraConditions) }; if (step === 3) return { paymentMode: values.paymentMode, showFullAmountForDeposit: values.paymentMode === "deposit" && values.showFullAmountForDeposit, depositTerms: values.paymentMode === "deposit" ? optional(values.depositTerms) : null }; return {}; }
function optional(value: string): string | null { const trimmed = value.trim(); return trimmed.length ? trimmed : null; }
async function uploadPosterFile(eventId: string, poster: File): Promise<OrganizerEvent> { const form = new FormData(); form.set("poster", poster); return apiRequest<OrganizerEvent>(`/api/organizer/events/${eventId}/poster`, { method: "POST", body: form }); }
function posterUrl(path: string): string { return new URL(path, API_URL).toString(); }
