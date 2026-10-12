import assert from "node:assert/strict";
import { test } from "node:test";
import { guestEventSchedule } from "./guest-event-schedule";

const event = { startsAt: "2026-10-20T15:00:00Z", endsAt: "2026-10-20T18:00:00Z", timezone: "Asia/Almaty" };

test("same-day endings show only the end time", () => {
  assert.equal(guestEventSchedule(event, "en"), "Oct 20, 2026 · 20:00–23:00");
});

test("overnight endings include the end date in the event's timezone", () => {
  assert.equal(guestEventSchedule({ ...event, endsAt: "2026-10-20T20:30:00Z" }, "en"), "Oct 20, 2026 · 20:00 – Oct 21, 2026 · 01:30");
});

test("UTC midnight does not repeat a date when both times are on the same local day", () => {
  assert.equal(guestEventSchedule({ ...event, startsAt: "2026-10-20T23:00:00Z", endsAt: "2026-10-21T01:00:00Z" }, "en"), "Oct 21, 2026 · 04:00–06:00");
});

test("missing or invalid endings preserve the start-only label in every site language", () => {
  for (const locale of ["ru", "en", "kk"] as const) {
    const label = guestEventSchedule({ ...event, endsAt: null }, locale);
    assert.equal(guestEventSchedule({ ...event, endsAt: "invalid" }, locale), label);
    assert.equal(guestEventSchedule({ ...event, endsAt: event.startsAt }, locale), label);
    assert.ok(label.endsWith("20:00"));
  }
});
