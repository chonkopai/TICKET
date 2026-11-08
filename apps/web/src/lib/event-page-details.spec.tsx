import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicEvent, PublicVenueLayout } from "@event-platform/shared-types";
import { CurrencyProvider } from "../components/currency-provider";
import { CheckoutPanel } from "../app/events/[id]/checkout-panel";
import { EventHeroDetails, eventStartDetails } from "../app/events/[id]/event-hero-details";

test("hero shows only the start with date-specific GMT offsets including half-hour and DST zones", () => {
  const event = { startsAt: "2027-04-25T15:00:00Z", endsAt: "2027-04-25T18:00:00Z", timezone: "Asia/Almaty", address: "Address", countryCode: "KZ", city: "Almaty" } as PublicEvent;
  assert.equal(eventStartDetails(event, "en").time, "20:00 GMT+5");
  assert.equal(eventStartDetails({ ...event, timezone: "Asia/Kolkata" }, "en").time, "20:30 GMT+5:30");
  assert.equal(eventStartDetails({ ...event, timezone: "Europe/Amsterdam" }, "en").time, "17:00 GMT+2");
  const html = renderToStaticMarkup(<EventHeroDetails event={event} locale="en" />);
  assert.doesNotMatch(html, /23:00|Asia\/Almaty|backdrop-blur|bg-white/);
  assert.match(html, /Address/);
  assert.match(html, /Almaty, Kazakhstan/);
});

test("checkout summary preserves its empty state while terms require a selected seat", () => {
  const event = { id: "event", creationVersion: 2, contentLocale: "ru", refundsAvailable: false, paymentMode: "full_payment", tables: [], ticketTypes: [] } as unknown as PublicEvent;
  const layout = { seats: [{ id: "seat", availability: "available", price: 500000, currency: "KZT", label: "Seat" }] } as unknown as PublicVenueLayout;
  const render = (selectedSeatIds: string[]) => renderToStaticMarkup(<CurrencyProvider><CheckoutPanel event={event} layout={layout} selectedSeatIds={selectedSeatIds} selectedTableId={null} ticketQuantities={{}} onTableChange={() => {}} onTicketChange={() => {}} onClearSeats={() => {}} onRefreshAvailability={async () => {}} /></CurrencyProvider>);
  for (const ids of [[], ["seat"], []]) {
    const html = render(ids);
    if (ids.length) { assert.match(html, /ВАШ ВЫБОР|Ваш выбор/); assert.match(html, /Принимаю условия регистрации/); }
    else { assert.doesNotMatch(html, /Принимаю условия|Продолжить без аккаунта/); assert.match(html, /Добавьте билет или выберите место на схеме/); assert.match(html, /Выберите места на схеме/); }
  }
});

test("a large hall only lists selected tables, zone tickets and seats in checkout", () => {
  const payment = { amountDue: 50000, currency: "KZT" };
  const tables = Array.from({ length: 100 }, (_, i) => ({ id: `table-${i}`, number: i + 1, name: `Table ${i + 1}`, saleMode: "whole_table", availability: "available", seats: 8, currency: "KZT", payment }));
  const tickets = Array.from({ length: 20 }, (_, i) => ({ id: `zone-${i}`, venueObjectId: `object-${i}`, name: `Zone ${i + 1}`, status: "active", remaining: 50, currency: "KZT", payment }));
  const event = { id: "event", creationVersion: 2, contentLocale: "ru", saleMode: "paid_seated", paymentMode: "full_payment", tables, ticketTypes: tickets } as unknown as PublicEvent;
  const layout = { seats: Array.from({ length: 50 }, (_, i) => ({ id: `seat-${i}`, number: i + 1, rowId: null, tableId: null, availability: "available", price: 0, currency: "KZT", label: `Free seat ${i + 1}` })), tables: [], rows: [] } as unknown as PublicVenueLayout;
  const render = (selected: boolean) => renderToStaticMarkup(<CurrencyProvider><CheckoutPanel event={event} layout={layout} hasHall selectedSeatIds={selected ? ["seat-3"] : []} selectedTableId={selected ? "table-5" : null} ticketQuantities={selected ? { "zone-2": 2 } : {}} onTableChange={() => {}} onTicketChange={() => {}} onClearSeats={() => {}} onRefreshAvailability={async () => {}} /></CurrencyProvider>);
  const empty = render(false);
  assert.doesNotMatch(empty, /Table \d|Zone \d|Free seat \d/);
  assert.match(empty, /href="#venue-plan"/);
  const selected = render(true);
  assert.equal((selected.match(/class="checkout-table /g) ?? []).length, 1);
  assert.equal((selected.match(/class="checkout-ticket /g) ?? []).length, 1);
  for (const label of ["Table 6", "Zone 3", "Free seat 4", "Бесплатно"]) assert.ok(selected.includes(label), label);
  assert.doesNotMatch(selected, /Table 100|Zone 20|Free seat 50/);
  assert.doesNotMatch(render(false), /Table 6|Zone 3|Free seat 4/, "removing a selection restores the compact empty state");
});

test("ordinary tickets remain selectable without a hall, including zero-price tickets", () => {
  const event = { id: "event", creationVersion: 2, contentLocale: "ru", saleMode: "free", paymentMode: "full_payment", tables: [], ticketTypes: [{ id: "ticket", name: "Free admission", status: "active", remaining: 50, currency: "KZT", payment: { amountDue: 0, currency: "KZT" } }] } as unknown as PublicEvent;
  const html = renderToStaticMarkup(<CurrencyProvider><CheckoutPanel event={event} layout={null} selectedSeatIds={[]} selectedTableId={null} ticketQuantities={{}} onTableChange={() => {}} onTicketChange={() => {}} onClearSeats={() => {}} onRefreshAvailability={async () => {}} /></CurrencyProvider>);
  assert.match(html, /Free admission/);
  assert.match(html, /Добавить: Free admission/);
  assert.match(html, /Бесплатно/);
});
