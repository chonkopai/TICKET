import { randomUUID } from "node:crypto";

import { EventStatus, prisma } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import type { Clock } from "../tables/tables.constants.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { PublicEventsService } from "../public-events/public-events.service.js";
import { FavoritesService } from "./favorites.service.js";

const organizerId = randomUUID();
const guestId = randomUUID();
const otherGuestId = randomUUID();
const eventId = randomUUID();
const telegramBase = BigInt(Date.now()) * 100_000n + 9_000n;
const domainEvents = new DomainEventsService();
const ticketTypes = new TicketTypesService(prisma, domainEvents);
const tables = new TablesService(prisma, domainEvents, { holdTtlSeconds: 60, cleanupIntervalSeconds: 60 }, { now: () => new Date() } satisfies Clock);
const publicEvents = new PublicEventsService(prisma, ticketTypes, tables);
const service = new FavoritesService(prisma, publicEvents);

beforeAll(async () => {
  await prisma.user.createMany({ data: [
    { id: organizerId, telegramId: telegramBase, role: "organizer", name: "Организатор" },
    { id: guestId, telegramId: telegramBase + 1n, role: "guest", name: "Гость" },
    { id: otherGuestId, telegramId: telegramBase + 2n, role: "guest", name: "Другой гость" },
  ] });
  await prisma.event.create({ data: {
    id: eventId, organizerId, title: "Событие для избранного", category: "music", city: "Алматы",
    date: new Date("2030-01-01T00:00:00.000Z"), time: new Date("1970-01-01T18:00:00.000Z"),
    timezone: "Asia/Almaty", venueName: "Зал", address: "Алматы", status: EventStatus.published,
  } });
});

afterAll(async () => {
  await prisma.favorite.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerId, guestId, otherGuestId] } } });
  await prisma.$disconnect();
});

describe("FavoritesService", () => {
  it("adds idempotently and scopes lists by user", async () => {
    await expect(service.add(guestId, eventId)).resolves.toEqual({ eventId, favorited: true });
    await expect(service.add(guestId, eventId)).resolves.toEqual({ eventId, favorited: true });
    await expect(service.list(guestId, 1, 20)).resolves.toMatchObject({ total: 1, items: [{ id: eventId }] });
    await expect(service.list(otherGuestId, 1, 20)).resolves.toMatchObject({ total: 0, items: [] });
  });

  it("removes idempotently", async () => {
    await expect(service.remove(guestId, eventId)).resolves.toEqual({ eventId, favorited: false });
    await expect(service.remove(guestId, eventId)).resolves.toEqual({ eventId, favorited: false });
    await expect(service.list(guestId, 1, 20)).resolves.toMatchObject({ total: 0, items: [] });
  });
});
