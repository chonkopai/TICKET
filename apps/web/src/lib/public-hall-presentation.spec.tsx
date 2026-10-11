import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { newHallObject, type PublicEvent, type PublicVenueLayout } from "@event-platform/shared-types";
import { CurrencyProvider } from "../components/currency-provider";
import { VenueSection } from "../app/events/[id]/event-client";
import { EventHero } from "../app/events/[id]/event-hero";

function renderHall(whole: boolean, available = true, selected = false) {
  const table = { ...newHallObject("table", "table_rect", 5, 5), tariffId: "green", name: "Table", saleMode: whole ? "whole_table" as const : "per_seat" as const };
  const chair = { ...newHallObject("seat", "seat", 5, 4), parentId: table.id, colorOverride: true, color: "#000000" };
  const event = { paymentMode: "full", currency: "KZT", tables: whole ? [{ id: "table", name: "Table", saleMode: "whole_table", availability: available ? "available" : "unavailable", seats: 1, currency: "KZT", payment: { amountDue: 500000 } }] : [], ticketTypes: [] } as unknown as PublicEvent;
  const layout = { layoutJson: { version: 2, room: { widthM: 10, heightM: 8 }, tables: [], rows: [], editor: { version: 1, objects: [table, chair], tariffs: [{ id: "green", name: "Green VIP", color: "#15803D", price: 500000 }] } }, rows: [], tables: [], seats: [{ id: "seat", number: 1, tableId: "table", rowId: null, label: "Seat", availability: available ? "available" : "unavailable", price: 500000, currency: "KZT", tariffName: "Green VIP" }] } as unknown as PublicVenueLayout;
  return renderToStaticMarkup(<CurrencyProvider><VenueSection event={event} layout={layout} selectedSeatIds={selected && !whole ? ["seat"] : []} selectedTableId={selected && whole ? "table" : null} ticketQuantities={{}} onChange={() => {}} onTableChange={() => {}} onTicketChange={() => {}} /></CurrencyProvider>);
}

test("public seats inherit the tariff, retain it when selected, and expose the price legend", () => {
  const html = renderHall(false, true, true);
  assert.match(html, /aria-label="место 1, выбрано" aria-pressed="true" aria-disabled="false"/);
  assert.match(html, /fill="#15803D"/);
  assert.match(html, /✓/);
  assert.match(html, /Тарифы и цены/);
  assert.match(html, /Green VIP/);
  assert.match(html, /5.*000/);
  assert.ok(html.indexOf("Тарифы и цены") > html.indexOf('aria-label="Схема зала"'));
});

test("unavailable seats and tables are gray, disabled, and absent from keyboard tab order", () => {
  for (const whole of [false, true]) {
    const html = renderHall(whole, false);
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /tabindex="-1"/);
    assert.match(html, /fill="#D1D5DB"/);
  }
});

test("whole-table chairs are white and decorative; only the colored table is selectable", () => {
  const html = renderHall(true);
  assert.match(html, /aria-label="Table · свободно"/);
  assert.doesNotMatch(html, /aria-label="место 1/);
  assert.match(html, /aria-hidden="true"><circle r="0.225" fill="white" stroke="#94A3B8"/);
  assert.match(html, /fill="#15803D"/);
});

test("hero thumbnails are deduplicated, capped at four, and identify the initial background", () => {
  const media = Array.from({ length: 5 }, (_, index) => ({ id: String(index), kind: "image", url: `/image-${index}.jpg`, slot: index, width: 1600, height: 900, posterUrl: null, galleryVisible: true, isCard: index === 0, isBackground: index === 3, caption: null, crops: { card: { focalX: .5, focalY: .5, zoom: 1 } } }));
  const html = renderToStaticMarkup(<EventHero event={{ media } as unknown as PublicEvent} galleryLabel="Photos" actions={<button>Share</button>}><h1>Event</h1></EventHero>);
  assert.equal((html.match(/class="event-hero-thumbnail/g) ?? []).length, 4);
  assert.match(html, /aria-label="Photos: 1" aria-pressed="true"/);
  assert.doesNotMatch(html, /aria-label="Photos: 5"/);
});
