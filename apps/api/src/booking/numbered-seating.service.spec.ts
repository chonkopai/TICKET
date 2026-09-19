import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { PaymentService } from "../payments/payment.service.js";
import { TablesService } from "../tables/tables.service.js";
import { SeatsService } from "../seats/seats.service.js";
import { TicketsService } from "../tickets/tickets.service.js";
import type { BookingClock } from "./booking.constants.js";
import { BookingService } from "./booking.service.js";
import { DevelopmentPaymentProvider } from "./payment-provider.js";

// Reuse the seeded organizer so this file does not perturb other database-backed
// suites that assert the global user count while Vitest runs files in parallel.
const organizerId = "00000000-0000-4000-8000-000000000001";
const guestId = organizerId;
const eventId = randomUUID();
const layoutId = randomUUID();

class FixedClock implements BookingClock {
  now(): Date { return new Date("2031-01-01T12:00:00.000Z"); }
}

const clock = new FixedClock();
const events = new DomainEventsService();
const tables = new TablesService(prisma, events, { holdTtlSeconds: 600, cleanupIntervalSeconds: 60 }, clock);
const seats = new SeatsService(prisma, events, tables);
const provider = new DevelopmentPaymentProvider("http://localhost:3000", "numbered-seating-test-secret", 300, () => clock.now());
const payments = new PaymentService(prisma, provider, events, clock);
const booking = new BookingService(prisma, undefined as never, tables, events, { checkoutTtlSeconds: 900, cleanupIntervalSeconds: 60 }, clock, payments);
const wallet = { isConfigured: () => false, generate: async () => Buffer.alloc(0) };
const tickets = new TicketsService(prisma, events, wallet);

beforeAll(async () => {
  await prisma.user.findUniqueOrThrow({ where: { id: organizerId } });
  await prisma.event.create({ data: {
    id: eventId,
    organizerId,
    title: "Numbered seating test",
    category: "music",
    city: "Алматы",
    date: new Date("2031-02-01T00:00:00.000Z"),
    time: new Date("1970-01-01T18:00:00.000Z"),
    timezone: "Asia/Almaty",
    venueName: "Test hall",
    address: "Test address",
    status: "draft",
    paymentMode: "full_payment",
    showFullAmountForDeposit: false,
  } });
  await prisma.venueLayout.create({ data: { id: layoutId, eventId, templateName: "Numbered", layoutJson: { version: 1, canvas: { width: 900, height: 600 }, tables: [] } } });
});

afterAll(async () => {
  await prisma.order.deleteMany({ where: { buyerUserId: guestId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.idempotencyRecord.deleteMany({ where: { userId: guestId } });
});

describe("numbered seating", () => {
  it("keeps numeric seat numbers local to a parent and duplicates structures with fresh IDs", async () => {
    const draftEventId = randomUUID();
    const draftLayoutId = randomUUID();
    const mutationIds: string[] = [];
    await prisma.event.create({ data: {
      id: draftEventId,
      organizerId,
      title: "Seating editor test",
      category: "music",
      city: "Алматы",
      date: new Date("2031-03-01T00:00:00.000Z"),
      time: new Date("1970-01-01T18:00:00.000Z"),
      timezone: "Asia/Almaty",
      venueName: "Editor hall",
      address: "Editor address",
      status: "draft",
      paymentMode: "full_payment",
      showFullAmountForDeposit: false,
    } });
    await prisma.venueLayout.create({ data: {
      id: draftLayoutId,
      eventId: draftEventId,
      templateName: "Editor",
      layoutJson: { version: 2, room: { widthM: 20, heightM: 14 }, stage: null, tables: [], rows: [] },
    } });

    try {
      const table = await tables.create(organizerId, draftLayoutId, {
        number: 1,
        seats: 2,
        price: 25_000,
        deposit: 0,
        typeLabel: "VIP",
        shortDescription: "Лучший обзор сцены",
        saleMode: "per_seat",
        geometry: { x: 1, y: 1, width: 1.2, height: 1.2, shape: "square", preset: "two", seats: [{ number: 1, x: 25, y: 0, side: "top" }, { number: 2, x: 75, y: 100, side: "bottom" }] },
      });
      mutationIds.push(table.id);
      const originalSeats = await seats.createForTable(organizerId, table.id, { numbers: [1, 2] });
      await expect(seats.createForTable(organizerId, table.id, { numbers: [2] })).rejects.toMatchObject({ response: { code: "SEAT_NUMBER_EXISTS" } });

      const tableCopy = await seats.duplicateTable(organizerId, table.id);
      mutationIds.push(tableCopy.table!.id);
      expect(tableCopy.table).toMatchObject({ number: 2, typeLabel: "VIP", shortDescription: "Лучший обзор сцены", price: 25_000, saleMode: "per_seat" });
      expect(tableCopy.table?.seatRecords?.map(({ number }) => number)).toEqual([1, 2]);
      expect(tableCopy.table?.seatRecords?.map(({ id }) => id)).not.toEqual(originalSeats.map(({ id }) => id));
      expect(await prisma.seatAllocation.count({ where: { seat: { tableId: tableCopy.table!.id } } })).toBe(0);

      const row = await seats.createRow(organizerId, draftLayoutId, {
        number: 1,
        typeLabel: "Standard",
        shortDescription: "Центральный ряд",
        price: 10_000,
        deposit: 0,
        seatCount: 3,
        startSeatNumber: 10,
        geometry: { x: 1, y: 5, width: 5, height: 1, rotation: 0, seatSpacing: 0.15 },
      });
      mutationIds.push(row.id);
      const rowCopy = await seats.duplicateRow(organizerId, row.id);
      mutationIds.push(rowCopy.row!.id);
      expect(rowCopy.row).toMatchObject({ number: 2, typeLabel: "Standard", price: 10_000 });
      expect(rowCopy.row?.seats.map(({ number }) => number)).toEqual([10, 11, 12]);
      expect(rowCopy.row?.seats.map(({ id }) => id)).not.toEqual(row.seats.map(({ id }) => id));
    } finally {
      await prisma.event.delete({ where: { id: draftEventId } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: mutationIds } } });
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: mutationIds } } });
    }
  });

  it("allocates one seat from twenty concurrent requests", async () => {
    const table = await tables.create(organizerId, layoutId, { number: 1, seats: 3, price: 12_000, deposit: 0, saleMode: "per_seat", geometry: { x: 20, y: 20, width: 60, height: 60 } });
    const created = await seats.createForTable(organizerId, table.id, { numbers: [1, 2, 3] });
    await prisma.event.update({ where: { id: eventId }, data: { status: "published" } });
    const seatId = created[0]!.id;
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => booking.checkoutSeats(guestId, `seat-race-${index}-${randomUUID()}`, { seatIds: [seatId], termsAccepted: true })));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(19);
    expect(await prisma.seatAllocation.count({ where: { seatId, status: "active" } })).toBe(1);
  });

  it("allows independent seats, rejects mixed unavailable selections, and creates a whole-table group pass", async () => {
    const perSeatTable = await prisma.table.findFirstOrThrow({ where: { venueLayoutId: layoutId, saleMode: "per_seat" } });
    const perSeat = await prisma.seat.findMany({ where: { tableId: perSeatTable.id }, orderBy: { sortOrder: "asc" } });
    const second = await booking.checkoutSeats(guestId, `seat-second-${randomUUID()}`, { seatIds: [perSeat[1]!.id], termsAccepted: true });
    expect(second.ticketIds).toHaveLength(1);
    await expect(booking.checkoutSeats(guestId, `seat-mixed-${randomUUID()}`, { seatIds: [perSeat[0]!.id, perSeat[1]!.id], termsAccepted: true })).rejects.toMatchObject({ response: { code: "SEAT_UNAVAILABLE" } });
    await expect(booking.checkoutTable(guestId, `whole-on-per-seat-${randomUUID()}`, { tableId: perSeatTable.id, termsAccepted: true })).rejects.toMatchObject({ response: { code: "TABLE_REQUIRES_SEAT_SELECTION" } });

    const whole = await tables.create(organizerId, layoutId, { number: 2, seats: 4, price: 100_000, deposit: 0, geometry: { x: 120, y: 20, width: 80, height: 60 } });
    const checkout = await booking.checkoutTable(guestId, `whole-${randomUUID()}`, { tableId: whole.id, termsAccepted: true });
    expect(checkout.ticketIds).toHaveLength(4);
    expect(checkout.groupPassId).toBeTruthy();
    expect(checkout.amountDue).toBe(100_000);
    const before = await prisma.ticketType.findFirstOrThrow({ where: { name: { startsWith: "__table_admission:" }, eventId } });
    await booking.settleSucceeded(checkout.orderId);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: before.id } })).quantitySold).toBe(0);
    const group = await prisma.groupPass.findUniqueOrThrow({ where: { orderId: checkout.orderId } });
    const child = await prisma.ticket.findFirstOrThrow({ where: { orderId: checkout.orderId } });
    await expect(tickets.useByQrToken(organizerId, child.qrToken)).resolves.toMatchObject({ ticket: { status: "used" } });
    await expect(tickets.useGroupPass(organizerId, group.token, true)).resolves.toMatchObject({ admitted: 3, remaining: 0, status: "used" });
    await expect(tickets.useGroupPass(organizerId, group.token, true)).rejects.toMatchObject({ response: { code: "ALREADY_USED" } });
    const used = await prisma.ticket.count({ where: { orderId: checkout.orderId, status: "used" } });
    expect(used).toBe(4);
  });
});
