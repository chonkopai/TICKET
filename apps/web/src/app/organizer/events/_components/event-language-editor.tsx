"use client";

import { useEffect, useRef, useState } from "react";
import type { EventLocale, EventLocalizedContent, EventTranslation, OrganizerEvent } from "@event-platform/shared-types";
import { apiRequest } from "../../../(auth)/_lib/api";
import { useLocale } from "../../../../components/locale-provider";

const LANGUAGES: Array<{ value: EventLocale; label: string }> = [
  { value: "ru", label: "Русский" },
  { value: "kk", label: "Қазақша" },
  { value: "en", label: "English" },
];
const FIELDS = ["title", "venueName", "address", "announcement", "description", "program", "rules", "visitTerms", "cancellationTerms", "depositTerms", "extraConditions"] as const;
const STEP_FIELDS: Record<number, readonly (typeof FIELDS)[number][]> = {
  0: ["title", "venueName", "address"],
  1: ["announcement", "description", "program"],
  2: ["rules", "visitTerms", "cancellationTerms", "extraConditions"],
  3: ["depositTerms"],
  4: [],
  5: FIELDS,
};
const LABELS: Record<EventLocale, Record<(typeof FIELDS)[number], string>> = {
  ru: { title: "Название", venueName: "Площадка", address: "Адрес", announcement: "Анонс", description: "Описание", program: "Программа", rules: "Правила", visitTerms: "Условия посещения", cancellationTerms: "Условия отмены и возврата", depositTerms: "Условия депозита", extraConditions: "Дополнительные условия" },
  kk: { title: "Атауы", venueName: "Өтетін орны", address: "Мекенжай", announcement: "Анонс", description: "Сипаттама", program: "Бағдарлама", rules: "Ережелер", visitTerms: "Қатысу шарттары", cancellationTerms: "Бас тарту және қайтару шарттары", depositTerms: "Депозит шарттары", extraConditions: "Қосымша шарттар" },
  en: { title: "Title", venueName: "Venue", address: "Address", announcement: "Announcement", description: "Description", program: "Program", rules: "Rules", visitTerms: "Visit terms", cancellationTerms: "Cancellation and refund terms", depositTerms: "Deposit terms", extraConditions: "Additional conditions" },
};
const COPY = {
  ru: { heading: "Языковые версии", source: "Исходный язык", missing: "Перевод ещё не сохранён. Показан исходный текст.", manual: "Изменено вручную", machine: "Автоматический перевод — проверьте перед публикацией", stale: "Исходный текст изменился. Перевод устарел.", save: "Сохранить изменения", translate: "Сохранить и перевести на два других языка", translating: "Переводим…", saved: "Изменения сохранены.", retry: "Повторить перевод", sourceHint: "Исходный текст редактируется в форме выше.", noFields: "На этом шаге нет переводимых полей.", review: "Проверьте условия отмены, посещения и депозита на каждом языке.", unavailable: "Сначала сохраните черновик мероприятия.", overwrite: "Заменить отредактированный вручную перевод? Это действие удалит ваши правки.", skipped: "Ручной перевод сохранён без изменений.", failed: "Не удалось перевести." },
  kk: { heading: "Тілдік нұсқалар", source: "Бастапқы тіл", missing: "Аударма әлі сақталмаған. Бастапқы мәтін көрсетілген.", manual: "Қолмен өңделген", machine: "Автоматты аударма — жарияламас бұрын тексеріңіз", stale: "Бастапқы мәтін өзгерді. Аударма ескірді.", save: "Өзгерістерді сақтау", translate: "Сақтап, басқа екі тілге аудару", translating: "Аударылып жатыр…", saved: "Өзгерістер сақталды.", retry: "Аударманы қайталау", sourceHint: "Бастапқы мәтінді жоғарыдағы пішінде өңдеңіз.", noFields: "Бұл қадамда аударылатын өрістер жоқ.", review: "Бас тарту, қатысу және депозит шарттарын әр тілде тексеріңіз.", unavailable: "Алдымен іс-шараның нобайын сақтаңыз.", overwrite: "Қолмен өңделген аударманы ауыстырасыз ба? Өзгерістеріңіз жойылады.", skipped: "Қолмен өңделген аударма өзгеріссіз қалды.", failed: "Аудару мүмкін болмады." },
  en: { heading: "Language versions", source: "Source language", missing: "No translation has been saved. Source text is shown.", manual: "Edited manually", machine: "Machine translated — review before publishing", stale: "The source changed. This translation is out of date.", save: "Save changes", translate: "Save and translate into the other two languages", translating: "Translating…", saved: "Changes saved.", retry: "Retry translation", sourceHint: "Edit the source text in the form above.", noFields: "There are no translatable fields on this step.", review: "Review cancellation, visit, and deposit terms in every language.", unavailable: "Save the event draft first.", overwrite: "Replace a manually edited translation? Your edits will be lost.", skipped: "Manual translation was kept unchanged.", failed: "Translation failed." },
} as const;

type Drafts = Partial<Record<EventLocale, EventLocalizedContent>>;
type TranslationResponse = { sourceLocale: EventLocale; translations: EventTranslation[] };
type TranslateResult = { results: Array<{ locale: EventLocale; status: "translated" | "skipped" | "failed"; error?: string }> };

function fromEvent(event: OrganizerEvent): EventLocalizedContent {
  return Object.fromEntries(FIELDS.map((field) => [field, event[field]])) as unknown as EventLocalizedContent;
}

export function EventLanguageEditor({ event, step, sourceDirty, onSaveSource }: {
  event: OrganizerEvent | null; step: number; sourceDirty: boolean; onSaveSource: () => Promise<boolean>;
}) {
  const siteLocale = useLocale();
  const [selected, setSelected] = useState<EventLocale>(siteLocale);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [edited, setEdited] = useState<Partial<Record<EventLocale, boolean>>>({});
  const [translations, setTranslations] = useState<EventTranslation[]>([]);
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const copy = COPY[siteLocale];
  const sourceLocale = event?.sourceLocale ?? siteLocale;

  useEffect(() => {
    if (!event) return;
    try {
      const saved = sessionStorage.getItem(`ticket-event-translations:${event.id}`);
      if (saved) {
        const value = JSON.parse(saved) as { drafts?: Drafts; edited?: Partial<Record<EventLocale, boolean>> };
        const drafts: Drafts = {};
        const edited: Partial<Record<EventLocale, boolean>> = {};
        for (const locale of ["ru", "kk", "en"] as const) {
          const content = value.drafts?.[locale];
          if (value.edited?.[locale] && content && FIELDS.every((field) =>
            typeof content[field] === "string" || content[field] === null,
          )) {
            drafts[locale] = content;
            edited[locale] = true;
          }
        }
        setDrafts(drafts);
        setEdited(edited);
      }
    } catch { /* Ignore invalid local draft data. */ }
    setRestoredId(event.id);
  }, [event?.id]);

  useEffect(() => {
    if (!event || restoredId !== event.id) return;
    const unsaved = Object.fromEntries(Object.entries(drafts).filter(([locale]) => edited[locale as EventLocale]));
    const key = `ticket-event-translations:${event.id}`;
    if (Object.keys(unsaved).length) sessionStorage.setItem(key, JSON.stringify({ drafts: unsaved, edited }));
    else sessionStorage.removeItem(key);
  }, [drafts, edited, restoredId, event?.id]);

  useEffect(() => {
    if (!event) return;
    const current = ++generation.current;
    apiRequest<TranslationResponse>(`/api/organizer/events/${event.id}/translations`)
      .then((result) => {
        if (current !== generation.current) return;
        setTranslations(result.translations);
        setDrafts((previous) => {
          const next = { ...previous };
          for (const translation of result.translations) {
            if (!edited[translation.locale]) next[translation.locale] = translation;
          }
          return next;
        });
      })
      .catch((reason: unknown) => { if (current === generation.current) setError(reason instanceof Error ? reason.message : copy.failed); });
    return () => { generation.current++; };
  }, [event?.id]);

  const source = event ? fromEvent(event) : null;
  const existing = translations.find((item) => item.locale === selected);
  const content = drafts[selected] ?? existing ?? source;
  const fields = STEP_FIELDS[step] ?? [];

  function update(field: (typeof FIELDS)[number], value: string): void {
    if (!content) return;
    setDrafts((previous) => ({ ...previous, [selected]: { ...content, [field]: value } }));
    setEdited((previous) => ({ ...previous, [selected]: true }));
    setNotice(null);
  }

  async function reload(forceLocale?: EventLocale): Promise<void> {
    if (!event) return;
    const result = await apiRequest<TranslationResponse>(`/api/organizer/events/${event.id}/translations`);
    setTranslations(result.translations);
    setDrafts((previous) => {
      const next = { ...previous };
      for (const translation of result.translations) {
        if (!edited[translation.locale] || translation.locale === forceLocale) next[translation.locale] = translation;
      }
      return next;
    });
  }

  async function saveTranslationDraft(locale: EventLocale, value: EventLocalizedContent): Promise<void> {
    if (!event) return;
    const payload = Object.fromEntries(FIELDS.map((field) => [field, value[field] === "" && field !== "title" && field !== "venueName" && field !== "address" ? null : value[field]]));
    await apiRequest(`/api/organizer/events/${event.id}/translations/${locale}`, { method: "PATCH", body: JSON.stringify(payload) });
    setEdited((previous) => ({ ...previous, [locale]: false }));
    await reload(locale);
  }

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (selected === sourceLocale) {
        if (await onSaveSource()) setNotice(copy.saved);
      } else if (event && content && edited[selected]) {
        await saveTranslationDraft(selected, content);
        setNotice(copy.saved);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : copy.failed); }
    finally { setBusy(false); }
  }

  async function translate(overwriteManual = false): Promise<void> {
    if (!event || busy) return;
    if (overwriteManual && !window.confirm(copy.overwrite)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (sourceDirty && !(await onSaveSource())) return;
      for (const locale of ["ru", "kk", "en"] as const) {
        if (locale !== sourceLocale && edited[locale] && drafts[locale]) {
          await saveTranslationDraft(locale, drafts[locale]);
        }
      }
      const targets = LANGUAGES.filter((language) => language.value !== sourceLocale);
      const results: TranslateResult["results"] = [];
      for (const [index, target] of targets.entries()) {
        setTranslationProgress(`${index + 1}/${targets.length}: ${target.label}`);
        try {
          const result = await apiRequest<TranslateResult>(`/api/organizer/events/${event.id}/translations/translate`, {
            method: "POST", body: JSON.stringify({ overwriteManual, targetLocale: target.value }),
          });
          results.push(...result.results);
        } catch (reason) {
          results.push({ locale: target.value, status: "failed", error: reason instanceof Error ? reason.message : copy.failed });
        }
      }
      const failed = results.filter((item) => item.status === "failed");
      const skipped = results.some((item) => item.status === "skipped");
      if (failed.length) setError(failed.map((item) => `${item.locale}: ${item.error ?? copy.failed}`).join(" · "));
      else setNotice(skipped ? copy.skipped : copy.saved);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : copy.failed); }
    finally { setTranslationProgress(null); setBusy(false); }
  }

  return <section aria-label={copy.heading} className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">{copy.heading}</h2><div aria-label={copy.heading} className="flex gap-1 rounded-xl bg-violet-50 p-1">{LANGUAGES.map((language) => <button key={language.value} type="button" aria-pressed={selected === language.value} onClick={() => { setSelected(language.value); setError(null); setNotice(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-violet-600 ${selected === language.value ? "bg-white text-violet-700 shadow-sm" : "text-slate-600"}`}>{language.label}</button>)}</div></div>
    <p className="mt-3 text-sm text-slate-600">{selected === sourceLocale ? copy.source : existing?.status === "stale" ? copy.stale : existing?.status === "manual" ? copy.manual : existing?.status === "machine" ? copy.machine : copy.missing}</p>
    {!event ? <p className="mt-4 text-sm text-slate-600">{copy.unavailable}</p> : selected === sourceLocale ? <p className="mt-4 text-sm text-slate-600">{copy.sourceHint}</p> : fields.length === 0 ? <p className="mt-4 text-sm text-slate-600">{copy.noFields}</p> : <div className="mt-5 grid gap-4">{fields.map((field) => <label key={field} className="grid gap-2 text-sm font-semibold text-slate-800">{LABELS[selected][field]}<textarea className="min-h-20 rounded-xl border border-slate-300 p-3 font-normal focus-visible:outline-2 focus-visible:outline-violet-600" value={content?.[field] ?? ""} onChange={(input) => update(field, input.target.value)} /></label>)}</div>}
    {step === 2 || step === 3 || step === 5 ? <p className="mt-4 text-sm text-amber-800">{copy.review}</p> : null}
    <div className="mt-5 flex flex-wrap gap-2">
      <button type="button" disabled={busy || (!sourceDirty && selected === sourceLocale) || (selected !== sourceLocale && !edited[selected])} onClick={() => void save()} className="rounded-xl border border-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-800 disabled:opacity-40">{copy.save}</button>
      <button type="button" disabled={busy || !event} onClick={() => void translate()} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? copy.translating : copy.translate}</button>
      {translations.some((item) => item.status === "manual" && item.locale !== sourceLocale) ? <button type="button" disabled={busy || !event} onClick={() => void translate(true)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 underline disabled:opacity-40">{copy.retry}</button> : null}
    </div>
    {notice ? <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p> : null}
    {translationProgress ? <p role="status" className="mt-3 text-sm text-violet-700">{copy.translating} {translationProgress}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
  </section>;
}
