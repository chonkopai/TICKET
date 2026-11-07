import { randomUUID } from "node:crypto";
import { prisma, type PrismaClient, type Prisma } from "@event-platform/database";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { TablesService } from "../tables/tables.service.js";
import { TicketsService } from "../tickets/tickets.service.js";
import { PaymentService } from "../payments/payment.service.js";
import { DevelopmentPaymentProvider } from "./payment-provider.js";
import { BookingService } from "./booking.service.js";

// Explicit opt-in: these regressions must never run against the normal application DB.
const testUrl = process.env.AUDIT_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (testUrl !== process.env.DATABASE_URL || url.hostname !== "127.0.0.1" || url.pathname !== "/ticketron_audit") {
    throw new Error("Cancellation regressions require an isolated localhost ticketron_audit database");
  }
}

const ownerId = randomUUID(), buyerId = randomUUID(), eventId = randomUUID();
const domain = new DomainEventsService();
const clock = { now: () => new Date("2030-01-01T00:00:00Z") };
const provider = new DevelopmentPaymentProvider("http://localhost:3000", "audit-payment-secret", 300, clock.now);
const types = new TicketTypesService(prisma, domain);
const tables = new TablesService(prisma, domain, { holdTtlSeconds: 600, cleanupIntervalSeconds: 60 }, clock);
const payment = new PaymentService(prisma, provider, domain, clock);
const service = (db = prisma) => new BookingService(db, types, tables, domain, { checkoutTtlSeconds: 900, cleanupIntervalSeconds: 60 }, clock, payment);
const booking = service();
const scanner = new TicketsService(prisma, domain, { isConfigured: () => false, generate: async () => Buffer.alloc(0) });

async function ticketCheckout(quantity = 1) {
  const type = await prisma.ticketType.create({ data: { eventId, name: randomUUID(), price: 1000, currency: "KZT", quantityTotal: 20, status: "active" } });
  const checkout = await booking.checkoutTickets(buyerId, randomUUID(), { ticketTypeId: type.id, quantity, termsAccepted: true });
  return { ...checkout, typeId: type.id };
}

let tableNumber = 0;
async function tableCheckout() {
  const layout = await prisma.venueLayout.findUniqueOrThrow({ where: { eventId } });
  const table = await tables.create(ownerId, layout.id, { number: ++tableNumber, seats: 2, price: 1000, geometry: { x: 20, y: 20, width: 60, height: 60 } });
  const checkout = await booking.checkoutTable(buyerId, randomUUID(), { tableId: table.id, termsAccepted: true });
  return { ...checkout, tableId: table.id };
}

/** Hold the order lock until cancellation has completed its first DB read.
 * The mutation commits before cancellation can take the lock, with no timing sleeps. */
async function raceCancellation(orderId: string, kind: "ticket" | "booking", id: string, mutate: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let signalRead!: () => void;
  const read = new Promise<void>(resolve => { signalRead = resolve; });
  const observed = prisma.$extends({ query: { $allModels: { async findFirst({ model, args, query }) {
    const result = await query(args);
    if (model === (kind === "ticket" ? "Ticket" : "Booking") && (args.where as { id?: string } | undefined)?.id === id) signalRead();
    return result;
  } } } });
  let cancellation!: Promise<PromiseSettledResult<unknown>[]>;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`;
    const concurrent = service(observed as unknown as PrismaClient);
    cancellation = Promise.allSettled([kind === "ticket" ? concurrent.cancelTicket(buyerId, id, randomUUID()) : concurrent.cancelBooking(buyerId, id, randomUUID())]);
    await read;
    await mutate(tx);
  }, { timeout: 15_000 });
  return (await cancellation)[0]!;
}

(testUrl ? describe : describe.skip)("audit cancellation regressions (isolated PostgreSQL)", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [{ id: ownerId, role: "organizer" }, { id: buyerId, role: "guest" }] });
    await prisma.event.create({ data: { id: eventId, organizerId: ownerId, title: "Cancellation regressions", status: "published", date: new Date("2035-01-01"), time: new Date("1970-01-01T18:00:00Z"), timezone: "UTC", address: "Test venue", description: "Test", cancellationTerms: "Cancellations permitted", paymentMode: "full_payment" } });
    await prisma.venueLayout.create({ data: { eventId, templateName: "Test", layoutJson: { version: 1, canvas: { width: 800, height: 600 }, tables: [] } } });
  });
  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { userId: buyerId } });
    await prisma.order.deleteMany({ where: { buyerUserId: buyerId } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [ownerId, buyerId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, buyerId] } } });
    await prisma.$disconnect();
  });

  it("preserves the full payable selection when a buyer tries to cancel part of an unpaid checkout", async () => {
    const order = await ticketCheckout(2);
    await expect(booking.cancelTicket(buyerId, order.ticketIds[0]!, randomUUID())).rejects.toMatchObject({ response: { code: "PENDING_ORDER_PARTIAL_CANCELLATION_UNAVAILABLE" } });
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "pending_payment" } })).toBe(2);
    await booking.settleSucceeded(order.orderId);
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "active" } })).toBe(2);
    expect(await prisma.ticketType.findUniqueOrThrow({ where: { id: order.typeId } })).toMatchObject({ quantitySold: 2 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).toMatchObject({ amount: 2000, paymentStatus: "paid" });
  });

  it("still cancels a single-ticket unpaid checkout and releases its reservation", async () => {
    const order = await ticketCheckout();
    await expect(booking.cancelTicket(buyerId, order.ticketIds[0]!, randomUUID())).resolves.toMatchObject({ cancelled: true, refundPending: false });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).toMatchObject({ paymentStatus: "cancelled" });
    expect(await prisma.ticketReservation.count({ where: { orderId: order.orderId, status: "active" } })).toBe(0);
    await expect(booking.settleSucceeded(order.orderId)).rejects.toMatchObject({ response: { code: "CHECKOUT_NOT_PAYABLE" } });
  });

  it("quarantines a success callback for a historical partially cancelled checkout without issuing tickets", async () => {
    const order = await ticketCheckout(2);
    // Restore the inconsistent state produced by the previous implementation.
    await prisma.ticket.update({ where: { id: order.ticketIds[0]! }, data: { status: "cancelled" } });
    await expect(booking.settleSucceeded(order.orderId)).rejects.toMatchObject({ response: { code: "CHECKOUT_SELECTION_CHANGED" } });
    const attempt = await prisma.payment.findFirstOrThrow({ where: { orderId: order.orderId } });
    const webhook = { provider: "mock", eventId: randomUUID(), eventType: "payment.succeeded" as const, providerPaymentId: attempt.providerPaymentId!, orderId: order.orderId, amount: 2000, currency: "KZT", payloadHash: randomUUID(), occurredAt: clock.now() };
    const result = await booking.handlePaymentWebhook(webhook);
    expect(result.reviewRequired).toBe(true);
    expect(await booking.handlePaymentWebhook(webhook)).toMatchObject({ duplicate: true, reviewRequired: true });
    expect(await prisma.ticket.count({ where: { orderId: order.orderId, status: "active" } })).toBe(0);
    expect(await prisma.ticketType.findUniqueOrThrow({ where: { id: order.typeId } })).toMatchObject({ quantitySold: 0 });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ status: "paid" });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.orderId, eventType: "payment.review_required" } })).toBe(1);
    expect(await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: order.orderId, eventType: "payment.review_required" } })).toMatchObject({ payload: { reason: "checkout_selection_changed" } });
  });

  it.each(["individual", "group"])("keeps a table unavailable after %s admission", async kind => {
    const order = await tableCheckout();
    await booking.settleSucceeded(order.orderId);
    if (kind === "group") {
      const pass = await prisma.groupPass.findUniqueOrThrow({ where: { orderId: order.orderId } });
      await scanner.useGroupPass(ownerId, pass.token, true);
    } else {
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: order.ticketIds[0]! } });
      await scanner.useByQrToken(ownerId, ticket.qrToken);
    }
    await expect(booking.cancelBooking(buyerId, order.bookingId!, randomUUID())).rejects.toMatchObject({ response: { code: "BOOKING_CANCELLATION_NOT_ALLOWED" } });
    expect(await prisma.table.findUniqueOrThrow({ where: { id: order.tableId } })).toMatchObject({ status: "booked" });
    expect(await prisma.seatAllocation.count({ where: { orderId: order.orderId, status: "released" } })).toBe(0);
  });

  it("does not overwrite admission that commits while ticket cancellation waits for the lock", async () => {
    const order = await ticketCheckout();
    await booking.settleSucceeded(order.orderId);
    const result = await raceCancellation(order.orderId, "ticket", order.ticketIds[0]!, tx => tx.ticket.update({ where: { id: order.ticketIds[0]! }, data: { status: "used", usedAt: clock.now() } }));
    expect(result).toMatchObject({ status: "rejected", reason: { response: { code: "TICKET_CANCELLATION_NOT_ALLOWED" } } });
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: order.ticketIds[0]! } })).toMatchObject({ status: "used" });
    expect(await prisma.ticketType.findUniqueOrThrow({ where: { id: order.typeId } })).toMatchObject({ quantitySold: 1 });
  });

  it("uses the committed payment state when cancellation waits behind settlement", async () => {
    const order = await ticketCheckout();
    const result = await raceCancellation(order.orderId, "ticket", order.ticketIds[0]!, tx => booking.settleSucceededInTransaction(tx, order.orderId));
    expect(result).toMatchObject({ status: "fulfilled", value: { refundPending: true } });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).toMatchObject({ paymentStatus: "paid" });
    expect(await prisma.ticketType.findUniqueOrThrow({ where: { id: order.typeId } })).toMatchObject({ quantitySold: 0 });
  });

  it("keeps the table booked when admission commits while booking cancellation waits", async () => {
    const order = await tableCheckout();
    await booking.settleSucceeded(order.orderId);
    const result = await raceCancellation(order.orderId, "booking", order.bookingId!, tx => tx.ticket.update({ where: { id: order.ticketIds[0]! }, data: { status: "used", usedAt: clock.now() } }));
    expect(result).toMatchObject({ status: "rejected", reason: { response: { code: "BOOKING_CANCELLATION_NOT_ALLOWED" } } });
    expect(await prisma.table.findUniqueOrThrow({ where: { id: order.tableId } })).toMatchObject({ status: "booked" });
    expect(await prisma.seatAllocation.count({ where: { orderId: order.orderId, status: "released" } })).toBe(0);
  });

  it("does not reopen a table when a preceding cancellation committed while waiting", async () => {
    const order = await tableCheckout();
    await booking.settleSucceeded(order.orderId);
    const result = await raceCancellation(order.orderId, "booking", order.bookingId!, async tx => {
      await tx.booking.update({ where: { id: order.bookingId! }, data: { status: "cancelled" } });
      // A later sale is represented by the table remaining booked after the old booking ended.
    });
    expect(result).toMatchObject({ status: "fulfilled", value: { cancelled: true } });
    expect(await prisma.table.findUniqueOrThrow({ where: { id: order.tableId } })).toMatchObject({ status: "booked" });
  });

  it("decrements sold inventory only once for concurrent cancellations with different keys", async () => {
    const order = await ticketCheckout();
    await booking.settleSucceeded(order.orderId);
    await Promise.all([booking.cancelTicket(buyerId, order.ticketIds[0]!, randomUUID()), booking.cancelTicket(buyerId, order.ticketIds[0]!, randomUUID())]);
    expect(await prisma.ticketType.findUniqueOrThrow({ where: { id: order.typeId } })).toMatchObject({ quantitySold: 0 });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.ticketIds[0]!, eventType: "ticket.cancelled" } })).toBe(1);
  });
});
