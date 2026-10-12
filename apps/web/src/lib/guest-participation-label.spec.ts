import assert from "node:assert/strict";
import { test } from "node:test";
import { guestEventParticipationLabel, guestTicketParticipationLabel } from "./guest-participation-label";

test("returned tickets use return wording even when the free return is stored as cancelled", () => {
  for (const status of ["cancelled", "refunded"] as const) {
    const ticket = { status, participationStatus: "cancelled" as const };
    assert.equal(guestTicketParticipationLabel(ticket, "ru"), "Возвращён");
    assert.equal(guestTicketParticipationLabel(ticket, "en"), "Returned");
    assert.equal(guestTicketParticipationLabel(ticket, "kk"), "Қайтарылған");
    assert.equal(guestEventParticipationLabel({ eventStatus: "published", participationStatus: "cancelled", tickets: [ticket], bookings: [] }, "en"), "Returned");
  }
});

test("event cancellation stays distinct from a ticket return", () => {
  assert.equal(guestEventParticipationLabel({ eventStatus: "cancelled", participationStatus: "cancelled", tickets: [{ status: "cancelled", participationStatus: "cancelled" }], bookings: [] }, "en"), "Cancelled");
});

test("a partial return does not mark the whole event as returned", () => {
  const event = { eventStatus: "published" as const, participationStatus: "cancelled" as const, tickets: [{ status: "refunded" as const, participationStatus: "cancelled" as const }, { status: "active" as const, participationStatus: "registered" as const }], bookings: [] };
  assert.equal(guestEventParticipationLabel(event, "en"), "Registered");
  assert.equal(guestEventParticipationLabel({ ...event, tickets: event.tickets.slice(0, 1), bookings: [{ status: "confirmed" }] }, "en"), "Registered");
});

test("unused ended tickets are unavailable while attended and returned history stays distinct", () => {
  const unused = { status: "active" as const, participationStatus: "no_show" as const };
  assert.equal(guestTicketParticipationLabel(unused, "en"), "Unavailable");
  const event = { eventStatus: "published" as const, participationStatus: "no_show" as const, tickets: [unused], bookings: [] };
  assert.equal(guestEventParticipationLabel(event, "ru", true), "Недоступен");
  assert.equal(guestTicketParticipationLabel({ status: "used", participationStatus: "attended" }, "en", true), "Attended");
  assert.equal(guestTicketParticipationLabel({ status: "cancelled", participationStatus: "cancelled" }, "en", true), "Returned");
  assert.equal(guestEventParticipationLabel({ ...event, tickets: [{ status: "active", participationStatus: "registered" }] }, "en", false), "Registered");
});
