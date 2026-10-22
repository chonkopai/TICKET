import { randomUUID } from "node:crypto";
import { prisma } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PublicEventsService } from "./public-events.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { TablesService } from "../tables/tables.service.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";

const ownerId = randomUUID(), ids = Array.from({ length: 25 }, () => randomUUID());
const domainEvents = new DomainEventsService();
const service = new PublicEventsService(prisma, new TicketTypesService(prisma, domainEvents), new TablesService(prisma, domainEvents, { holdTtlSeconds: 60, cleanupIntervalSeconds: 60 }, { now: () => new Date() }));
beforeAll(async () => {
  await prisma.user.create({ data: { id: ownerId, role: "organizer" } });
  await prisma.event.createMany({ data: ids.map((id, index) => ({
    id, organizerId: ownerId, title: `Catalog fixture ${index}`, status: "published", countryCode: index < 3 ? "KZ" : "RU", city: index < 3 ? "Алматы" : "Москва", category: index % 2 ? "music" : "theatre", address: "Test venue",
    date: new Date(Date.UTC(2035, 0, index + 1)), time: new Date("1970-01-01T18:00:00Z"), timezone: "UTC",
    publishedAt: new Date(Date.UTC(2034, 0, 25 - index)),
  })) });
});
afterAll(async () => {
  await prisma.event.deleteMany({ where: { organizerId: ownerId } });
  await prisma.user.delete({ where: { id: ownerId } });
  await prisma.$disconnect();
});

describe("catalogue priority and complete pagination", () => {
  it("shows country matches before every remaining event in chronological order", async () => {
    const page = await service.list({ page: 1, limit: 5, sort: "soonest", countryCode: "KZ", includeRemaining: true });
    expect(page).toMatchObject({ total: 25, matchingTotal: 3, hasNext: true });
    expect(page.items.map(item => item.id)).toEqual(ids.slice(0, 5));
  });
  it("keeps all filters for the first group and includes the nonmatching tail once", async () => {
    const page = await service.list({ page: 1, limit: 5, sort: "soonest", countryCode: "KZ", category: "music", includeRemaining: true });
    expect(page.matchingTotal).toBe(1);
    expect(page.items.map(item => item.id)).toEqual([ids[1], ids[0], ids[2], ids[3], ids[4]]);
  });
  it("shows chronological alternatives even when no event matches", async () => {
    const page = await service.list({ page: 1, limit: 5, sort: "popular", search: "no-match-here", includeRemaining: true });
    expect(page).toMatchObject({ matchingTotal: 0, total: 25 });
    expect(page.items.map(item => item.id)).toEqual(ids.slice(0, 5));
  });
  it("all countries includes every event across pages with an accurate final-page state", async () => {
    const pages = await Promise.all([1, 2, 3].map(page => service.list({ page, limit: 10, sort: "soonest", includeRemaining: true })));
    expect(pages.map(page => page.items.length)).toEqual([10, 10, 5]);
    expect(pages.map(page => page.hasNext)).toEqual([true, true, false]);
    expect(pages.flatMap(page => page.items.map(item => item.id))).toEqual(ids);
    expect(pages.every(page => page.matchingTotal === 25 && page.total === 25)).toBe(true);
  });
  it("paginates across the boundary without repeating matches on later pages", async () => {
    const pages = await Promise.all([1, 2, 3].map(page => service.list({ page, limit: 10, sort: "popular", countryCode: "KZ", includeRemaining: true })));
    const items = pages.flatMap(page => page.items);
    expect(new Set(items.map(item => item.id)).size).toBe(25);
    expect(items.slice(0, 3).every(item => item.countryCode === "KZ")).toBe(true);
    expect(items.slice(3).map(item => item.id)).toEqual(ids.slice(3));
  });
  it("keeps strict filtering for API consumers that do not request catalogue alternatives", async () => {
    const page = await service.list({ page: 1, limit: 10, sort: "soonest", countryCode: "KZ" });
    expect(page.total).toBe(3);
    expect(page.items.map(item => item.id)).toEqual(ids.slice(0, 3));
  });
});
