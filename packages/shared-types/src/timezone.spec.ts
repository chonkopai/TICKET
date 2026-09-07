import { describe, expect, it } from "vitest";

import { isoToZonedInput, zonedInputToIso } from "./timezone.js";

describe("venue timezone conversion", () => {
  it("round-trips an Almaty sales time without using the browser timezone", () => {
    const iso = zonedInputToIso("2027-03-21T19:30", "Asia/Almaty");
    expect(iso).toBe("2027-03-21T14:30:00.000Z");
    expect(isoToZonedInput(iso, "Asia/Almaty")).toBe("2027-03-21T19:30");
  });

  it("rejects a local time skipped by a daylight-saving transition", () => {
    expect(() => zonedInputToIso("2027-03-14T02:30", "America/New_York")).toThrow(RangeError);
  });
});
