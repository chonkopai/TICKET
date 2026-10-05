"use client";
import { EVENT_TEXT_LIMITS, type EventLocale } from "@event-platform/shared-types";
import type { DraftAutosave } from "../../lib/creation-draft-client";
import { CountedField } from "./counted-field";
import { DescriptionEditor } from "./description-editor";
const labels = {
  ru: { title: "Название события", summary: "Краткое описание", description: "Полное описание", venueName: "Название места", address: "Адрес или ссылка на онлайн-событие" },
  en: { title: "Event title", summary: "Summary", description: "Full description", venueName: "Venue name", address: "Address or online event link" },
  kk: { title: "Іс-шара атауы", summary: "Қысқаша сипаттама", description: "Толық сипаттама", venueName: "Орын атауы", address: "Мекенжай немесе онлайн іс-шара сілтемесі" },
};
const placeholders = {
  ru: { title: "Как называется ваше событие?", summary: "В двух словах: что ждёт гостей", description: "Программа, участники и всё, что важно знать гостям", venueName: "Название площадки или онлайн-платформы", address: "Улица, дом или ссылка для подключения" },
  en: { title: "Give your event a name", summary: "A short introduction for your guests", description: "The programme, participants, and everything guests should know", venueName: "Venue or online platform name", address: "Street address or a link to join" },
  kk: { title: "Іс-шараңызға атау беріңіз", summary: "Қонақтарға қысқаша таныстыру", description: "Бағдарлама, қатысушылар және қонақтарға қажетті ақпарат", venueName: "Орын немесе онлайн платформа атауы", address: "Көше, үй немесе қосылу сілтемесі" },
};
export function DetailsFields({ client, locale, contentLocale, section = "all", disabled = false }: { client: DraftAutosave; locale: EventLocale; contentLocale: EventLocale; disabled?: boolean; section?: "information" | "venue" | "all" }) {
  const draft = client.aggregate, fieldLocale = section === "venue" ? locale : contentLocale;
  const fields = section === "venue" ? ["venueName", "address"] as const : section === "information" ? ["title", "summary", "description"] as const : ["title", "summary", "description", "venueName", "address"] as const;
  return <div className="creation-fields">{fields.map(field => field === "description"
    ? <DescriptionEditor key={`${contentLocale}:${field}`} label={labels[fieldLocale][field]} placeholder={placeholders[fieldLocale][field]} required={contentLocale === draft.sourceLocale} max={EVENT_TEXT_LIMITS[field]} disabled={disabled} locale={fieldLocale} value={draft.content[contentLocale]?.[field] ?? ""} onChange={value => client.patch({ content: { [contentLocale]: { [field]: value } } })} />
    : <CountedField key={`${contentLocale}:${field}`} label={labels[fieldLocale][field]} placeholder={placeholders[fieldLocale][field]} required={contentLocale === draft.sourceLocale} max={EVENT_TEXT_LIMITS[field]} disabled={disabled} multiline={field === "summary"} value={draft.content[contentLocale]?.[field] ?? ""} onChange={value => client.patch({ content: { [contentLocale]: { [field]: value } } })} />)}</div>;
}
