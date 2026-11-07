import { randomUUID } from "node:crypto";
import { prisma, type PrismaClient } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { TablesService } from "../tables/tables.service.js";
import { TicketsService } from "../tickets/tickets.service.js";
import { PaymentService } from "../payments/payment.service.js";
import { StaffRefundsService } from "../staff/staff-refunds.service.js";
import { AnonymousService } from "../orders/anonymous.service.js";
import { BookingService } from "./booking.service.js";
import { DevelopmentPaymentProvider, type NormalizedPaymentWebhook } from "./payment-provider.js";

// The caller must provision a new disposable DB; localhost alone is not isolation.
const testUrl = process.env.AUDIT_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (testUrl !== process.env.DATABASE_URL || url.hostname !== "127.0.0.1" || url.pathname !== "/ticketron_audit") {
    throw new Error("Lifecycle regressions require the explicitly provisioned disposable ticketron_audit database");
  }
}
const ownerId = randomUUID(), buyerId = randomUUID(), staffId = randomUUID();
const eventIds: string[] = [], orderIds: string[] = [], sessionIds: string[] = [];
const domain = new DomainEventsService();
let now = new Date("2030-01-01T00:00:00Z");
const clock = { now: () => new Date(now) };
const provider = new DevelopmentPaymentProvider("http://localhost:3000", "lifecycle-test-secret", 300, clock.now);
const types = new TicketTypesService(prisma, domain);
const tables = new TablesService(prisma, domain, { holdTtlSeconds: 600, cleanupIntervalSeconds: 60 }, clock);
const payments = new PaymentService(prisma, provider, domain, clock);
const service = (db: PrismaClient = prisma) => new BookingService(db, types, tables, domain, { checkoutTtlSeconds: 900, cleanupIntervalSeconds: 60 }, clock, payments);
const booking = service();
const scanner = (db: PrismaClient = prisma) => new TicketsService(db, domain, { isConfigured: () => false, generate: async () => Buffer.alloc(0) });
const staff = (db: PrismaClient = prisma) => new StaffRefundsService(db, provider);
const actor = { id: staffId, role: "moderator" as const, sessionId: randomUUID(), authenticated: true };

async function fixture() {
  const eventId = randomUUID(); eventIds.push(eventId);
  await prisma.event.create({ data: { id: eventId, organizerId: ownerId, title: "Lifecycle security regression", status: "published", date: new Date("2035-01-01"), time: new Date("1970-01-01T18:00:00Z"), timezone: "UTC", address: "Test", cancellationTerms: "Cancellation permitted" } });
  const layout = await prisma.venueLayout.create({ data: { eventId, templateName: "Test", layoutJson: { version: 1, canvas: { width: 800, height: 600 }, tables: [] } } });
  const type = await prisma.ticketType.create({ data: { eventId, name: randomUUID(), price: 1000, currency: "KZT", quantityTotal: 100, status: "active" } });
  return { eventId, layoutId: layout.id, typeId: type.id };
}
async function ticket(f: Awaited<ReturnType<typeof fixture>>) {
  const order = await booking.checkoutTickets(buyerId, randomUUID(), { ticketTypeId: f.typeId, quantity: 1, termsAccepted: true });
  orderIds.push(order.orderId); return order;
}
async function table(f: Awaited<ReturnType<typeof fixture>>) {
  const resource = await tables.create(ownerId, f.layoutId, { number: 1, seats: 2, price: 1000, geometry: { x: 20, y: 20, width: 60, height: 60 } });
  const order = await booking.checkoutTable(buyerId, randomUUID(), { tableId: resource.id, termsAccepted: true });
  orderIds.push(order.orderId); return { ...order, tableId: resource.id };
}
async function webhook(orderId: string): Promise<NormalizedPaymentWebhook> {
  const attempt = await prisma.payment.findFirstOrThrow({ where: { orderId } });
  return { provider: "mock", eventId: randomUUID(), eventType: "payment.succeeded", orderId, providerPaymentId: attempt.providerPaymentId!, amount: attempt.amount, currency: attempt.currency, occurredAt: clock.now(), payloadHash: randomUUID() };
}
async function pay(orderId: string) { await booking.handlePaymentWebhook(await webhook(orderId)); }

// The event writer commits while the operation waits on its lifecycle row lock.
// Query hooks signal real reads, rather than relying on timing sleeps.
async function cancelDuringRead(eventId: string, model: string, work: (db: PrismaClient) => Promise<unknown>) {
  let signal!: () => void;
  const read = new Promise<void>(resolve => { signal = resolve; });
  const observed = prisma.$extends({ query: { $allModels: {
    async findFirst({ model: current, args, query }) { const result = await query(args); if (current === model) signal(); return result; },
    async findUnique({ model: current, args, query }) { const result = await query(args); if (current === model) signal(); return result; },
  } } });
  let result!: Promise<PromiseSettledResult<unknown>[]>;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${eventId}::uuid FOR UPDATE`;
    result = Promise.allSettled([work(observed as unknown as PrismaClient)]);
    await read;
    await tx.event.update({ where: { id: eventId }, data: { status: "cancelled" } });
  }, { timeout: 15_000 });
  return (await result)[0]!;
}

(testUrl ? describe : describe.skip)("B1–B3 lifecycle security regressions (disposable PostgreSQL)", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [{ id: ownerId, role: "organizer" }, { id: buyerId, role: "guest" }] });
    await prisma.staffAccount.create({ data: { id: staffId, name: "Test moderator", email: `${staffId}@example.test`, role: "moderator" } });
  });
  afterAll(async () => {
    await prisma.anonymousCheckoutSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.idempotencyRecord.deleteMany({ where: { userId: buyerId } });
    await prisma.staffRefund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [ownerId, buyerId] } } });
    // Staff audit entries are append-only. Their account and audit fixtures
    // remain until the explicitly disposable database is destroyed.
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, buyerId] } } });
    await prisma.$disconnect();
  });

  it("rejects internal table types through authenticated and verified anonymous ticket/cart checkout", async () => {
    const f = await fixture(), original = await table(f);
    const child = await prisma.ticket.findUniqueOrThrow({ where: { id: original.ticketIds[0]! } });
    const quick = new AnonymousService(prisma, booking, payments, domain, clock, { botUsername: "test_bot", sessionSeconds: 600, accessSeconds: 3600, claimSeconds: 600 });
    const recipient = await quick.startForVerifiedRecipient("Test", "123", "123");
    const session = await quick.session(recipient.sessionToken); sessionIds.push(session.id);
    const input = { ticketTypeId: child.ticketTypeId, quantity: 10, termsAccepted: true as const };
    const cart = { eventId: f.eventId, tickets: [input], seatIds: [], termsAccepted: true as const };
    const before = await prisma.order.count();
    await expect(booking.checkoutTickets(buyerId, randomUUID(), input)).rejects.toMatchObject({ response: { code: "TICKET_TYPE_NOT_FOUND" } });
    await expect(quick.checkout(recipient.sessionToken, randomUUID(), "ticket", input)).rejects.toMatchObject({ response: { code: "TICKET_TYPE_NOT_FOUND" } });
    await expect(booking.checkoutCart(buyerId, randomUUID(), cart)).rejects.toMatchObject({ response: { code: "TICKET_UNAVAILABLE" } });
    await expect(quick.checkout(recipient.sessionToken, randomUUID(), "cart", cart)).rejects.toMatchObject({ response: { code: "TICKET_UNAVAILABLE" } });
    await expect(types.reserve(child.ticketTypeId, 1, new Date(Date.now() + 60_000))).rejects.toMatchObject({ response: { code: "TICKET_TYPE_NOT_ON_SALE" } });
    expect(await prisma.order.count()).toBe(before);
    expect(await prisma.ticketReservation.count({ where: { ticketTypeId: child.ticketTypeId } })).toBe(0);
    await pay(original.orderId);
    expect(await prisma.ticket.count({ where: { orderId: original.orderId, status: "active" } })).toBe(2);
  });

  it("rechecks internal eligibility after the ticket-type lock and rolls the checkout back", async () => {
    const f = await fixture();
    let signal!: () => void; const read = new Promise<void>(resolve => { signal = resolve; });
    const observed = prisma.$extends({ query: { ticketType: { async findFirst({ args, query }) { const result = await query(args); signal(); return result; } } } });
    let result!: Promise<PromiseSettledResult<unknown>[]>;
    const before = await prisma.order.count();
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${f.typeId}`},0))`;
      result = Promise.allSettled([service(observed as unknown as PrismaClient).checkoutTickets(buyerId, randomUUID(), { ticketTypeId: f.typeId, quantity: 1, termsAccepted: true })]);
      await read;
      await tx.ticketType.update({ where: { id: f.typeId }, data: { isInternal: true } });
    }, { timeout: 15_000 });
    expect((await result)[0]).toMatchObject({ status: "rejected", reason: { response: { code: "TICKET_TYPE_NOT_ON_SALE" } } });
    expect(await prisma.order.count()).toBe(before);
  });

  it("continues to settle ordinary public free tickets", async () => {
    const f = await fixture(); await prisma.ticketType.update({ where: { id: f.typeId }, data: { price: 0 } });
    const order = await ticket(f);
    expect(order.amountDue).toBe(0);
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "active" } })).toBe(1);
  });

  it.each(["cancelled", "completed"] as const)("rejects direct settlement and reviews money received after event %s", async status => {
    const f = await fixture(), order = await table(f), callback = await webhook(order.orderId);
    await prisma.event.update({ where: { id: f.eventId }, data: { status } });
    await expect(booking.settleSucceeded(order.orderId)).rejects.toMatchObject({ response: { code: "EVENT_NOT_PUBLISHED" } });
    expect(await booking.handlePaymentWebhook(callback)).toMatchObject({ reviewRequired: true });
    expect(await booking.handlePaymentWebhook(callback)).toMatchObject({ duplicate: true, reviewRequired: true });
    expect(await prisma.payment.findFirstOrThrow({ where: { orderId: order.orderId } })).toMatchObject({ status: "paid" });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).toMatchObject({ paymentStatus: "cancelled" });
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "active" } })).toBe(0);
    expect(await prisma.seatAllocation.count({ where: { orderId: order.orderId, status: "released" } })).toBe(2);
    expect(await prisma.table.findUniqueOrThrow({ where: { id: order.tableId } })).toMatchObject({ status: "available" });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.orderId, eventType: "payment.review_required" } })).toBe(1);
    expect(await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: order.orderId, eventType: "payment.review_required" } })).toMatchObject({ payload: { reason: "event_not_published" } });
  });

  it("observes cancellation committed while payment waits for the event lock", async () => {
    const f = await fixture(), order = await ticket(f), callback = await webhook(order.orderId);
    expect(await cancelDuringRead(f.eventId, "Order", db => service(db).handlePaymentWebhook(callback))).toMatchObject({ status: "fulfilled", value: { reviewRequired: true } });
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "active" } })).toBe(0);
    expect(await prisma.ticketType.findUniqueOrThrow({ where: { id: f.typeId } })).toMatchObject({ quantitySold: 0 });
  });

  it("observes cancellation committed while direct settlement waits for the event lock", async () => {
    const f = await fixture(), order = await ticket(f);
    expect(await cancelDuringRead(f.eventId, "Order", db => service(db).settleSucceeded(order.orderId))).toMatchObject({ status: "rejected", reason: { response: { code: "EVENT_NOT_PUBLISHED" } } });
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "active" } })).toBe(0);
  });

  it.each(["cancelled", "completed"] as const)("rejects individual/group admission and QR retrieval for a %s event", async status => {
    const f = await fixture(), order = await table(f); await pay(order.orderId);
    const child = await prisma.ticket.findUniqueOrThrow({ where: { id: order.ticketIds[0]! } });
    const pass = await prisma.groupPass.findUniqueOrThrow({ where: { orderId: order.orderId } });
    await prisma.event.update({ where: { id: f.eventId }, data: { status } });
    const closed = { response: { code: "EVENT_NOT_PUBLISHED" } };
    await expect(scanner().useByQrToken(ownerId, child.qrToken, f.eventId)).rejects.toMatchObject(closed);
    await expect(scanner().useGroupPass(ownerId, pass.token, true, f.eventId)).rejects.toMatchObject(closed);
    await expect(scanner().transition(ownerId, child.id, "used")).rejects.toMatchObject(closed);
    await expect(scanner().renderQrForUser(buyerId, child.id)).rejects.toMatchObject(closed);
    await expect(scanner().renderGroupPassQrForUser(buyerId, pass.id)).rejects.toMatchObject(closed);
    await expect(scanner().assetForAnonymousOrder(order.orderId, child.id, false)).rejects.toMatchObject(closed);
    await expect(scanner().assetGroupPassForOrder(order.orderId, pass.id)).rejects.toMatchObject(closed);
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "used" } })).toBe(0);
  });

  it.each(["individual", "group"])("does not admit a %s scan using event state read before cancellation commits", async kind => {
    const f = await fixture(), order = await table(f); await pay(order.orderId);
    const child = await prisma.ticket.findUniqueOrThrow({ where: { id: order.ticketIds[0]! } });
    const pass = await prisma.groupPass.findUniqueOrThrow({ where: { orderId: order.orderId } });
    const result = await cancelDuringRead(f.eventId, kind === "individual" ? "Ticket" : "GroupPass", db => kind === "individual" ? scanner(db).useByQrToken(ownerId, child.qrToken, f.eventId) : scanner(db).useGroupPass(ownerId, pass.token, true, f.eventId));
    expect(result).toMatchObject({ status: "rejected", reason: { response: { code: "EVENT_NOT_PUBLISHED" } } });
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "used" } })).toBe(0);
    expect(await prisma.groupPass.findUniqueOrThrow({ where: { id: pass.id } })).toMatchObject({ status: "active" });
  });

  it("refunds a cancelled historical table order without changing the replacement sale", async () => {
    const f = await fixture(), old = await table(f); await pay(old.orderId);
    await booking.cancelBooking(buyerId, old.bookingId!, randomUUID());
    const replacement = await booking.checkoutTable(buyerId, randomUUID(), { tableId: old.tableId, termsAccepted: true }); orderIds.push(replacement.orderId); await pay(replacement.orderId);
    const input = { key: randomUUID(), reason: "Refund the original cancelled booking", override: true };
    expect(await staff().request(actor, old.orderId, input)).toMatchObject({ status: "succeeded" });
    expect(await staff().request(actor, old.orderId, input)).toMatchObject({ status: "succeeded" });
    expect(await prisma.table.findUniqueOrThrow({ where: { id: old.tableId } })).toMatchObject({ status: "booked" });
    expect(await prisma.booking.findUniqueOrThrow({ where: { orderId: replacement.orderId } })).toMatchObject({ status: "confirmed" });
    expect(await prisma.seatAllocation.count({ where: { orderId: replacement.orderId, status: "consumed" } })).toBe(2);
    expect(await prisma.groupPass.findUniqueOrThrow({ where: { orderId: replacement.orderId } })).toMatchObject({ status: "active" });
    await expect(tables.hold(old.tableId, randomUUID())).rejects.toBeDefined();
  });

  it("still releases a currently owned table exactly once on a staff refund", async () => {
    const f = await fixture(), order = await table(f); await pay(order.orderId);
    const input = { key: randomUUID(), reason: "Refund the current table purchase", override: true };
    await staff().request(actor, order.orderId, input); await staff().request(actor, order.orderId, input);
    expect(await prisma.table.findUniqueOrThrow({ where: { id: order.tableId } })).toMatchObject({ status: "available" });
    expect(await prisma.seatAllocation.count({ where: { orderId: order.orderId, status: "released" } })).toBe(2);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).toMatchObject({ paymentStatus: "refunded" });
  });

  it("rereads historical ownership after a concurrent resale releases the table lock", async () => {
    const f = await fixture(), old = await table(f); await pay(old.orderId);
    await booking.cancelBooking(buyerId, old.bookingId!, randomUUID());
    let signal!: () => void; const read = new Promise<void>(resolve => { signal = resolve; });
    const observed = prisma.$extends({ query: { booking: { async findUnique({ args, query }) {
      const result = await query(args);
      if (args.where.orderId === old.orderId) signal();
      return result;
    } } } });
    let refund!: Promise<PromiseSettledResult<unknown>[]>;
    let replacementId!: string;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`table:${old.tableId}`},0))`;
      refund = Promise.allSettled([staff(observed as unknown as PrismaClient).request(actor, old.orderId, { key: randomUUID(), reason: "Refund while the replacement sale commits", override: true })]);
      await read;
      // Reuse the actual checkout transaction through its internal anonymous
      // boundary so resale commits before the waiting refund can reread state.
      const replacement = await booking.checkoutTable(buyerId, randomUUID(), { tableId: old.tableId, termsAccepted: true }, {
        transaction: tx, sessionId: randomUUID(), verifiedEmail: null, guestContact: { name: "Replacement buyer" },
      });
      replacementId = replacement.orderId; orderIds.push(replacementId);
      await booking.settleSucceededInTransaction(tx, replacementId);
    }, { timeout: 15_000 });
    expect((await refund)[0]).toMatchObject({ status: "fulfilled", value: { status: "succeeded" } });
    expect(await prisma.table.findUniqueOrThrow({ where: { id: old.tableId } })).toMatchObject({ status: "booked" });
    expect(await prisma.booking.findUniqueOrThrow({ where: { orderId: replacementId } })).toMatchObject({ status: "confirmed" });
    expect(await prisma.groupPass.findUniqueOrThrow({ where: { orderId: replacementId } })).toMatchObject({ status: "active" });
  });

  it.each(["release", "expiry"])("limits hold %s cleanup to the hold's own order", async action => {
    const f = await fixture(), order = await table(f); await pay(order.orderId);
    // Historical corruption from B3: a paid booking's table was incorrectly reopened.
    // A later bare hold must never invalidate that paid booking's group pass.
    await prisma.table.update({ where: { id: order.tableId }, data: { status: "available" } });
    const hold = await tables.hold(order.tableId, randomUUID());
    if (action === "release") await tables.release(order.tableId, hold.holdToken);
    else {
      const previous = now; now = new Date(now.getTime() + 601_000);
      try { await tables.expireLayoutHolds(f.layoutId); } finally { now = previous; }
    }
    expect(await prisma.groupPass.findUniqueOrThrow({ where: { orderId: order.orderId } })).toMatchObject({ status: "active" });
    expect(await prisma.booking.findUniqueOrThrow({ where: { orderId: order.orderId } })).toMatchObject({ status: "confirmed" });
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "active" } })).toBe(2);
  });
});
