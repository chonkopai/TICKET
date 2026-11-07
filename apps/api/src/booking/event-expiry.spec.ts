import { randomUUID } from "node:crypto";
import { prisma } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { PublicEventsService } from "../public-events/public-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { BookingService } from "./booking.service.js";
import { CheckoutEmailService } from "./checkout-email.service.js";

const ownerId = randomUUID(), buyerId = randomUUID();
const now = new Date("2030-01-02T00:00:00Z");
const clock = { now: () => new Date(now) };
const domain = new DomainEventsService();
const types = new TicketTypesService(prisma, domain);
const tables = new TablesService(prisma, domain, { holdTtlSeconds: 600, cleanupIntervalSeconds: 60 }, clock);
const booking = new BookingService(prisma, types, tables, domain, { checkoutTtlSeconds: 900, cleanupIntervalSeconds: 60 }, clock, {} as never, new CheckoutEmailService({} as never));
const catalog = new PublicEventsService(prisma, types, tables);
const ids = Array.from({ length: 4 }, () => randomUUID());
let freeId: string, paidId: string, seatId: string, tableId: string, overnightType: string;

beforeAll(async () => {
  await prisma.user.createMany({ data: [{ id: ownerId, role: "organizer" }, { id: buyerId, role: "guest" }] });
  const common = { organizerId: ownerId, status: "published" as const, countryCode: "RU", category: "music" as const, address: "Fixture venue", timezone: "Europe/Moscow", date: new Date("2030-01-01T00:00:00Z"), time: new Date("1970-01-01T23:00:00Z") };
  await prisma.event.createMany({ data: [
    // Canonical event ended at exactly `now`.
    { ...common, id: ids[0]!, title: "Expiry ended", city: "Expired city", startsAt: new Date("2030-01-01T20:00:00Z"), endsAt: now },
    // No canonical timestamp: 23:00 Moscow is already past at UTC midnight.
    { ...common, id: ids[1]!, title: "Expiry legacy", city: "Expired city" },
    // Starts yesterday in Moscow but continues until 04:00 local time.
    { ...common, id: ids[2]!, title: "Expiry overnight", city: "Current city", startsAt: new Date("2030-01-01T20:00:00Z"), endsAt: new Date("2030-01-02T01:00:00Z") },
    { ...common, id: ids[3]!, title: "Expiry future", city: "Current city", date: new Date("2030-01-03T00:00:00Z") },
  ] });
  const free = await prisma.ticketType.create({ data: { eventId: ids[0]!, name: "Free", price: 0, currency: "KZT", quantityTotal: 20, status: "active" } });
  freeId = free.id;
  paidId = (await prisma.ticketType.create({ data: { eventId: ids[0]!, name: "Paid", price: 1000, currency: "KZT", quantityTotal: 20, status: "active" } })).id;
  overnightType = (await prisma.ticketType.create({ data: { eventId: ids[2]!, name: "Ongoing free", price: 0, currency: "KZT", quantityTotal: 20, status: "active" } })).id;
  const layout = await prisma.venueLayout.create({ data: { eventId: ids[0]!, templateName: "Expiry hall", layoutJson: { version: 1, canvas: { width: 800, height: 600 }, tables: [] } } });
  tableId = (await prisma.table.create({ data: { venueLayoutId: layout.id, number: 1, seats: 2, price: 1000, deposit: 0, currency: "KZT", saleMode: "whole_table" } })).id;
  seatId = (await prisma.seat.create({ data: { venueLayoutId: layout.id, ticketTypeId: paidId, number: 1, label: "Seat 1", sortOrder: 0 } })).id;
});

afterAll(async () => {
  await prisma.idempotencyRecord.deleteMany({ where: { userId: buyerId } });
  await prisma.order.deleteMany({ where: { buyerUserId: buyerId } });
  await prisma.event.deleteMany({ where: { organizerId: ownerId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [ownerId, buyerId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, buyerId] } } });
  await prisma.$disconnect();
});

const ended = { response: expect.objectContaining({ code: "EVENT_ENDED" }) };
describe("ended event registration", () => {
  it("rejects free registration, paid seats, carts and whole-table checkouts before creating orders", async () => {
    const count = await prisma.order.count({ where: { buyerUserId: buyerId } });
    await expect(booking.checkoutTickets(buyerId, randomUUID(), { ticketTypeId: freeId, quantity: 1, termsAccepted: true })).rejects.toMatchObject(ended);
    await expect(booking.checkoutCart(buyerId, randomUUID(), { eventId: ids[0]!, tickets: [{ ticketTypeId: freeId, quantity: 1 }], seatIds: [], termsAccepted: true })).rejects.toMatchObject(ended);
    await expect(booking.checkoutSeats(buyerId, randomUUID(), { seatIds: [seatId], termsAccepted: true })).rejects.toMatchObject(ended);
    await expect(booking.checkoutTable(buyerId, randomUUID(), { tableId, termsAccepted: true })).rejects.toMatchObject(ended);
    expect(await prisma.order.count({ where: { buyerUserId: buyerId } })).toBe(count);
  });

  it("rejects anonymous registration through the same cart guard", async () => {
    await expect(prisma.$transaction(transaction => booking.checkoutCart(randomUUID(), randomUUID(), {
      eventId: ids[0]!, tickets: [{ ticketTypeId: freeId, quantity: 1 }], seatIds: [], termsAccepted: true,
    }, { transaction, guestContact: { name: "Guest" }, sessionId: randomUUID(), verifiedEmail: null }))).rejects.toMatchObject(ended);
  });

  it("rejects direct inventory reservations and table holds", async () => {
    await expect(prisma.$transaction(tx => types.reserveInTransaction(tx, freeId, 1, new Date(now.getTime() + 60000), undefined, now))).rejects.toMatchObject(ended);
    await expect(tables.hold(tableId, randomUUID())).rejects.toMatchObject(ended);
    expect(await prisma.ticketReservation.count({ where: { ticketTypeId: freeId } })).toBe(0);
    expect(await prisma.tableHold.count({ where: { tableId } })).toBe(0);
  });

  it("allows registration during an overnight event, then rejects it exactly at the end", async () => {
    const order = await booking.checkoutTickets(buyerId, randomUUID(), { ticketTypeId: overnightType, quantity: 1, termsAccepted: true });
    expect(order.amountDue).toBe(0);
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "active" } })).toBe(1);
    const original = new Date(now);
    try {
      now.setTime(Date.parse("2030-01-02T01:00:00Z"));
      await expect(booking.checkoutTickets(buyerId, randomUUID(), { ticketTypeId: overnightType, quantity: 1, termsAccepted: true })).rejects.toMatchObject(ended);
    } finally { now.setTime(original.getTime()); }
  });

  it.each(["recent", "soonest", "popular"] as const)("removes expired events before pagination and totals (%s)", async sort => {
    for (const includeRemaining of [false, true]) {
      const pages = await Promise.all([1, 2].map(page => catalog.list({ page, limit: 1, sort, includeRemaining, search: "Expiry" }, now)));
      expect(pages.map(page => page.total)).toEqual([2, 2]);
      expect(pages.map(page => page.hasNext)).toEqual([true, false]);
      expect(new Set(pages.flatMap(page => page.items.map(event => event.id)))).toEqual(new Set(ids.slice(2)));
    }
  });

  it("also filters SQL-paged listings, empty-match alternatives and location choices", async () => {
    expect((await catalog.list({ page: 1, limit: 20, sort: "recent" }, now)).total).toBe(2);
    const alternatives = await catalog.list({ page: 1, limit: 20, sort: "soonest", includeRemaining: true, search: "no-match" }, now);
    expect(alternatives).toMatchObject({ matchingTotal: 0, total: 2 });
    expect(await catalog.locations(now)).toEqual([{ countryCode: "RU", cities: ["Current city"] }]);
  });

  it("preserves direct historical event pages with timing and closed sale status", async () => {
    expect(await catalog.get(ids[0]!, now)).toMatchObject({ id: ids[0], startsAt: "2030-01-01T20:00:00.000Z", endsAt: now.toISOString() });
    expect(await catalog.summary(ids[0]!, now)).toMatchObject({ saleStatus: "sales_ended" });
  });
});
