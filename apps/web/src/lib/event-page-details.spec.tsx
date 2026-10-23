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
