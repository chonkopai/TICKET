export function isoToZonedInput(iso: string, timezone: string): string {
  const values = zonedParts(new Date(iso), timezone);
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
export function zonedInputToIso(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Venue-local date and time are invalid");
  const desired = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let guess = desired;
  for (let index = 0; index < 3; index += 1) {
    const parts = zonedParts(new Date(guess), timezone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    guess += desired - represented;
  }
  const result = new Date(guess).toISOString();
  if (isoToZonedInput(result, timezone) !== value) {
    throw new RangeError("Venue-local date and time do not exist in this timezone");
  }
  return result;
}

function zonedParts(
  date: Date,
  timezone: string,
): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const entries = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]);
  return Object.fromEntries(entries) as Record<
    "year" | "month" | "day" | "hour" | "minute",
    string
  >;
}
