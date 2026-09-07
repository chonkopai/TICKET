import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import jsQRPackage from "jsqr";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import type { WalletPassGenerator, WalletPassInput } from "../wallet/wallet-pass-generator.js";
import { TICKET_TRANSITIONS, TicketsService } from "./tickets.service.js";

type DecodeQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
const decodeQr = ((jsQRPackage as unknown as { default?: DecodeQr }).default ?? jsQRPackage) as unknown as DecodeQr;

const organizerA = randomUUID();
const organizerB = randomUUID();
const eventId = randomUUID();
const ticketTypeId = randomUUID();
const orderIds: string[] = [];
const ticketIds: string[] = [];

class FakeWallet implements WalletPassGenerator {
  input: WalletPassInput | null = null;
  constructor(private readonly configured: boolean) {}
  isConfigured(): boolean { return this.configured; }
  async generate(input: WalletPassInput): Promise<Buffer> {
    this.input = input;
    return Buffer.from("signed-pkpass-fixture");
  }
}

beforeAll(async () => {
  const telegramBase = BigInt(Date.now()) * 100_000n;
  await prisma.user.createMany({
    data: [
      { id: organizerA, telegramId: telegramBase + 501n, role: "organizer" },
      { id: organizerB, telegramId: telegramBase + 502n, role: "organizer" },
    ],
  });
  await prisma.event.create({ data: {
    id: eventId,
    organizerId: organizerA,
    title: "QR Festival",
    date: new Date("2027-03-21T00:00:00.000Z"),
    time: new Date("1970-01-01T19:30:00.000Z"),
    timezone: "Asia/Almaty",
    venueName: "Большой зал",
    address: "Абая 10",
    status: "published",
  } });
  await prisma.ticketType.create({ data: {
    id: ticketTypeId,
    eventId,
    name: "Standard",
    price: 100_000,
    currency: "KZT",
    quantityTotal: 10,
    status: "active",
  } });
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [organizerA, organizerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerA, organizerB] } } });
  await prisma.$disconnect();
});

describe("TicketsService", () => {
  it("centralizes the complete branching transition matrix", () => {
    expect(TICKET_TRANSITIONS).toEqual({
      created: ["pending_payment", "cancelled"],
      pending_payment: ["paid", "cancelled"],
      paid: ["active", "refunded", "cancelled"],
      active: ["used", "refunded", "cancelled"],
      used: [], cancelled: [], refunded: [],
    });
  });

  it("creates an opaque QR, transitions legally, renders/decodes it, and wires Wallet", async () => {
    const wallet = new FakeWallet(true);
    const service = new TicketsService(prisma, new DomainEventsService(), wallet);
    const orderId = await createOrder();
    const ticket = await service.createForOrder({ actorId: organizerA, ticketTypeId, orderId });
    ticketIds.push(ticket.id);
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.qrToken).toHaveLength(43);
    expect(stored.qrToken).not.toContain(ticket.id);

    await service.transition(organizerA, ticket.id, "pending_payment");
    await service.transition(organizerA, ticket.id, "paid");
    const active = await service.transition(organizerA, ticket.id, "active");
    expect(active.status).toBe("active");
    await expect(service.transition(organizerA, ticket.id, "active")).rejects.toBeInstanceOf(ConflictException);
    await expect(service.get(organizerB, ticket.id)).rejects.toBeInstanceOf(NotFoundException);

    const qr = await service.renderQr(organizerA, ticket.id);
    const png = PNG.sync.read(qr);
    const decoded = decodeQr(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(stored.qrToken);
    expect(decoded?.data).not.toContain(ticket.id);

    await expect(service.walletPass(organizerA, ticket.id)).resolves.toEqual(Buffer.from("signed-pkpass-fixture"));
    expect(wallet.input).toMatchObject({ qrToken: stored.qrToken, eventTitle: "QR Festival", ticketTypeName: "Standard" });
    expect(wallet.input?.serialNumber).toHaveLength(43);

    const ticketTypes = new TicketTypesService(prisma, new DomainEventsService());
    await expect(ticketTypes.reconcile(ticketTypeId)).resolves.toEqual({ stored: 1, authoritative: 1, matches: true });
    await expect(ticketTypes.get(organizerA, ticketTypeId)).resolves.toMatchObject({
      counters: { created: 1, sold: 1, paid: 1, remaining: 9 },
    });
  });

  it("allows exactly one of two concurrent uses and preserves the original usedAt", async () => {
    const service = new TicketsService(prisma, new DomainEventsService(), new FakeWallet(false));
    const orderId = await createOrder();
    const created = await service.createForOrder({ actorId: organizerA, ticketTypeId, orderId });
    ticketIds.push(created.id);
    await service.transition(organizerA, created.id, "pending_payment");
    await service.transition(organizerA, created.id, "paid");
    await service.transition(organizerA, created.id, "active");
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });

    const attempts = await Promise.allSettled([
      service.useByQrToken(organizerA, stored.qrToken),
      service.useByQrToken(organizerA, stored.qrToken),
    ]);
    const success = attempts.find((attempt) => attempt.status === "fulfilled");
    const failure = attempts.find((attempt) => attempt.status === "rejected");
    expect(success?.status).toBe("fulfilled");
    expect(failure?.status).toBe("rejected");
    if (success?.status !== "fulfilled" || failure?.status !== "rejected") throw new Error("unexpected result");
    expect(failure.reason).toBeInstanceOf(ConflictException);
    const response = (failure.reason as ConflictException).getResponse() as { code: string; details: { usedAt: string } };
    expect(response.code).toBe("ALREADY_USED");
    expect(response.details.usedAt).toBe(success.value.ticket.usedAt);
    await expect(service.transition(organizerA, created.id, "refunded")).rejects.toBeInstanceOf(ConflictException);

    const [outbox, audit] = await Promise.all([
      prisma.outboxEvent.count({ where: { aggregateType: "ticket", aggregateId: created.id } }),
      prisma.auditLog.count({ where: { entityType: "ticket", entityId: created.id } }),
    ]);
    expect({ outbox, audit }).toEqual({ outbox: 5, audit: 5 });
  });

  it("keeps activation successful while returning WALLET_NOT_CONFIGURED for pass download", async () => {
    const service = new TicketsService(prisma, new DomainEventsService(), new FakeWallet(false));
    const orderId = await createOrder();
    const created = await service.createForOrder({ actorId: organizerA, ticketTypeId, orderId });
    ticketIds.push(created.id);
    await service.transition(organizerA, created.id, "pending_payment");
    await service.transition(organizerA, created.id, "paid");
    await expect(service.transition(organizerA, created.id, "active")).resolves.toMatchObject({ status: "active" });
    await expect(service.walletPass(organizerA, created.id)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("resolves guest tickets through the order buyer while isolating other users", async () => {
    const orderId = randomUUID();
    orderIds.push(orderId);
    await prisma.order.create({ data: { id: orderId, type: "ticket", buyerUserId: organizerA, amount: 100_000, currency: "KZT" } });
    const created = await prisma.ticket.create({ data: { ticketTypeId, orderId, qrToken: `buyer-${randomUUID()}` } });
    const service = new TicketsService(prisma, new DomainEventsService(), new FakeWallet(false));
    await expect(service.getForUser(organizerA, created.id)).resolves.toMatchObject({ id: created.id, eventId });
    await expect(service.getForUser(organizerB, created.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

async function createOrder(): Promise<string> {
  const id = randomUUID();
  orderIds.push(id);
  await prisma.order.create({ data: { id, type: "ticket", amount: 100_000, currency: "KZT" } });
  return id;
}
