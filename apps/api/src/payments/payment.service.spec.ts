import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { BookingService } from "../booking/booking.service.js";
import { TablesService } from "../tables/tables.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import type { BookingClock } from "../booking/booking.constants.js";
import { DevelopmentPaymentProvider } from "../booking/payment-provider.js";
import { PaymentService } from "./payment.service.js";

const organizerId = randomUUID();
const guestId = randomUUID();
const eventId = randomUUID();
const typeId = randomUUID();
const secret = "batch8-webhook-test-secret";
const now = new Date("2031-05-01T10:00:00.000Z");

class TestClock implements BookingClock { now(): Date { return new Date(now); } }
const clock = new TestClock();
const events = new DomainEventsService();
const tickets = new TicketTypesService(prisma, events);
const tables = new TablesService(prisma, events, { holdTtlSeconds: 600, cleanupIntervalSeconds: 60 }, clock);
const provider = new DevelopmentPaymentProvider("http://localhost:3000", secret, 300, () => now);
const payments = new PaymentService(prisma, provider, events, clock);
const booking = new BookingService(prisma, tickets, tables, events, { checkoutTtlSeconds: 900, cleanupIntervalSeconds: 60 }, clock, payments);

beforeAll(async () => {
  const telegram = BigInt(Date.now()) * 100_000n;
  await prisma.user.createMany({ data: [{ id: organizerId, telegramId: telegram + 701n, role: "organizer" }, { id: guestId, telegramId: telegram + 702n, role: "guest" }] });
  await prisma.event.create({ data: { id: eventId, organizerId, title: "Payment test", date: new Date("2031-05-03T00:00:00.000Z"), time: new Date("1970-01-01T19:00:00.000Z"), timezone: "Asia/Almaty", venueName: "Hall", address: "Address", status: "published" } });
  await prisma.ticketType.create({ data: { id: typeId, eventId, name: "Standard", price: 10_000, currency: "KZT", quantityTotal: 2, status: "active" } });
});

afterAll(async () => {
  await prisma.webhookEvent.deleteMany({ where: { order: { buyerUserId: guestId } } });
  await prisma.idempotencyRecord.deleteMany({ where: { userId: guestId } });
  await prisma.order.deleteMany({ where: { buyerUserId: guestId } });
  await prisma.event.delete({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerId, guestId] } } });
});

describe("DevelopmentPaymentProvider", () => {
  it("verifies exact bytes and rejects altered or stale callbacks", () => {
    const signed = DevelopmentPaymentProvider.signWebhook({ eventId: "evt-1", eventType: "payment.succeeded", providerPaymentId: "pay-1", amount: 100, currency: "KZT" }, secret, Math.floor(now.getTime() / 1_000));
    expect(provider.verifyWebhook({ rawBody: signed.rawBody, headers: signed.headers, now })).toMatchObject({ eventId: "evt-1", amount: 100 });
    expect(() => provider.verifyWebhook({ rawBody: Buffer.from(`${signed.rawBody} `), headers: signed.headers, now })).toThrow(/invalid/i);
    expect(() => provider.verifyWebhook({ rawBody: signed.rawBody, headers: signed.headers, now: new Date(now.getTime() + 301_000) })).toThrow(/stale/i);
  });
});

describe("Payment settlement", () => {
  it("finalizes a ticket exactly once for duplicate and concurrent callbacks", async () => {
    const checkout = await booking.checkoutTickets(guestId, `pay-${randomUUID()}`, { ticketTypeId: typeId, quantity: 1, termsAccepted: true });
    const attempt = await prisma.payment.findFirst({ where: { orderId: checkout.orderId } });
    if (!attempt?.providerPaymentId) throw new Error("payment attempt missing");
    const signed = DevelopmentPaymentProvider.signWebhook({ eventId: `evt-${randomUUID()}`, eventType: "payment.succeeded", providerPaymentId: attempt.providerPaymentId, orderId: checkout.orderId, amount: attempt.amount, currency: attempt.currency }, secret, Math.floor(now.getTime() / 1_000));
    const normalized = provider.verifyWebhook({ rawBody: signed.rawBody, headers: signed.headers, now });
    const results = await Promise.all([booking.handlePaymentWebhook(normalized), booking.handlePaymentWebhook(normalized)]);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    await expect(prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).resolves.toMatchObject({ paymentStatus: "paid" });
    await expect(prisma.payment.findFirstOrThrow({ where: { orderId: checkout.orderId } })).resolves.toMatchObject({ status: "paid" });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: checkout.orderId, eventType: "checkout.paid" } })).toBe(1);
    const altered = DevelopmentPaymentProvider.signWebhook({ eventId: normalized.eventId, eventType: "payment.succeeded", providerPaymentId: attempt.providerPaymentId, orderId: checkout.orderId, amount: attempt.amount + 1, currency: attempt.currency }, secret, Math.floor(now.getTime() / 1_000));
    await expect(booking.handlePaymentWebhook(provider.verifyWebhook({ rawBody: altered.rawBody, headers: altered.headers, now }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("releases a pending reservation on a verified failure callback", async () => {
    const checkout = await booking.checkoutTickets(guestId, `fail-${randomUUID()}`, { ticketTypeId: typeId, quantity: 1, termsAccepted: true });
    const attempt = await prisma.payment.findFirstOrThrow({ where: { orderId: checkout.orderId } });
    if (!attempt.providerPaymentId) throw new Error("payment attempt missing");
    const signed = DevelopmentPaymentProvider.signWebhook({ eventId: `evt-${randomUUID()}`, eventType: "payment.failed", providerPaymentId: attempt.providerPaymentId, orderId: checkout.orderId, amount: attempt.amount, currency: attempt.currency }, secret, Math.floor(now.getTime() / 1_000));
    await expect(booking.handlePaymentWebhook(provider.verifyWebhook({ rawBody: signed.rawBody, headers: signed.headers, now }))).resolves.toMatchObject({ accepted: true });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).resolves.toMatchObject({ paymentStatus: "failed" });
    await expect(prisma.ticketReservation.findFirstOrThrow({ where: { orderId: checkout.orderId } })).resolves.toMatchObject({ status: "released" });
  });
});
