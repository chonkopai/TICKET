"use client";
import { useState } from "react";
import { graphemeLength, type EventLocale } from "@event-platform/shared-types";
import { CountedField } from "./counted-field";
import { CreationSelect } from "./creation-select";
import { majorCityOptions } from "./city-options";
const copy = {
  ru: { manual: "Ввести вручную", choose: "Выбрать из списка", search: "Поиск города" },
  en: { manual: "Type manually", choose: "Choose from list", search: "Search cities" },
  kk: { manual: "Қолмен енгізу", choose: "Тізімнен таңдау", search: "Қаланы іздеу" },
};
export function CityField({ label, placeholder, value, country, locale, onChange }: { label: string; placeholder: string; value: string; country: string | null; locale: EventLocale; onChange: (city: string) => void }) {
  const options = majorCityOptions(country, locale), words = copy[locale];
  const [choosing, setChoosing] = useState(!value || options.some(option => option.value === value));
  const [focusManual, setFocusManual] = useState(false);
  // Preserve existing city text, including custom entries and text written in another locale.
  if (!options.length || !choosing) return <div className="creation-city-manual"><CountedField label={label} required placeholder={placeholder} max={80} value={value} onChange={onChange} autoFocus={focusManual} />{options.length ? <button type="button" className="creation-city-choose" onClick={() => setChoosing(true)}>{words.choose}</button> : null}</div>;
  return <CreationSelect label={label} required value={value} placeholder={placeholder} counter={`${graphemeLength(value)} / 80`} options={[{ value: "__manual", label: words.manual, pinned: true }, ...options]} locale={locale} searchable searchLabel={words.search} onChange={city => { if (city === "__manual") { setChoosing(false); setFocusManual(true); } else onChange(city); }} />;
}
