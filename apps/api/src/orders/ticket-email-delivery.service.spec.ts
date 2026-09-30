import { randomBytes, randomUUID } from "node:crypto";

import { createPrismaClient, type PrismaClient } from "@event-platform/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TicketsService } from "../tickets/tickets.service.js";
import { TicketEmailDeliveryService } from "./ticket-email-delivery.service.js";
import { TicketEmailSendError, type TicketEmailMessage, type TicketEmailSender } from "./ticket-email-sender.js";

const testUrl = process.env.VERIFICATION_TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration("ticket email outbox and purchase capability", () => {
  let db: PrismaClient;
  let service: TicketEmailDeliveryService;
  const sent: TicketEmailMessage[] = [];
  let fail: "uncertain" | null = null;
  const sender: TicketEmailSender = { available: () => true, send: async message => {
    sent.push(message);
    if (fail) throw new TicketEmailSendError(fail);
    return { id: `test-${sent.length}` };
  } };

  beforeAll(() => {
    const prior = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testUrl;
    db = createPrismaClient();
    if (prior === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prior;
    service = new TicketEmailDeliveryService(db, sender, { secret: "test-only-ticket-email-secret-32-chars", webOrigin: "https://ticketron.live" }, new TicketsService(db, {} as never, {} as never));
  });
  afterAll(async () => { await db?.$disconnect(); });

  async function paidFixture() {
    const type = await db.ticketType.findFirst({ where: { isInternal: false }, select: { id: true } });
    if (!type) throw new Error("Seed an isolated event with a ticket type first");
    const id = randomUUID();
    const order = await db.order.create({ data: { id, type: "ticket", amount: 1000, currency: "KZT", paymentStatus: "paid", emailDeliveryAddress: `${id}@example.test`, emailDeliveryRequestedAt: new Date(), checkoutSnapshot: { eventId: randomUUID(), eventTitle: "Тестовое событие", eventDate: "2026-10-10", eventTime: "19:00", eventTimezone: "Asia/Almaty", venueName: "Тестовый зал", itemId: type.id, itemName: "Билет", itemKind: "ticket", quantity: 1, paymentMode: "full_payment", paymentLabel: "full_payment", unitFullAmount: 1000, fullAmount: 1000, amountDue: 1000, currency: "KZT", cancellationTerms: null, depositTerms: null } } });
    const ticket = await db.ticket.create({ data: { orderId: id, ticketTypeId: type.id, qrToken: randomBytes(32).toString("base64url"), status: "active" } });
    await db.outboxEvent.create({ data: { eventType: "ticket.email_requested", aggregateType: "order", aggregateId: id, payload: {} } });
    return { order, ticket };
  }

  it("accepts one initial email, stores only a hash, and denies cross-order QR access", async () => {
    const { order, ticket } = await paidFixture();
    const before = sent.length;
    await service.tick(); await service.tick();
    expect(sent.length).toBe(before + 1);
    const message = sent.at(-1)!;
    expect(message.to).toBe(order.emailDeliveryAddress);
    expect(message.text).toContain("Asia/Almaty");
    const token = /#token=([A-Za-z0-9_-]{43})/.exec(message.text)?.[1];
    expect(token).toBeTruthy();
    const state = await db.ticketEmailDelivery.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(state.status).toBe("accepted");
    expect(state.capabilityHash).not.toBe(token);
    expect((await service.view(token!)).tickets[0]?.id).toBe(ticket.id);
    await expect(service.qr(token!, randomUUID())).rejects.toBeTruthy();
    expect((await service.qr(token!, ticket.id)).length).toBeGreaterThan(100);
    await db.ticket.update({ where: { id: ticket.id }, data: { status: "refunded" } });
    expect((await service.view(token!)).tickets[0]?.status).toBe("refunded");
    await expect(service.qr(token!, ticket.id)).rejects.toBeTruthy();
  });

  it("keeps an ambiguous provider result uncertain until authorized resend rotates the link", async () => {
    const { order } = await paidFixture();
    fail = "uncertain";
    const before = sent.length;
    await service.tick(); await service.tick();
    expect(sent.length).toBe(before + 1);
    expect((await db.ticketEmailDelivery.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("uncertain");
    const oldToken = /#token=([A-Za-z0-9_-]{43})/.exec(sent.at(-1)!.text)![1]!;
    await db.ticketEmailDelivery.update({ where: { orderId: order.id }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
    fail = null;
    await service.resend(order.id);
    await service.tick();
    expect(sent.length).toBe(before + 2);
    await expect(service.view(oldToken)).rejects.toBeTruthy();
    expect((await db.ticketEmailDelivery.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("accepted");
  });
});
