import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TicketTypesService } from "./ticket-types.service.js";

const organizerA = randomUUID();
const organizerB = randomUUID();
const eventA = randomUUID();
const eventB = randomUUID();

beforeAll(async () => {
  const telegramBase = BigInt(Date.now()) * 100_000n;
  await prisma.user.createMany({
    data: [
      { id: organizerA, telegramId: telegramBase + 401n, role: "organizer" },
      { id: organizerB, telegramId: telegramBase + 402n, role: "organizer" },
    ],
  });
  await prisma.event.createMany({
    data: [eventData(eventA, organizerA, "A"), eventData(eventB, organizerB, "B")],
  });
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { id: { in: [eventA, eventB] } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [organizerA, organizerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerA, organizerB] } } });
  await prisma.$disconnect();
});

describe("TicketTypesService", () => {
  it("supports owned CRUD, pagination, validation, counters and transactional records", async () => {
    const service = new TicketTypesService(prisma, new DomainEventsService());
    const created = await service.create(organizerA, eventA, {
      name: "VIP",
      price: 500_000,
      quantityTotal: 10,
      description: "Первый ряд",
      status: "draft",
    });
    expect(created).toMatchObject({ currency: "KZT", counters: { total: 10, remaining: 10 } });
    await expect(service.create(organizerA, eventA, {
      name: "VIP",
      price: 0,
      quantityTotal: 1,
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.list(organizerA, eventA, { page: 1, limit: 1 })).resolves.toMatchObject({
      items: [{ id: created.id }], page: 1, limit: 1, total: 1, hasNext: false,
    });
    await expect(service.get(organizerB, created.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(organizerB, created.id, { name: "Чужой" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete(organizerB, created.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(organizerA, created.id, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(organizerA, eventA, {
      name: "Broken window",
      price: 0,
      quantityTotal: 1,
      salesStartAt: "2027-03-22T00:00:00.000Z",
      salesEndAt: "2027-03-21T00:00:00.000Z",
    })).rejects.toBeInstanceOf(BadRequestException);

    const updated = await service.update(organizerA, created.id, { name: "VIP Plus", status: "active" });
    expect(updated).toMatchObject({ name: "VIP Plus", status: "active" });
    await expect(service.delete(organizerA, created.id)).resolves.toEqual({ deleted: true, id: created.id });
    await expect(mutationCounts(created.id)).resolves.toEqual({ outbox: 3, audit: 3 });
  });

  it("serializes 20 concurrent reservations so one remaining unit is sold once", async () => {
    const service = new TicketTypesService(prisma, new DomainEventsService());
    const type = await service.create(organizerA, eventA, {
      name: `Concurrent ${randomUUID()}`,
      price: 100_000,
      quantityTotal: 1,
      status: "active",
    });
    const expiry = new Date(Date.now() + 10 * 60_000);
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => service.reserve(type.id, 1, expiry)),
    );
    const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
    const failures = attempts.filter((attempt) => attempt.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(19);
    expect(failures.every((attempt) => attempt.reason instanceof ConflictException)).toBe(true);
    await expect(prisma.outboxEvent.count({
      where: { aggregateType: "ticket_type", aggregateId: type.id, eventType: "ticket_inventory.reserved" },
    })).resolves.toBe(1);

    const reserved = await service.get(organizerA, type.id);
    expect(reserved.counters).toMatchObject({ reserved: 1, remaining: 0, sold: 0 });
    await expect(service.update(organizerA, type.id, { quantityTotal: 0 })).rejects.toBeInstanceOf(ConflictException);

    const reservation = successes[0];
    if (reservation?.status !== "fulfilled") throw new Error("reservation missing");
    await service.release(reservation.value.token);
    await expect(service.get(organizerA, type.id)).resolves.toMatchObject({
      counters: { reserved: 0, remaining: 1 },
    });
    await expect(service.release(reservation.value.token)).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.outboxEvent.count({
      where: { aggregateType: "ticket_type", aggregateId: type.id },
    })).resolves.toBe(3);
    await expect(service.delete(organizerA, type.id)).rejects.toBeInstanceOf(ConflictException);
  });
});

function eventData(id: string, organizerId: string, suffix: string) {
  return {
    id,
    organizerId,
    title: `Event ${suffix}`,
    date: new Date("2027-03-21T00:00:00.000Z"),
    time: new Date("1970-01-01T19:30:00.000Z"),
    timezone: "Asia/Almaty",
    venueName: "Зал",
    address: "Адрес",
    status: "published" as const,
  };
}

async function mutationCounts(id: string): Promise<{ outbox: number; audit: number }> {
  const [outbox, audit] = await Promise.all([
    prisma.outboxEvent.count({ where: { aggregateType: "ticket_type", aggregateId: id } }),
    prisma.auditLog.count({ where: { entityType: "ticket_type", entityId: id } }),
  ]);
  return { outbox, audit };
}
