import { randomUUID } from "node:crypto";

import { EventStatus, prisma } from "@event-platform/database";
import { NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import type { Clock } from "../tables/tables.constants.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { PublicEventsService } from "./public-events.service.js";

const organizerId = randomUUID();
const guestId = randomUUID();
const publishedId = randomUUID();
const hiddenIds = [randomUUID(), randomUUID(), randomUUID()];
const orderIds: string[] = [];
const now = new Date();
const clock: Clock = { now: () => now };
const domainEvents = new DomainEventsService();
const ticketTypes = new TicketTypesService(prisma, domainEvents);
const tables = new TablesService(prisma, domainEvents, { holdTtlSeconds: 60, cleanupIntervalSeconds: 60 }, clock);
const service = new PublicEventsService(prisma, ticketTypes, tables);

beforeAll(async () => {
  const telegramBase = BigInt(Date.now()) * 100_000n;
  await prisma.user.createMany({ data: [
    { id: organizerId, telegramId: telegramBase + 701n, role: "organizer", name: "Организатор", phone: "+77010000000", email: "private@example.com" },
    { id: guestId, telegramId: telegramBase + 702n, role: "guest", name: "Гость" },
  ] });
  await prisma.event.create({ data: {
    id: publishedId, organizerId, title: "Открытый концерт", category: "music", city: "Алматы", posterUrl: "https://example.com/poster.jpg", announcement: "Анонс", description: "Описание", program: "Программа", rules: "Правила", visitTerms: "Условия посещения", cancellationTerms: "Условия отмены", paymentMode: "deposit", showFullAmountForDeposit: true, depositTerms: "Депозит", extraConditions: "18+", date: new Date("2027-01-01T00:00:00.000Z"), time: new Date("1970-01-01T18:00:00.000Z"), timezone: "Asia/Almaty", venueName: "Зал", address: "Алматы", status: EventStatus.published,
  } });
  await prisma.event.createMany({ data: hiddenIds.map((id, index) => ({ ...eventData(id, `Скрытое ${index}`), status: [EventStatus.draft, EventStatus.cancelled, EventStatus.completed][index]! })) });

  const ticketType = await prisma.ticketType.create({ data: { eventId: publishedId, name: "Билет", price: 100_000, deposit: 25_000, currency: "KZT", quantityTotal: 2, status: "active" } });
  const ticketOrder = await prisma.order.create({ data: { type: "ticket", buyerUserId: guestId, amount: 100_000, currency: "KZT", paymentStatus: "paid" } });
  orderIds.push(ticketOrder.id);
  await prisma.ticket.create({ data: { ticketTypeId: ticketType.id, orderId: ticketOrder.id, ownerUserId: guestId, qrToken: `public-test-${randomUUID()}`, status: "active" } });

  const layout = await prisma.venueLayout.create({ data: { eventId: publishedId, templateName: "Зал", layoutJson: { version: 1, canvas: { width: 500, height: 500 }, tables: [] } } });
  const table = await prisma.table.create({ data: { venueLayoutId: layout.id, number: 1, name: "Стол", seats: 4, price: 200_000, deposit: 50_000, currency: "KZT", status: "available" } });
  const geometry = { version: 1, canvas: { width: 500, height: 500 }, tables: [{ tableId: table.id, x: 20, y: 20, width: 100, height: 80 }] };
  await prisma.venueLayout.update({ where: { id: layout.id }, data: { layoutJson: geometry } });
});

afterAll(async () => {
  if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.event.deleteMany({ where: { id: { in: [publishedId, ...hiddenIds] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerId, guestId] } } });
  await prisma.$disconnect();
});

describe("PublicEventsService", () => {
  it("lists only published events with bounded, searchable results", async () => {
    const recent = await service.list({ page: 1, limit: 12, sort: "recent", search: "Открытый концерт" });
    expect(recent.items).toHaveLength(1);
    expect(recent.items[0]).toMatchObject({ id: publishedId, title: "Открытый концерт", paymentMode: "deposit" });
    const byCity = await service.list({ page: 1, limit: 12, sort: "recent", search: "алМАТЫ" });
    expect(byCity.total).toBeGreaterThanOrEqual(1);
    expect(byCity.items.some((item) => item.id === publishedId)).toBe(true);
    expect(JSON.stringify(recent)).not.toContain("private@example.com");
    await expect(service.list({ page: 1, limit: 12, sort: "recent", search: "не существует" })).resolves.toMatchObject({ items: [], total: 0, hasNext: false });
    await expect(service.list({ page: 1, limit: 12, sort: "recent", search: "Открытый концерт", from: "2027-01-01", to: "2027-01-01" })).resolves.toMatchObject({ total: 1 });
    await expect(service.list({ page: 1, limit: 12, sort: "recent", from: "2027-02-01", to: "2027-01-01" })).rejects.toMatchObject({ response: { code: "EVENT_DATE_FILTER_RANGE_INVALID" } });
  });

  it("applies category, payment and timezone-aware preset filters", async () => {
    await expect(service.list({ page: 1, limit: 12, sort: "recent", category: "music", city: "алматы", paymentMode: "deposit" })).resolves.toMatchObject({ total: 1, items: [{ id: publishedId }] });
    await expect(service.list({ page: 1, limit: 12, sort: "recent", datePreset: "today" }, new Date("2027-01-01T10:00:00.000Z"))).resolves.toMatchObject({ total: 1 });
    await expect(service.list({ page: 1, limit: 12, sort: "recent", free: true, paymentMode: "deposit" })).rejects.toMatchObject({ response: { code: "EVENT_FILTER_COMBINATION_INVALID" } });
  });

  it("returns an allowlisted published event with authoritative inventory", async () => {
    const result = await service.get(publishedId, now);
    expect(result).toMatchObject({ title: "Открытый концерт", category: "music", city: "Алматы", timezone: "Asia/Almaty", organizer: { name: "Организатор", contact: null } });
    expect(result.ticketTypes).toMatchObject([{ name: "Билет", remaining: 1, status: "active" }]);
    expect(result.tables).toMatchObject([{ number: 1, availability: "available", seats: 4, deposit: 50_000 }]);
    expect(result.ticketTypes[0]?.payment).toMatchObject({ mode: "deposit", amountDue: 25_000, fullAmount: 100_000 });
    const body = JSON.stringify(result);
    for (const forbidden of ["telegramId", "private@example.com", "qrToken", "holdToken", "holdExpiresAt", "orderId", "guestContact"]) expect(body).not.toContain(forbidden);
    await prisma.event.update({ where: { id: publishedId }, data: { showFullAmountForDeposit: false } });
    const hiddenPrice = await service.get(publishedId, now);
    expect(hiddenPrice.ticketTypes[0]).toMatchObject({ price: null, payment: { amountDue: 25_000, fullAmount: null } });
    expect(hiddenPrice.tables[0]).toMatchObject({ price: null, payment: { amountDue: 50_000, fullAmount: null } });
  });

  it("allows the owner to preview a draft without making it public", async () => {
    const preview = await service.preview(organizerId, hiddenIds[0]!);
    expect(preview).toMatchObject({ status: "draft", id: hiddenIds[0], category: "other", city: "Алматы" });
    await expect(service.preview(guestId, hiddenIds[0]!)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.preview(randomUUID(), hiddenIds[0]!, now, true)).resolves.toMatchObject({ id: hiddenIds[0], status: "draft" });
    await expect(service.get(hiddenIds[0]!)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reclaims an expired hold before serializing table availability", async () => {
    const initial = await service.get(publishedId, now);
    const tableId = initial.tables[0]!.id;
    const held = await tables.hold(tableId, `public-${randomUUID()}`);
    expect(held.holdToken).toBeTruthy();
    now.setTime(new Date(held.expiresAt).getTime() + 1);
    await expect(service.get(publishedId, now)).resolves.toMatchObject({ tables: [{ id: tableId, availability: "available" }] });
  });

  it("returns the same not-found response for every non-public event", async () => {
    for (const id of [...hiddenIds, randomUUID()]) {
      const error = await service.get(id).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    }
  });
});

function eventData(id: string, title: string) {
  return { id, organizerId, title, date: new Date("2027-01-01T00:00:00.000Z"), time: new Date("1970-01-01T18:00:00.000Z"), timezone: "Asia/Almaty", venueName: "Зал", address: "Алматы" };
}
