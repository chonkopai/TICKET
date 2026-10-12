import { describe, expect, it } from "vitest";
import { guestOrganizerContact, guestOrderChatPath } from "./guest-ticket-details.js";

describe("guest ticket action data", () => {
  const organizer = { name: "Organizer", phone: "+77000000000", email: "organizer@example.test", organizerProfile: { organizationName: "Events", address: "Office", showContactInfo: false } };
  it("never exposes private organizer contacts without their publication preference", () => {
    expect(guestOrganizerContact(organizer)).toEqual({ name: "Events", phone: null, email: null, address: null });
    expect(guestOrganizerContact({ ...organizer, organizerProfile: null })).toEqual({ name: "Organizer", phone: null, email: null, address: null });
    expect(guestOrganizerContact({ ...organizer, organizerProfile: { ...organizer.organizerProfile, showContactInfo: true } })).toEqual({ name: "Events", phone: organizer.phone, email: organizer.email, address: "Office" });
  });
  it("provides order chat only for the buyer of a settled order, including after a refund", () => {
    for (const paymentStatus of ["paid", "refunded", "cancelled"]) {
      expect(guestOrderChatPath("buyer", "event", { id: "order", buyerUserId: "buyer", paymentStatus })).toBe("/account/events/event/orders/order/chat");
      expect(guestOrderChatPath("transferred-owner", "event", { id: "order", buyerUserId: "buyer", paymentStatus })).toBeNull();
    }
    for (const paymentStatus of ["pending", "failed"]) expect(guestOrderChatPath("buyer", "event", { id: "order", buyerUserId: "buyer", paymentStatus })).toBeNull();
    expect(guestOrderChatPath("buyer", "event", null)).toBeNull();
  });
});
