import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { newEventCreationDraft, type CreationDraftResponse } from "@event-platform/shared-types";
import { DraftAutosave } from "./creation-draft-client";
import { DraftPreview } from "../components/event-creation/draft-preview";
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
    assert.match(html, /About the event/); assert.match(html, /Add a description to see it here/);
    assert.match(html, /Event address/); assert.match(html, /Tickets/); assert.match(html, /November/);
    assert.match(html, /lang="en"/); assert.match(html, /Предпросмотр/);
    assert.doesNotMatch(html, /О событии|Дата и время|Адрес события|Билеты/);
  } finally { draft.dispose(); }
});
test("empty preview labels follow the selected language while editor controls retain the interface language", () => {
  const draft = client();
  try {
    draft.patch({ schedule: { startLocal: null } });
    for (const [contentLocale, about, date, address, tickets] of [
      ["en", "About the event", "Date and time", "Event address", "Tickets"],
      ["kk", "Іс-шара туралы", "Күні мен уақыты", "Іс-шара мекенжайы", "Билеттер"],
    ] as const) {
      const html = renderToStaticMarkup(<DraftPreview client={draft} locale="ru" contentLocale={contentLocale} assets={[]} currencies={[]} />);
      for (const label of [about, date, address, tickets, "Предпросмотр", "Компьютер"]) assert.ok(html.includes(label));
      assert.doesNotMatch(html, /О событии|Дата и время|Адрес события/);
    }
  } finally { draft.dispose(); }
});
