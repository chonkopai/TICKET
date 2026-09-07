import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import type { BookingClock } from "./booking.constants.js";
import { BookingService } from "./booking.service.js";
import { DevelopmentPaymentProvider } from "./payment-provider.js";
import { PaymentService } from "../payments/payment.service.js";

const organizerId = randomUUID();
const guestId = randomUUID();
const depositEventId = randomUUID();
const fullEventId = randomUUID();
const layoutId = randomUUID();

class FakeClock implements BookingClock {
  constructor(public value = new Date("2030-09-03T12:00:00.000Z")) {}
  now(): Date { return new Date(this.value); }
  advance(milliseconds: number): void { this.value = new Date(this.value.getTime() + milliseconds); }
}

const clock = new FakeClock();
const events = new DomainEventsService();
const ticketTypes = new TicketTypesService(prisma, events);
const tables = new TablesService(prisma, events, { holdTtlSeconds: 600, cleanupIntervalSeconds: 60 }, clock);
const provider = new DevelopmentPaymentProvider("http://localhost:3000", "development-webhook-secret", 300, () => clock.now());
const paymentLinks = new PaymentService(prisma, provider, events, clock);
const service = new BookingService(
  prisma,
  ticketTypes,
  tables,
  events,
  { checkoutTtlSeconds: 900, cleanupIntervalSeconds: 60 },
  clock,
  paymentLinks,
);

beforeAll(async () => {
  const base = BigInt(Date.now()) * 100_000n;
  await prisma.user.createMany({ data: [
    { id: organizerId, telegramId: base + 8_101n, role: "organizer" },
    { id: guestId, telegramId: base + 8_102n, role: "guest" },
  ] });
  await prisma.event.createMany({ data: [
    eventData(depositEventId, "deposit", false, "Deposit event"),
    eventData(fullEventId, "full_payment", false, "Full event"),
  ] });
  await prisma.venueLayout.create({ data: {
    id: layoutId,
    eventId: depositEventId,
    templateName: "Checkout layout",
    layoutJson: { version: 1, canvas: { width: 800, height: 600 }, tables: [] },
  } });
});

afterAll(async () => {
  await prisma.idempotencyRecord.deleteMany({ where: { userId: guestId } });
  await prisma.order.deleteMany({ where: { buyerUserId: guestId } });
  await prisma.event.deleteMany({ where: { id: { in: [depositEventId, fullEventId] } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [guestId, organizerId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [guestId, organizerId] } } });
});

describe("BookingService", () => {
  it("charges only the deposit, hides optional full amount, snapshots terms and replays safely", async () => {
    const type = await ticketTypes.create(organizerId, depositEventId, {
      name: `Deposit ${randomUUID()}`,
      price: 100_000,
      deposit: 25_000,
      quantityTotal: 10,
      status: "active",
    });
    const key = `checkout-${randomUUID()}`;
    const checkout = await service.checkoutTickets(guestId, key, { ticketTypeId: type.id, quantity: 2, termsAccepted: true });
    expect(checkout).toMatchObject({ paymentMode: "deposit", paymentLabel: "deposit", amountDue: 50_000, fullAmount: null });
    await expect(service.checkoutTickets(guestId, key, { ticketTypeId: type.id, quantity: 2, termsAccepted: true })).resolves.toEqual(checkout);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId }, include: { deposit: true, tickets: true, reservations: true } });
    expect(order).toMatchObject({ amount: 50_000, currency: "KZT", deposit: { amount: 50_000 }, tickets: [{ status: "pending_payment" }, { status: "pending_payment" }] });
    expect(order.reservations).toHaveLength(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: checkout.orderId, eventType: "checkout.ticket_created" } })).toBe(1);

    await prisma.event.update({ where: { id: depositEventId }, data: { cancellationTerms: "Новые условия", showFullAmountForDeposit: true } });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(stored.checkoutSnapshot).toMatchObject({ cancellationTerms: "Возврат по правилам", fullAmount: null });
  });

  it("charges the full server amount and creates no Deposit", async () => {
    const type = await ticketTypes.create(organizerId, fullEventId, {
      name: `Full ${randomUUID()}`,
      price: 175_000,
      quantityTotal: 5,
      status: "active",
    });
    const checkout = await service.checkoutTickets(guestId, `full-${randomUUID()}`, { ticketTypeId: type.id, quantity: 1, termsAccepted: true });
    expect(checkout).toMatchObject({ paymentMode: "full_payment", amountDue: 175_000, fullAmount: 175_000 });
    await expect(prisma.deposit.findUnique({ where: { orderId: checkout.orderId } })).resolves.toBeNull();
  });

  it("allows exactly one of 20 concurrent checkouts for the final ticket", async () => {
    const type = await ticketTypes.create(organizerId, fullEventId, {
      name: `Last ${randomUUID()}`,
      price: 10_000,
      quantityTotal: 1,
      status: "active",
    });
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
      service.checkoutTickets(guestId, `ticket-race-${index}-${randomUUID()}`, { ticketTypeId: type.id, quantity: 1, termsAccepted: true }),
    ));
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(19);
    expect(await prisma.ticketReservation.count({ where: { ticketTypeId: type.id, status: "active" } })).toBe(1);
    expect(await prisma.order.count({ where: { tickets: { some: { ticketTypeId: type.id } } } })).toBe(1);
  });

  it("serializes table checkout, confirms it internally, and cancels with one refund request", async () => {
    const table = await tables.create(organizerId, layoutId, {
      number: 901,
      name: "Стол checkout",
      seats: 6,
      price: 900_000,
      deposit: 150_000,
      geometry: { x: 20, y: 20, width: 80, height: 60 },
    });
    const keys = Array.from({ length: 20 }, (_, index) => `table-race-${index}-${randomUUID()}`);
    const attempts = await Promise.allSettled(keys.map((key) => service.checkoutTable(guestId, key, { tableId: table.id, termsAccepted: true })));
    const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
    expect(successes).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(19);
    const winner = successes[0];
    if (!winner || winner.status !== "fulfilled") throw new Error("winner missing");
    expect(winner.value).toMatchObject({ amountDue: 150_000, fullAmount: 900_000, paymentMode: "deposit" });
    const winnerIndex = attempts.findIndex(({ status }) => status === "fulfilled");
    await expect(service.checkoutTable(guestId, keys[winnerIndex]!, { tableId: table.id, termsAccepted: true })).resolves.toEqual(winner.value);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: winner.value.orderId, eventType: "checkout.table_created" } })).toBe(1);

    await service.settleSucceeded(winner.value.orderId);
    await expect(prisma.table.findUniqueOrThrow({ where: { id: table.id } })).resolves.toMatchObject({ status: "booked" });
    await expect(prisma.deposit.findUniqueOrThrow({ where: { orderId: winner.value.orderId } })).resolves.toMatchObject({ status: "paid" });
    const cancelKey = `cancel-${randomUUID()}`;
    const cancelled = await service.cancelBooking(guestId, winner.value.bookingId!, cancelKey);
    expect(cancelled).toEqual({ resourceId: winner.value.bookingId, cancelled: true, refundPending: true });
    await expect(service.cancelBooking(guestId, winner.value.bookingId!, cancelKey)).resolves.toEqual(cancelled);
    await expect(prisma.table.findUniqueOrThrow({ where: { id: table.id } })).resolves.toMatchObject({ status: "available" });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: winner.value.orderId, eventType: "refund.requested" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: winner.value.bookingId!, action: "booking.cancelled" } })).toBe(1);
  });

  it("releases expired checkout inventory through bounded cleanup", async () => {
    const type = await ticketTypes.create(organizerId, fullEventId, {
      name: `Expiry ${randomUUID()}`,
      price: 10_000,
      quantityTotal: 1,
      status: "active",
    });
    await service.checkoutTickets(guestId, `expiry-${randomUUID()}`, { ticketTypeId: type.id, quantity: 1, termsAccepted: true });
    clock.advance(901_000);
    await expect(service.expireDueCheckouts(100)).resolves.toBeGreaterThanOrEqual(1);
    await expect(ticketTypes.get(organizerId, type.id)).resolves.toMatchObject({ counters: { reserved: 0, remaining: 1 } });
  });

  it("cancels an owned paid ticket once and preserves financial history", async () => {
    const type = await ticketTypes.create(organizerId, fullEventId, {
      name: `Cancellation ${randomUUID()}`,
      price: 40_000,
      quantityTotal: 1,
      status: "active",
    });
    const checkout = await service.checkoutTickets(guestId, `paid-${randomUUID()}`, { ticketTypeId: type.id, quantity: 1, termsAccepted: true });
    const ticketId = checkout.ticketIds[0]!;
    await service.settleSucceeded(checkout.orderId);
    const key = `ticket-cancel-${randomUUID()}`;
    const first = await service.cancelTicket(guestId, ticketId, key);
    await expect(service.cancelTicket(guestId, ticketId, key)).resolves.toEqual(first);
    expect(first.refundPending).toBe(true);
    await expect(prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).resolves.toMatchObject({ paymentStatus: "paid" });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: checkout.orderId, eventType: "refund.requested" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: ticketId, action: "ticket.cancelled" } })).toBe(1);
  });

  it("keeps the payment intent and hold when the provider is temporarily unavailable", async () => {
    const table = await tables.create(organizerId, layoutId, {
      number: 902,
      seats: 4,
      price: 500_000,
      deposit: 100_000,
      geometry: { x: 120, y: 20, width: 80, height: 60 },
    });
    const failing = new BookingService(
      prisma,
      ticketTypes,
      tables,
      events,
      { checkoutTtlSeconds: 900, cleanupIntervalSeconds: 60 },
      clock,
      new PaymentService(prisma, { name: "mock", createPaymentLink: async () => { throw new Error("provider unavailable"); }, verifyWebhook: () => { throw new Error("not supported"); } }, events, clock),
    );
    const key = `rollback-${randomUUID()}`;
    await expect(failing.checkoutTable(guestId, key, { tableId: table.id, termsAccepted: true })).rejects.toThrow("Payment provider is temporarily unavailable");
    await expect(prisma.table.findUniqueOrThrow({ where: { id: table.id } })).resolves.toMatchObject({ status: "held" });
    await expect(prisma.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId: guestId, operation: "checkout.table", key } } })).resolves.toMatchObject({ response: expect.objectContaining({ paymentLink: "" }) });
    expect(await prisma.payment.count({ where: { order: { buyerUserId: guestId }, status: "pending" } })).toBeGreaterThan(0);
  });

  it("rejects a second successful settlement after failure", async () => {
    const type = await ticketTypes.create(organizerId, fullEventId, {
      name: `Failure ${randomUUID()}`,
      price: 10_000,
      quantityTotal: 1,
      status: "active",
    });
    const checkout = await service.checkoutTickets(guestId, `failure-${randomUUID()}`, { ticketTypeId: type.id, quantity: 1, termsAccepted: true });
    await service.settleFailed(checkout.orderId);
    await expect(service.settleSucceeded(checkout.orderId)).rejects.toBeInstanceOf(ConflictException);
  });
});

function eventData(id: string, paymentMode: "deposit" | "full_payment", showFullAmountForDeposit: boolean, title: string) {
  return {
    id,
    organizerId,
    title,
    description: "Описание",
    cancellationTerms: "Возврат по правилам",
    depositTerms: paymentMode === "deposit" ? "Депозит засчитывается" : null,
    paymentMode,
    showFullAmountForDeposit,
    date: new Date("2031-09-03T00:00:00.000Z"),
    time: new Date("1970-01-01T19:00:00.000Z"),
    timezone: "Asia/Almaty",
    venueName: "Зал",
    address: "Адрес",
    status: "published" as const,
  };
}
