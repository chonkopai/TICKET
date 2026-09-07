import { randomUUID } from "node:crypto";
import { prisma } from "@event-platform/database";
import { quickTicketSchema, quickTableSchema } from "@event-platform/shared-types";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { TablesService } from "../tables/tables.service.js";
import { BookingService } from "../booking/booking.service.js";
import { DevelopmentPaymentProvider } from "../booking/payment-provider.js";
import { PaymentService } from "../payments/payment.service.js";
import { AnonymousService, secretHash } from "./anonymous.service.js";
import { QuickDeliveryService } from "./quick-delivery.service.js";
import { TicketsService } from "../tickets/tickets.service.js";
import { MyEventsService } from "../my-events/my-events.service.js";

const organizerId = randomUUID(), userId = randomUUID(), otherId = randomUUID(), eventId = randomUUID(), layoutId = randomUUID();
const telegramId = BigInt(Date.now()) * 1000n + 39n;
const clock = { value: new Date("2035-01-01T00:00:00Z"), now() { return new Date(this.value); } };
const events = new DomainEventsService();
const types = new TicketTypesService(prisma, events);
const tables = new TablesService(prisma, events, { holdTtlSeconds: 600, cleanupIntervalSeconds: 60 }, clock);
const provider = new DevelopmentPaymentProvider("http://localhost:3000", "test-signed-secret", 300, () => clock.now());
const payments = new PaymentService(prisma, provider, events, clock);
const booking = new BookingService(prisma, types, tables, events, { checkoutTtlSeconds: 900, cleanupIntervalSeconds: 60 }, clock, payments);
const quick = new AnonymousService(prisma, booking, payments, events, clock, { botUsername: "test_bot", sessionSeconds: 600, accessSeconds: 3600, claimSeconds: 600 });
const sessions: string[] = [], orders: string[] = [];
const tickets = new TicketsService(prisma, events, { isConfigured: () => false, generate: async () => { throw new Error("not configured"); } });

beforeAll(async () => {
  await prisma.user.createMany({ data: [{ id: organizerId, role: "organizer", telegramId: telegramId + 1n }, { id: userId, telegramId }, { id: otherId, telegramId: telegramId + 2n }] });
  await prisma.event.create({ data: { id: eventId, organizerId, title: "Anonymous acceptance", date: new Date("2035-02-01T00:00:00Z"), time: new Date("1970-01-01T18:00:00Z"), timezone: "Asia/Almaty", venueName: "Venue", address: "Almaty", status: "published", paymentMode: "deposit", depositTerms: "Deposit terms", cancellationTerms: "Cancellation terms", showFullAmountForDeposit: false } });
  await prisma.venueLayout.create({ data: { id: layoutId, eventId, templateName: "Quick test", layoutJson: { version: 1, canvas: { width: 800, height: 600 }, tables: [] } } });
});
afterAll(async () => {
  const rows = await prisma.anonymousCheckoutSession.findMany({ where: { id: { in: sessions } }, select: { orderId: true } });
  orders.push(...rows.flatMap(r => r.orderId ? [r.orderId] : []));
  await prisma.anonymousCheckoutSession.deleteMany({ where: { id: { in: sessions } } });
  await prisma.order.deleteMany({ where: { id: { in: orders } } });
  await prisma.event.delete({ where: { id: eventId } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: [organizerId, userId, otherId] } }, { entityId: { in: orders } }] } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [...orders, ...sessions] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerId, userId, otherId] } } });
});
async function session(verified = true) {
  const result = await quick.start("Guest");
  const row = await prisma.anonymousCheckoutSession.findUniqueOrThrow({ where: { sessionHash: secretHash(result.sessionToken) } }); sessions.push(row.id);
  if (verified) await quick.verify({ token: new URL(result.telegramUrl).searchParams.get("start")!.slice(2), telegramId: telegramId.toString(), chatId: telegramId.toString(), messageId: 11 });
  return { ...result, id: row.id };
}
async function type(quantityTotal = 10) { return types.create(organizerId, eventId, { name: randomUUID(), price: 100000, deposit: 25000, quantityTotal, status: "active" }); }
async function buy() {
  const s = await session(), t = await type();
  const input = { ticketTypeId: t.id, quantity: 1, termsAccepted: true as const };
  const key = randomUUID();
  const result = await quick.checkout(s.sessionToken, key, "ticket", input); orders.push(result.orderId);
  return { s, t, key, input, result };
}
async function pay(orderId: string) {
  const attempt = await prisma.payment.findFirstOrThrow({ where: { orderId } });
  const signed = DevelopmentPaymentProvider.signWebhook({ eventId: randomUUID(), eventType: "payment.succeeded", providerPaymentId: attempt.providerPaymentId, orderId, amount: attempt.amount, currency: attempt.currency }, "test-signed-secret", Math.floor(clock.now().getTime() / 1000));
  const event = provider.verifyWebhook({ rawBody: signed.rawBody, headers: signed.headers });
  await booking.handlePaymentWebhook(event);
  return event;
}

describe("anonymous checkout and claims (PostgreSQL)", () => {
  it("does not create users, verifies recipients once and stores only hashes", async () => {
    const before = await prisma.user.count();
    const s = await session(false);
    const token = new URL(s.telegramUrl).searchParams.get("start")!.slice(2);
    await expect(quick.verify({ token, telegramId: telegramId.toString(), chatId: "1", messageId: 1 })).rejects.toThrow();
    await quick.verify({ token, telegramId: telegramId.toString(), chatId: telegramId.toString(), messageId: 1 });
    await expect(quick.verify({ token, telegramId: telegramId.toString(), chatId: telegramId.toString(), messageId: 1 })).rejects.toThrow();
    const row = await prisma.anonymousCheckoutSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(JSON.stringify(row, (_, v) => typeof v === "bigint" ? v.toString() : v)).not.toContain(s.accessToken);
    expect(await prisma.user.count()).toBe(before);
  });
  it("requires verification; rejects unknown fields and price/identity tampering", async () => {
    const s = await session(false), t = await type();
    const input = { ticketTypeId: t.id, quantity: 1, termsAccepted: true as const };
    await expect(quick.checkout(s.sessionToken, randomUUID(), "ticket", input)).rejects.toThrow();
    for (const field of ["price", "currency", "paymentMode", "buyerUserId", "telegramId"]) expect(quickTicketSchema.safeParse({ ...input, [field]: "forged" }).success).toBe(false);
    expect(quickTableSchema.safeParse({ tableId: randomUUID(), termsAccepted: false }).success).toBe(false);
  });
  it("completes a signed deposit ticket purchase and preserves hidden prices and idempotency", async () => {
    const { s, result, input, key } = await buy();
    expect(result).toMatchObject({ amountDue: 25000, fullAmount: null, paymentMode: "deposit" });
    expect(result.paymentLink).toContain("/quick/status");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { tickets: true, deposit: true } });
    expect(order.buyerUserId).toBeNull(); expect(order.tickets[0]?.ownerUserId).toBeNull(); expect(order.deposit?.amount).toBe(25000);
    expect((await quick.checkout(s.sessionToken, key, "ticket", input)).orderId).toBe(result.orderId);
    await expect(quick.checkout(s.sessionToken, key, "ticket", { ...input, quantity: 2 })).rejects.toThrow();
    const event = await pay(result.orderId);
    await booking.handlePaymentWebhook(event);
    const status = await quick.status(s.accessToken);
    expect(status).toMatchObject({ status: "paid", fullAmount: null, tickets: [{ status: "active" }] });
    expect(JSON.stringify(status)).not.toMatch(/qrToken|chatId|telegramId|guestContact|unitFullAmount|holdToken/);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: result.orderId, eventType: "checkout.paid" } })).toBe(1);
  });
  it("recovers the same order and attempt after provider timeout", async () => {
    const s = await session(), t = await type(), key = randomUUID();
    const input = { ticketTypeId: t.id, quantity: 1, termsAccepted: true as const };
    const spy = vi.spyOn(provider, "createPaymentLink").mockRejectedValueOnce(new Error("timeout"));
    await expect(quick.checkout(s.sessionToken, key, "ticket", input)).rejects.toThrow();
    spy.mockRestore();
    const row = await prisma.anonymousCheckoutSession.findUniqueOrThrow({ where: { id: s.id } });
    const result = await quick.checkout(s.sessionToken, key, "ticket", input);
    expect(result.orderId).toBe(row.orderId);
    expect(await prisma.payment.count({ where: { orderId: result.orderId } })).toBe(1);
  });
  it("20 competing anonymous requests reserve the last ticket exactly once", async () => {
    const t = await type(1), ss = await Promise.all(Array.from({ length: 20 }, () => session()));
    const results = await Promise.allSettled(ss.map(s => quick.checkout(s.sessionToken, randomUUID(), "ticket", { ticketTypeId: t.id, quantity: 1, termsAccepted: true })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.order.count({ where: { tickets: { some: { ticketTypeId: t.id } } } })).toBe(1);
  });
  it("concurrent identical keys produce one order, reservation and link event", async () => {
    const s = await session(), t = await type(), key = randomUUID();
    const results = await Promise.all(Array.from({ length: 8 }, () => quick.checkout(s.sessionToken, key, "ticket", { ticketTypeId: t.id, quantity: 1, termsAccepted: true })));
    expect(new Set(results.map(r => r.orderId)).size).toBe(1);
    expect(await prisma.ticketReservation.count({ where: { orderId: results[0]!.orderId } })).toBe(1);
    const p = await prisma.payment.findFirstOrThrow({ where: { orderId: results[0]!.orderId } });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: p.id, eventType: "payment.link_created" } })).toBe(1);
  });
  it("table checkout holds and confirms using the same signed payment boundary", async () => {
    const table = await tables.create(organizerId, layoutId, { number: 91, seats: 4, price: 400000, deposit: 100000, geometry: { x: 50, y: 50, width: 100, height: 100 } });
    const ss = await Promise.all([session(), session()]);
    const results = await Promise.allSettled(ss.map(s => quick.checkout(s.sessionToken, randomUUID(), "table", { tableId: table.id, termsAccepted: true })));
    const wins = results.filter(r => r.status === "fulfilled"); expect(wins).toHaveLength(1);
    if (wins[0]?.status !== "fulfilled") throw new Error("missing winner");
    await pay(wins[0].value.orderId);
    expect(await prisma.table.findUnique({ where: { id: table.id } })).toMatchObject({ status: "booked" });
    expect(await prisma.booking.findUnique({ where: { orderId: wins[0].value.orderId } })).toMatchObject({ status: "confirmed" });
  });
  it("isolates capability access, QR and Wallet to the order and enforces expiry", async () => {
    const a = await buy(), b = await buy(); await pay(a.result.orderId);
    await expect(quick.access(a.s.accessToken, b.result.orderId)).rejects.toThrow();
    await expect(quick.status(a.result.orderId)).rejects.toThrow();
    expect((await tickets.assetForAnonymousOrder(a.result.orderId, a.result.ticketIds[0]!, false)).subarray(1, 4).toString()).toBe("PNG");
    await expect(tickets.assetForAnonymousOrder(a.result.orderId, b.result.ticketIds[0]!, false)).rejects.toThrow();
    await expect(tickets.assetForAnonymousOrder(a.result.orderId, a.result.ticketIds[0]!, true)).rejects.toThrow();
    await prisma.anonymousCheckoutSession.update({ where: { id: a.s.id }, data: { accessExpiresAt: clock.now() } });
    await expect(quick.status(a.s.accessToken)).rejects.toThrow();
  });
  it("claims once for the verified recipient, preserving ticket/order/history IDs", async () => {
    const { s, result } = await buy(); await pay(result.orderId);
    const before = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    const { claimToken } = await quick.issueClaim(s.accessToken);
    await expect(quick.claim(otherId, claimToken)).rejects.toThrow();
    const results = await Promise.allSettled([quick.claim(userId, claimToken), quick.claim(userId, claimToken)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(quick.claim(userId, claimToken)).rejects.toThrow();
    await expect(quick.issueClaim(s.accessToken)).rejects.toThrow();
    const after = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { tickets: true } });
    expect(after.buyerUserId).toBe(userId); expect(after.checkoutSnapshot).toEqual(before.checkoutSnapshot);
    expect(after.tickets.map(t => t.id)).toEqual(result.ticketIds); expect(after.tickets[0]?.ownerUserId).toBe(userId);
    expect(await prisma.auditLog.count({ where: { entityId: result.orderId, action: "order.claimed" } })).toBe(1);
    const my = new MyEventsService(prisma);
    expect(JSON.stringify(await my.list(userId, "upcoming", 1, 20, clock.now()))).toContain(result.ticketIds[0]);
  });
  it("rejects expired claims and rolls back ownership when outbox insertion fails", async () => {
    const { s, result } = await buy(); await pay(result.orderId);
    const expired = await quick.issueClaim(s.accessToken);
    await prisma.anonymousCheckoutSession.update({ where: { id: s.id }, data: { claimExpiresAt: clock.now() } });
    await expect(quick.claim(userId, expired.claimToken)).rejects.toThrow();
    const fresh = await quick.issueClaim(s.accessToken);
    const spy = vi.spyOn(events, "append").mockRejectedValueOnce(new Error("outbox failure"));
    await expect(quick.claim(userId, fresh.claimToken)).rejects.toThrow(); spy.mockRestore();
    expect(await prisma.order.findUnique({ where: { id: result.orderId } })).toMatchObject({ buyerUserId: null });
    expect(await prisma.ticket.findMany({ where: { orderId: result.orderId } })).toMatchObject([{ ownerUserId: null }]);
    expect(await prisma.auditLog.count({ where: { action: "order.claimed", entityId: result.orderId } })).toBe(0);
  });
  it("rolls back checkout and inventory when the atomic session result cannot be committed", async () => {
    const s = await session(), t = await type();
    const spy = vi.spyOn(events, "append").mockRejectedValueOnce(new Error("outbox failure"));
    await expect(quick.checkout(s.sessionToken, randomUUID(), "ticket", { ticketTypeId: t.id, quantity: 1, termsAccepted: true })).rejects.toThrow(); spy.mockRestore();
    expect(await prisma.order.count({ where: { tickets: { some: { ticketTypeId: t.id } } } })).toBe(0);
    expect(await prisma.ticketReservation.count({ where: { ticketTypeId: t.id } })).toBe(0);
  });
  it("delivery consumes committed paid outbox and retries the same Telegram message", async () => {
    const { s, result } = await buy(); await pay(result.orderId);
    const worker = new QuickDeliveryService(prisma, clock);
    const send = vi.fn(async () => undefined);
    await worker.tick(send, [s.id]); const count = send.mock.calls.length;
    await worker.tick(send, [s.id]); expect(send.mock.calls.length).toBe(count);
    expect(await prisma.anonymousCheckoutSession.findUnique({ where: { id: s.id } })).toMatchObject({ deliveredAt: clock.now() });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: result.orderId, eventType: "anonymous.delivery_completed" } })).toBe(1);
  });
  it("organizer purchases include anonymous contacts only for their own event", async () => {
    const { result } = await buy();
    const list = await quick.purchases(organizerId, eventId, 1);
    expect(JSON.stringify(list)).toContain(result.orderId);
    await expect(quick.purchases(otherId, eventId, 1)).rejects.toThrow();
    expect(JSON.stringify(list)).not.toMatch(/qrToken|accessHash|claimHash|holdToken/);
  });
  it("free full-payment orders settle internally without a Payment or Deposit", async () => {
    await prisma.event.update({ where: { id: eventId }, data: { paymentMode: "full_payment" } });
    const s = await session(); const t = await types.create(organizerId, eventId, { name: randomUUID(), price: 0, quantityTotal: 2, status: "active" });
    const result = await quick.checkout(s.sessionToken, randomUUID(), "ticket", { ticketTypeId: t.id, quantity: 1, termsAccepted: true });
    expect(await quick.status(s.accessToken)).toMatchObject({ status: "paid", amountDue: 0, deposit: null });
    expect(await prisma.payment.count({ where: { orderId: result.orderId } })).toBe(0);
    await prisma.event.update({ where: { id: eventId }, data: { paymentMode: "deposit" } });
  });
  it("expires pending anonymous inventory on access and rejects expired verification", async () => {
    const { s, result, t } = await buy();
    await prisma.order.update({ where: { id: result.orderId }, data: { expiresAt: clock.now() } });
    expect(await quick.status(s.accessToken)).toMatchObject({ status: "expired" });
    expect(await prisma.ticketReservation.count({ where: { ticketTypeId: t.id, status: "active" } })).toBe(0);
    const fresh = await session(false);
    await prisma.anonymousCheckoutSession.update({ where: { id: fresh.id }, data: { expiresAt: clock.now() } });
    await expect(quick.verify({ token: new URL(fresh.telegramUrl).searchParams.get("start")!.slice(2), telegramId: telegramId.toString(), chatId: telegramId.toString(), messageId: 11 })).rejects.toThrow();
  });
  it("charges a nonzero full amount through the signed provider without a deposit", async () => {
    await prisma.event.update({ where: { id: eventId }, data: { paymentMode: "full_payment" } });
    const { s, result } = await buy();
    expect(result).toMatchObject({ amountDue: 100000, paymentMode: "full_payment", fullAmount: 100000 });
    await pay(result.orderId);
    expect(await quick.status(s.accessToken)).toMatchObject({ status: "paid", deposit: null });
    await prisma.event.update({ where: { id: eventId }, data: { paymentMode: "deposit" } });
  });
  it("retries the same delivery after send success followed by a database failure", async () => {
    const { s, result } = await buy(); await pay(result.orderId);
    const worker = new QuickDeliveryService(prisma, clock), send = vi.fn(async (_chat: string, _message: number, _text: string) => undefined);
    const spy = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("acknowledgement failed"));
    await expect(worker.tick(send, [s.id])).rejects.toThrow(); spy.mockRestore();
    await worker.tick(send, [s.id]);
    expect(send).toHaveBeenCalledTimes(2); expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: result.orderId, eventType: "anonymous.delivery_completed" } })).toBe(1);
  });
});
