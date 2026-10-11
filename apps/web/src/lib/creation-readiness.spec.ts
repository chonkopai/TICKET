import assert from "node:assert/strict";
import { test } from "node:test";
import { newEventCreationDraft, type PublishValidationContext } from "@event-platform/shared-types";
import { creationReadiness } from "./creation-readiness";

const draftId = "00000000-0000-4000-8000-000000000001";
const imageId = "00000000-0000-4000-8000-000000000003";
const context = (): PublishValidationContext => ({ draftId, currencies: [{ code: "KZT", exponent: 2 }], assets: [{ id: imageId, draftId, kind: "image", state: "ready", bytes: 1000, width: 1600, height: 1000, durationSeconds: null }] });
function completeDraft() {
  const draft = newEventCreationDraft("00000000-0000-4000-8000-000000000002", "ru");
  draft.content.ru = { title: "Concert", description: "Doors open at 18:00", address: "Test address" };
  draft.classification = { category: "music", countryCode: "KZ", city: "Almaty", ageRestriction: 0 };
  draft.schedule = { startLocal: "2026-11-01T19:00", endLocal: "2026-11-01T21:00", timezone: "Asia/Almaty", startChoice: null, endChoice: null };
  draft.selectedMode = "free";
  draft.free.capacity = 100;
  draft.free.content.ru = { name: "Registration" };
  draft.media.slots[0] = imageId;
  draft.media.cardAssetId = imageId;
  draft.media.backgroundAssetId = imageId;
  return draft;
}
test("an empty draft points to all four unfinished sections", () => {
  const state = creationReadiness(newEventCreationDraft("00000000-0000-4000-8000-000000000002"), context());
  assert.equal(state.valid, false);
  assert.equal(state.completed, 0);
});
test("a complete free draft needs no refund choice or secondary translation", () => {
  const state = creationReadiness(completeDraft(), context());
  assert.equal(state.valid, true);
  assert.equal(state.completed, 4);
});
test("unprocessed media prevents publishing while other sections remain complete", () => {
  const mediaContext = context(); mediaContext.assets = mediaContext.assets.map(asset => ({ ...asset, state: "processing" }));
  const state = creationReadiness(completeDraft(), mediaContext);
  assert.equal(state.valid, false);
  assert.equal(state.complete.media, false);
  assert.equal(state.completed, 3);
});
test("missing source venue text marks the combined date and place section", () => {
  const draft = completeDraft(); draft.content.ru!.address = "";
  const state = creationReadiness(draft, context());
  assert.equal(state.complete.schedule, false);
  assert.equal(state.complete.information, true);
});
test("a paid draft cannot publish without a refund choice or priced active tickets", () => {
  const draft = completeDraft(); draft.selectedMode = "paid_general";
  draft.paidGeneral = [{ ...draft.free, id: "00000000-0000-4000-8000-000000000004", amount: 10000 }];
  assert.equal(creationReadiness(draft, context()).complete.tickets, false);
  draft.refundsAvailable = false;
  assert.equal(creationReadiness(draft, context()).valid, true);
  draft.paidGeneral[0]!.active = false;
  assert.equal(creationReadiness(draft, context()).complete.tickets, false);
});
test("a schedule ending before it starts blocks publishing", () => {
  const draft = completeDraft(); draft.schedule.endLocal = "2026-11-01T18:00";
  const state = creationReadiness(draft, context());
  assert.equal(state.valid, false);
  assert.equal(state.complete.schedule, false);
});

test("missing fields are identified individually, including both halves of partial dates", () => {
  const draft = completeDraft();
  draft.content.ru!.title = ""; draft.content.ru!.description = ""; draft.content.ru!.address = "";
  draft.classification.category = null; draft.classification.ageRestriction = null;
  draft.schedule.startLocal = "2026-11-01T"; draft.schedule.endLocal = "T21:00";
  draft.free.capacity = null; draft.free.content.ru!.name = "";
  const state = creationReadiness(draft, context());
  assert.deepEqual([...state.fields].sort(), ["content.title", "content.description", "content.address", "classification.category", "classification.ageRestriction", "schedule.startTime", "schedule.endDate", `sale.${draft.free.id}.capacity`, `sale.${draft.free.id}.name`].sort());
  draft.content.ru!.title = "Filled title";
  const next = creationReadiness(draft, context());
  assert.equal(next.fields.has("content.title"), false);
  assert.equal(next.fields.has("content.description"), true);
});
test("an ambiguous clock change highlights its occurrence choice while nonexistent times highlight the time", () => {
  const draft = completeDraft(); draft.schedule.timezone = "Europe/Amsterdam";
  draft.schedule.startLocal = "2026-10-25T02:30"; draft.schedule.endLocal = "2026-10-25T05:00";
  assert.deepEqual([...creationReadiness(draft, context()).fields], ["schedule.startChoice"]);
  draft.schedule.startChoice = "earlier";
  assert.equal(creationReadiness(draft, context()).valid, true);
  draft.schedule.startChoice = null; draft.schedule.startLocal = "2027-03-28T02:30"; draft.schedule.endLocal = "2027-03-28T05:00";
  assert.deepEqual([...creationReadiness(draft, context()).fields], ["schedule.startTime"]);
});
test("paid ticket and refund errors remain distinct and clear when completed", () => {
  const draft = completeDraft(); draft.selectedMode = "paid_general";
  draft.paidGeneral = [{ ...draft.free, id: "00000000-0000-4000-8000-000000000004", amount: null, capacity: null, content: {} }];
  draft.refundsAvailable = true;
  let state = creationReadiness(draft, context());
  assert.ok(state.fields.has("content.refundConditions"));
  for (const field of ["name", "amount", "capacity"]) assert.ok(state.fields.has(`sale.${draft.paidGeneral[0]!.id}.${field}`));
  draft.paidGeneral[0]!.content.ru = { name: "General admission" }; draft.paidGeneral[0]!.capacity = 50; draft.paidGeneral[0]!.amount = 10000;
  draft.content.ru!.refundConditions = "Refunds until the day before the event";
  state = creationReadiness(draft, context()); assert.equal(state.valid, true); assert.equal(state.fields.size, 0);
});
