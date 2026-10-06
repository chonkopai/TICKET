import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AccountService } from "../auth/account.service.js";
import { EventNotificationsService } from "./event-notifications.service.js";
import { TransactionalNotificationsService } from "./transactional-notifications.service.js";

const organizerId = randomUUID(), guestId = randomUUID(), otherId = randomUUID(), eventId = randomUUID(), typeId = randomUUID(), orderId = randomUUID();
const chatId = BigInt(Date.now()) * 100_000n + 700n;
const now = new Date("2035-04-01T10:00:00.000Z");
const delivery = new EventNotificationsService(prisma);
const dispatcher = new TransactionalNotificationsService(prisma, delivery);
const account = new AccountService(prisma);

beforeAll(async () => {
  await prisma.user.createMany({ data: [
    { id: organizerId, telegramId: chatId + 1n, role: "organizer" },
    { id: guestId, telegramId: chatId, role: "guest" },
    { id: otherId, telegramId: chatId + 2n, role: "guest" },
  ] });
  await prisma.userNotificationPreference.create({ data: { userId: guestId, eventReminders: false } });
  await prisma.event.create({ data: { id: eventId, organizerId, title: "Тест R2", date: new Date("2035-04-02T00:00:00Z"), time: new Date("1970-01-01T09:00:00Z"), timezone: "Asia/Almaty", address: "Адрес", status: "published" } });
  await prisma.ticketType.create({ data: { id: typeId, eventId, name: "Вход", price: 1000, currency: "KZT", quantityTotal: 5 } });
  await prisma.order.create({ data: { id: orderId, type: "ticket", buyerUserId: guestId, amount: 1000, currency: "KZT", paymentStatus: "paid" } });
  await prisma.ticket.create({ data: { ticketTypeId: typeId, orderId, ownerUserId: guestId, qrToken: randomUUID(), status: "active", paidAt: now } });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { eventId } });
  await prisma.broadcast.deleteMany({ where: { eventId } });
  await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: eventId }, { aggregateId: orderId }] } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [organizerId, guestId, otherId] } } });
  await prisma.order.delete({ where: { id: orderId } });
  await prisma.event.delete({ where: { id: eventId } });
  await prisma.userNotificationPreference.deleteMany({ where: { userId: guestId } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerId, guestId, otherId] } } });
  await prisma.$disconnect();
});

describe("R2 transactional inbox and reminders", () => {
  it("keeps optional reminders off until opted in, queues once and allows only the recipient to read", async () => {
    await dispatcher.tick(now);
    expect((await account.notifications(guestId, { page: 1, limit: 20 })).total).toBe(0);
    await account.updatePreferences(guestId, { eventReminders: true });
    await dispatcher.tick(now);
    await dispatcher.tick(now);
    const inbox = await account.notifications(guestId, { page: 1, limit: 20 });
    expect(inbox).toMatchObject({ total: 1, unreadCount: 1 });
    expect(inbox.items[0]?.type).toBe("event.reminder");
    expect((await account.notifications(otherId, { page: 1, limit: 20 })).total).toBe(0);
    await expect(account.readNotification(otherId, inbox.items[0]!.id)).rejects.toThrow();
    const first = await account.readNotification(guestId, inbox.items[0]!.id);
    expect((await account.readNotification(guestId, inbox.items[0]!.id)).readAt).toBe(first.readAt);
    expect((await account.notifications(guestId, { page: 1, limit: 20 })).unreadCount).toBe(0);
  });

  it("adds a late buyer to the same reminder without duplicating earlier recipients", async () => {
    const lateId = randomUUID();
    const lateOrder = randomUUID();
    await prisma.user.create({ data: { id: lateId, telegramId: chatId + 3n, role: "guest" } });
    await prisma.order.create({ data: { id: lateOrder, type: "ticket", buyerUserId: lateId, amount: 1000, currency: "KZT", paymentStatus: "paid" } });
    await prisma.ticket.create({ data: { ticketTypeId: typeId, orderId: lateOrder, ownerUserId: lateId, qrToken: randomUUID(), status: "active", paidAt: now } });
    await dispatcher.tick(now);
    expect((await account.notifications(lateId, { page: 1, limit: 20 })).items.filter((item) => item.type === "event.reminder")).toHaveLength(1);
    expect((await account.notifications(guestId, { page: 1, limit: 20 })).items.filter((item) => item.type === "event.reminder")).toHaveLength(1);
    await prisma.order.delete({ where: { id: lateOrder } });
    await prisma.user.delete({ where: { id: lateId } });
  });

  it("turns a confirmed purchase and current event change into inbox records and sends only to linked Telegram", async () => {
    await prisma.outboxEvent.create({ data: { eventType: "checkout.paid", aggregateType: "order", aggregateId: orderId, payload: {} } });
    await dispatcher.tick(now);
    expect((await account.notifications(guestId, { page: 1, limit: 20 })).items.some((item) => item.type === "purchase.confirmed")).toBe(true);

    const changed = await prisma.event.update({ where: { id: eventId }, data: { address: "Новый адрес" } });
    await prisma.outboxEvent.create({ data: { eventType: "event.updated", aggregateType: "event", aggregateId: eventId, payload: { changedFields: ["address"], eventUpdatedAt: changed.updatedAt.toISOString() } } });
    await prisma.user.update({ where: { id: guestId }, data: { telegramChatId: chatId } });
    await dispatcher.tick(now);
    const inbox = await account.notifications(guestId, { page: 1, limit: 20 });
    expect(inbox.items.some((item) => item.type === "event.change" && item.text.includes("Новый адрес"))).toBe(true);
    const send = vi.fn(async () => "telegram-accepted");
    await delivery.tick(send);
    expect(send).toHaveBeenCalled();
    await delivery.tick(send);
    expect(send.mock.calls.length).toBe(2); // the guest linked before the reminder refresh and change
  });

  it("suppresses obsolete reminders after reschedule and records cancellation without a retrospective send", async () => {
    await prisma.event.update({ where: { id: eventId }, data: { date: new Date("2035-04-03T00:00:00Z") } });
    await dispatcher.tick(new Date("2035-04-02T10:00:00Z"));
    await account.updatePreferences(guestId, { eventReminders: false });
    const sent = vi.fn(async (_chatId: string, _message: string) => "accepted");
    await delivery.tick(sent);
    expect(sent).not.toHaveBeenCalled();
    await account.updatePreferences(guestId, { eventReminders: true });
    const firstReschedule = await prisma.event.update({ where: { id: eventId }, data: { date: new Date("2035-04-04T00:00:00Z") } });
    await prisma.outboxEvent.create({ data: { eventType: "event.updated", aggregateType: "event", aggregateId: eventId, payload: { changedFields: ["date"], eventUpdatedAt: firstReschedule.updatedAt.toISOString() } } });
    await dispatcher.tick(new Date("2035-04-03T10:00:00Z"));
    const secondReschedule = await prisma.event.update({ where: { id: eventId }, data: { date: new Date("2035-04-05T00:00:00Z") } });
    await prisma.outboxEvent.create({ data: { eventType: "event.updated", aggregateType: "event", aggregateId: eventId, payload: { changedFields: ["date"], eventUpdatedAt: secondReschedule.updatedAt.toISOString() } } });
    await dispatcher.tick(new Date("2035-04-03T10:00:00Z"));
    expect((await account.notifications(guestId, { page: 1, limit: 20 })).items.filter((item) => item.type === "event.reminder")).toHaveLength(0);
    await delivery.tick(sent);
    expect(sent.mock.calls.every(([, message]) => !message.includes("Напоминаем"))).toBe(true);
    await prisma.ticket.updateMany({ where: { orderId }, data: { status: "cancelled" } });
    await dispatcher.tick(new Date("2035-04-04T10:00:00Z"));
    expect((await account.notifications(guestId, { page: 1, limit: 20 })).items.filter((item) => item.type === "event.reminder")).toHaveLength(0);
    await prisma.event.update({ where: { id: eventId }, data: { status: "cancelled" } });
    await prisma.outboxEvent.create({ data: { eventType: "event.cancelled", aggregateType: "event", aggregateId: eventId, payload: {} } });
    await dispatcher.tick(now);
    expect((await account.notifications(guestId, { page: 1, limit: 20 })).items.some((item) => item.type === "event.cancellation")).toBe(true);
  });
});
