import assert from "node:assert/strict";
import { test } from "node:test";
import { formatGmtOffset, timezoneOffsetMinutes, timezoneOptions } from "./timezone-options";

test("Kazakhstan uses its current GMT+05 rule, not old website tables", () => {
  assert.equal(timezoneOffsetMinutes("Asia/Almaty", new Date("2026-11-15T12:00:00Z")), 300);
});
test("offsets follow the event's season and retain fractional offsets", () => {
  assert.equal(timezoneOffsetMinutes("America/New_York", new Date("2026-01-15T12:00:00Z")), -300);
  assert.equal(timezoneOffsetMinutes("America/New_York", new Date("2026-07-15T12:00:00Z")), -240);
  assert.equal(formatGmtOffset(timezoneOffsetMinutes("Asia/Kathmandu", new Date("2026-11-15T12:00:00Z"))), "GMT+05:45");
  assert.equal(formatGmtOffset(timezoneOffsetMinutes("America/St_Johns", new Date("2026-01-15T12:00:00Z"))), "GMT−03:30");
});
test("the city menu is searchable by Beijing, Hong Kong, Macau, offsets and IANA IDs", () => {
  const options = timezoneOptions("ru", "Asia/Hong_Kong", new Date("2026-11-15T12:00:00Z"));
  const option = options.find(option => option.value === "Asia/Hong_Kong")!;
  assert.match(option.label, /GMT\+08:00.*Пекин.*Гонконг.*Макао/);
  for (const term of ["Beijing", "Hong Kong", "Macau", "GMT+8", "GMT +8", "Asia/Hong_Kong"]) assert.ok(option.keywords?.includes(term));
  assert.ok(options.length > 80);
  assert.equal(new Set(options.map(option => option.value)).size, options.length);
});
test("legacy timezone identifiers stay selected and invalid values cannot be newly chosen", () => {
  const options = timezoneOptions("en", "Asia/Kolkata", new Date("2026-11-15T12:00:00Z"));
  assert.ok(options.some(option => option.value === "Asia/Kolkata"));
  assert.ok(!timezoneOptions("en", "Invalid/Zone", new Date("2026-11-15T12:00:00Z")).some(option => option.value === "Invalid/Zone"));
});
