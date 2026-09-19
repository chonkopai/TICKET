import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountService } from "./account.service.js";

const guestId = randomUUID();
const otherId = randomUUID();
const organizerId = randomUUID();
const eventId = randomUUID();
const orderIds: string[] = [];

beforeAll(async () => {
  const telegramBase = BigInt(Date.now()) * 100n;
  await prisma.user.createMany({ data: [
    { id: guestId, telegramId: telegramBase + 1n, role: "guest", name: "Гость" },
    { id: otherId, telegramId: telegramBase + 2n, role: "guest", name: "Другой" },
    { id: organizerId, telegramId: telegramBase + 3n, role: "organizer", name: "Организатор" },
  ] });
  await prisma.event.create({ data: { id: eventId, organizerId, title: "Тестовое событие", category: "music", city: "Алматы", date: new Date("2027-04-20T00:00:00Z"), time: new Date("1970-01-01T19:00:00Z"), timezone: "Asia/Almaty", venueName: "Зал", address: "Адрес" } });
  const type = await prisma.ticketType.create({ data: { eventId, name: "Стандарт", price: 100_000, currency: "KZT", quantityTotal: 10, quantitySold: 3, status: "active" } });
  const activeOrder = await prisma.order.create({ data: { type: "ticket", buyerUserId: guestId, amount: 100_000, currency: "KZT", paymentStatus: "paid", checkoutSnapshot: { eventId, eventTitle: "Историческое название", itemName: "Стандарт", quantity: 1 } } });
  const usedOrder = await prisma.order.create({ data: { type: "ticket", buyerUserId: guestId, amount: 200_000, currency: "KZT", paymentStatus: "paid", checkoutSnapshot: { eventId, eventTitle: "Тестовое событие", itemName: "Стандарт", quantity: 2 } } });
  const otherOrder = await prisma.order.create({ data: { type: "ticket", buyerUserId: otherId, amount: 900_000, currency: "KZT", paymentStatus: "paid", checkoutSnapshot: { eventId, eventTitle: "Чужой заказ", itemName: "VIP" } } });
  orderIds.push(activeOrder.id, usedOrder.id, otherOrder.id);
  await prisma.ticket.createMany({ data: [
    { ticketTypeId: type.id, orderId: activeOrder.id, ownerUserId: guestId, qrToken: randomUUID(), status: "active" },
    { ticketTypeId: type.id, orderId: usedOrder.id, ownerUserId: guestId, qrToken: randomUUID(), status: "used", usedAt: new Date() },
    { ticketTypeId: type.id, orderId: usedOrder.id, ownerUserId: guestId, qrToken: randomUUID(), status: "used", usedAt: new Date() },
  ] });
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [guestId, organizerId] } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [guestId, organizerId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [guestId, otherId, organizerId] } } });
  await prisma.$disconnect();
});

describe("AccountService", () => {
  const service = new AccountService(prisma);

  it("calculates active admissions and distinct attended events", async () => {
    await expect(service.dashboard(guestId)).resolves.toEqual({ activeAdmissions: 1, attendedEvents: 1 });
  });

  it("returns safe defaults and persists allowlisted notification preferences", async () => {
    await expect(service.preferences(guestId)).resolves.toEqual({ transactionalTicketDelivery: true, eventReminders: true, marketingAnnouncements: false });
    await expect(service.updatePreferences(guestId, { marketingAnnouncements: true })).resolves.toMatchObject({ marketingAnnouncements: true, transactionalTicketDelivery: true });
    await expect(prisma.auditLog.count({ where: { actorId: guestId, action: "notification_preferences.updated" } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: guestId, eventType: "notification_preferences.updated" } })).resolves.toBe(1);
  });

  it("scopes order history to the buyer and presents immutable snapshot labels", async () => {
    const result = await service.orders(guestId, { page: 1, limit: 20 });
    expect(result.total).toBe(2);
    expect(result.items.map(({ eventTitle }) => eventTitle)).toContain("Историческое название");
    expect(result.items.some(({ eventTitle }) => eventTitle === "Чужой заказ")).toBe(false);
    expect(result.items.every(({ receiptUrl }) => receiptUrl === null)).toBe(true);
  });

  it("persists an organizer display identity with audit and outbox records", async () => {
    await expect(service.updateOrganizerProfile(organizerId, { organizationName: "  TICKET Studio  " })).resolves.toEqual({ organizationName: "TICKET Studio" });
    await expect(service.organizerProfile(organizerId, null)).resolves.toEqual({ organizationName: "TICKET Studio" });
    await expect(prisma.auditLog.count({ where: { actorId: organizerId, action: "organizer_profile.updated" } })).resolves.toBe(1);
  });
});
