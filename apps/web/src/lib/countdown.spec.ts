import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCountdown } from "./countdown";

const hour = 60 * 60;
const day = 24 * hour;
const month = 30 * day;

test("countdown shows months, days and hours", () => {
  assert.equal(formatCountdown(2 * month + 4 * day + 6 * hour), "2 месяца 4 дня 6 часов");
});

test("countdown omits zero-value units", () => {
  assert.equal(formatCountdown(month + 3 * day), "1 месяц 3 дня");
  assert.equal(formatCountdown(12 * day + 5 * hour), "12 дней 5 часов");
  assert.equal(formatCountdown(7 * hour), "7 часов");
});

test("countdown uses the less-than-hour label and hides expired values", () => {
  assert.equal(formatCountdown(59 * 60), "Менее часа");
  assert.equal(formatCountdown(0), null);
  assert.equal(formatCountdown(-hour), null);
});

test("countdown uses Russian plural forms for edge values", () => {
  assert.match(formatCountdown(month) ?? "", /1 месяц/);
  assert.match(formatCountdown(2 * month) ?? "", /2 месяца/);
  assert.match(formatCountdown(5 * month) ?? "", /5 месяцев/);
  assert.match(formatCountdown(11 * day) ?? "", /11 дней/);
  assert.match(formatCountdown(21 * hour) ?? "", /21 час/);
  assert.match(formatCountdown(22 * hour) ?? "", /22 часа/);
});
