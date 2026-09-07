import { ru } from "@event-platform/shared-types";

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY;

type UnitForms = readonly [string, string, string];

/** Formats a non-negative duration using complete 30-day months, days and hours. */
export function formatCountdown(remainingSeconds: number): string | null {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return null;
  if (remainingSeconds < SECONDS_PER_HOUR) return ru.countdown.lessThanHour;

  let seconds = Math.floor(remainingSeconds);
  const months = Math.floor(seconds / SECONDS_PER_MONTH);
  seconds -= months * SECONDS_PER_MONTH;
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  seconds -= days * SECONDS_PER_DAY;
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} ${pluralize(months, ru.countdown.units.month)}`);
  if (days > 0) parts.push(`${days} ${pluralize(days, ru.countdown.units.day)}`);
  if (hours > 0) parts.push(`${hours} ${pluralize(hours, ru.countdown.units.hour)}`);
  return parts.length > 0 ? parts.join(" ") : ru.countdown.lessThanHour;
}

function pluralize(value: number, forms: UnitForms): string {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  if (absolute % 10 === 1 && lastTwo !== 11) return forms[0];
  if (absolute % 10 >= 2 && absolute % 10 <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
  return forms[2];
}
