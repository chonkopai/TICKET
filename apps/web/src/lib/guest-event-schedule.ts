import type { EventLocale, GuestEvent } from "@event-platform/shared-types";
import { INTL_LOCALES } from "./locale";

export function guestEventSchedule(event: Pick<GuestEvent, "startsAt" | "endsAt" | "timezone">, locale: EventLocale): string {
  const start = new Date(event.startsAt), end = event.endsAt ? new Date(event.endsAt) : null;
  const options = { timeZone: event.timezone };
  const date = new Intl.DateTimeFormat(INTL_LOCALES[locale], { ...options, dateStyle: "medium" });
  const time = new Intl.DateTimeFormat(INTL_LOCALES[locale], { ...options, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const label = `${date.format(start)} · ${time.format(start)}`;
  if (!end || !Number.isFinite(end.getTime()) || end <= start) return label;
  const day = new Intl.DateTimeFormat("en-CA", { ...options, year: "numeric", month: "2-digit", day: "2-digit" });
  return day.format(start) === day.format(end)
    ? `${label}–${time.format(end)}`
    : `${label} – ${date.format(end)} · ${time.format(end)}`;
}
