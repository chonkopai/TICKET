type EventTiming = { startsAt?: string | Date | null | undefined; endsAt?: string | Date | null | undefined };

/** Legacy events without an end time retain their start-time cutoff. */
export function eventExpiryTime(event: EventTiming): number {
  const start = event.startsAt ? new Date(event.startsAt).getTime() : NaN;
  const end = event.endsAt ? new Date(event.endsAt).getTime() : NaN;
  return Number.isFinite(end) && (!Number.isFinite(start) || end > start) ? end : start;
}

export function hasEventEnded(event: EventTiming, now: number | Date = Date.now()): boolean {
  return eventExpiryTime(event) <= Number(now);
}
