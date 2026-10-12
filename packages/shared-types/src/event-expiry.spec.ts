import { describe, expect, it } from "vitest";
import { eventExpiryTime, hasEventEnded } from "./event-expiry.js";

describe("event end cutoff", () => {
  const overnight = { startsAt: "2030-01-01T23:00:00+05:00", endsAt: "2030-01-02T02:00:00+05:00" };
  it("keeps an event current after it starts and across local midnight", () => {
    expect(hasEventEnded(overnight, new Date("2030-01-02T01:59:59+05:00"))).toBe(false);
  });
  it("expires exactly at the end in the event timezone", () => {
    expect(hasEventEnded(overnight, new Date("2030-01-01T21:00:00Z"))).toBe(true);
    expect(eventExpiryTime(overnight)).toBe(new Date("2030-01-01T21:00:00Z").getTime());
  });
  it("preserves the start-time fallback for legacy or invalid endings", () => {
    for (const endsAt of [null, "invalid", "2030-01-01T22:00:00+05:00"]) {
      const event = { startsAt: overnight.startsAt, endsAt };
      expect(hasEventEnded(event, new Date(overnight.startsAt))).toBe(true);
      expect(hasEventEnded(event, new Date("2030-01-01T22:59:59+05:00"))).toBe(false);
    }
    expect(hasEventEnded({})).toBe(false);
  });
});
