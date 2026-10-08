"use client";
import { useCreationValidation, ValidationField } from "./creation-validation";
import { useMemo } from "react";
import { COUNTRY_CODES, EVENT_CATEGORIES, EVENT_AGE_RESTRICTIONS, localTimeCandidates, resolveLocalTime, resolveSchedule, type EventLocale } from "@event-platform/shared-types";
import type { DraftAutosave } from "../../lib/creation-draft-client";
import { CityField } from "./city-field";
import { CreationSelect } from "./creation-select";
import { timezoneOptions } from "./timezone-options";
import { EVENTS_COPY } from "../../lib/events-copy";
const words = {
  ru: { category: "Категория", country: "Страна", city: "Город", age: "Возрастное ограничение", start: "Начало", end: "Окончание", startDate: "Дата начала", startTime: "Время начала", endDate: "Дата окончания", endTime: "Время окончания", zone: "Часовой пояс", choose: "Выберите", early: "Первое вхождение", late: "Второе вхождение", ambiguous: "Это время повторяется. Выберите вхождение.", nonexistent: "Такого времени нет из-за перехода часов.", invalid: "Проверьте даты и время: окончание должно быть позже начала.", zoneHint: "Все даты и время указаны в выбранном часовом поясе. GMT-смещение зависит от даты события.", cityPlaceholder: "Город проведения" },
  en: { category: "Category", country: "Country", city: "City", age: "Age restriction", start: "Starts", end: "Ends", startDate: "Start date", startTime: "Start time", endDate: "End date", endTime: "End time", zone: "Timezone", choose: "Choose", early: "First occurrence", late: "Second occurrence", ambiguous: "This time occurs twice. Choose an occurrence.", nonexistent: "This time does not exist because the clocks change.", invalid: "Check the dates and times: the end must be after the start.", zoneHint: "All dates and times use this timezone. GMT offsets depend on the event date.", cityPlaceholder: "City where the event takes place" },
  kk: { category: "Санат", country: "Ел", city: "Қала", age: "Жас шектеуі", start: "Басталуы", end: "Аяқталуы", startDate: "Басталу күні", startTime: "Басталу уақыты", endDate: "Аяқталу күні", endTime: "Аяқталу уақыты", zone: "Уақыт белдеуі", choose: "Таңдаңыз", early: "Бірінші рет", late: "Екінші рет", ambiguous: "Бұл уақыт екі рет қайталанады. Біреуін таңдаңыз.", nonexistent: "Сағат ауысуына байланысты мұндай уақыт жоқ.", invalid: "Күн мен уақытты тексеріңіз: аяқталуы басталуынан кейін болуы керек.", zoneHint: "Барлық күн мен уақыт осы уақыт белдеуінде көрсетілген. GMT ығысуы іс-шара күніне байланысты.", cityPlaceholder: "Іс-шара өтетін қала" },
};
export function SharedDetails({ client, locale, section = "all" }: { client: DraftAutosave; locale: EventLocale; section?: "classification" | "schedule" | "location" | "all" }) {
  const categoryValidation = useCreationValidation("classification.category"), ageValidation = useCreationValidation("classification.ageRestriction");
  const draft = client.aggregate, c = words[locale], classification = draft.classification, schedule = draft.schedule, countryNames = new Intl.DisplayNames([locale], { type: "region" }), englishCountries = new Intl.DisplayNames(["en"], { type: "region" });
  const zones = useMemo(() => {
    let instant = new Date();
    if (schedule.startLocal) try { instant = new Date(resolveLocalTime(schedule.startLocal, schedule.timezone, schedule.startChoice ?? undefined)); } catch { /* A partial or ambiguous date still allows timezone selection. */ }
    return timezoneOptions(locale, schedule.timezone, instant);
  }, [locale, schedule.timezone, schedule.startLocal, schedule.startChoice]);
  const featuredCountries = ["KZ", "UZ", "RU", "AE"];
  const countryOptions = COUNTRY_CODES.map(country => ({ value: country, label: countryNames.of(country) ?? country, keywords: `${country} ${englishCountries.of(country)}` })).sort((a, b) => {
    const aRank = featuredCountries.indexOf(a.value), bRank = featuredCountries.indexOf(b.value);
    return (aRank < 0 ? 4 : aRank) - (bRank < 0 ? 4 : bRank) || a.label.localeCompare(b.label, locale);
  });
  const classificationFields = <div className="creation-two-columns">
    <label {...categoryValidation.wrapper} className="creation-field">{c.category}<span aria-hidden="true" className="creation-required"> *</span><select aria-label={c.category} {...categoryValidation.control} aria-required className="creation-input" value={classification.category ?? ""} onChange={event => client.patch({ classification: { category: event.target.value ? event.target.value as typeof classification.category : null } })}><option value="">{c.choose}</option>{EVENT_CATEGORIES.map(category => <option key={category} value={category}>{EVENTS_COPY[locale].categories[category]}</option>)}</select>{categoryValidation.error}</label>
    <label {...ageValidation.wrapper} className="creation-field">{c.age}<span aria-hidden="true" className="creation-required"> *</span><select aria-label={c.age} {...ageValidation.control} aria-required className="creation-input" value={classification.ageRestriction ?? ""} onChange={event => client.patch({ classification: { ageRestriction: event.target.value === "" ? null : Number(event.target.value) as typeof classification.ageRestriction } })}><option value="">{c.choose}</option>{EVENT_AGE_RESTRICTIONS.map(age => <option key={age} value={age}>{age}+</option>)}</select>{ageValidation.error}</label>
  </div>;
  const locationFields = <div className="creation-two-columns">
    <CreationSelect validationKey="classification.countryCode" label={c.country} required value={classification.countryCode ?? ""} placeholder={c.choose} locale={locale} searchable searchLabel={locale === "ru" ? "Поиск страны" : locale === "kk" ? "Елді іздеу" : "Search countries"} options={[{ value: "", label: c.choose, pinned: true }, ...countryOptions]} onChange={country => client.patch({ classification: { countryCode: country ? country as typeof classification.countryCode : null } })} />
    <CityField key={classification.countryCode ?? "none"} label={c.city} placeholder={c.cityPlaceholder} country={classification.countryCode} locale={locale} value={classification.city} onChange={city => client.patch({ classification: { city } })} />
  </div>;
  let error = "";
  if (schedule.startLocal && schedule.endLocal) try { resolveSchedule(schedule); } catch (reason) { error = (reason as Error).message; }
  const scheduleFields = <div className="creation-fields creation-schedule-fields">
    <div className="creation-schedule-row">{(["start", "end"] as const).map(side => {
      const value = schedule[`${side}Local`] ?? "", date = value.split("T")[0] ?? "", time = value.split("T")[1] ?? "", choice = schedule[`${side}Choice`];
      let candidates: string[] | null = null;
      try { if (value) candidates = localTimeCandidates(value, schedule.timezone); } catch { /* Partially typed timezones remain editable. */ }
      const change = (nextDate: string, nextTime: string) => client.patch({ schedule: { [`${side}Local`]: nextDate || nextTime ? `${nextDate}T${nextTime}` : null, [`${side}Choice`]: null } });
      return <fieldset key={side} className="creation-schedule-group"><legend>{c[side]}<span aria-hidden="true" className="creation-required"> *</span></legend><div className="creation-date-time">
        <ScheduleInput field={`schedule.${side}Date`} label={c[`${side}Date`]} type="date" value={date} onChange={value => change(value, time)} />
        <ScheduleInput field={`schedule.${side}Time`} label={c[`${side}Time`]} type="time" value={time} onChange={value => change(date, value)} />
      </div>{candidates?.length === 0 ? <p role="alert" className="creation-error">{c.nonexistent}</p> : null}{candidates && candidates.length > 1 ? <ValidationField field={`schedule.${side}Choice`}><label className="creation-field">{c.ambiguous}<select className="creation-input" value={choice ?? ""} onChange={event => client.patch({ schedule: { [`${side}Choice`]: event.target.value || null } })}><option value="">{c.choose}</option><option value="earlier">{c.early} · {candidates[0]}</option><option value="later">{c.late} · {candidates.at(-1)}</option></select></label></ValidationField> : null}</fieldset>;
    })}
    <CreationSelect validationKey="schedule.timezone" className="creation-timezone-field" label={c.zone} required describedBy="event-timezone-hint" value={schedule.timezone} placeholder={c.choose} locale={locale} searchable searchLabel={locale === "ru" ? "Город или GMT-смещение" : locale === "kk" ? "Қала немесе GMT ығысуы" : "City or GMT offset"} menuMinWidth={440} options={zones} onChange={timezone => client.patch({ schedule: { timezone, startChoice: null, endChoice: null } })} />
    </div>
    <span id="event-timezone-hint" className="creation-hint creation-schedule-hint">{c.zoneHint}</span>
    {error && error !== "SCHEDULE_TIME_AMBIGUOUS" && error !== "SCHEDULE_TIME_NONEXISTENT" ? <p role="alert" className="creation-error">{c.invalid}</p> : null}
  </div>;
  return <div className="creation-fields">{section === "classification" || section === "all" ? classificationFields : null}{section === "schedule" || section === "all" ? scheduleFields : null}{section === "location" || section === "all" ? locationFields : null}</div>;
}

function ScheduleInput({ field, label, type, value, onChange }: { field: string; label: string; type: "date" | "time"; value: string; onChange: (value: string) => void }) {
  const validation = useCreationValidation(field);
  return <div {...validation.wrapper}><input {...validation.control} aria-label={label} aria-required type={type} className="creation-input" value={value} onInput={event => onChange(event.currentTarget.value)} />{validation.error}</div>;
}
