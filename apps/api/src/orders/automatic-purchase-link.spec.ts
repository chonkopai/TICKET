import { randomUUID } from "node:crypto";
import { prisma, type PrismaClient } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkGuestPurchases } from "./automatic-purchase-link.js";
import { AuthService } from "../auth/auth.service.js";
import { TokenService } from "../auth/token.service.js";
import { AccountService } from "../auth/account.service.js";
import { MyEventsService } from "../my-events/my-events.service.js";
import type { AuthConfig } from "../auth/auth.constants.js";

const ownerId = randomUUID(), eventId = randomUUID(), typeId = randomUUID();
const users: string[] = [ownerId], orders: string[] = [];
let telegram = BigInt(Date.now()) * 100_000n;
async function user(input: { telegramId?: bigint; verifiedEmail?: string; profileEmail?: string } = {}) {
  const row = await prisma.user.create({ data: { telegramId: input.telegramId ?? null, email: input.profileEmail ?? null,
    ...(input.verifiedEmail ? { contactIdentities: { create: { method: "email", normalizedIdentifier: input.verifiedEmail, verifiedAt: new Date() } } } : {}) } });
  users.push(row.id); return row;
}
async function purchase(input: { telegramId?: bigint; email?: string; status?: "paid" | "pending" | "refunded" | "cancelled"; buyerId?: string; ticketOwnerId?: string } = {}) {
  const order = await prisma.order.create({ data: { type: "ticket", amount: 0, currency: "RUB", paymentStatus: input.status ?? "paid", buyerUserId: input.buyerId ?? null,
    tickets: { create: { ticketTypeId: typeId, status: input.status === "refunded" ? "refunded" : input.status === "cancelled" ? "cancelled" : "active", ownerUserId: input.ticketOwnerId ?? null, qrToken: randomUUID() } },
    anonymousSession: { create: { name: "Guest", telegramId: input.telegramId ?? null, chatId: input.telegramId ?? null, verifiedEmail: input.email ?? null,
      sessionHash: randomUUID(), accessHash: randomUUID(), expiresAt: new Date("2020-01-01"), accessExpiresAt: new Date("2020-01-02") } },
  }, include: { tickets: true, anonymousSession: true } });
  orders.push(order.id); return order;
}
beforeAll(async () => {
  await prisma.user.create({ data: { id: ownerId, role: "organizer" } });
  await prisma.event.create({ data: { id: eventId, organizerId: ownerId, title: "Guest recovery fixture", status: "published", date: new Date("2035-01-01"), time: new Date("1970-01-01T18:00:00Z"), timezone: "UTC", address: "Test venue" } });
  await prisma.ticketType.create({ data: { id: typeId, eventId, name: "Invitation", price: 0, currency: "RUB", quantityTotal: 100 } });
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: orders } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orders } } });
  await prisma.anonymousCheckoutSession.deleteMany({ where: { orderId: { in: orders } } });
  await prisma.order.deleteMany({ where: { id: { in: orders } } });
  await prisma.event.delete({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe("automatic recovery of verified guest purchases", () => {
  it("recovers an expired guest receipt when the same Telegram identity first signs in", async () => {
    const telegramId = ++telegram;
    const order = await purchase({ telegramId });
    const config = { accessTokenSecret: "a".repeat(32), refreshTokenSecret: "b".repeat(32) } as AuthConfig;
    const auth = new AuthService(prisma, config, new TokenService(prisma, config), {} as never);
    const login = await auth.loginWithVerifiedTelegram({ id: telegramId, name: "Returning guest", photoUrl: null });
    users.push(login.user.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).buyerUserId).toBe(login.user.id);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: order.tickets[0]!.id } })).toMatchObject({ ownerUserId: login.user.id, qrToken: order.tickets[0]!.qrToken, status: "active" });
    const list = await new MyEventsService(prisma).list(login.user.id, "upcoming", 1, 20);
    expect(list.items.flatMap(item => item.tickets).map(ticket => ticket.id)).toContain(order.tickets[0]!.id);
    expect(await new AccountService(prisma).dashboard(login.user.id)).toMatchObject({ activeAdmissions: 1 });
  });

  it("recovers every matching purchase for an existing Telegram account once under concurrent requests", async () => {
    const telegramId = ++telegram, buyer = await user({ telegramId });
    const first = await purchase({ telegramId }), second = await purchase({ telegramId });
    const results = await Promise.all([linkGuestPurchases(prisma, buyer.id), linkGuestPurchases(prisma, buyer.id)]);
    expect(results.sort()).toEqual([0, 2]);
    expect(await prisma.order.count({ where: { id: { in: [first.id, second.id] }, buyerUserId: buyer.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { entityId: { in: [first.id, second.id] }, action: "order.claimed" } })).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: { in: [first.id, second.id] }, eventType: "order.claimed" } })).toBe(2);
  });

  it("uses only a verified email identity, never the editable profile email", async () => {
    const email = `${randomUUID()}@example.test`, buyer = await user({ verifiedEmail: email }), stranger = await user({ profileEmail: email });
    const order = await purchase({ email });
    expect(await linkGuestPurchases(prisma, stranger.id)).toBe(0);
    expect(await linkGuestPurchases(prisma, buyer.id)).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).buyerUserId).toBe(buyer.id);
  });

  it("does not let a separate email recipient take a Telegram buyer's purchase", async () => {
    const telegramId = ++telegram, email = `${randomUUID()}@example.test`;
    const buyer = await user({ telegramId }), recipient = await user({ verifiedEmail: email });
    const order = await purchase({ telegramId, email });
    expect(await linkGuestPurchases(prisma, recipient.id)).toBe(0);
    expect(await linkGuestPurchases(prisma, buyer.id)).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).buyerUserId).toBe(buyer.id);
  });

  it("leaves another buyer or ticket owner's purchase untouched", async () => {
    const telegramId = ++telegram, buyer = await user({ telegramId }), other = await user();
    const owned = await purchase({ telegramId, buyerId: other.id, ticketOwnerId: other.id });
    const partial = await purchase({ telegramId, ticketOwnerId: other.id });
    const mismatch = await purchase({ telegramId: ++telegram });
    expect(await linkGuestPurchases(prisma, buyer.id)).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: owned.id } })).buyerUserId).toBe(other.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: partial.id } })).buyerUserId).toBeNull();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: mismatch.id } })).buyerUserId).toBeNull();
  });

  it("waits for payment and recovers on opening the account after settlement", async () => {
    const telegramId = ++telegram, buyer = await user({ telegramId }), order = await purchase({ telegramId, status: "pending" });
    expect(await linkGuestPurchases(prisma, buyer.id)).toBe(0);
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
    expect(await new AccountService(prisma).dashboard(buyer.id)).toMatchObject({ activeAdmissions: 1 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).buyerUserId).toBe(buyer.id);
  });

  it("preserves returned and cancelled ticket history instead of making tickets valid again", async () => {
    const telegramId = ++telegram, buyer = await user({ telegramId });
    const returned = await purchase({ telegramId, status: "refunded" }), cancelled = await purchase({ telegramId, status: "cancelled" });
    expect(await linkGuestPurchases(prisma, buyer.id)).toBe(2);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: returned.tickets[0]!.id } })).status).toBe("refunded");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: cancelled.tickets[0]!.id } })).status).toBe("cancelled");
  });

  it("rolls back ownership if recording the claim fails", async () => {
    const telegramId = ++telegram, buyer = await user({ telegramId }), order = await purchase({ telegramId });
    const failing = prisma.$extends({ query: { outboxEvent: { async create() { throw new Error("test outbox failure"); } } } }) as unknown as PrismaClient;
    await expect(linkGuestPurchases(failing, buyer.id)).rejects.toThrow("test outbox failure");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).buyerUserId).toBeNull();
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: order.tickets[0]!.id } })).ownerUserId).toBeNull();
    expect((await prisma.anonymousCheckoutSession.findUniqueOrThrow({ where: { id: order.anonymousSession!.id } })).claimedAt).toBeNull();
    expect(await linkGuestPurchases(prisma, buyer.id)).toBe(1);
  });
});
