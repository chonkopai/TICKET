import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicEventSummary } from "@event-platform/shared-types";
import { formatCatalogPrice } from "./catalog-event-price";
import { HOME_COPY } from "../app/home-copy";

const event = { saleStatus: "available", startingAmount: 500000, startingCurrency: "KZT", startingUnit: "seat", startingPrices: [] } as unknown as PublicEventSummary;
const money = (amount: number, currency: string) => `${amount / 100} ${currency}`;

test("unavailable sales show their status even when price data is still present", () => {
  for (const status of ["sold_out", "sales_ended", "temporarily_unavailable"] as const) {
    for (const locale of ["ru", "kk", "en"] as const) {
      for (const startingAmount of [null, 0, 500000]) {
        const unavailable = { ...event, saleStatus: status, startingAmount, startingPrices: [
          { amount: 500000, fullAmount: 500000, currency: "KZT", unit: "seat" as const },
          { amount: 1000, fullAmount: 1000, currency: "USD", unit: "seat" as const },
        ] };
        assert.equal(formatCatalogPrice(unavailable, money, locale), HOME_COPY[locale].saleStatuses[status]);
      }
    }
  }
});

test("available seats, tables, free registrations, and mixed currencies keep their prices", () => {
  assert.equal(formatCatalogPrice(event, money, "en"), "from 5000 KZT per seat");
  assert.equal(formatCatalogPrice({ ...event, startingUnit: "table" }, money, "en"), "from 5000 KZT per table");
  assert.equal(formatCatalogPrice({ ...event, startingAmount: 0 }, money, "en"), "Free");
  assert.equal(formatCatalogPrice({ ...event, startingPrices: [
    { amount: 500000, fullAmount: null, currency: "KZT", unit: "seat" },
    { amount: 1000, fullAmount: null, currency: "USD", unit: "ticket" },
  ] }, money, "en"), "from 5000 KZT per seat · from 10 USD per ticket");
});
