import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import type { Clock } from "./tables.constants.js";
import { TablesService } from "./tables.service.js";

const organizerA = randomUUID();
const organizerB = randomUUID();
const eventId = randomUUID();
const layoutId = randomUUID();
const orderIds: string[] = [];

class FakeClock implements Clock {
  constructor(public current = new Date()) {}
  now(): Date { return new Date(this.current); }
  advance(milliseconds: number): void { this.current = new Date(this.current.getTime() + milliseconds); }
}

const clock = new FakeClock();
const service = new TablesService(prisma, new DomainEventsService(), { holdTtlSeconds: 600, cleanupIntervalSeconds: 60 }, clock);

beforeAll(async () => {
  const base = BigInt(Date.now()) * 100_000n;
  await prisma.user.createMany({ data: [
    { id: organizerA, telegramId: base + 901n, role: "organizer" },
    { id: organizerB, telegramId: base + 902n, role: "organizer" },
  ] });
  await prisma.event.create({ data: {
    id: eventId, organizerId: organizerA, title: "Venue safety", date: new Date("2027-06-01T00:00:00Z"),
    time: new Date("1970-01-01T19:00:00Z"), timezone: "Asia/Almaty", venueName: "Зал", address: "Адрес", status: "published",
  } });
  await prisma.venueLayout.create({ data: {
    id: layoutId, eventId, templateName: "Main", layoutJson: { version: 1, canvas: { width: 800, height: 600 }, tables: [] },
  } });
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [organizerA, organizerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerA, organizerB] } } });
  await prisma.$disconnect();
});

describe("TablesService", () => {
  it("enforces ownership, managed states, unique numbers, and transactional table CRUD", async () => {
    const table = await createTable(1);
    expect(table).toMatchObject({ status: "available", currency: "KZT", seats: 6 });
    await expect(service.get(organizerB, table.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(organizerB, table.id, { name: "Чужой" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete(organizerB, table.id)).rejects.toBeInstanceOf(NotFoundException);
    const mutationCount = await prisma.outboxEvent.count({ where: { aggregateType: "table", payload: { path: ["layoutId"], equals: layoutId } } });
    await expect(createTable(1)).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.outboxEvent.count({ where: { aggregateType: "table", payload: { path: ["layoutId"], equals: layoutId } } })).resolves.toBe(mutationCount);
    await expect(service.update(organizerA, table.id, { status: "held" } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(organizerA, table.id, { status: "unavailable" })).resolves.toMatchObject({ status: "unavailable" });
    await expect(service.update(organizerA, table.id, { status: "available", price: 1_000 })).resolves.toMatchObject({ status: "available", price: 1_000 });
    const layout = await prisma.venueLayout.findUniqueOrThrow({ where: { id: layoutId } });
    expect((layout.layoutJson as { tables: unknown[] }).tables).toHaveLength(1);
    await expect(service.delete(organizerA, table.id)).resolves.toEqual({ deleted: true, id: table.id });
    await expect(prisma.outboxEvent.count({ where: { aggregateType: "table", aggregateId: table.id } })).resolves.toBe(4);
    await expect(prisma.auditLog.count({ where: { entityType: "table", entityId: table.id } })).resolves.toBe(4);
  });

  it("allows exactly one of 20 concurrent PostgreSQL-authoritative holds and keeps retries idempotent", async () => {
    const table = await createTable(20);
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => service.hold(table.id, `request-${randomUUID()}-${index}`)));
    const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
    const failures = attempts.filter((attempt) => attempt.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(19);
    for (const failure of failures) {
      if (failure.status !== "rejected") continue;
      expect((failure.reason as ConflictException).getResponse()).toMatchObject({ code: "TABLE_UNAVAILABLE" });
    }
    const winner = successes[0];
    if (winner?.status !== "fulfilled") throw new Error("winner missing");
    const hold = await prisma.tableHold.findUniqueOrThrow({ where: { token: winner.value.holdToken } });
    await expect(service.hold(table.id, hold.requestKey)).resolves.toEqual(winner.value);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: table.id, eventType: "table.hold_created" } })).resolves.toBe(1);
    await expect(service.update(organizerA, table.id, { name: "Blocked" })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.delete(organizerA, table.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.release(table.id, "not-the-winning-hold-token-value")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reclaims expiry lazily and through bounded cleanup without Redis or real-time waiting", async () => {
    const lazy = await createTable(30);
    await service.hold(lazy.id, `lazy-${randomUUID()}`);
    clock.advance(601_000);
    await expect(service.get(organizerA, lazy.id)).resolves.toMatchObject({ status: "available", holdExpiresAt: null });

    const cleanup = await createTable(31);
    await service.hold(cleanup.id, `cleanup-${randomUUID()}`);
    clock.advance(601_000);
    await expect(service.expireDueHolds(100)).resolves.toBeGreaterThanOrEqual(1);
    await expect(service.get(organizerA, cleanup.id)).resolves.toMatchObject({ status: "available" });
  });

  it("expires a pending booking on release and makes repeated release stable", async () => {
    const table = await createTable(40);
    const hold = await service.hold(table.id, `release-${randomUUID()}`);
    const orderId = await createOrder();
    await prisma.booking.create({ data: { tableId: table.id, orderId } });
    await expect(service.release(table.id, hold.holdToken)).resolves.toMatchObject({ released: true, status: "released" });
    await expect(service.release(table.id, hold.holdToken)).resolves.toMatchObject({ released: true, status: "released" });
    await expect(prisma.booking.findUniqueOrThrow({ where: { orderId } })).resolves.toMatchObject({ status: "expired" });
    await expect(prisma.outboxEvent.count({ where: { aggregateId: table.id, eventType: "table.hold_released" } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { entityType: "table", entityId: table.id, action: "table.hold_released" } })).resolves.toBe(1);
  });

  it("confirms internally, stays booked past expiry, and is idempotent for the same order", async () => {
    const table = await createTable(50);
    const hold = await service.hold(table.id, `confirm-${randomUUID()}`);
    const orderId = await createOrder();
    await prisma.booking.create({ data: { tableId: table.id, orderId } });
    await expect(service.confirm(table.id, hold.holdToken, orderId)).resolves.toMatchObject({ status: "booked" });
    await expect(service.confirm(table.id, hold.holdToken, orderId)).resolves.toMatchObject({ status: "booked" });
    clock.advance(601_000);
    await service.expireDueHolds(100);
    await expect(service.get(organizerA, table.id)).resolves.toMatchObject({ status: "booked" });
    await expect(service.hold(table.id, `new-${randomUUID()}`)).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: table.id, eventType: "table.booking_confirmed" } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { entityType: "table", entityId: table.id, action: "table.booking_confirmed" } })).resolves.toBe(1);
  });

  it("serializes concurrent confirm/release into one valid final state", async () => {
    const table = await createTable(60);
    const hold = await service.hold(table.id, `race-${randomUUID()}`);
    const orderId = await createOrder();
    await prisma.booking.create({ data: { tableId: table.id, orderId } });
    const attempts = await Promise.allSettled([
      service.confirm(table.id, hold.holdToken, orderId),
      service.release(table.id, hold.holdToken),
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const [storedTable, booking] = await Promise.all([
      prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
      prisma.booking.findUniqueOrThrow({ where: { orderId } }),
    ]);
    expect([["booked", "confirmed"], ["available", "expired"]]).toContainEqual([storedTable.status, booking.status]);
  });
});

async function createTable(number: number) {
  return service.create(organizerA, layoutId, {
    number, name: `Стол ${number}`, seats: 6, price: 0, deposit: 500_000,
    geometry: { x: 20 + number, y: 20 + number, width: 80, height: 60 },
  });
}

async function createOrder(): Promise<string> {
  const id = randomUUID();
  orderIds.push(id);
  await prisma.order.create({ data: { id, type: "table", amount: 500_000, currency: "KZT" } });
  return id;
}
