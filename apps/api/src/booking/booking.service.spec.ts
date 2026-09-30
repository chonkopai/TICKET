import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { TicketsService } from "../tickets/tickets.service.js";
import type { BookingClock } from "./booking.constants.js";
import { BookingService } from "./booking.service.js";
import { CheckoutEmailService } from "./checkout-email.service.js";
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
  new CheckoutEmailService({} as never),
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
  it("freezes a linked email in a paid order and rejects idempotent destination changes", async () => {
    const address = `buyer-${randomUUID()}@example.test`;
    await prisma.contactIdentity.create({ data: { userId: guestId, method: "email", normalizedIdentifier: address, verifiedAt: new Date() } });
    const type = await ticketTypes.create(organizerId, fullEventId, { name: `Email ${randomUUID()}`, price: 1200, quantityTotal: 2, status: "active" });
    const key = `email-${randomUUID()}`;
    const input = { ticketTypeId: type.id, quantity: 1, termsAccepted: true as const, emailDelivery: { address } };
    const checkout = await service.checkoutTickets(guestId, key, input);
    expect(checkout.emailDelivery).toMatchObject({ address });
    await expect(service.checkoutTickets(guestId, key, input)).resolves.toEqual(checkout);
    await expect(service.checkoutTickets(guestId, key, { ...input, emailDelivery: { address: "another@example.test" } })).rejects.toThrow();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).emailDeliveryAddress).toBe(address);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: checkout.orderId, eventType: "ticket.email_requested" } })).toBe(0);
    await service.settleSucceeded(checkout.orderId);
    await service.settleSucceeded(checkout.orderId);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: checkout.orderId, eventType: "ticket.email_requested" } })).toBe(1);
  });
  it("checks out two zones, a whole table and an assigned seat as one deposit order", async () => {
    const first = await ticketTypes.create(organizerId, depositEventId, { name: `Fan A ${randomUUID()}`, price: 10_000, deposit: 2_000, quantityTotal: 10, status: "active" });
    const second = await ticketTypes.create(organizerId, depositEventId, { name: `Fan B ${randomUUID()}`, price: 15_000, deposit: 3_000, quantityTotal: 10, status: "active" });
    const table = await tables.create(organizerId, layoutId, { number: 990, seats: 4, price: 40_000, deposit: 8_000, currency: "KZT", geometry: { x: 100, y: 100, width: 100, height: 80 } });
    const seatType = await ticketTypes.create(organizerId, depositEventId, { name: `Seat ${randomUUID()}`, price: 20_000, deposit: 5_000, quantityTotal: 1, status: "active" });
    const row = await prisma.venueRow.create({ data: { venueLayoutId: layoutId, number: 990, price: 20_000, deposit: 5_000, currency: "KZT" } });
    const seat = await prisma.seat.create({ data: { venueLayoutId: layoutId, rowId: row.id, number: 1, label: "Ряд 990 · место 1", sortOrder: 1, ticketTypeId: seatType.id } });
    const key = `cart-${randomUUID()}`;
    const input = { eventId: depositEventId, tickets: [{ ticketTypeId: first.id, quantity: 2 }, { ticketTypeId: second.id, quantity: 1 }], tableId: table.id, seatIds: [seat.id], termsAccepted: true as const };
    const checkout = await service.checkoutCart(guestId, key, input);
    expect(checkout).toMatchObject({ kind: "cart", amountDue: 20_000, fullAmount: null });
    expect(checkout.bookingId).toBeTruthy();
    expect(checkout.ticketIds).toHaveLength(8);
    await expect(service.checkoutCart(guestId, key, input)).resolves.toEqual(checkout);
    expect(await prisma.order.count({ where: { id: checkout.orderId } })).toBe(1);
    await service.settleSucceeded(checkout.orderId);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId }, include: { tickets: true, booking: true, reservations: true, deposit: true } });
    expect(order.paymentStatus).toBe("paid");
    expect(order.booking?.status).toBe("confirmed");
    expect(order.tickets.every((ticket) => ticket.status === "active")).toBe(true);
    expect(order.reservations).toHaveLength(2);
    expect(order.reservations.every((reservation) => reservation.status === "consumed")).toBe(true);
    expect(order.deposit?.amount).toBe(20_000);
    const pass = await prisma.groupPass.findUniqueOrThrow({ where: { orderId: checkout.orderId } });
    const scanner = new TicketsService(prisma, events, { isConfigured: () => false, generate: async () => Buffer.alloc(0) });
    const scan = await scanner.useGroupPass(organizerId, pass.token, true, depositEventId);
    expect(scan.admitted).toBe(4);
    expect((await prisma.ticket.findMany({ where: { orderId: checkout.orderId, ticketTypeId: { in: [first.id, second.id] } } })).every((ticket) => ticket.status === "active")).toBe(true);
    expect((await prisma.ticket.findFirstOrThrow({ where: { orderId: checkout.orderId, ticketTypeId: seatType.id } })).status).toBe("active");
    await service.settleSucceeded(checkout.orderId);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: first.id } })).quantitySold).toBe(2);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: second.id } })).quantitySold).toBe(1);
  });

  it("releases every cart hold when payment fails and rejects cross-event items atomically", async () => {
    const first = await ticketTypes.create(organizerId, depositEventId, { name: `Cart release ${randomUUID()}`, price: 10_000, deposit: 2_000, quantityTotal: 1, status: "active" });
    const other = await ticketTypes.create(organizerId, fullEventId, { name: `Other ${randomUUID()}`, price: 10_000, quantityTotal: 1, status: "active" });
    const table = await tables.create(organizerId, layoutId, { number: 991, seats: 2, price: 20_000, deposit: 4_000, currency: "KZT", geometry: { x: 250, y: 100, width: 100, height: 80 } });
    await expect(service.checkoutCart(guestId, `cart-wrong-${randomUUID()}`, { eventId: depositEventId, tickets: [{ ticketTypeId: other.id, quantity: 1 }], tableId: table.id, seatIds: [], termsAccepted: true })).rejects.toThrow();
    expect((await prisma.table.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("available");
    const checkout = await service.checkoutCart(guestId, `cart-release-${randomUUID()}`, { eventId: depositEventId, tickets: [{ ticketTypeId: first.id, quantity: 1 }], tableId: table.id, seatIds: [], termsAccepted: true });
    await service.settleFailed(checkout.orderId);
    expect((await prisma.table.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("available");
    expect(await prisma.ticketReservation.count({ where: { orderId: checkout.orderId, status: "active" } })).toBe(0);
    expect(await prisma.seatAllocation.count({ where: { orderId: checkout.orderId, status: "active" } })).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).paymentStatus).toBe("failed");
  });

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

  it("releases only the event's active unpaid hold once and rejects settlement afterward", async () => {
    const type = await ticketTypes.create(organizerId, fullEventId, { name: `Release ${randomUUID()}`, price: 20_000, quantityTotal: 2, status: "active" });
    const checkout = await service.checkoutTickets(guestId, `release-${randomUUID()}`, { ticketTypeId: type.id, quantity: 2, termsAccepted: true });
    await expect(service.organizerHoldPreview(guestId, fullEventId, checkout.orderId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.organizerHoldPreview(organizerId, depositEventId, checkout.orderId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.organizerHoldPreview(organizerId, fullEventId, checkout.orderId)).resolves.toMatchObject({ eligible: true, reason: "active" });
    const results = await Promise.all([service.organizerReleaseHold(organizerId, fullEventId, checkout.orderId), service.organizerReleaseHold(organizerId, fullEventId, checkout.orderId)]);
    expect(results.map((result) => result.alreadyReleased).sort()).toEqual([false, true]);
    await expect(service.settleSucceeded(checkout.orderId)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.ticketReservation.count({ where: { orderId: checkout.orderId, status: "active" } })).toBe(0);
    expect(await prisma.ticket.count({ where: { orderId: checkout.orderId, status: "cancelled" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { entityId: checkout.orderId, action: "checkout.hold_released" } })).toBe(1);
  });

  it("keeps a paid whole table and its seats when stale hold release arrives", async () => {
    const table = await tables.create(organizerId, layoutId, { number: 1902, name: "Paid table", seats: 4, price: 400_000, deposit: 100_000, geometry: { x: 120, y: 20, width: 80, height: 60 } });
    const checkout = await service.checkoutTable(guestId, `paid-hold-${randomUUID()}`, { tableId: table.id, termsAccepted: true });
    await service.settleSucceeded(checkout.orderId);
    await expect(service.organizerReleaseHold(organizerId, depositEventId, checkout.orderId)).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.table.findUniqueOrThrow({ where: { id: table.id } })).resolves.toMatchObject({ status: "booked" });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).resolves.toMatchObject({ paymentStatus: "paid" });
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

  it("keeps an expired order unissued when a signed success callback arrives late", async () => {
    const type = await ticketTypes.create(organizerId, fullEventId, { name: `Late ${randomUUID()}`, price: 10_000, quantityTotal: 1, status: "active" });
    const checkout = await service.checkoutTickets(guestId, `late-${randomUUID()}`, { ticketTypeId: type.id, quantity: 1, termsAccepted: true });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: checkout.orderId } });
    clock.advance(901_000);
    const signed = DevelopmentPaymentProvider.signWebhook({ eventId: randomUUID(), eventType: "payment.succeeded", providerPaymentId: payment.providerPaymentId, orderId: checkout.orderId, amount: payment.amount, currency: payment.currency }, "development-webhook-secret", Math.floor(clock.now().getTime() / 1000));
    const webhook = provider.verifyWebhook({ rawBody: signed.rawBody, headers: signed.headers });
    await service.handlePaymentWebhook(webhook);
    await service.handlePaymentWebhook(webhook);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).not.toMatchObject({ paymentStatus: "paid" });
    expect(await prisma.ticket.count({ where: { orderId: checkout.orderId, status: "active" } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: checkout.orderId, eventType: "payment.review_required" } })).toBe(1);
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
