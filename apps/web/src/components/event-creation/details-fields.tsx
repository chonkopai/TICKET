"use client";
import { EVENT_TEXT_LIMITS, type EventLocale } from "@event-platform/shared-types";
import type { DraftAutosave } from "../../lib/creation-draft-client";
import { AddressField } from "./address-field";
import { CountedField } from "./counted-field";
import { DescriptionEditor } from "./description-editor";
const labels = {
  ru: { title: "Название события", description: "Описание", address: "Адрес" },
  en: { title: "Event title", description: "Description", address: "Address" },
  kk: { title: "Іс-шара атауы", description: "Сипаттама", address: "Мекенжай" },
};
const placeholders = {
  ru: { title: "Как называется ваше событие?", description: "Программа, участники и всё, что важно знать гостям", address: "Улица и номер дома" },
  en: { title: "Give your event a name", description: "The programme, participants, and everything guests should know", address: "Street and building number" },
  kk: { title: "Іс-шараңызға атау беріңіз", description: "Бағдарлама, қатысушылар және қонақтарға қажетті ақпарат", address: "Көше және үй нөмірі" },
};
export function DetailsFields({ client, locale, contentLocale, section = "all", disabled = false }: { client: DraftAutosave; locale: EventLocale; contentLocale: EventLocale; disabled?: boolean; section?: "information" | "venue" | "all" }) {
  const draft = client.aggregate, fieldLocale = section === "venue" ? locale : contentLocale;
  const fields = section === "venue" ? ["address"] as const : section === "information" ? ["title", "description"] as const : ["title", "description", "address"] as const;
  return <div className="creation-fields">{fields.map(field => field === "description"
    ? <DescriptionEditor validationKey={contentLocale === draft.sourceLocale ? "content.description" : undefined} key={`${contentLocale}:${field}`} label={labels[fieldLocale][field]} placeholder={placeholders[fieldLocale][field]} required={contentLocale === draft.sourceLocale} max={EVENT_TEXT_LIMITS[field]} disabled={disabled} locale={fieldLocale} value={draft.content[contentLocale]?.[field] ?? ""} onChange={value => client.patch({ content: { [contentLocale]: { [field]: value } } })} />
    : field === "address" ? <AddressField key={`${contentLocale}:address`} label={labels[fieldLocale].address} value={draft.content[contentLocale]?.address ?? ""} city={draft.classification.city} country={draft.classification.countryCode} locale={locale} required={contentLocale === draft.sourceLocale} disabled={disabled} onChange={(address, city) => client.patch({ content: { [contentLocale]: { address } }, ...(city ? { classification: { city } } : {}) })} />
    : <CountedField validationKey={contentLocale === draft.sourceLocale ? "content.title" : undefined} key={`${contentLocale}:${field}`} label={labels[fieldLocale][field]} placeholder={placeholders[fieldLocale][field]} required={contentLocale === draft.sourceLocale} max={EVENT_TEXT_LIMITS[field]} disabled={disabled} value={draft.content[contentLocale]?.[field] ?? ""} onChange={value => client.patch({ content: { [contentLocale]: { [field]: value } } })} />)}</div>;
}
