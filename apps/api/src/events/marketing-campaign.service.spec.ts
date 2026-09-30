import { randomUUID } from "node:crypto";
import { prisma } from "@event-platform/database";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EventNotificationsService } from "./event-notifications.service.js";
import { MarketingCampaignService } from "./marketing-campaign.service.js";
import type { ObjectStorage } from "./object-storage.js";

const owner = randomUUID(), other = randomUUID(), buyer = randomUUID(), buyer2 = randomUUID(), optedOut = randomUUID();
const eventId = randomUUID(), otherEventId = randomUUID(), typeId = randomUUID(), otherTypeId = randomUUID();
const orderIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const chatBase = BigInt(Date.now()) * 100_000n;
const images = new Map<string, Buffer>();
const storage: ObjectStorage = {
  async putPoster(input) { const key = `${randomUUID()}.${input.extension}`; images.set(key, input.body); return { key, url: `/media/posters/${key}` }; },
  async readPoster(key) { const body = images.get(key); if (!body) throw new Error("missing"); return { body, contentType: "image/png" }; },
  async deletePoster(key) { images.delete(key); },
};
const delivery = new EventNotificationsService(prisma, storage);
const campaigns = new MarketingCampaignService(prisma, delivery, storage);

beforeAll(async () => {
  await prisma.user.createMany({ data: [
    { id: owner, telegramId: chatBase + 1n, role: "organizer" },
    { id: other, telegramId: chatBase + 2n, role: "organizer" },
    { id: buyer, telegramId: chatBase + 3n, telegramChatId: chatBase + 3n, role: "guest" },
    { id: buyer2, telegramId: chatBase + 4n, telegramChatId: chatBase + 4n, role: "guest" },
    { id: optedOut, telegramId: chatBase + 5n, telegramChatId: chatBase + 5n, role: "guest" },
  ] });
  await prisma.userNotificationPreference.createMany({ data: [
    { userId: buyer, marketingAnnouncements: true }, { userId: buyer2, marketingAnnouncements: true }, { userId: optedOut, marketingAnnouncements: false },
  ] });
  await prisma.event.createMany({ data: [
    { id: eventId, organizerId: owner, title: "Событие кампании", date: new Date("2035-03-01"), time: new Date("1970-01-01T19:00:00Z"), venueName: "Зал", address: "Адрес", status: "published" },
    { id: otherEventId, organizerId: other, title: "Чужое событие", date: new Date("2035-03-02"), time: new Date("1970-01-01T19:00:00Z"), venueName: "Зал", address: "Адрес", status: "published" },
  ] });
  await prisma.ticketType.createMany({ data: [
    { id: typeId, eventId, name: "Билет", price: 1000, currency: "KZT", quantityTotal: 10 },
    { id: otherTypeId, eventId: otherEventId, name: "Билет", price: 1000, currency: "KZT", quantityTotal: 10 },
  ] });
  await prisma.order.createMany({ data: [
    { id: orderIds[0]!, type: "ticket", buyerUserId: buyer, amount: 1000, currency: "KZT", paymentStatus: "paid" },
    { id: orderIds[1]!, type: "ticket", buyerUserId: buyer, amount: 1000, currency: "KZT", paymentStatus: "paid" },
    { id: orderIds[2]!, type: "ticket", buyerUserId: buyer2, amount: 1000, currency: "KZT", paymentStatus: "paid" },
    { id: orderIds[3]!, type: "ticket", buyerUserId: optedOut, amount: 1000, currency: "KZT", paymentStatus: "paid" },
    { id: orderIds[4]!, type: "ticket", buyerUserId: buyer, amount: 1000, currency: "KZT", paymentStatus: "paid" },
  ] });
  await prisma.ticket.createMany({ data: orderIds.map((orderId, index) => ({ id: randomUUID(), ticketTypeId: index === 4 ? otherTypeId : typeId, orderId, qrToken: randomUUID(), status: "active", paidAt: new Date() })) });
});

afterAll(async () => {
  const broadcasts = await prisma.broadcast.findMany({ where: { eventId }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { broadcastId: { in: broadcasts.map((item) => item.id) } } });
  await prisma.broadcast.deleteMany({ where: { eventId } });
  await prisma.auditLog.deleteMany({ where: { actorId: owner } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.event.deleteMany({ where: { id: { in: [eventId, otherEventId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, other, buyer, buyer2, optedOut] } } });
  await prisma.$disconnect();
});

describe("owner-scoped marketing campaigns", () => {
  it("previews only consented, linked buyers once and rejects another organizer", async () => {
    expect(await campaigns.preview(owner, eventId)).toMatchObject({ eligibleCount: 2, channel: "telegram" });
    await expect(campaigns.preview(other, eventId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("saves a retry-safe draft, validates an uploaded image, and sends exactly once", async () => {
    const requestKey = randomUUID();
    const draft = await campaigns.createDraft(owner, eventId, { message: "Новый концерт", requestKey });
    expect((await campaigns.createDraft(owner, eventId, { message: "Новый концерт", requestKey })).id).toBe(draft.id);
    await expect(campaigns.createDraft(other, eventId, { message: "Новый концерт", requestKey })).rejects.toBeInstanceOf(NotFoundException);
    await expect(campaigns.uploadImage(owner, eventId, draft.id, { buffer: Buffer.from("bad"), size: 3, mimetype: "image/png", originalname: "x.png" })).rejects.toBeInstanceOf(BadRequestException);
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    expect((await campaigns.uploadImage(owner, eventId, draft.id, { buffer: image, size: image.length, mimetype: "image/png", originalname: "x.png" })).imageUrl).toMatch(/^\/media\/posters\//);
    await expect(campaigns.status(other, eventId, draft.id)).rejects.toBeInstanceOf(NotFoundException);
    const queued = await campaigns.send(owner, eventId, draft.id);
    expect(queued).toMatchObject({ status: "queued", audienceCount: 2, reachableCount: 2 });
    expect((await campaigns.send(owner, eventId, draft.id)).id).toBe(queued.id);
    expect(await prisma.notification.count({ where: { broadcastId: draft.id, channel: "telegram" } })).toBe(2);
    const photo = vi.fn(async () => "photo-accepted");
    expect(await new EventNotificationsService(prisma, storage).tick(vi.fn(async () => "unexpected"), photo)).toBe(2);
    expect(photo).toHaveBeenCalledTimes(2);
  });

  it("rechecks consent at delivery and reports failure without sending", async () => {
    const draft = await campaigns.createDraft(owner, eventId, { message: "Специальное предложение", requestKey: randomUUID() });
    await campaigns.send(owner, eventId, draft.id);
    await prisma.userNotificationPreference.update({ where: { userId: buyer2 }, data: { marketingAnnouncements: false } });
    const send = vi.fn(async () => "accepted");
    expect(await delivery.tick(send)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await campaigns.status(owner, eventId, draft.id)).counts).toMatchObject({ accepted: 1, failed: 1 });
    expect(await delivery.tick(send)).toBe(0);
    await prisma.userNotificationPreference.update({ where: { userId: buyer2 }, data: { marketingAnnouncements: true } });
  });

  it("enforces the three-campaign daily rate limit without queuing a fourth", async () => {
    const third = await campaigns.createDraft(owner, eventId, { message: "Третий анонс", requestKey: randomUUID() });
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const withImage = await campaigns.uploadImage(owner, eventId, third.id, { buffer: image, size: image.length, mimetype: "image/png", originalname: "x.png" });
    await campaigns.send(owner, eventId, third.id);
    images.delete(withImage.imageUrl!.match(/\/([^/]+)$/)![1]!);
    const photo = vi.fn(async () => "unexpected");
    expect(await delivery.tick(vi.fn(async () => "unexpected"), photo)).toBe(0);
    expect(photo).not.toHaveBeenCalled();
    expect((await campaigns.status(owner, eventId, third.id)).counts).toMatchObject({ failed: 2, uncertain: 0 });
    const fourth = await campaigns.createDraft(owner, eventId, { message: "Лишний анонс", requestKey: randomUUID() });
    await expect(campaigns.send(owner, eventId, fourth.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await campaigns.status(owner, eventId, fourth.id)).status).toBe("draft");
  });
});
