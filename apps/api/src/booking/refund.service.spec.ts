import { randomBytes, randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { EventsService } from "../events/events.service.js";
import type { ObjectStorage } from "../events/object-storage.js";
import { TicketsService } from "../tickets/tickets.service.js";
import type { WalletPassGenerator } from "../wallet/wallet-pass-generator.js";
import type { BookingClock } from "./booking.constants.js";
import { DevelopmentPaymentProvider } from "./payment-provider.js";
import { RefundService } from "./refund.service.js";

const organizerId = randomUUID();
const otherOrganizerId = randomUUID();
const eventId = randomUUID();
const typeId = randomUUID();
const orderIds: string[] = [];
const clock: BookingClock = { now: () => new Date("2030-10-01T12:00:00.000Z") };
const provider = new DevelopmentPaymentProvider("http://localhost:3000");
const service = new RefundService(prisma, provider, new DomainEventsService(), clock);

beforeAll(async () => {
  const base = BigInt(Date.now()) * 100_000n;
  await prisma.user.createMany({ data: [{ id: organizerId, telegramId: base + 9101n, role: "organizer" }, { id: otherOrganizerId, telegramId: base + 9102n, role: "organizer" }] });
  await prisma.event.create({ data: { id: eventId, organizerId, title: "Refund fixture", date: new Date("2030-10-20T00:00:00Z"), time: new Date("1970-01-01T19:00:00Z"), timezone: "Asia/Almaty", address: "Test", status: "published" } });
  await prisma.ticketType.create({ data: { id: typeId, eventId, name: "Admission", price: 50_000, currency: "KZT", quantityTotal: 100, status: "active" } });
});

afterAll(async () => {
  await prisma.refundRequest.deleteMany({ where: { organizerId } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [organizerId, otherOrganizerId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerId, otherOrganizerId] } } });
  await prisma.$disconnect();
});

describe("RefundService", () => {
  it("quotes, confirms and records one test refund without double movement", async () => {
    const orderId = await paidOrder(2, 100_000);
    await expect(service.quote(otherOrganizerId, eventId, orderId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.quote(organizerId, randomUUID(), orderId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.quote(organizerId, eventId, orderId)).resolves.toMatchObject({ eligible: true, amount: 100_000, currency: "KZT", testOnly: true });
    const attempts = await Promise.all([service.request(organizerId, eventId, orderId, "Event was cancelled"), service.request(organizerId, eventId, orderId, "Event was cancelled")]);
    const first = attempts[0]!;
    expect(attempts[1]!.id).toBe(first.id);
    expect(first).toMatchObject({ status: "succeeded", amount: 100_000 });
    expect((await service.request(organizerId, eventId, orderId, "Event was cancelled")).id).toBe(first.id);
    expect(await prisma.refundRequest.count({ where: { orderId, status: "succeeded" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: orderId, action: "refund.succeeded" } })).toBe(1);
    expect(await prisma.ticket.count({ where: { orderId, status: "refunded" } })).toBe(2);
    expect(await prisma.ticketType.findUniqueOrThrow({ where: { id: typeId } })).toMatchObject({ quantitySold: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ paymentStatus: "refunded" });
    const storedTicket = await prisma.ticket.findFirstOrThrow({ where: { orderId } });
    const tickets = new TicketsService(prisma, new DomainEventsService(), { isConfigured: () => false, generate: async () => Buffer.alloc(0) } as WalletPassGenerator);
    await expect(tickets.useByQrToken(organizerId, storedTicket.qrToken, eventId)).rejects.toBeInstanceOf(ConflictException);
    const events = new EventsService(prisma, {} as ObjectStorage, new DomainEventsService());
    const summary = await events.managementSummary(organizerId, eventId);
    expect(summary.money.completedRefunds).toEqual([{ currency: "KZT", amount: 100_000 }]);
    expect(summary.money.netReceived?.[0]?.amount).toBe((summary.money.grossReceived?.[0]?.amount ?? 0) - 100_000);
    const analytics = await events.managementAnalytics(organizerId, eventId, { from: "2030-10-01T11:00:00.000Z", to: "2030-10-01T13:00:00.000Z", bucket: "hour" });
    expect(analytics.totals.completedRefunds).toEqual([{ currency: "KZT", amount: 100_000 }]);
  });

  it("refuses used admissions and payment amount mismatches", async () => {
    const used = await paidOrder(1, 50_000);
    await prisma.ticket.updateMany({ where: { orderId: used }, data: { status: "used", usedAt: clock.now() } });
    await expect(service.quote(organizerId, eventId, used)).resolves.toMatchObject({ eligible: false, reason: "used_ticket" });
    await expect(service.request(organizerId, eventId, used, "Guest changed plans")).rejects.toBeInstanceOf(ConflictException);
    const mismatch = await paidOrder(1, 50_000);
    await prisma.payment.updateMany({ where: { orderId: mismatch }, data: { amount: 40_000 } });
    await expect(service.quote(organizerId, eventId, mismatch)).resolves.toMatchObject({ eligible: false, reason: "payment_mismatch" });
  });

  it("refunds a paid whole-table deposit once and invalidates its group pass", async () => {
    const layout = await prisma.venueLayout.create({ data: { eventId, templateName: "Refund layout", layoutJson: { version: 1, canvas: { width: 500, height: 300 }, tables: [] } } });
    const table = await prisma.table.create({ data: { venueLayoutId: layout.id, number: 1, seats: 4, price: 400_000, deposit: 100_000, currency: "KZT", status: "booked" } });
    const orderId = randomUUID(); orderIds.push(orderId);
    await prisma.order.create({ data: { id: orderId, type: "table", amount: 100_000, currency: "KZT", paymentStatus: "paid" } });
    await prisma.payment.create({ data: { orderId, provider: "mock", providerPaymentId: `dev-${randomUUID()}`, providerRequestKey: `order:${orderId}`, amount: 100_000, currency: "KZT", status: "paid", webhookReceivedAt: clock.now() } });
    await prisma.booking.create({ data: { tableId: table.id, orderId, status: "confirmed" } });
    const passToken = randomBytes(32).toString("base64url");
    await prisma.groupPass.create({ data: { tableId: table.id, orderId, token: passToken, totalSeats: 4, status: "active" } });
    await prisma.deposit.create({ data: { orderId, eventId, amount: 100_000, currency: "KZT", status: "paid", terms: "Deposit", paidAt: clock.now() } });
    const result = await service.request(organizerId, eventId, orderId, "Whole table cancelled");
    expect(result).toMatchObject({ status: "succeeded", amount: 100_000 });
    expect(await prisma.table.findUniqueOrThrow({ where: { id: table.id } })).toMatchObject({ status: "available" });
    expect(await prisma.groupPass.findUniqueOrThrow({ where: { orderId } })).toMatchObject({ status: "cancelled" });
    expect(await prisma.deposit.findUniqueOrThrow({ where: { orderId } })).toMatchObject({ status: "refunded" });
    const tickets = new TicketsService(prisma, new DomainEventsService(), { isConfigured: () => false, generate: async () => Buffer.alloc(0) } as WalletPassGenerator);
    await expect(tickets.useGroupPass(organizerId, passToken, true, eventId)).rejects.toBeInstanceOf(ConflictException);
  });

  it("keeps uncertain provider outcomes processing until idempotent reconciliation", async () => {
    const orderId = await paidOrder(1, 50_000);
    let firstAttempt = true;
    class FlakyProvider extends DevelopmentPaymentProvider {
      override async requestRefund(input: Parameters<DevelopmentPaymentProvider["requestRefund"]>[0]) {
        if (firstAttempt) { firstAttempt = false; throw new Error("timeout"); }
        return super.requestRefund(input);
      }
    }
    const flaky = new RefundService(prisma, new FlakyProvider("http://localhost:3000"), new DomainEventsService(), clock);
    const pending = await flaky.request(organizerId, eventId, orderId, "Provider timeout test");
    expect(pending.status).toBe("processing");
    expect(await prisma.ticket.count({ where: { orderId, status: "active" } })).toBe(1);
    const reconciled = await flaky.process(pending.id);
    expect(reconciled.status).toBe("succeeded");
    expect(await prisma.auditLog.count({ where: { entityId: orderId, action: "refund.succeeded" } })).toBe(1);
  });
});

async function paidOrder(quantity: number, amount: number): Promise<string> {
  const orderId = randomUUID();
  orderIds.push(orderId);
  await prisma.order.create({ data: { id: orderId, type: "ticket", amount, currency: "KZT", paymentStatus: "paid" } });
  await prisma.payment.create({ data: { orderId, provider: "mock", providerPaymentId: `dev-${randomUUID()}`, providerRequestKey: `order:${orderId}`, amount, currency: "KZT", status: "paid", webhookReceivedAt: clock.now() } });
  for (let index = 0; index < quantity; index++) await prisma.ticket.create({ data: { orderId, ticketTypeId: typeId, qrToken: randomBytes(32).toString("base64url"), status: "active", paidAt: clock.now() } });
  await prisma.ticketType.update({ where: { id: typeId }, data: { quantitySold: { increment: quantity } } });
  return orderId;
}
