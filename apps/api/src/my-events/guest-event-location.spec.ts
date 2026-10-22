vi.mock("../orders/automatic-purchase-link.js", () => ({ linkGuestPurchases: vi.fn().mockResolvedValue(0) }));
import type { PrismaClient } from "@event-platform/database";
import { expect, it, vi } from "vitest";
import { MyEventsService } from "./my-events.service.js";

it("includes saved event coordinates in account cards and preserves legacy address fallback", async () => {
  const event = {
    id: "event", title: "Concert", sourceLocale: "ru", creationVersion: 1, v2State: "legacy",
    date: new Date("2030-01-01"), time: new Date("1970-01-01T20:00:00Z"), startsAt: new Date("2030-01-01T15:00:00Z"), endsAt: new Date("2030-01-01T18:00:00Z"), timezone: "Asia/Almaty",
    address: "Venue", latitude: 43.238, longitude: 76.927, status: "published", ticketTypes: [], venueLayout: null,
    organizer: { name: "Organizer", phone: null, email: null, organizerProfile: null },
  };
  const findMany = vi.fn().mockResolvedValue([event]);
  const db = { event: { findMany }, eventTranslation: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
  const service = new MyEventsService(db);
  const result = await service.list("buyer", "upcoming", 1, 10, new Date("2029-01-01"));
  expect(result.items[0]?.coordinates).toEqual({ latitude: 43.238, longitude: 76.927 });
  expect(result.items[0]?.endsAt).toBe("2030-01-01T18:00:00.000Z");
  findMany.mockResolvedValue([{ ...event, latitude: null, longitude: null, endsAt: null }]);
  const legacy = await service.list("buyer", "upcoming", 1, 10, new Date("2029-01-01"));
  expect(legacy.items[0]?.coordinates).toBeNull();
  expect(legacy.items[0]?.address).toBe("Venue");
  expect(legacy.items[0]?.endsAt).toBeNull();
});
