import { createHash, createHmac } from "node:crypto";

import { type PrismaClient, type TicketEmailDelivery } from "@event-platform/database";
import type { CheckoutSnapshot } from "@event-platform/shared-types";
import { ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { TicketsService } from "../tickets/tickets.service.js";
import { TicketEmailSendError, type TicketEmailMessage, type TicketEmailSender } from "./ticket-email-sender.js";

export const TICKET_EMAIL_SENDER = Symbol("TICKET_EMAIL_SENDER");
export const TICKET_EMAIL_CONFIG = Symbol("TICKET_EMAIL_CONFIG");
export interface TicketEmailConfig { secret: string; webOrigin: string }

const CAPABILITY_TTL_MS = 30 * 24 * 60 * 60_000;
const LEASE_MS = 2 * 60_000;
const MAX_SEND_ATTEMPTS = 5;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const unavailable = () => new NotFoundException({ code: "TICKET_EMAIL_ACCESS_INVALID" });

@Injectable()
export class TicketEmailDeliveryService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(TICKET_EMAIL_SENDER) private readonly sender: TicketEmailSender,
    @Inject(TICKET_EMAIL_CONFIG) private readonly config: TicketEmailConfig,
    @Inject(TicketsService) private readonly tickets: TicketsService,
  ) { if (config.secret.length < 32) throw new Error("Ticket email secret must have at least 32 characters"); }

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.tick().catch(() => undefined); }, 15_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  available(): boolean { return this.sender.available(); }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await this.enqueueCommitted(); if (this.sender.available()) await this.deliverQueued(); }
    finally { this.busy = false; }
  }

  private token(orderId: string, generation: number): string {
    return createHmac("sha256", this.config.secret).update(`ticket-email:v1:${orderId}:${generation}`).digest("base64url");
  }

  private async enqueueCommitted(): Promise<void> {
    const events = await this.db.outboxEvent.findMany({ where: { eventType: "ticket.email_requested", processedAt: null }, orderBy: { occurredAt: "asc" }, take: 25 });
    for (const event of events) {
      await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-email-event:${event.id}`}, 0))`;
        const current = await tx.outboxEvent.findUnique({ where: { id: event.id } });
        if (!current || current.processedAt) return;
        const order = await tx.order.findUnique({ where: { id: event.aggregateId } });
        if (order?.paymentStatus === "paid" && order.emailDeliveryAddress && order.emailDeliveryRequestedAt) {
          await tx.ticketEmailDelivery.upsert({ where: { orderId: order.id }, create: {
            orderId: order.id, recipient: order.emailDeliveryAddress,
            capabilityHash: hash(this.token(order.id, 1)), capabilityExpiresAt: new Date(order.emailDeliveryRequestedAt.getTime() + CAPABILITY_TTL_MS),
          }, update: {} });
        }
        await tx.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), attempts: { increment: 1 } } });
      });
    }
  }

  private async deliverQueued(): Promise<void> {
    const now = new Date();
    const rows = await this.db.ticketEmailDelivery.findMany({ where: { OR: [
      { status: "queued", nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      { status: "sending", leaseUntil: { lt: now } },
    ] }, orderBy: { createdAt: "asc" }, take: 20 });
    for (const row of rows) {
      if (row.status === "sending" && now.getTime() - row.updatedAt.getTime() >= 24 * 60 * 60_000) {
        await this.db.ticketEmailDelivery.updateMany({ where: { id: row.id, status: "sending" }, data: { status: "uncertain", leaseUntil: null, lastErrorCode: "LEASE_EXPIRED" } });
        continue;
      }
      const claimed = await this.db.ticketEmailDelivery.updateMany({ where: { id: row.id, status: row.status, attempts: { lt: MAX_SEND_ATTEMPTS }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { status: "sending", leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } } });
      if (claimed.count !== 1) continue;
      await this.sendOne({ ...row, attempts: row.attempts + 1 });
    }
  }

  private async sendOne(row: TicketEmailDelivery): Promise<void> {
    const order = await this.db.order.findUnique({ where: { id: row.orderId }, include: { tickets: { select: { status: true } } } });
    if (!order || order.paymentStatus !== "paid" || !order.tickets.some(ticket => ticket.status === "active" || ticket.status === "used") || order.emailDeliveryAddress !== row.recipient) {
      await this.db.ticketEmailDelivery.update({ where: { id: row.id }, data: { status: "failed", leaseUntil: null, lastErrorCode: "INELIGIBLE" } });
      return;
    }
    if (row.capabilityExpiresAt <= new Date()) {
      await this.db.ticketEmailDelivery.update({ where: { id: row.id }, data: { status: "failed", leaseUntil: null, lastErrorCode: "LINK_EXPIRED" } });
      return;
    }
    const snapshot = order.checkoutSnapshot as unknown as CheckoutSnapshot;
    const message = this.compose(row, snapshot);
    try {
      const accepted = await this.sender.send(message);
      await this.db.ticketEmailDelivery.updateMany({ where: { id: row.id, status: "sending", generation: row.generation }, data: { status: "accepted", leaseUntil: null, acceptedAt: new Date(), providerMessageId: accepted.id, lastErrorCode: null } });
    } catch (error) {
      const kind = error instanceof TicketEmailSendError ? error.kind : "uncertain";
      const status = kind === "rate" && row.attempts < MAX_SEND_ATTEMPTS ? "queued" : kind === "rejected" ? "failed" : "uncertain";
      await this.db.ticketEmailDelivery.updateMany({ where: { id: row.id, status: "sending", generation: row.generation }, data: {
        status, leaseUntil: null, lastErrorCode: kind.toUpperCase(),
        nextAttemptAt: new Date(Date.now() + Math.min(30, 2 ** row.attempts) * 60_000),
      } });
    }
  }

  private compose(row: TicketEmailDelivery, snapshot: CheckoutSnapshot): TicketEmailMessage {
    const accessUrl = `${this.config.webOrigin.replace(/\/$/, "")}/delivery#token=${this.token(row.orderId, row.generation)}`;
    const payment = snapshot.paymentMode === "deposit" ? "Оплачен депозит" : "Покупка оплачена";
    const date = [snapshot.eventDate, snapshot.eventTime, snapshot.eventTimezone].filter(Boolean).join(" · ");
    const labels = snapshot.items?.map(item => `${item.name} × ${item.quantity}`).join(", ") ?? `${snapshot.itemName} × ${snapshot.quantity}`;
    const text = `${payment}: ${snapshot.eventTitle}\n${date}\n${snapshot.venueName ?? ""}\nБилеты: ${labels}\nОткрыть покупку и QR-коды: ${accessUrl}\nСсылка действует 30 дней. Не пересылайте её другим.`;
    const html = `<p>${escapeHtml(payment)}: <strong>${escapeHtml(snapshot.eventTitle)}</strong></p><p>${escapeHtml(date)}<br>${escapeHtml(snapshot.venueName ?? "")}</p><p>Билеты: ${escapeHtml(labels)}</p><p><a href="${escapeHtml(accessUrl)}">Открыть покупку и QR-коды</a></p><p>Ссылка действует 30 дней. Не пересылайте её другим.</p>`;
    return { to: row.recipient, subject: `Билеты TICKET — ${snapshot.eventTitle}`, text, html, idempotencyKey: `ticket-email/${row.orderId}/${row.generation}` };
  }

  async status(orderId: string): Promise<{ status: string; address: string | null; acceptedAt: string | null }> {
    const order = await this.db.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true, emailDeliveryAddress: true, ticketEmailDelivery: true } });
    if (!order) throw unavailable();
    return { address: order.emailDeliveryAddress, status: !order.emailDeliveryAddress ? "not_requested" : order.paymentStatus !== "paid" ? "pending_payment" : order.ticketEmailDelivery?.status ?? "queued", acceptedAt: order.ticketEmailDelivery?.acceptedAt?.toISOString() ?? null };
  }

  async statusForUser(userId: string, orderId: string) {
    if (!await this.db.order.findFirst({ where: { id: orderId, buyerUserId: userId }, select: { id: true } })) throw unavailable();
    return this.status(orderId);
  }

  async resendForUser(userId: string, orderId: string) {
    if (!await this.db.order.findFirst({ where: { id: orderId, buyerUserId: userId }, select: { id: true } })) throw unavailable();
    return this.resend(orderId);
  }

  async access(rawToken: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw unavailable();
    const delivery = await this.db.ticketEmailDelivery.findUnique({ where: { capabilityHash: hash(rawToken) }, include: { order: { include: { tickets: { include: { ticketType: { select: { name: true, isInternal: true } } }, orderBy: { id: "asc" } }, booking: { include: { table: { select: { number: true, name: true } } } }, groupPass: true } } } });
    if (!delivery || delivery.capabilityExpiresAt <= new Date() || delivery.order.paymentStatus !== "paid") throw unavailable();
    return delivery;
  }

  async view(rawToken: string) {
    const delivery = await this.access(rawToken);
    const order = delivery.order;
    const snapshot = order.checkoutSnapshot as unknown as CheckoutSnapshot;
    const event = typeof snapshot.eventId === "string" ? await this.db.event.findUnique({ where: { id: snapshot.eventId }, select: { sourceLocale: true } }) : null;
    return { orderId: order.id, title: snapshot.eventTitle, sourceLocale: event?.sourceLocale ?? "ru", date: snapshot.eventDate ?? null, time: snapshot.eventTime ?? null, timezone: snapshot.eventTimezone ?? null, venue: snapshot.venueName ?? null,
      paymentMode: snapshot.paymentMode, amountPaid: order.amount, currency: order.currency.trim(), status: order.paymentStatus,
      items: snapshot.items ?? [{ kind: snapshot.itemKind, name: snapshot.itemName, quantity: snapshot.quantity }],
      tickets: order.tickets.map(ticket => ({ id: ticket.id, name: ticket.ticketType.isInternal ? ticket.seatLabelSnapshot ?? "Место за столом" : ticket.ticketType.name, seatLabel: ticket.seatLabelSnapshot, status: ticket.status })),
      booking: order.booking ? { status: order.booking.status, table: order.booking.table } : null,
      groupPass: order.groupPass ? { id: order.groupPass.id, status: order.groupPass.status, totalSeats: order.groupPass.totalSeats } : null,
    };
  }

  async qr(rawToken: string, ticketId: string): Promise<Buffer> {
    const delivery = await this.access(rawToken);
    return this.tickets.assetForAnonymousOrder(delivery.orderId, ticketId, false);
  }

  async groupQr(rawToken: string, groupPassId: string): Promise<Buffer> {
    const delivery = await this.access(rawToken);
    return this.tickets.assetGroupPassForOrder(delivery.orderId, groupPassId);
  }

  async resend(orderId: string): Promise<{ status: "queued" }> {
    if (!this.sender.available()) throw new ServiceUnavailableException({ code: "TICKET_EMAIL_UNAVAILABLE" });
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-email-resend:${orderId}`}, 0))`;
      const row = await tx.ticketEmailDelivery.findUnique({ where: { orderId }, include: { order: { select: { paymentStatus: true, emailDeliveryAddress: true } } } });
      if (!row || row.order.paymentStatus !== "paid" || row.order.emailDeliveryAddress !== row.recipient) throw unavailable();
      if (row.status === "queued" || row.status === "sending" || Date.now() - row.updatedAt.getTime() < 10 * 60_000 || row.generation >= 5) throw new ConflictException({ code: "TICKET_EMAIL_RESEND_LIMIT" });
      const generation = row.generation + 1;
      await tx.ticketEmailDelivery.update({ where: { id: row.id }, data: { status: "queued", generation, attempts: 0, leaseUntil: null, nextAttemptAt: new Date(), capabilityHash: hash(this.token(orderId, generation)), capabilityExpiresAt: new Date(Date.now() + CAPABILITY_TTL_MS), acceptedAt: null, providerMessageId: null, lastErrorCode: null } });
    });
    return { status: "queued" };
  }
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
