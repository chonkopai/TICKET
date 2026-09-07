import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@event-platform/database";
import type { CheckoutResponse, CreateTableCheckoutRequest, CreateTicketCheckoutRequest } from "@event-platform/shared-types";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { BOOKING_CLOCK, type BookingClock } from "../booking/booking.constants.js";
import { BookingService } from "../booking/booking.service.js";
import { PaymentService } from "../payments/payment.service.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";

export const QUICK_CONFIG = Symbol("QUICK_CONFIG");
export interface QuickConfig { botUsername: string; sessionSeconds: number; accessSeconds: number; claimSeconds: number }
export const secretHash = (value: string): string => createHash("sha256").update(value).digest("hex");
const token = (): string => randomBytes(32).toString("base64url");
const missing = (): NotFoundException => new NotFoundException({ code: "QUICK_ACCESS_INVALID", message: "Purchase access is unavailable" });
const conflict = (code: string): ConflictException => new ConflictException({ code, message: "This operation is not available" });

@Injectable()
export class AnonymousService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(BookingService) private readonly booking: BookingService,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(DomainEventsService) private readonly events: DomainEventsService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(QUICK_CONFIG) private readonly config: QuickConfig,
  ) {}

  async start(name: string) {
    const sessionToken = token(), accessToken = token(), verification = token();
    const now = this.clock.now();
    const session = await this.db.anonymousCheckoutSession.create({ data: {
      name, sessionHash: secretHash(sessionToken), accessHash: secretHash(accessToken),
      verificationHash: secretHash(verification),
      expiresAt: new Date(now.getTime() + this.config.sessionSeconds * 1000),
      accessExpiresAt: new Date(now.getTime() + this.config.accessSeconds * 1000),
    } });
    return { sessionToken, accessToken, expiresAt: session.expiresAt.toISOString(), accessExpiresAt: session.accessExpiresAt.toISOString(), telegramUrl: `https://t.me/${this.config.botUsername}?start=q_${verification}` };
  }

  /** Starts an account-free session for a private Telegram chat already verified by the bot. */
  async startForVerifiedRecipient(name: string, telegramId: string, chatId: string) {
    if (!/^\d+$/.test(telegramId) || telegramId !== chatId) throw missing();
    const sessionToken = token(), accessToken = token();
    const now = this.clock.now();
    const session = await this.db.anonymousCheckoutSession.create({ data: {
      name, sessionHash: secretHash(sessionToken), accessHash: secretHash(accessToken),
      telegramId: BigInt(telegramId), chatId: BigInt(chatId),
      expiresAt: new Date(now.getTime() + this.config.sessionSeconds * 1000),
      accessExpiresAt: new Date(now.getTime() + this.config.accessSeconds * 1000),
    } });
    return { sessionToken, accessToken, expiresAt: session.expiresAt.toISOString(), accessExpiresAt: session.accessExpiresAt.toISOString() };
  }

  options(eventId: string) { return this.booking.options("", eventId); }

  async verify(input: { token: string; telegramId: string; chatId: string; messageId: number }) {
    // Only private chats are eligible. HTTP caller must pass the bot-service guard.
    if (input.telegramId !== input.chatId) throw missing();
    return this.db.$transaction(async tx => {
      await lock(tx, `quick-verify:${secretHash(input.token)}`);
      const row = await tx.anonymousCheckoutSession.findUnique({ where: { verificationHash: secretHash(input.token) } });
      if (!row || row.expiresAt <= this.clock.now() || row.telegramId) throw missing();
      await tx.anonymousCheckoutSession.update({ where: { id: row.id }, data: {
        telegramId: BigInt(input.telegramId), chatId: BigInt(input.chatId), deliveryMessageId: input.messageId, verificationHash: null,
      } });
      await this.events.append(tx, { eventType: "anonymous.recipient_verified", aggregateType: "anonymous_session", aggregateId: row.id, payload: {} });
      return { verified: true };
    });
  }

  async session(raw: string) {
    const row = await this.db.anonymousCheckoutSession.findUnique({ where: { sessionHash: secretHash(raw) } });
    if (!row || row.expiresAt <= this.clock.now()) throw missing();
    return row;
  }

  async checkout(raw: string, key: string, kind: "ticket" | "table", input: CreateTicketCheckoutRequest | CreateTableCheckoutRequest): Promise<CheckoutResponse> {
    const session = await this.session(raw);
    const fingerprint = secretHash(JSON.stringify({ kind, ...input }));
    const response = await this.db.$transaction(async tx => {
      await lock(tx, `quick:${session.id}`);
      const current = await tx.anonymousCheckoutSession.findUniqueOrThrow({ where: { id: session.id } });
      if (current.expiresAt <= this.clock.now() || !current.telegramId || !current.chatId) throw conflict("RECIPIENT_NOT_VERIFIED");
      if (current.requestKey) {
        if (current.requestKey !== key || current.requestHash !== fingerprint) throw conflict("IDEMPOTENCY_CONFLICT");
        return current.response as unknown as CheckoutResponse;
      }
      const context = { transaction: tx, guestContact: { name: current.name, channel: "telegram", telegramId: current.telegramId.toString(), chatId: current.chatId.toString() } };
      const created = kind === "ticket"
        ? await this.booking.checkoutTickets(current.id, key, input as CreateTicketCheckoutRequest, context)
        : await this.booking.checkoutTable(current.id, key, input as CreateTableCheckoutRequest, context);
      await tx.anonymousCheckoutSession.update({ where: { id: current.id }, data: {
        orderId: created.orderId, requestKey: key, requestHash: fingerprint, response: created as unknown as Prisma.InputJsonObject,
      } });
      return created;
    }, { timeout: 15000 });
    const order = await this.db.order.findUniqueOrThrow({ where: { id: response.orderId } });
    if (order.paymentStatus !== "pending") return response;
    if (response.amountDue === 0) {
      await this.booking.settleSucceeded(response.orderId);
      return response;
    }
    const link = await this.payments.createLink(session.id, response.orderId, key, true);
    return { ...response, paymentLink: link.paymentLink };
  }

  async access(raw: string, orderId?: string) {
    const row = await this.db.anonymousCheckoutSession.findFirst({ where: {
      accessHash: secretHash(raw), accessExpiresAt: { gt: this.clock.now() }, ...(orderId ? { orderId } : {}),
    } });
    if (!row?.orderId) throw missing();
    return row;
  }

  async status(raw: string) {
    const session = await this.access(raw);
    let order = await this.db.order.findUniqueOrThrow({ where: { id: session.orderId! }, include: { tickets: { include: { ticketType: { select: { name: true } } } }, booking: { include: { table: { select: { number: true, name: true } } } }, deposit: true } });
    if (order.paymentStatus === "pending" && order.expiresAt && order.expiresAt <= this.clock.now()) {
      await this.booking.settleFailed(order.id, "expired");
      order = await this.db.order.findUniqueOrThrow({ where: { id: order.id }, include: { tickets: { include: { ticketType: { select: { name: true } } } }, booking: { include: { table: { select: { number: true, name: true } } } }, deposit: true } });
    }
    const snapshot = order.checkoutSnapshot as Record<string, Prisma.JsonValue>;
    const review = await this.db.outboxEvent.findFirst({ where: { aggregateId: order.id, eventType: "payment.review_required" } });
    const expired = await this.db.outboxEvent.findFirst({ where: { aggregateId: order.id, eventType: "checkout.expired" } });
    return { orderId: order.id, status: review ? "review_required" : expired ? "expired" : order.paymentStatus,
      title: snapshot.eventTitle, paymentMode: snapshot.paymentMode, amountDue: order.amount, currency: order.currency.trim(),
      fullAmount: snapshot.fullAmount, cancellationTerms: snapshot.cancellationTerms, depositTerms: snapshot.depositTerms,
      expiresAt: order.expiresAt?.toISOString() ?? null, linked: Boolean(order.buyerUserId),
      tickets: order.tickets.map(t => ({ id: t.id, name: t.ticketType.name, status: t.status })),
      booking: order.booking ? { id: order.booking.id, status: order.booking.status, table: order.booking.table } : null,
      deposit: order.deposit ? { amount: order.deposit.amount, status: order.deposit.status } : null };
  }

  async issueClaim(raw: string) {
    const session = await this.access(raw);
    const claimToken = token();
    await this.db.$transaction(async tx => {
      await lock(tx, `order:${session.orderId}`);
      const order = await tx.order.findUniqueOrThrow({ where: { id: session.orderId! } });
      if (order.paymentStatus !== "paid" || order.buyerUserId) throw conflict("ORDER_NOT_CLAIMABLE");
      await tx.anonymousCheckoutSession.update({ where: { id: session.id }, data: { claimHash: secretHash(claimToken), claimExpiresAt: new Date(this.clock.now().getTime() + this.config.claimSeconds * 1000) } });
    });
    return { claimToken };
  }

  async claim(userId: string, raw: string) {
    const initial = await this.db.anonymousCheckoutSession.findUnique({ where: { claimHash: secretHash(raw) } });
    if (!initial?.orderId) throw conflict("CLAIM_INVALID");
    return this.db.$transaction(async tx => {
      await lock(tx, `order:${initial.orderId}`);
      const session = await tx.anonymousCheckoutSession.findUniqueOrThrow({ where: { id: initial.id } });
      const user = await tx.user.findUnique({ where: { id: userId } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: initial.orderId! } });
      if (session.claimHash !== secretHash(raw) || session.claimedAt || !session.claimExpiresAt || session.claimExpiresAt <= this.clock.now() || user?.telegramId !== session.telegramId || order.buyerUserId || order.paymentStatus !== "paid") throw conflict("CLAIM_INVALID");
      await tx.order.update({ where: { id: order.id }, data: { buyerUserId: userId } });
      await tx.ticket.updateMany({ where: { orderId: order.id, ownerUserId: null }, data: { ownerUserId: userId } });
      await tx.anonymousCheckoutSession.update({ where: { id: session.id }, data: { claimedAt: this.clock.now(), claimHash: null } });
      await tx.auditLog.create({ data: { actorId: userId, action: "order.claimed", entityType: "order", entityId: order.id, meta: {} } });
      await this.events.append(tx, { eventType: "order.claimed", aggregateType: "order", aggregateId: order.id, payload: { userId } });
      return { orderId: order.id, linked: true };
    });
  }

  async purchases(organizerId: string, eventId: string, page: number) {
    if (!await this.db.event.findFirst({ where: { id: eventId, organizerId }, select: { id: true } })) throw missing();
    const rows = await this.db.order.findMany({ where: { OR: [
      { tickets: { some: { ticketType: { eventId, event: { organizerId } } } } },
      { booking: { table: { venueLayout: { eventId, event: { organizerId } } } } },
    ] }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20,
      include: { buyer: { select: { name: true } }, tickets: { select: { id: true, status: true } }, booking: { select: { id: true, status: true } } } });
    return { page, items: rows.map(o => ({ id: o.id, name: o.buyer?.name ?? (o.guestContact as { name?: string } | null)?.name ?? null,
      guestContact: o.buyerUserId || !o.guestContact ? null : {
        name: (o.guestContact as { name?: string }).name ?? null,
        telegramId: (o.guestContact as { telegramId?: string }).telegramId ?? null,
        channel: "telegram",
      }, status: o.paymentStatus, amount: o.amount, currency: o.currency.trim(), tickets: o.tickets, booking: o.booking })) };
  }
}

async function lock(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
