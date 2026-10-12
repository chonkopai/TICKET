import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { newEventCreationDraft, newHallObject, type CreationDraftResponse } from "@event-platform/shared-types";
import { DraftAutosave } from "./creation-draft-client";
import { DraftPreview } from "../components/event-creation/draft-preview";
import { draftEventPreview } from "./draft-event-preview";
const id = "00000000-0000-4000-8000-000000000001";
function client() {
  const aggregate = newEventCreationDraft("00000000-0000-4000-8000-000000000002", "ru");
  aggregate.content.ru = { title: "Live music", description: "Doors open at 18:00", address: "Nevsky Prospekt, 1" };
  aggregate.schedule = { startLocal: "2026-11-01T19:00", endLocal: "2026-11-01T21:00", timezone: "Asia/Almaty", startChoice: null, endChoice: null };
  aggregate.classification.city = "Almaty";
  const saved: CreationDraftResponse = { id, revision: 0, aggregate, csrfToken: "test-only", owned: false, state: "active", resultEventId: null, expiresAt: "2030-01-01T00:00:00Z" };
  return new DraftAutosave(saved);
}
test("preview shows unsaved edits and the date-specific timezone offset without requiring publication", () => {
  const draft = client();
  try {
    draft.patch({ content: { ru: { title: "Unsaved concert title" } } });
    const html = renderToStaticMarkup(<DraftPreview client={draft} locale="ru" contentLocale="ru" assets={[]} currencies={[]} />);
    assert.match(html, /Unsaved concert title/); assert.match(html, /Doors open at 18:00/); assert.match(html, /19:00.*GMT\+5/);
    assert.match(html, /Nevsky Prospekt, 1/); assert.doesNotMatch(html, /Asia\/Almaty|21:00/);
  } finally { draft.dispose(); }
});
test("preview displays the language being edited even before the translation is complete", () => {
  const draft = client();
  try {
    draft.patch({ content: { en: { title: "English work in progress" } } });
    const html = renderToStaticMarkup(<DraftPreview client={draft} locale="ru" contentLocale="en" assets={[]} currencies={[]} />);
    assert.match(html, /English work in progress/); assert.doesNotMatch(html, /Live music|Doors open at 18:00/);
    assert.match(html, /About this event/); assert.match(html, /Add a description to see it here/);
    assert.match(html, /Event address/); assert.match(html, /Choose tickets and seats/); assert.match(html, /November/);
    assert.match(html, /lang="en"/); assert.match(html, /Предпросмотр/);
    assert.doesNotMatch(html, /О событии|Дата и время|Адрес события|Билеты/);
  } finally { draft.dispose(); }
});
test("empty preview labels follow the selected language while editor controls retain the interface language", () => {
  const draft = client();
  try {
    draft.patch({ schedule: { startLocal: null } });
    for (const [contentLocale, about, date, address, tickets] of [
      ["en", "About this event", "Date and time", "Event address", "Choose tickets and seats"],
      ["kk", "Іс-шара туралы", "Күні мен уақыты", "Іс-шара мекенжайы", "Билеттер мен орындарды таңдаңыз"],
    ] as const) {
      const html = renderToStaticMarkup(<DraftPreview client={draft} locale="ru" contentLocale={contentLocale} assets={[]} currencies={[]} />);
      for (const label of [about, date, address, tickets, "Предпросмотр", "Компьютер"]) assert.ok(html.includes(label));
      assert.doesNotMatch(html, /О событии|Дата и время|Адрес события/);
    }
  } finally { draft.dispose(); }
});
test("preview uses the published page's hero, icons and ticket controls inside a desktop viewport without navigation", () => {
  const draft = client();
  try {
    draft.patch({ selectedMode: "free", free: { capacity: 100, content: { ru: { name: "Пригласительный" } } } });
    const html = renderToStaticMarkup(<DraftPreview client={draft} locale="ru" contentLocale="ru" assets={[]} currencies={[]} />);
    for (const marker of ['aspect-ratio:1440 / 900', 'width:1440px;height:900px', 'class="event-hero ', 'class="event-hero-details ', 'class="event-details-grid ', 'id="tickets"', 'Пригласительный', '100 осталось', 'inert=""']) assert.ok(html.includes(marker), marker);
    assert.doesNotMatch(html, /ticket-navbar|creation-preview-hero|creation-preview-ticket/);
  } finally { draft.dispose(); }
});
test("draft hall projection preserves whole tables, seat availability and zone capacities", () => {
  const draft = client();
  try {
    const tariffId = "00000000-0000-4000-8000-000000000003";
    const geometry = (object: ReturnType<typeof newHallObject>) => { const { name: _name, description: _description, price: _price, deposit: _deposit, ...rest } = object; return rest; };
    const table = { ...geometry(newHallObject("00000000-0000-4000-8000-000000000004", "table_rect", 5, 5)), saleMode: "whole_table" as const, tariffId };
    const seat = { ...geometry(newHallObject("00000000-0000-4000-8000-000000000005", "seat", 5, 4)), parentId: table.id };
    const zone = { ...geometry(newHallObject("00000000-0000-4000-8000-000000000006", "zone", 10, 5)), tariffId, capacity: 25, points: [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }] };
    draft.patch({ selectedMode: "paid_seated", paidSeated: { version: 3, room: { widthM: 20, heightM: 15 }, objects: [table, seat, zone], tariffs: [{ id: tariffId, active: true, amount: 500000, content: { en: { name: "VIP" } } }] } });
    const result = draftEventPreview(id, draft.aggregate, "en", [], { title: "Title", address: "Address", invitation: "Invitation" });
    assert.equal(result.event.tables[0]?.seats, 1);
    assert.equal(result.event.tables[0]?.payment.amountDue, 500000);
    assert.equal(result.layout?.seats?.[0]?.availability, "available");
    assert.equal(result.event.ticketTypes[0]?.venueObjectId, zone.id);
    assert.equal(result.event.ticketTypes[0]?.remaining, 25);
    assert.equal(result.layout?.layoutJson.version, 2);
  } finally { draft.dispose(); }
});
