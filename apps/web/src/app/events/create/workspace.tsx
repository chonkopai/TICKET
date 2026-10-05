"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { AuthUser, CreationDraftResponse, CurrencyCapability, DraftMediaResponse, EventLocale, PublishValidationContext } from "@event-platform/shared-types";
import { DraftAutosave, DraftRequestError, creationDraftRequest, openCreationDraft, finishPublishedDraft, resetDraftBootstrap, resetCreationDraft } from "../../../lib/creation-draft-client";
import { preparePublication, publishIntent, creationContinuation, publicationEditor } from "../../../lib/creation-publication-client";
import { CREATION_SECTIONS, creationReadiness, type CreationSection } from "../../../lib/creation-readiness";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession, updateSessionUser } from "../../(auth)/_lib/session";
import { useLocale } from "../../../components/locale-provider";
import { MediaGrid } from "../../../components/event-creation/media-grid";
import { TicketModes } from "../../../components/event-creation/ticket-modes";
import { isLocale } from "../../../lib/locale";
import { RecoveryNotice } from "../../../components/event-creation/recovery-notice";
import { LocaleActions } from "../../../components/event-creation/locale-actions";
import { DetailsFields } from "../../../components/event-creation/details-fields";
import { SharedDetails } from "../../../components/event-creation/shared-details";
import { DraftPreview } from "../../../components/event-creation/draft-preview";
import { CreationCard, CreationIcon } from "../../../components/event-creation/creation-ui";
import "../../../components/event-creation/creation.css";
const words={ru:{title:"Создание события",edit:"Редактирование события",tickets:"Билеты",details:"Детали",saved:"Сохранено",saving:"Сохраняем…",save:"Сохранить черновик",apply:"Сохранить изменения",next:"Далее",back:"Назад",preview:"Предпросмотр",publish:"Опубликовать",publishing:"Публикуем…",reload:"Загрузить сохранённую версию",new:"Новый черновик",failed:"Не удалось сохранить изменения. Попробуйте снова.",conflict:"Сохранённая версия изменилась. Загрузите её и проверьте свою резервную копию.",invalid:"Заполните обязательные поля в исходном языке, время, билеты и готовые медиа.",approval:"По текущим правилам требуется одобрение организатора. Черновик сохранён.",stale:"Черновик изменился. Проверьте его и нажмите «Опубликовать» снова.",success:"Событие опубликовано",public:"Открыть страницу события",locks:"Цена, количество, режим и структура опубликованных билетов защищены. Локализованный текст можно редактировать."},en:{title:"Create an event",edit:"Edit event",tickets:"Tickets",details:"Details",saved:"Saved",saving:"Saving…",save:"Save draft",apply:"Save changes",next:"Next",back:"Back",preview:"Preview",publish:"Publish",publishing:"Publishing…",reload:"Load saved version",new:"New draft",failed:"Changes could not be saved. Please retry.",conflict:"The saved version changed. Load it and review your recovery backup.",invalid:"Complete the required source-language fields, schedule, tickets and ready media.",approval:"The current policy requires organizer approval. Your draft is saved.",stale:"The draft changed. Review it and click Publish again.",success:"Event published",public:"View public event",locks:"Published prices, capacity, mode and ticket structure are protected. Localized text remains editable."},kk:{title:"Іс-шара құру",edit:"Іс-шараны өңдеу",tickets:"Билеттер",details:"Мәліметтер",saved:"Сақталды",saving:"Сақталып жатыр…",save:"Жобаны сақтау",apply:"Өзгерістерді сақтау",next:"Келесі",back:"Артқа",preview:"Алдын ала қарау",publish:"Жариялау",publishing:"Жарияланып жатыр…",reload:"Сақталған нұсқаны жүктеу",new:"Жаңа жоба",failed:"Өзгерістер сақталмады. Қайталаңыз.",conflict:"Сақталған нұсқа өзгерген. Оны жүктеп, қалпына келтіру көшірмесін тексеріңіз.",invalid:"Бастапқы тілдегі міндетті өрістерді, уақытты, билеттер мен дайын медианы толтырыңыз.",approval:"Қазіргі ереже бойынша ұйымдастырушыға мақұлдау қажет. Жоба сақталған.",stale:"Жоба өзгерген. Тексеріп, қайта жариялаңыз.",success:"Іс-шара жарияланды",public:"Іс-шара парақшасын ашу",locks:"Жарияланған баға, орын саны, режим және билет құрылымы қорғалған. Тілдегі мәтінді өңдеуге болады."}};

const layoutWords = {
  ru: { draft: "Черновик", intro: "Расскажите о событии, добавьте медиа и настройте билеты.", media: "Медиа события", information: "Основная информация", schedule: "Дата и место", tickets: "Билеты", checklist: "Перед публикацией", ready: "Всё готово к публикации", remaining: "Заполните разделы", privacy: "До публикации событие видно только вам. Все изменения сохраняются автоматически.", required: "* Обязательно для публикации", autosave: "Изменения сохраняются автоматически", saveFailed: "Не сохранено", language: "Язык контента", check: "Проверить обязательные поля" },
  en: { draft: "Draft", intro: "Tell your guests about the event, add media, and set up tickets.", media: "Event media", information: "Basic information", schedule: "Date and place", tickets: "Tickets", checklist: "Before you publish", ready: "Ready to publish", remaining: "Complete the sections", privacy: "Only you can see this event until you publish. Your changes are saved automatically.", required: "* Required to publish", autosave: "Changes are saved automatically", saveFailed: "Not saved", language: "Content language", check: "Review required fields" },
  kk: { draft: "Жоба", intro: "Іс-шара туралы айтып, медиа қосыңыз және билеттерді баптаңыз.", media: "Іс-шара медиасы", information: "Негізгі ақпарат", schedule: "Күні мен орны", tickets: "Билеттер", checklist: "Жариялау алдында", ready: "Жариялауға дайын", remaining: "Бөлімдерді толтырыңыз", privacy: "Жариялағанға дейін іс-шара тек сізге көрінеді. Өзгерістер автоматты түрде сақталады.", required: "* Жариялау үшін міндетті", autosave: "Өзгерістер автоматты түрде сақталады", saveFailed: "Сақталмады", language: "Контент тілі", check: "Міндетті өрістерді тексеру" },
};
const resetCopy={ru:"Сбросить",en:"Reset",kk:"Тазарту"};
type Capabilities = { currencies: CurrencyCapability[]; mediaLimits?: PublishValidationContext["limits"] };
const button = "creation-button";
export function DraftWorkspace({ eventId }: { eventId?: string }) {
  const locale = useLocale(), params = useSearchParams(), router = useRouter(), id = params.get("draftId") ?? undefined;
  const [client, setClient] = useState<DraftAutosave | null>(null), [contentLocale, setContentLocale] = useState<EventLocale>(isLocale(params.get("contentLocale")) ? params.get("contentLocale") as EventLocale : locale);
  const [error, setError] = useState<Error | null>(null), [working, setWorking] = useState(false), [publishing, setPublishing] = useState(false), [preview, setPreview] = useState(false), [, tick] = useState(0);
  const [assets, setAssets] = useState<DraftMediaResponse[]>([]), [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const errorRegion = useRef<HTMLDivElement>(null), c = words[locale], l = layoutWords[locale];
  useEffect(() => {
    let live = true;
    const opening = eventId ? creationDraftRequest<CreationDraftResponse>(`/api/creation-drafts/owned/${eventId}`, { method: "POST" }).then(value => new DraftAutosave(value)) : openCreationDraft(locale, id);
    void opening.then(value => { if (live) setClient(value); }).catch(reason => { if (live) setError(reason); });
    return () => { live = false; };
  }, [id, locale, eventId]);
  useEffect(() => client?.subscribe(() => tick(value => value + 1)), [client]);
  useEffect(() => { let live = true; void creationDraftRequest<Capabilities>("/api/creation-drafts/capabilities").then(value => { if (live) setCapabilities(value); }).catch(reason => { if (live) setError(reason); }); return () => { live = false; }; }, []);
  useEffect(() => {
    const result = client?.saved.resultEventId;
    if (!eventId && result) { finishPublishedDraft(client!.saved.id); void apiRequest<AuthUser>("/me").then(user => { updateSessionUser(user); router.replace(publicationEditor({ eventId: result }, locale, contentLocale)); }).catch(reason => setError(reason)); }
  }, [client, client?.saved.resultEventId, eventId, router, locale, contentLocale]);
  const fail = (reason: unknown) => { setError(reason instanceof Error ? reason : new Error("REQUEST_FAILED")); setTimeout(() => errorRegion.current?.focus(), 0); };
  const message = (reason: Error) => reason.message === "ORGANIZER_APPROVAL_REQUIRED" ? c.approval : ["PUBLISH_INTENT_STALE", "PUBLISH_INTENT_EXPIRED"].includes(reason.message) ? c.stale : reason instanceof DraftRequestError && reason.status === 409 ? c.conflict : reason.message === "DRAFT_VALIDATION_FAILED" ? c.invalid : c.failed;
  if (!client) return <main className="creation-workspace"><div className="creation-heading"><h1>{eventId ? c.edit : c.title}</h1></div>{error ? <div className="creation-error-panel"><p role="alert">{message(error)}</p>{!eventId ? <button className={button} onClick={() => { window.localStorage.removeItem("ticket.creation.v2.id"); resetDraftBootstrap(); window.location.href = `/events/create?lang=${locale}`; }}>{c.new}</button> : null}</div> : <p role="status" className="creation-subtitle">{c.saving}</p>}</main>;
  async function action(run: () => Promise<void>) { if (working) return; setWorking(true); setError(null); try { await run(); } catch (reason) { fail(reason); } finally { setWorking(false); } }
  async function publish() { if (working) return; setPublishing(true); await action(async () => { const intent = await preparePublication(client!); if (!getSession()) { const returnTo = creationContinuation(client!.saved.id, intent.id, locale, contentLocale); router.push(`/login?lang=${locale}&returnTo=${encodeURIComponent(returnTo)}`); return; } const result = await publishIntent(client!.saved, intent.id); router.replace(publicationEditor(result, locale, contentLocale)); }); setPublishing(false); }
  async function save() { await client!.flush(); if (eventId) { const draft = await creationDraftRequest<CreationDraftResponse>(`/api/creation-drafts/${client!.saved.id}/save-owned`, { method: "POST", headers: { "content-type": "application/json", "x-draft-csrf": client!.saved.csrfToken }, body: JSON.stringify({ revision: client!.saved.revision }) }); client!.adopt(draft); } }
  function switchDraft(next:DraftAutosave,nextLocale:EventLocale){
    setPreview(false);setAssets([]);setClient(next);setContentLocale(nextLocale);
    const url=new URL(window.location.href);url.searchParams.set("draftId",next.saved.id);url.searchParams.set("contentLocale",nextLocale);window.history.replaceState(null,"",url);
  }
  async function reset(){
    const next=await resetCreationDraft(client!);
    client!.dispose();switchDraft(next,next.saved.aggregate.sourceLocale);
  }
  const draft = client.aggregate, activeError = error ?? client.error;
  const readiness = capabilities ? creationReadiness(draft, { draftId: client.saved.id, currencies: capabilities.currencies, assets: assets.map(asset => ({ ...asset, draftId: client.saved.id })), ...(capabilities.mediaLimits ? { limits: capabilities.mediaLimits } : {}) }) : null;
  const focusSection = (section: CreationSection) => { const target = document.getElementById(`creation-${section}`); target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); target?.focus({ preventScroll: true }); };
  const review = () => focusSection(CREATION_SECTIONS.find(section => !readiness?.complete[section]) ?? "information");
  const openPreview = () => void action(async () => { await client.flush(); setPreview(true); });
  const primary = !eventId ? <button disabled={working || !readiness?.valid} type="button" title={readiness?.valid ? c.publish : l.check} className={`${button} creation-button-primary`} onClick={() => void publish()}><CreationIcon name="arrow-up-right" size={17} />{publishing ? c.publishing : c.publish}</button> : null;
  return <main className="creation-workspace" data-draft-id={client.saved.id}>
    <header className="creation-heading"><div><div className="creation-heading-title"><h1>{eventId ? c.edit : c.title}</h1>{!eventId ? <span className="creation-draft-badge">{l.draft}</span> : null}</div><p className="creation-subtitle">{l.intro}</p><button type="button" className="creation-checklist-mobile" onClick={review}>{readiness?.valid ? l.ready : `${l.remaining} · ${readiness?.completed ?? 0} / ${CREATION_SECTIONS.length}`}</button></div><div className="creation-heading-actions">{!eventId?<button disabled={working||client.busy} type="button" className={`${button} creation-reset-button`} onClick={()=>void action(reset)}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10a9 9 0 1 1 2.5 8M3 4v6h6"/></svg>{resetCopy[locale]}</button>:null}<button disabled={working} type="button" className={button} onClick={openPreview}><CreationIcon name="eye" size={17} />{c.preview}</button>{primary}</div></header>
    {eventId && params.get("published") === "1" ? <p role="status" className="creation-notice mb-5">{c.success}. <Link className="underline" href={`/events/${eventId}?lang=${locale}`}>{c.public}</Link></p> : null}
    <fieldset key={client.saved.id} disabled={working} className="min-w-0 border-0 p-0">
      <RecoveryNotice client={client} locale={locale} />
      <div className="creation-language-panel"><LocaleActions client={client} locale={locale} contentLocale={contentLocale} onLocale={value => { void action(async () => { await client.flush(); setContentLocale(value); const url = new URL(window.location.href); url.searchParams.set("contentLocale", value); window.history.replaceState(null, "", url); }); }} /></div>
      <div className="creation-layout">
        <aside className="creation-sidebar">
          <CreationCard id="creation-media" title={l.media} icon="image" aside={<span className="creation-card-count">{draft.media.slots.filter(Boolean).length} / 5</span>}><MediaGrid client={client} locale={locale} contentLocale={contentLocale} onAssetsChange={setAssets} /></CreationCard>
          <div className="creation-sidebar-status">
            <section className="creation-card creation-checklist" aria-label={l.checklist}><div className="creation-checklist-top"><h2>{l.checklist}</h2><span className="creation-card-count">{readiness?.completed ?? 0} / {CREATION_SECTIONS.length}</span></div><progress max={CREATION_SECTIONS.length} value={readiness?.completed ?? 0} aria-label={l.checklist} /><ul>{CREATION_SECTIONS.map(section => <li key={section}><a href={`#creation-${section}`} data-complete={readiness?.complete[section] ?? false} onClick={event => { event.preventDefault(); focusSection(section); }}><CreationIcon name={readiness?.complete[section] ? "circle-check" : "circle"} size={16} /><span>{l[section]}</span></a></li>)}</ul>{readiness?.valid ? <p className="creation-hint">{l.ready}</p> : null}</section>
            <p className="creation-privacy"><CreationIcon name="lock-keyhole" size={15} /><span>{l.privacy}</span></p>
          </div>
        </aside>
        <div className="creation-main-column">
          <CreationCard id="creation-information" title={layoutWords[contentLocale].information} icon="align-left"><DetailsFields disabled={working} client={client} locale={locale} contentLocale={contentLocale} section="information" /><div className="creation-divider" /><SharedDetails client={client} locale={contentLocale} section="classification" /></CreationCard>
          <CreationCard id="creation-schedule" title={l.schedule} icon="calendar-days"><SharedDetails client={client} locale={locale} section="schedule" /><div className="creation-divider" /><div className="creation-fields"><SharedDetails client={client} locale={locale} section="location" /><DetailsFields disabled={working} client={client} locale={locale} contentLocale={contentLocale} section="venue" /></div></CreationCard>
          <CreationCard id="creation-tickets" title={l.tickets} icon="ticket1">{eventId ? <p className="creation-notice mb-4">{c.locks}</p> : null}<TicketModes client={client} locale={locale} contentLocale={contentLocale} locked={!!eventId} /></CreationCard>
          <p className="creation-hint">{l.required}</p>
        </div>
      </div>
    </fieldset>
    {activeError ? <div ref={errorRegion} tabIndex={-1} role="alert" className="creation-error-panel"><p>{message(activeError)}</p>{activeError instanceof DraftRequestError && activeError.fields.length ? <ul className="mt-2 list-disc pl-5">{[...new Set(activeError.fields.map(field => field.path.startsWith("media") ? l.media : field.path.startsWith("schedule") ? l.schedule : field.path.startsWith("classification") ? l.schedule : c.invalid))].map(label => <li key={label}>{label}</li>)}</ul> : null}{activeError instanceof DraftRequestError && activeError.status === 409 ? <button className={`${button} mt-3`} onClick={() => void client.reload().then(() => setError(null)).catch(fail)}>{c.reload}</button> : null}</div> : null}
    <footer className="creation-footer"><div className="creation-footer-inner"><div className="creation-save-status" data-error={!!client.error}><CreationIcon name={client.error ? "circle" : "cloud-check"} /><div><p role="status" aria-live="polite">{publishing ? c.publishing : client.error ? l.saveFailed : working || client.busy || client.dirty ? c.saving : c.saved}</p><small>{l.autosave}</small></div></div><div className="creation-actions"><button disabled={working} type="button" className={button} onClick={() => void action(save)}>{eventId ? c.apply : c.save}</button><button disabled={working} type="button" className={button} onClick={openPreview}><CreationIcon name="eye" size={17} />{c.preview}</button>{primary}</div></div></footer>
    {preview ? <DraftPreview client={client} locale={locale} contentLocale={contentLocale} onClose={() => setPreview(false)} /> : null}
  </main>;
}
