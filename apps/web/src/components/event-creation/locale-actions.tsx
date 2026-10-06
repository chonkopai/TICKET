"use client";
import { useEffect, useState } from "react";
import type { DraftTranslationResult, EventLocale } from "@event-platform/shared-types";
import { creationDraftRequest, DraftRequestError, type DraftAutosave } from "../../lib/creation-draft-client";

const copy = {
  ru: { language: "Язык контента", source: "Исходный язык", translate: "Перевести из исходного языка", translating: "Переводим…", unavailable: "Автоперевод не настроен. Можно заполнить перевод вручную.", failed: "Не удалось перевести. Ваш текст сохранён; попробуйте снова.", tooLong: "Перевод превышает лимит поля. Сократите исходный текст и попробуйте снова." },
  en: { language: "Content language", source: "Source language", translate: "Translate from source language", translating: "Translating…", unavailable: "Automatic translation is not configured. You can enter translations manually.", failed: "Translation failed. Your text is preserved; please retry.", tooLong: "The translation exceeds a field limit. Shorten the source text and try again." },
  kk: { language: "Контент тілі", source: "Бастапқы тіл", translate: "Бастапқы тілден аудару", translating: "Аударылуда…", unavailable: "Автоматты аударма бапталмаған. Аударманы қолмен енгізуге болады.", failed: "Аудару орындалмады. Мәтініңіз сақталды; қайта көріңіз.", tooLong: "Аударма өріс шегінен асады. Бастапқы мәтінді қысқартып, қайта көріңіз." },
};
const languageNames = { ru: "RU", en: "ENG", kk: "KAZ" };

export function LocaleActions({ client, locale, contentLocale, onLocale }: { client: DraftAutosave; locale: EventLocale; contentLocale: EventLocale; onLocale: (locale: EventLocale) => void }) {
  const c = copy[locale], source = client.aggregate.sourceLocale;
  const [configured, setConfigured] = useState<boolean | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void creationDraftRequest<{ configured: boolean }>(`/api/creation-drafts/${client.saved.id}/translations`).then(result => { if (active) setConfigured(result.configured); }).catch(() => { if (active) setConfigured(false); });
    return () => { active = false; };
  }, [client]);
  useEffect(() => { setError(""); }, [contentLocale]);

  async function translate() {
    if (contentLocale === source || !configured || loading) return;
    setLoading(true); setError("");
    const target = contentLocale;
    try {
      await client.translationMutation(saved => creationDraftRequest<DraftTranslationResult>(`/api/creation-drafts/${saved.id}/translations`, {
        method: "POST", headers: { "content-type": "application/json", "x-draft-csrf": saved.csrfToken },
        body: JSON.stringify({ revision: saved.revision, targetLocale: target }),
      }));
    } catch (reason) {
      setError(reason instanceof DraftRequestError && reason.code === "TRANSLATION_TOO_LONG" ? c.tooLong : c.failed);
    } finally { setLoading(false); }
  }

  return <section className="space-y-3">
    <div className="creation-locale-row"><span>{c.language}</span><div className="creation-locale-control-row"><div className="creation-locale-switcher"><div role="group" aria-label={c.language} className="creation-locale-tabs">{(["ru", "en", "kk"] as const).map(value => <button key={value} type="button" aria-pressed={value === contentLocale} disabled={loading} onClick={() => onLocale(value)}>{languageNames[value]}</button>)}</div><p className="creation-source-note">{c.source}: {languageNames[source]}</p></div>
      <button type="button" className="creation-translate-button" disabled={contentLocale === source || !configured || loading || /REVISION|EXPIRED|NOT_FOUND/.test(client.error?.message ?? "")} onClick={() => void translate()}>{loading ? c.translating : c.translate}</button>
    </div></div>
    {contentLocale !== source && configured === false ? <p role="status" className="text-sm text-slate-600 dark:text-ticket-muted">{c.unavailable}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700 dark:text-ticket-danger">{error}</p> : null}
  </section>;
}
