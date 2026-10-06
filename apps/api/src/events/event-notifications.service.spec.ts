import { randomUUID } from "node:crypto";
import { prisma } from "@event-platform/database";
import { NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EventNotificationsService } from "./event-notifications.service.js";
import { EventChatService } from "./event-chat.service.js";
import { secretHash } from "../orders/anonymous.service.js";
import { EventsService } from "./events.service.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import type { ObjectStorage } from "./object-storage.js";

const organizer = randomUUID(), otherOrganizer = randomUUID(), guest = randomUUID();
const eventId = randomUUID(), otherEventId = randomUUID();
const ticketTypeId = randomUUID(), otherTypeId = randomUUID();
const paidOrderId = randomUUID(), pendingOrderId = randomUUID(), crossEventOrderId = randomUUID(), anonOrderId = randomUUID(), anonSessionId = randomUUID();
const anonToken = "a".repeat(43);
const activeTicketId = randomUUID();
const base = BigInt(Date.now()) * 100_000n;
const service = new EventNotificationsService(prisma);
const chat = new EventChatService(prisma);

beforeAll(async () => {
  await prisma.user.createMany({ data: [
    { id: organizer, telegramId: base + 1n, role: "organizer" },
    { id: otherOrganizer, telegramId: base + 2n, role: "organizer" },
    { id: guest, telegramId: base + 3n, telegramChatId: base + 3n, role: "guest" },
  ] });
  await prisma.event.createMany({ data: [
    { id: eventId, organizerId: organizer, title: "Тестовое событие", date: new Date("2035-02-01"), time: new Date("1970-01-01T19:00:00Z"), address: "Адрес", status: "published" },
    { id: otherEventId, organizerId: otherOrganizer, title: "Чужое событие", date: new Date("2035-02-02"), time: new Date("1970-01-01T19:00:00Z"), address: "Адрес", status: "published" },
  ] });
  await prisma.ticketType.createMany({ data: [
    { id: ticketTypeId, eventId, name: "Тест", price: 1000, currency: "KZT", quantityTotal: 5 },
    { id: otherTypeId, eventId: otherEventId, name: "Чужой", price: 1000, currency: "KZT", quantityTotal: 5 },
  ] });
  await prisma.order.createMany({ data: [
    { id: paidOrderId, type: "ticket", buyerUserId: guest, amount: 1000, currency: "KZT", paymentStatus: "paid" },
    { id: pendingOrderId, type: "ticket", buyerUserId: guest, amount: 1000, currency: "KZT", paymentStatus: "pending" },
    { id: crossEventOrderId, type: "ticket", buyerUserId: guest, amount: 2000, currency: "KZT", paymentStatus: "paid" },
    { id: anonOrderId, type: "ticket", amount: 1000, currency: "KZT", paymentStatus: "paid" },
  ] });
  await prisma.anonymousCheckoutSession.create({ data: { id: anonSessionId, sessionHash: secretHash("session-test"), accessHash: secretHash(anonToken), name: "Анонимный гость", telegramId: base + 9n, chatId: base + 9n, expiresAt: new Date("2035-01-01"), accessExpiresAt: new Date("2035-01-01"), orderId: anonOrderId } });
  await prisma.ticket.createMany({ data: [
    { id: activeTicketId, ticketTypeId, orderId: paidOrderId, qrToken: randomUUID(), status: "active", paidAt: new Date() },
    { id: randomUUID(), ticketTypeId, orderId: pendingOrderId, qrToken: randomUUID(), status: "created" },
    { id: randomUUID(), ticketTypeId, orderId: crossEventOrderId, qrToken: randomUUID(), status: "active", paidAt: new Date() },
    { id: randomUUID(), ticketTypeId: otherTypeId, orderId: crossEventOrderId, qrToken: randomUUID(), status: "active", paidAt: new Date() },
    { id: randomUUID(), ticketTypeId, orderId: anonOrderId, qrToken: randomUUID(), status: "active", paidAt: new Date() },
  ] });
});

afterAll(async () => {
  const broadcasts = await prisma.broadcast.findMany({ where: { eventId }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { broadcastId: { in: broadcasts.map((row) => row.id) } } });
  await prisma.broadcast.deleteMany({ where: { eventId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [organizer, guest] } } });
  await prisma.anonymousCheckoutSession.deleteMany({ where: { id: anonSessionId } });
  await prisma.order.deleteMany({ where: { id: { in: [paidOrderId, pendingOrderId, crossEventOrderId, anonOrderId] } } });
  await prisma.event.deleteMany({ where: { id: { in: [eventId, otherEventId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizer, otherOrganizer, guest] } } });
  await prisma.$disconnect();
});

describe("event notification audience and worker", () => {
  it("counts actual paid event buyers once, excludes pending and cross-event orders, and enforces ownership", async () => {
    const preview = await service.preview(organizer, eventId, "important");
    expect(preview).toMatchObject({ audienceCount: 2, reachableCount: 2, channel: "telegram" });
    await expect(service.preview(otherOrganizer, eventId, "important")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list(otherOrganizer, eventId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("freezes recipients, deduplicates submission and records accepted send only after provider response", async () => {
    const requestKey = randomUUID();
    const input = { type: "important" as const, message: "Вход через северную дверь", requestKey };
    const first = await service.queue(organizer, eventId, input);
    const second = await service.queue(organizer, eventId, input);
    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({ audienceCount: 2, reachableCount: 2, counts: { queued: 2, accepted: 0 } });
    await expect(service.status(otherOrganizer, eventId, first.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.notification.count({ where: { broadcastId: first.id, channel: "telegram" } })).toBe(2);
    expect(await prisma.notification.count({ where: { broadcastId: first.id, channel: "in_app" } })).toBe(1);
    const send = vi.fn(async (_chat: string, _message: string) => "123");
    expect(await service.tick(send)).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await service.status(organizer, eventId, first.id)).counts.accepted).toBe(2);
    expect(await service.tick(send)).toBe(0);
  });

  it("retains ambiguous delivery without an automatic duplicate send", async () => {
    const broadcast = await service.queue(organizer, eventId, { type: "time", message: "Начало в 20:00", requestKey: randomUUID() });
    const send = vi.fn(async () => { throw new Error("timeout"); });
    await service.tick(send);
    expect((await service.status(organizer, eventId, broadcast.id)).counts.uncertain).toBe(2);
    await service.tick(send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("resends the same active QR identity through a durable job and rejects another organizer", async () => {
    const original = await prisma.ticket.findUniqueOrThrow({ where: { id: activeTicketId }, select: { qrToken: true, status: true } });
    await expect(service.resendTicket(otherOrganizer, eventId, paidOrderId, activeTicketId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    const key = randomUUID();
    const first = await service.resendTicket(organizer, eventId, paidOrderId, activeTicketId, key);
    expect((await service.resendTicket(organizer, eventId, paidOrderId, activeTicketId, key)).id).toBe(first.id);
    const sendPhoto = vi.fn(async (_chat: string, image: Buffer, _caption: string) => { expect(image.length).toBeGreaterThan(100); return "photo-1"; });
    expect(await service.tick(vi.fn(async () => "unused"), sendPhoto)).toBe(1);
    expect(sendPhoto).toHaveBeenCalledOnce();
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: activeTicketId }, select: { qrToken: true, status: true } })).toEqual(original);
  });

  it("shows actual notification and resend outcomes in the owned order history", async () => {
    const events = new EventsService(prisma, null as unknown as ObjectStorage, new DomainEventsService());
    const detail = await events.managementOrderDetail(organizer, eventId, paidOrderId);
    expect(detail.history.some((item) => item.kind === "communication" && item.description.includes("Telegram принял"))).toBe(true);
    expect(detail.history.some((item) => item.description.includes("Повторная отправка билета"))).toBe(true);
    await expect(events.managementOrderDetail(otherOrganizer, eventId, paidOrderId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not send an obsolete event-change message after cancellation", async () => {
    const id = await service.queueSystem({ eventId, type: "event.change", requestKey: randomUUID(), message: "Новое время" });
    await prisma.event.update({ where: { id: eventId }, data: { status: "cancelled" } });
    const send = vi.fn(async () => "unexpected");
    expect(await service.tick(send)).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(await prisma.notification.count({ where: { broadcastId: id, channel: "telegram", status: "failed", lastError: "EVENT_CHANGED_OR_CANCELLED" } })).toBe(2);
  });
});

describe("event-bound guest and organizer chat", () => {
  it("allows only the order buyer and event owner, paginates real messages and records reading", async () => {
    await expect(chat.list(eventId, paidOrderId, { kind: "organizer", userId: otherOrganizer })).rejects.toBeInstanceOf(NotFoundException);
    await expect(chat.list(eventId, paidOrderId, { kind: "guest", userId: otherOrganizer })).rejects.toBeInstanceOf(NotFoundException);
    await expect(chat.list(otherEventId, paidOrderId, { kind: "guest", userId: guest })).rejects.toBeInstanceOf(NotFoundException);
    const guestKey = randomUUID();
    const guestMessage = await chat.send(eventId, paidOrderId, { kind: "guest", userId: guest }, "Где вход?", guestKey);
    expect((await chat.send(eventId, paidOrderId, { kind: "guest", userId: guest }, "Где вход?", guestKey)).id).toBe(guestMessage.id);
    await expect(chat.send(eventId, paidOrderId, { kind: "guest", userId: guest }, "Повтор", randomUUID())).rejects.toThrow();
    const organizerMessage = await chat.send(eventId, paidOrderId, { kind: "organizer", userId: organizer }, "Северный вход", randomUUID());
    expect(new Set((await chat.list(eventId, paidOrderId, { kind: "guest", userId: guest })).items.map((item) => item.id))).toEqual(new Set([guestMessage.id, organizerMessage.id]));
    expect((await chat.markRead(eventId, paidOrderId, { kind: "guest", userId: guest })).marked).toBe(1);
    expect((await chat.list(eventId, paidOrderId, { kind: "organizer", userId: organizer })).items.find((item) => item.id === organizerMessage.id)?.readAt).not.toBeNull();
  });
  it("accepts only the matching live anonymous checkout token", async () => {
    await expect(chat.list(eventId, anonOrderId, { kind: "guest", accessToken: "b".repeat(43) })).rejects.toBeInstanceOf(NotFoundException);
    const message = await chat.send(eventId, anonOrderId, { kind: "guest", accessToken: anonToken }, "Нужна помощь", randomUUID());
    expect((await chat.list(eventId, anonOrderId, { kind: "guest", accessToken: anonToken })).items[0]?.id).toBe(message.id);
    await expect(chat.list(otherEventId, anonOrderId, { kind: "guest", accessToken: anonToken })).rejects.toBeInstanceOf(NotFoundException);
  });
});
