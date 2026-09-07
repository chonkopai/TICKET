import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import type { CreateEventRequest } from "@event-platform/shared-types";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { EventsService } from "./events.service.js";
import type { ObjectStorage, PutPosterInput, UploadedPoster } from "./object-storage.js";

const organizerA = randomUUID();
const organizerB = randomUUID();
const eventIds: string[] = [];

class MemoryStorage implements ObjectStorage {
  readonly stored: string[] = [];
  readonly deleted: string[] = [];

  async putPoster(input: PutPosterInput): Promise<{ key: string; url: string }> {
    const key = `${randomUUID()}.${input.extension}`;
    this.stored.push(key);
    return { key, url: `/media/posters/${key}` };
  }

  async readPoster(): Promise<{ body: Buffer; contentType: string }> {
    return { body: Buffer.alloc(0), contentType: "image/png" };
  }

  async deletePoster(key: string): Promise<void> {
    this.deleted.push(key);
  }
}

class ToggleDomainEvents extends DomainEventsService {
  fail = false;

  override append(...parameters: Parameters<DomainEventsService["append"]>): Promise<unknown> {
    if (this.fail) return Promise.reject(new Error("simulated outbox failure"));
    return super.append(...parameters);
  }
}

beforeAll(async () => {
  const telegramBase = BigInt(Date.now()) * 10_000n;
  await prisma.user.createMany({
    data: [
      { id: organizerA, telegramId: telegramBase + 301n, role: "organizer", name: "Организатор A" },
      { id: organizerB, telegramId: telegramBase + 302n, role: "organizer", name: "Организатор B" },
    ],
  });
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { organizerId: { in: [organizerA, organizerB] } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: eventIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [organizerA, organizerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerA, organizerB] } } });
  await prisma.$disconnect();
});

describe("EventsService", () => {
  it("covers owned CRUD, pagination, posters, and one audit/outbox pair per mutation", async () => {
    const storage = new MemoryStorage();
    const serviceA = new EventsService(prisma, storage, new DomainEventsService());
    const serviceB = new EventsService(prisma, storage, new DomainEventsService());
    const created = await serviceA.create(organizerA, completeInput());
    eventIds.push(created.id);

    expect(created).toMatchObject({
      organizerId: organizerA,
      date: "2027-03-21",
      time: "19:30",
      timezone: "Asia/Almaty",
      status: "draft",
    });
    await expect(serviceA.get(organizerA, created.id)).resolves.toEqual(created);
    await expect(serviceA.list(organizerA, { page: 1, limit: 1 })).resolves.toMatchObject({
      page: 1,
      limit: 1,
      total: 1,
      hasNext: false,
      items: [{ id: created.id }],
    });

    await serviceA.update(organizerA, created.id, {
      announcement: "Обновлённый анонс",
      time: "20:15",
    });
    await expect(serviceB.get(organizerB, created.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      serviceB.update(organizerB, created.id, { title: "Чужое изменение" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(serviceB.deleteDraft(organizerB, created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const firstPoster = await serviceA.replacePoster(organizerA, created.id, pngPoster());
    const firstKey = storage.stored[0];
    expect(firstPoster.posterUrl).toBe(`/media/posters/${firstKey}`);
    const secondPoster = await serviceA.replacePoster(organizerA, created.id, pngPoster());
    expect(secondPoster.posterUrl).toBe(`/media/posters/${storage.stored[1]}`);
    expect(storage.deleted).toContain(firstKey);
    await expect(serviceA.removePoster(organizerA, created.id)).resolves.toMatchObject({
      posterUrl: null,
    });
    expect(storage.deleted).toContain(storage.stored[1]);

    await expect(serviceA.deleteDraft(organizerA, created.id)).resolves.toEqual({
      deleted: true,
      id: created.id,
    });
    await expect(serviceA.get(organizerA, created.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(mutationCounts(created.id)).resolves.toEqual({ outbox: 6, audit: 6 });
  });

  it("validates publication and enforces one-way lifecycle transitions", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const incomplete = await service.create(organizerA, {
      ...completeInput(),
      description: null,
      cancellationTerms: null,
    });
    eventIds.push(incomplete.id);

    await expect(service.publish(organizerA, incomplete.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(mutationCounts(incomplete.id)).resolves.toEqual({ outbox: 1, audit: 1 });
    await service.update(organizerA, incomplete.id, {
      description: "Полное описание",
      cancellationTerms: "Возврат до начала мероприятия.",
    });
    await expect(service.publish(organizerA, incomplete.id)).resolves.toMatchObject({
      status: "published",
    });
    await expect(service.update(organizerA, incomplete.id, { paymentMode: "full_payment" })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.deleteDraft(organizerA, incomplete.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.cancel(organizerA, incomplete.id)).resolves.toMatchObject({
      status: "cancelled",
    });
    await expect(service.complete(organizerA, incomplete.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(mutationCounts(incomplete.id)).resolves.toEqual({ outbox: 4, audit: 4 });

    const completable = await service.create(organizerA, completeInput());
    eventIds.push(completable.id);
    await service.publish(organizerA, completable.id);
    await expect(service.complete(organizerA, completable.id)).resolves.toMatchObject({
      status: "completed",
    });
    await expect(service.cancel(organizerA, completable.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(mutationCounts(completable.id)).resolves.toEqual({ outbox: 3, audit: 3 });
  });

  it("normalizes city and records category/city edits", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const created = await service.create(organizerA, { ...completeInput(), category: "music", city: "  Астана  " });
    eventIds.push(created.id);
    expect(created).toMatchObject({ category: "music", city: "Астана" });
    const updated = await service.update(organizerA, created.id, { category: "business", city: "  Алматы  " });
    expect(updated).toMatchObject({ category: "business", city: "Алматы" });
    await expect(mutationCounts(created.id)).resolves.toEqual({ outbox: 2, audit: 2 });
  });

  it("rolls back the poster URL and preserves the old object when outbox persistence fails", async () => {
    const storage = new MemoryStorage();
    const domainEvents = new ToggleDomainEvents();
    const service = new EventsService(prisma, storage, domainEvents);
    const event = await service.create(organizerA, completeInput());
    eventIds.push(event.id);
    const first = await service.replacePoster(organizerA, event.id, pngPoster());
    const firstKey = storage.stored[0];

    domainEvents.fail = true;
    await expect(service.replacePoster(organizerA, event.id, pngPoster())).rejects.toThrow(
      "simulated outbox failure",
    );
    expect(storage.deleted).toContain(storage.stored[1]);
    expect(storage.deleted).not.toContain(firstKey);
    await expect(service.get(organizerA, event.id)).resolves.toMatchObject({
      posterUrl: first.posterUrl,
    });
    await expect(mutationCounts(event.id)).resolves.toEqual({ outbox: 2, audit: 2 });
  });

  it("rejects a file whose declared MIME type does not match its content", async () => {
    const storage = new MemoryStorage();
    const service = new EventsService(prisma, storage, new DomainEventsService());
    const event = await service.create(organizerA, completeInput());
    eventIds.push(event.id);
    const mismatch = { ...pngPoster(), mimetype: "image/jpeg" };

    await expect(service.replacePoster(organizerA, event.id, mismatch)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.stored).toHaveLength(0);
    await expect(mutationCounts(event.id)).resolves.toEqual({ outbox: 1, audit: 1 });
  });

  it("rejects an impossible venue-local calendar date before persistence", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    await expect(
      service.create(organizerA, { ...completeInput(), date: "2027-02-31" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function completeInput(): CreateEventRequest {
  return {
    title: "Весенний фестиваль",
    category: "festival",
    city: "Алматы",
    date: "2027-03-21",
    time: "19:30",
    timezone: "Asia/Almaty",
    venueName: "Большой зал",
    address: "проспект Абая, 10",
    announcement: "Один вечер музыки и новых знакомств.",
    description: "Полное описание мероприятия.",
    program: "19:30 — открытие; 20:00 — концерт.",
    rules: "Вход по билету.",
    visitTerms: "Необходимо иметь документ.",
    cancellationTerms: "Возврат доступен до начала мероприятия.",
    paymentMode: "deposit",
    showFullAmountForDeposit: true,
    depositTerms: "Депозит засчитывается в счёт заказа.",
    extraConditions: "18+",
  };
}

function pngPoster(): UploadedPoster {
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    buffer,
    mimetype: "image/png",
    originalname: "poster.png",
    size: buffer.byteLength,
  };
}

async function mutationCounts(id: string): Promise<{ outbox: number; audit: number }> {
  const [outbox, audit] = await Promise.all([
    prisma.outboxEvent.count({ where: { aggregateId: id, aggregateType: "event" } }),
    prisma.auditLog.count({ where: { entityId: id, entityType: "event" } }),
  ]);
  return { outbox, audit };
}
