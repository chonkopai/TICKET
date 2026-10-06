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
const seatOnlyId = randomUUID();
const holdOnlyId = randomUUID();
const mixedCurrencyId = randomUUID();
const localizedId = randomUUID();
const foreignId = randomUUID();
const hiddenIds = [randomUUID(), randomUUID(), randomUUID()];
const paginationIds: string[] = [];
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
    id: publishedId, organizerId, title: "Открытый концерт", category: "music", city: "Алматы", posterUrl: "https://example.com/poster.jpg", description: "Описание", program: "Программа", rules: "Правила", visitTerms: "Условия посещения", cancellationTerms: "Условия отмены", paymentMode: "deposit", showFullAmountForDeposit: true, depositTerms: "Депозит", extraConditions: "18+", date: new Date("2027-01-01T00:00:00.000Z"), time: new Date("1970-01-01T18:00:00.000Z"), timezone: "Asia/Almaty", ageRestriction: 18, address: "Алматы", status: EventStatus.published,
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
  await prisma.event.deleteMany({ where: { id: { in: [publishedId, seatOnlyId, holdOnlyId, mixedCurrencyId, localizedId, foreignId, ...hiddenIds, ...paginationIds] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerId, guestId] } } });
  await prisma.$disconnect();
});

describe("PublicEventsService", () => {
  it("groups published cities by country and does not mix same-named cities", async () => {
    await prisma.event.create({ data: { ...eventData(foreignId, "Зарубежное событие"), countryCode: "RU", city: "Алматы", status: EventStatus.published } });
    const locations = await service.locations();
    expect(locations).toEqual(expect.arrayContaining([
      expect.objectContaining({ countryCode: "KZ", cities: expect.arrayContaining(["Алматы"]) }),
      expect.objectContaining({ countryCode: "RU", cities: expect.arrayContaining(["Алматы"]) }),
    ]));
    const kazakhstan = await service.list({ page: 1, limit: 12, sort: "recent", countryCode: "KZ", city: "Алматы", search: "Зарубежное событие" });
    expect(kazakhstan.total).toBe(0);
    const russia = await service.list({ page: 1, limit: 12, sort: "recent", countryCode: "RU", city: "Алматы", search: "Зарубежное событие" });
    expect(russia.items).toMatchObject([{ id: foreignId, countryCode: "RU" }]);
  });
  it("searches displayed translations and falls back when a generated version becomes stale", async () => {
    await prisma.event.create({ data: { ...eventData(localizedId, "Исходное название"), status: EventStatus.published } });
    await prisma.eventTranslation.create({ data: {
      eventId: localizedId, locale: "en", title: "Community gathering", address: "Almaty",
      origin: "manual",
    } });
    const translated = await service.list({ page: 1, limit: 12, sort: "recent", locale: "en", search: "Community gathering" });
    expect(translated.items).toMatchObject([{ id: localizedId, title: "Community gathering", contentLocale: "en", sourceLocale: "ru" }]);
    await prisma.eventTranslation.update({ where: { eventId_locale: { eventId: localizedId, locale: "en" } }, data: { origin: "machine", sourceHash: "stale" } });
    const stale = await service.list({ page: 1, limit: 12, sort: "recent", locale: "en", search: "Community gathering" });
    expect(stale.items).toHaveLength(0);
    const fallback = await service.summary(localizedId, now, "en");
    expect(fallback).toMatchObject({ title: "Исходное название", contentLocale: "ru", sourceLocale: "ru" });
  });
  it("reports a separate minimum for each currency", async () => {
    await prisma.event.create({ data: { ...eventData(mixedCurrencyId, "Две валюты"), status: EventStatus.published } });
    await prisma.ticketType.createMany({ data: [
      { eventId: mixedCurrencyId, name: "KZT", price: 100_000, currency: "KZT", quantityTotal: 2, status: "active" },
      { eventId: mixedCurrencyId, name: "USD", price: 5_000, currency: "USD", quantityTotal: 2, status: "active" },
    ] });
    await expect(service.summary(mixedCurrencyId)).resolves.toMatchObject({ startingAmount: null, startingCurrency: null, startingPrices: [{ currency: "KZT", amount: 100_000, unit: "ticket" }, { currency: "USD", amount: 5_000, unit: "ticket" }] });
  });

  it("shows organizer contacts and photo only when public visibility is enabled", async () => {
    await prisma.user.update({ where: { id: organizerId }, data: { photoUrl: "/media/posters/profile.jpg" } });
    await prisma.organizerProfile.upsert({ where: { userId: organizerId }, create: { userId: organizerId, organizationName: "TICKET Studio", address: "Алматы", showContactInfo: false }, update: { organizationName: "TICKET Studio", address: "Алматы", showContactInfo: false } });
    expect((await service.get(publishedId)).organizer).toEqual({ name: "TICKET Studio", personName: null, photoUrl: null, contact: null });
    await prisma.organizerProfile.update({ where: { userId: organizerId }, data: { showContactInfo: true } });
    expect((await service.get(publishedId)).organizer).toEqual({ name: "TICKET Studio", personName: "Организатор", photoUrl: "/media/posters/profile.jpg", contact: "+77010000000 · private@example.com · Алматы" });
    await prisma.organizerProfile.delete({ where: { userId: organizerId } });
    await prisma.user.update({ where: { id: organizerId }, data: { photoUrl: null } });
  });

  it("distinguishes an active reservation from sold-out inventory", async () => {
    await prisma.event.create({ data: { ...eventData(holdOnlyId, "На удержании"), status: EventStatus.published } });
    const tariff = await prisma.ticketType.create({ data: { eventId: holdOnlyId, name: "Последний билет", price: 80_000, currency: "KZT", quantityTotal: 1, status: "active" } });
    await prisma.ticketReservation.create({ data: { ticketTypeId: tariff.id, token: `held-${randomUUID()}`, quantity: 1, expiresAt: new Date(Date.now() + 60_000) } });
    await expect(service.summary(holdOnlyId)).resolves.toMatchObject({ remainingTickets: 0, saleStatus: "temporarily_unavailable" });
  });

  it("derives card availability and starting price from selectable numbered seats", async () => {
    await prisma.event.create({ data: { ...eventData(seatOnlyId, "Места по схеме"), status: EventStatus.published } });
    const layout = await prisma.venueLayout.create({ data: { eventId: seatOnlyId, templateName: "Зал", layoutJson: { version: 1, canvas: { width: 500, height: 500 }, tables: [] } } });
    const tariff = await prisma.ticketType.create({ data: { eventId: seatOnlyId, name: "Место", price: 1_200_000, currency: "KZT", quantityTotal: 2, status: "active" } });
    const available = await prisma.seat.create({ data: { venueLayoutId: layout.id, number: 1, label: "1", sortOrder: 0, ticketTypeId: tariff.id } });
    const occupied = await prisma.seat.create({ data: { venueLayoutId: layout.id, number: 2, label: "2", sortOrder: 1, ticketTypeId: tariff.id } });
    const order = await prisma.order.create({ data: { type: "ticket", buyerUserId: guestId, amount: 1_200_000, currency: "KZT", paymentStatus: "paid" } });
    orderIds.push(order.id);
    await prisma.seatAllocation.create({ data: { seatId: occupied.id, orderId: order.id, status: "active" } });

    const summary = await service.summary(seatOnlyId);
    expect(summary).toMatchObject({ startingAmount: 1_200_000, startingCurrency: "KZT", startingUnit: "seat", remainingSeats: 1, remainingTickets: 0, saleStatus: "few_left" });
    await prisma.ticketType.update({ where: { id: tariff.id }, data: { salesStartAt: new Date(Date.now() + 86_400_000) } });
    await expect(service.summary(seatOnlyId)).resolves.toMatchObject({ startingAmount: null, remainingSeats: 0, saleStatus: "sales_not_started" });
    await prisma.ticketType.update({ where: { id: tariff.id }, data: { salesStartAt: null, salesEndAt: new Date(Date.now() - 86_400_000) } });
    await expect(service.summary(seatOnlyId)).resolves.toMatchObject({ startingAmount: null, remainingSeats: 0, saleStatus: "sales_ended" });
    await prisma.ticketType.update({ where: { id: tariff.id }, data: { salesEndAt: null } });
    await prisma.seat.update({ where: { id: available.id }, data: { status: "disabled" } });
    await expect(service.summary(seatOnlyId)).resolves.toMatchObject({ remainingSeats: 0, saleStatus: "sold_out" });
  });
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

  it("reaches recent results beyond the old 500-event cutoff", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({ ...eventData(randomUUID(), `R1 pagination fixture ${index}`), status: EventStatus.published, publishedAt: new Date(index === 0 ? "2026-01-01T00:00:00Z" : "2026-02-01T00:00:00Z") }));
    paginationIds.push(...rows.map(row => row.id));
    await prisma.event.createMany({ data: rows });
    await prisma.ticketType.create({ data: { eventId: rows[0]!.id, name: "Free", price: 0, currency: "KZT", quantityTotal: 1, status: "active" } });
    const last = await service.list({ page: 501, limit: 1, sort: "recent", search: "R1 pagination fixture" });
    expect(last).toMatchObject({ page: 501, limit: 1, total: 501, hasNext: false });
    expect(last.items).toMatchObject([{ id: rows[0]!.id }]);
    const free = await service.list({ page: 1, limit: 12, sort: "recent", search: "R1 pagination fixture", free: true });
    expect(free).toMatchObject({ total: 1, items: [{ id: rows[0]!.id, startingAmount: 0 }] });
  });

  it("applies category and timezone-aware preset filters", async () => {
    await expect(service.list({ page: 1, limit: 12, sort: "recent", category: "music", city: "алматы", search:"Открытый концерт" })).resolves.toMatchObject({ total: 1, items: [{ id: publishedId }] });
    await expect(service.list({ page: 1, limit: 12, sort: "recent", search: "Открытый концерт", datePreset: "today" }, new Date("2027-01-01T10:00:00.000Z"))).resolves.toMatchObject({ total: 1, items: [{ id: publishedId }] });
  });

  it("filters events by their KZT starting ticket price", async () => {
    const matching = await service.list({ page: 1, limit: 12, sort: "recent", search: "Открытый концерт", minPrice: 250, maxPrice: 250 });
    expect(matching).toMatchObject({ total: 1, items: [{ id: publishedId }] });
    const tooExpensive = await service.list({ page: 1, limit: 12, sort: "recent", search: "Открытый концерт", maxPrice: 249 });
    expect(tooExpensive).toMatchObject({ total: 0, items: [] });
    await expect(service.list({ page: 1, limit: 12, sort: "recent", minPrice: 100, maxPrice: 50 })).rejects.toMatchObject({ response: { code: "EVENT_PRICE_RANGE_INVALID" } });
  });

  it("returns an allowlisted published event with authoritative inventory", async () => {
    const result = await service.get(publishedId, now);
    expect(result).toMatchObject({ title: "Открытый концерт", category: "music", city: "Алматы", timezone: "Asia/Almaty", ageRestriction: 18, organizer: { name: "Организатор", contact: null } });
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
  return { id, organizerId, title, date: new Date("2027-01-01T00:00:00.000Z"), time: new Date("1970-01-01T18:00:00.000Z"), timezone: "Asia/Almaty", address: "Алматы" };
}
