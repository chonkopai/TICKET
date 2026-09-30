import assert from "node:assert/strict";
import test from "node:test";
import { displayMoney } from "./display-currency.ts";

const rates = { asOf: "29.09.26", kztPerRub: 5.2, kztPerUsd: 440 };

test("keeps source KZT amount exact when KZT is selected", () => {
  assert.equal(displayMoney(1_500_000, "KZT", "KZT", rates).replaceAll("\u00a0", " "), "15 000 ₸");
});

test("rounds displayed RUB estimates up to ten and USD estimates up to one", () => {
  assert.equal(displayMoney(1_500_000, "KZT", "RUB", rates).replaceAll("\u00a0", " "), "≈ 2 890 ₽");
  assert.equal(displayMoney(1_500_000, "KZT", "USD", rates).replaceAll("\u00a0", " "), "≈ 35 $");
});

test("shows original amount when rates are unavailable or source currency is unsupported", () => {
  assert.equal(displayMoney(1_500_000, "KZT", "USD", null).replaceAll("\u00a0", " "), "15 000 ₸");
  assert.equal(displayMoney(1_500_000, "EUR", "USD", rates).replaceAll("\u00a0", " "), "15 000 EUR");
});

test("formats the same amount predictably for each display language", () => {
  assert.equal(displayMoney(123_456_700, "KZT", "KZT", rates, "en-KZ"), "1,234,567 ₸");
  assert.equal(displayMoney(123_456_700, "KZT", "KZT", rates, "kk-KZ"), "1\u00a0234\u00a0567 ₸");
});
