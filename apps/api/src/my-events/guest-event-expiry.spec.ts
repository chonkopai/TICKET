import type { PrismaClient } from "@event-platform/database";
import { expect, it, vi } from "vitest";
import { MyEventsService } from "./my-events.service.js";

it("moves used and unused tickets to past at the end, preserving attendance and return history", async () => {
  const startsAt = new Date("2030-01-01T18:00:00Z"), endsAt = new Date("2030-01-01T21:00:00Z");
  const event = {
    id: "event", title: "Overnight", sourceLocale: "ru", creationVersion: 1, v2State: "legacy", status: "published",
    date: new Date("2030-01-01"), time: new Date("1970-01-01T23:00:00Z"), startsAt, endsAt, timezone: "Asia/Almaty", address: "Venue",
    organizer: { name: "Organizer", phone: null, email: null, organizerProfile: null }, venueLayout: null,
    ticketTypes: [{ id: "type", name: "Entry", tickets: ["active", "used", "cancelled"].map((status, index) => ({ id: `ticket-${index}`, status, usedAt: status === "used" ? startsAt : null, seatLabelSnapshot: null, createdAt: startsAt, updatedAt: startsAt, seatAllocation: null, order: { id: "order", buyerUserId: "buyer", paymentStatus: "paid", checkoutSnapshot: null } })) }],
  };
  const findMany = vi.fn().mockResolvedValue([event]);
  const database = { event: { findMany }, eventTranslation: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
  const service = new MyEventsService(database);
  const beforeEnd = new Date(endsAt.getTime() - 1);
  expect((await service.list("buyer", "upcoming", 1, 10, beforeEnd)).items[0]?.tickets[0]?.participationStatus).toBe("registered");
  expect((await service.list("buyer", "past", 1, 10, beforeEnd)).total).toBe(0);
  expect((await service.list("buyer", "upcoming", 1, 10, endsAt)).total).toBe(0);
  const past = await service.list("buyer", "past", 1, 10, endsAt);
  expect(past.total).toBe(1);
  expect(past.items[0]?.tickets.map(ticket => [ticket.status, ticket.participationStatus])).toEqual([["active", "no_show"], ["used", "attended"], ["cancelled", "cancelled"]]);
  findMany.mockResolvedValue([{ ...event, endsAt: null }]);
  expect((await service.list("buyer", "past", 1, 10, startsAt)).total).toBe(1);
});
