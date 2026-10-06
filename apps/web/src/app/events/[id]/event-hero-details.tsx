import type { EventLocale, PublicEvent } from "@event-platform/shared-types";
import { cityName, countryName } from "../../../lib/countries";
import { INTL_LOCALES } from "../../../lib/locale";

export function eventStartDetails(event: PublicEvent, locale: EventLocale) {
  const date = new Date(event.startsAt ?? `${event.date}T${event.time.slice(0, 5)}:00Z`);
  const timeZone = event.startsAt ? event.timezone : "UTC";
  const offset = new Intl.DateTimeFormat("en", { timeZone: event.timezone, timeZoneName: "shortOffset" }).formatToParts(date).find(part => part.type === "timeZoneName")?.value ?? "GMT";
  const dateLabel = new Intl.DateTimeFormat(INTL_LOCALES[locale], { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(date);
  return {
    date: dateLabel.charAt(0).toLocaleUpperCase(INTL_LOCALES[locale]) + dateLabel.slice(1),
    time: `${event.startsAt ? new Intl.DateTimeFormat(INTL_LOCALES[locale], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date) : event.time.slice(0, 5)} ${offset === "GMT" ? "GMT+0" : offset}`,
  };
}

export function EventHeroDetails({ event, locale }: { event: PublicEvent; locale: EventLocale }) {
  const start = eventStartDetails(event, locale);
  const place = [event.city ? cityName(event.city, locale) : "", event.countryCode ? countryName(event.countryCode, locale) : ""].filter(Boolean).join(", ");
  return <div className="event-hero-details mt-5 grid grid-cols-2 gap-4 text-xs sm:flex sm:flex-wrap sm:gap-x-8 sm:text-sm">
    <div className="flex min-w-0 items-start gap-2"><svg aria-hidden="true" className="mt-0.5 size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg><div className="min-w-0"><p className="font-semibold">{start.date}</p><p className="mt-1 text-white/75">{start.time}</p></div></div>
    <div className="flex min-w-0 items-start gap-2"><svg aria-hidden="true" className="mt-0.5 size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg><div className="min-w-0"><p className="font-semibold">{event.address}</p>{place ? <p className="mt-1 text-white/75">{place}</p> : null}</div></div>
  </div>;
}
