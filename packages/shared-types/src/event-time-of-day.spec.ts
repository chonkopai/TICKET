import { describe, expect, it } from "vitest";
import { matchesEventTimeOfDay } from "./events.js";

describe("event local start time periods", () => {
  it.each([ ["00:00", "night"], ["05:59", "night"], ["06:00", "morning"], ["11:59", "morning"], ["12:00", "day"], ["17:59", "day"], ["18:00", "evening"], ["23:59", "evening"] ] as const)("assigns %s to only %s", (time, expected) => {
    for (const period of ["morning", "day", "evening", "night"] as const) expect(matchesEventTimeOfDay(time, period)).toBe(period === expected);
  });
  it("rejects invalid wall times", () => { for (const time of ["24:00", "12:60", "", "invalid"]) expect(matchesEventTimeOfDay(time, "evening")).toBe(false); });
});
