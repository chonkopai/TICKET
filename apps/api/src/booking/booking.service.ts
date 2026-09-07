import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  BookingStatus,
  EventPaymentMode,
  EventStatus,
  OrderType,
  PaymentStatus,
  Prisma,
  TableHoldStatus,
  TableStatus,
  TicketReservationStatus,
  TicketStatus,
  TicketTypeStatus,
  type PrismaClient,
} from "@event-platform/database";
import {
  venueLayoutSchema,
  type BookingOptions,
  type CancellationResponse,
  type CancellationTermsResponse,
  type CheckoutResponse,
  type CheckoutSnapshot,
  type CreateTableCheckoutRequest,
  type CreateTicketCheckoutRequest,
} from "@event-platform/shared-types";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { lockTable, TablesService } from "../tables/tables.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import {
  BOOKING_CLOCK,
  BOOKING_CONFIG,
  type BookingClock,
  type BookingConfig,
} from "./booking.constants.js";
import { PaymentService } from "../payments/payment.service.js";
import type { NormalizedPaymentWebhook } from "./payment-provider.js";

const TICKET_CHECKOUT = "checkout.ticket";
const TABLE_CHECKOUT = "checkout.table";
const TICKET_CANCEL = "cancel.ticket";
const BOOKING_CANCEL = "cancel.booking";

/** Internal only: the anonymous boundary owns authorization, idempotency and the transaction. */
export interface AnonymousCheckoutContext {
  transaction: Prisma.TransactionClient;
  guestContact: Prisma.InputJsonObject;
}

@Injectable()
export class BookingService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(TicketTypesService) private readonly ticketTypes: TicketTypesService,
    @Inject(TablesService) private readonly tables: TablesService,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    @Inject(BOOKING_CONFIG) private readonly config: BookingConfig,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(PaymentService) private readonly paymentLinks: PaymentService,
  ) {}

  async checkoutTickets(
    userId: string,
    rawKey: string | undefined,
    input: CreateTicketCheckoutRequest,
    anonymous?: AnonymousCheckoutContext,
  ): Promise<CheckoutResponse> {
    const key = idempotencyKey(rawKey);
    const prior = anonymous ? null : await this.replayed(userId, TICKET_CHECKOUT, key);
    if (prior) {
      if (prior.paymentLink) return prior;
      const link = await this.paymentLinks.createLink(userId, prior.orderId, `checkout-${key}`);
      return { ...prior, paymentLink: link.paymentLink };
    }

    try {
      const create = async (transaction: Prisma.TransactionClient) => {
        const replay = anonymous ? null : await claim(transaction, userId, TICKET_CHECKOUT, key);
        if (replay) return replay;

        const ticketType = await transaction.ticketType.findFirst({
          where: { id: input.ticketTypeId, status: TicketTypeStatus.active, event: { status: EventStatus.published } },
          include: { event: true },
        });
        if (!ticketType) throw new NotFoundException({ code: "TICKET_TYPE_NOT_FOUND", message: "Ticket type was not found" });

        const now = this.clock.now();
        const expiresAt = new Date(now.getTime() + this.config.checkoutTtlSeconds * 1_000);
        const amounts = paymentAmounts(ticketType.event, ticketType.price, ticketType.deposit, input.quantity);
        const snapshot: CheckoutSnapshot = {
          eventId: ticketType.eventId,
          eventTitle: ticketType.event.title,
          itemId: ticketType.id,
          itemName: ticketType.name,
          itemKind: "ticket",
          quantity: input.quantity,
          paymentMode: ticketType.event.paymentMode,
          paymentLabel: ticketType.event.paymentMode,
          unitFullAmount: ticketType.price,
          fullAmount: amounts.fullAmount,
          amountDue: amounts.amountDue,
          currency: ticketType.currency.trim(),
          cancellationTerms: ticketType.event.cancellationTerms,
          depositTerms: ticketType.event.depositTerms,
        };
        const orderId = randomUUID();
        await transaction.order.create({
          data: {
            id: orderId,
            type: OrderType.ticket,
            buyerUserId: anonymous ? null : userId,
            ...(anonymous ? { guestContact: anonymous.guestContact } : {}),
            amount: amounts.amountDue,
            currency: snapshot.currency,
            checkoutSnapshot: json(snapshot),
            termsAcceptedAt: now,
            expiresAt,
          },
        });
        await this.ticketTypes.reserveInTransaction(transaction, ticketType.id, input.quantity, expiresAt, orderId, now);
        const tickets: Array<{ id: string }> = [];
        for (let index = 0; index < input.quantity; index += 1) {
          tickets.push(await transaction.ticket.create({
            data: {
              ticketTypeId: ticketType.id,
              orderId,
              ownerUserId: anonymous ? null : userId,
              qrToken: randomBytes(32).toString("base64url"),
              status: TicketStatus.pending_payment,
            },
            select: { id: true },
          }));
        }
        if (ticketType.event.paymentMode === EventPaymentMode.deposit) {
          await transaction.deposit.create({
            data: {
              eventId: ticketType.eventId,
              orderId,
              amount: amounts.amountDue,
              currency: snapshot.currency,
              terms: requiredDepositTerms(ticketType.event.depositTerms),
            },
          });
        }
        const response: CheckoutResponse = {
          orderId,
          kind: "ticket",
          paymentMode: snapshot.paymentMode,
          paymentLabel: snapshot.paymentLabel,
          amountDue: snapshot.amountDue,
          fullAmount: snapshot.fullAmount,
          currency: snapshot.currency,
          paymentLink: "",
          expiresAt: expiresAt.toISOString(),
          ticketIds: tickets.map(({ id }) => id),
          bookingId: null,
        };
        await this.domainEvents.append(transaction, {
          eventType: "checkout.ticket_created",
          aggregateType: "order",
          aggregateId: orderId,
          payload: { userId: anonymous ? null : userId, ...(anonymous ? { anonymousSessionId: userId } : {}), eventId: ticketType.eventId, ticketTypeId: ticketType.id, quantity: input.quantity, amountDue: amounts.amountDue },
        });
        if (!anonymous) await saveResponse(transaction, userId, TICKET_CHECKOUT, key, orderId, response);
        return response;
      };
      const response = anonymous ? await create(anonymous.transaction) : await this.database.$transaction(create, { timeout: 15_000 });
      if (anonymous) return response;
      const linked = await this.paymentLinks.createLink(userId, response.orderId, `checkout-${key}`);
      if (response.amountDue === 0) await this.settleSucceeded(response.orderId);
      const finalResponse = { ...response, paymentLink: linked.paymentLink };
      await this.database.idempotencyRecord.update({ where: { userId_operation_key: { userId, operation: TICKET_CHECKOUT, key } }, data: { response: json(finalResponse) } });
      return finalResponse;
    } catch (error) {
      return this.resolveRace(error, userId, TICKET_CHECKOUT, key);
    }
  }

  async checkoutTable(
    userId: string,
    rawKey: string | undefined,
    input: CreateTableCheckoutRequest,
    anonymous?: AnonymousCheckoutContext,
  ): Promise<CheckoutResponse> {
    const key = idempotencyKey(rawKey);
    const prior = anonymous ? null : await this.replayed(userId, TABLE_CHECKOUT, key);
    if (prior) {
      if (prior.paymentLink) return prior;
      const link = await this.paymentLinks.createLink(userId, prior.orderId, `checkout-${key}`);
      return { ...prior, paymentLink: link.paymentLink };
    }
    try {
      const create = async (transaction: Prisma.TransactionClient) => {
        const replay = anonymous ? null : await claim(transaction, userId, TABLE_CHECKOUT, key);
        if (replay) return replay;
        const table = await transaction.table.findFirst({
          where: { id: input.tableId, venueLayout: { event: { status: EventStatus.published } } },
          include: { venueLayout: { include: { event: true } } },
        });
        const event = table?.venueLayout.event;
        if (!table || !event) throw new NotFoundException({ code: "TABLE_NOT_FOUND", message: "Table was not found" });

        const now = this.clock.now();
        const configuredExpiry = new Date(now.getTime() + this.config.checkoutTtlSeconds * 1_000);
        const holdKey = `checkout-${createHash("sha256").update(`${userId}:${key}`).digest("hex")}`;
        const hold = await this.tables.holdInTransaction(transaction, table.id, holdKey, now);
        const expiresAt = hold.expiresAt < configuredExpiry ? hold.expiresAt : configuredExpiry;
        const amounts = paymentAmounts(event, table.price, table.deposit, 1);
        const snapshot: CheckoutSnapshot = {
          eventId: event.id,
          eventTitle: event.title,
          itemId: table.id,
          itemName: table.name ?? `Стол №${table.number}`,
          itemKind: "table",
          quantity: 1,
          paymentMode: event.paymentMode,
          paymentLabel: event.paymentMode,
          unitFullAmount: table.price,
          fullAmount: amounts.fullAmount,
          amountDue: amounts.amountDue,
          currency: table.currency.trim(),
          cancellationTerms: event.cancellationTerms,
          depositTerms: event.depositTerms,
        };
        const orderId = randomUUID();
        await transaction.order.create({
          data: {
            id: orderId,
            type: OrderType.table,
            buyerUserId: anonymous ? null : userId,
            ...(anonymous ? { guestContact: anonymous.guestContact } : {}),
            amount: amounts.amountDue,
            currency: snapshot.currency,
            checkoutSnapshot: json(snapshot),
            termsAcceptedAt: now,
            expiresAt,
          },
        });
        const booking = await transaction.booking.create({
          data: { tableId: table.id, orderId, tableHoldId: hold.id, ...(anonymous ? { guestContact: anonymous.guestContact } : {}) },
        });
        if (event.paymentMode === EventPaymentMode.deposit) {
          await transaction.deposit.create({
            data: { eventId: event.id, orderId, amount: amounts.amountDue, currency: snapshot.currency, terms: requiredDepositTerms(event.depositTerms) },
          });
        }
        const response: CheckoutResponse = {
          orderId,
          kind: "table",
          paymentMode: snapshot.paymentMode,
          paymentLabel: snapshot.paymentLabel,
          amountDue: snapshot.amountDue,
          fullAmount: snapshot.fullAmount,
          currency: snapshot.currency,
          paymentLink: "",
          expiresAt: expiresAt.toISOString(),
          ticketIds: [],
          bookingId: booking.id,
        };
        await this.domainEvents.append(transaction, {
          eventType: "checkout.table_created",
          aggregateType: "order",
          aggregateId: orderId,
          payload: { userId: anonymous ? null : userId, ...(anonymous ? { anonymousSessionId: userId } : {}), eventId: event.id, tableId: table.id, bookingId: booking.id, amountDue: amounts.amountDue },
        });
        if (!anonymous) await saveResponse(transaction, userId, TABLE_CHECKOUT, key, orderId, response);
        return response;
      };
      const response = anonymous ? await create(anonymous.transaction) : await this.database.$transaction(create, { timeout: 15_000 });
      if (anonymous) return response;
      const linked = await this.paymentLinks.createLink(userId, response.orderId, `checkout-${key}`);
      if (response.amountDue === 0) await this.settleSucceeded(response.orderId);
      const finalResponse = { ...response, paymentLink: linked.paymentLink };
      await this.database.idempotencyRecord.update({ where: { userId_operation_key: { userId, operation: TABLE_CHECKOUT, key } }, data: { response: json(finalResponse) } });
      return finalResponse;
    } catch (error) {
      return this.resolveRace(error, userId, TABLE_CHECKOUT, key);
    }
  }

  async options(_userId: string, eventId: string): Promise<BookingOptions> {
    const event = await this.database.event.findFirst({
      where: { id: eventId, status: EventStatus.published },
      include: { venueLayout: true },
    });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    if (event.venueLayout) await this.tables.expireLayoutHolds(event.venueLayout.id);
    const parsed = event.venueLayout ? venueLayoutSchema.safeParse(event.venueLayout.layoutJson) : null;
    return {
      eventId,
      paymentMode: event.paymentMode,
      showFullAmountForDeposit: event.showFullAmountForDeposit,
      depositTerms: event.depositTerms,
      cancellationTerms: event.cancellationTerms,
      layout: parsed?.success ? parsed.data : null,
    };
  }

  async settleSucceeded(orderId: string): Promise<void> {
    await this.database.$transaction((transaction) => this.settleSucceededInTransaction(transaction, orderId), { timeout: 15_000 });
  }

  async settleFailed(orderId: string, reason: "failed" | "expired" = "failed"): Promise<void> {
    await this.database.$transaction((transaction) => this.failOrderInTransaction(transaction, orderId, reason), { timeout: 15_000 });
  }

  async settleSucceededInTransaction(transaction: Prisma.TransactionClient, orderId: string): Promise<void> {
    await lockOrder(transaction, orderId);
    const order = await transaction.order.findUnique({ where: { id: orderId }, include: { tickets: true, reservations: true, booking: { include: { tableHold: true } }, deposit: true } });
    if (!order) throw orderNotFound();
    if (order.paymentStatus === PaymentStatus.paid) return;
    if (order.paymentStatus !== PaymentStatus.pending || (order.expiresAt && order.expiresAt <= this.clock.now())) throw new ConflictException({ code: "CHECKOUT_NOT_PAYABLE", message: "Checkout is no longer payable" });
    if (order.type === OrderType.ticket) {
      const byType = new Map<string, number>();
      for (const ticket of order.tickets) byType.set(ticket.ticketTypeId, (byType.get(ticket.ticketTypeId) ?? 0) + 1);
      for (const [ticketTypeId, quantity] of byType) {
        await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${ticketTypeId}`}, 0))`;
        await transaction.ticketType.update({ where: { id: ticketTypeId }, data: { quantitySold: { increment: quantity } } });
      }
      await transaction.ticket.updateMany({ where: { orderId, status: TicketStatus.pending_payment }, data: { status: TicketStatus.active, paidAt: this.clock.now(), activatedAt: this.clock.now() } });
      await transaction.ticketReservation.updateMany({ where: { orderId, status: TicketReservationStatus.active }, data: { status: TicketReservationStatus.consumed } });
    } else if (order.booking?.tableHold) {
      await this.tables.confirmInTransaction(transaction, order.booking.tableId, order.booking.tableHold.token, orderId, order.buyerUserId);
    }
    await transaction.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.paid } });
    await transaction.deposit.updateMany({ where: { orderId }, data: { status: PaymentStatus.paid, paidAt: this.clock.now() } });
    await this.domainEvents.append(transaction, { eventType: "checkout.paid", aggregateType: "order", aggregateId: orderId, payload: { paymentMode: snapshot(order.checkoutSnapshot).paymentMode } });
  }

  async handlePaymentWebhook(webhook: NormalizedPaymentWebhook): Promise<{ accepted: true; duplicate: boolean; reviewRequired: boolean }> {
    try {
      return await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`webhook:${webhook.provider}:${webhook.eventId}`}, 0))`;
      const existing = await transaction.webhookEvent.findUnique({ where: { provider_providerEventId: { provider: webhook.provider, providerEventId: webhook.eventId } } });
      if (existing) {
        if (existing.payloadHash !== webhook.payloadHash) throw new ConflictException({ code: "PAYMENT_EVENT_CONFLICT", message: "Webhook event payload conflicts with an earlier event" });
        if (existing.status !== "processing") return { accepted: true as const, duplicate: true, reviewRequired: existing.status === "ignored" };
      }
      const claim = existing ?? await transaction.webhookEvent.create({ data: { provider: webhook.provider, providerEventId: webhook.eventId, eventType: webhook.eventType, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { metadata: webhook.metadata as Prisma.InputJsonObject } : {}) } });
      const payment = await transaction.payment.findFirst({ where: { provider: webhook.provider, providerPaymentId: webhook.providerPaymentId }, include: { order: { include: { booking: { include: { tableHold: true } } } } } });
      if (!payment) throw new NotFoundException({ code: "PAYMENT_NOT_FOUND", message: "Payment attempt was not found" });
      if (webhook.orderId && webhook.orderId !== payment.orderId) throw new ConflictException({ code: "PAYMENT_ORDER_MISMATCH", message: "Payment does not belong to this order" });
      if (payment.amount !== webhook.amount || payment.currency.trim().toUpperCase() !== webhook.currency.trim().toUpperCase()) throw new ConflictException({ code: "PAYMENT_AMOUNT_MISMATCH", message: "Payment amount or currency does not match" });
      await transaction.webhookEvent.update({ where: { id: claim.id }, data: { paymentId: payment.id, orderId: payment.orderId } });
      await lockOrder(transaction, payment.orderId);
      const order = await transaction.order.findUnique({ where: { id: payment.orderId }, include: { booking: { include: { tableHold: true } } } });
      if (!order) throw orderNotFound();
      if (webhook.eventType === "payment.succeeded") {
        if (order.paymentStatus === PaymentStatus.paid) {
          await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.paid, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { rawWebhook: webhook.metadata as Prisma.InputJsonObject } : {}), webhookReceivedAt: this.clock.now() } });
          await transaction.webhookEvent.update({ where: { id: claim.id }, data: { status: "processed", processedAt: this.clock.now() } });
          return { accepted: true as const, duplicate: false, reviewRequired: false };
        }
        let reviewRequired = false;
        const eligible = order.paymentStatus === PaymentStatus.pending && (!order.expiresAt || order.expiresAt > this.clock.now()) && (order.type !== OrderType.table || (order.booking?.status === BookingStatus.pending && order.booking.tableHold?.status === TableHoldStatus.active));
        if (eligible) {
          await this.settleSucceededInTransaction(transaction, order.id);
          await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.paid, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { rawWebhook: webhook.metadata as Prisma.InputJsonObject } : {}), webhookReceivedAt: this.clock.now() } });
          await this.domainEvents.append(transaction, { eventType: "payment.succeeded", aggregateType: "payment", aggregateId: payment.id, payload: { orderId: order.id, provider: webhook.provider, eventId: webhook.eventId } });
          await transaction.auditLog.create({ data: { actorId: order.buyerUserId, action: "payment.succeeded", entityType: "payment", entityId: payment.id, meta: { orderId: order.id, eventId: webhook.eventId } } });
        } else {
          reviewRequired = true;
          if (order.paymentStatus === PaymentStatus.pending && order.expiresAt && order.expiresAt <= this.clock.now()) {
            await this.failOrderInTransaction(transaction, order.id, "expired");
          }
          await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.paid, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { rawWebhook: webhook.metadata as Prisma.InputJsonObject } : {}), webhookReceivedAt: this.clock.now() } });
          const review = await transaction.outboxEvent.findFirst({ where: { eventType: "payment.review_required", aggregateId: order.id } });
          if (!review) {
            await this.domainEvents.append(transaction, { eventType: "payment.review_required", aggregateType: "order", aggregateId: order.id, payload: { provider: webhook.provider, providerPaymentId: webhook.providerPaymentId, reason: "late_or_released_order" } });
            await transaction.auditLog.create({ data: { actorId: order.buyerUserId, action: "payment.review_required", entityType: "order", entityId: order.id, meta: { provider: webhook.provider, eventId: webhook.eventId } } });
          }
        }
        await transaction.webhookEvent.update({ where: { id: claim.id }, data: { status: reviewRequired ? "ignored" : "processed", processedAt: this.clock.now() } });
        return { accepted: true as const, duplicate: false, reviewRequired };
      }
      if (order.paymentStatus !== PaymentStatus.paid && order.paymentStatus === PaymentStatus.pending) await this.failOrderInTransaction(transaction, order.id, webhook.eventType === "payment.expired" ? "expired" : "failed");
      const latestOrder = await transaction.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } });
      if (latestOrder?.paymentStatus === PaymentStatus.paid) {
        await transaction.webhookEvent.update({ where: { id: claim.id }, data: { status: "ignored", processedAt: this.clock.now() } });
        return { accepted: true as const, duplicate: false, reviewRequired: false };
      }
      await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.failed, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { rawWebhook: webhook.metadata as Prisma.InputJsonObject } : {}), webhookReceivedAt: this.clock.now() } });
      await this.domainEvents.append(transaction, { eventType: "payment.failed", aggregateType: "payment", aggregateId: payment.id, payload: { orderId: order.id, provider: webhook.provider, eventId: webhook.eventId } });
      await transaction.auditLog.create({ data: { actorId: order.buyerUserId, action: "payment.failed", entityType: "payment", entityId: payment.id, meta: { orderId: order.id, eventId: webhook.eventId } } });
      await transaction.webhookEvent.update({ where: { id: claim.id }, data: { status: "processed", processedAt: this.clock.now() } });
      return { accepted: true as const, duplicate: false, reviewRequired: false };
      }, { timeout: 15_000 });
    } catch (error) {
      if (isUniqueError(error)) {
        const existing = await this.database.webhookEvent.findUnique({ where: { provider_providerEventId: { provider: webhook.provider, providerEventId: webhook.eventId } } });
        if (existing?.payloadHash === webhook.payloadHash && existing.status !== "processing") return { accepted: true, duplicate: true, reviewRequired: existing.status === "ignored" };
      }
      throw error;
    }
  }

  async expireDueCheckouts(limit: number): Promise<number> {
    const due = await this.database.order.findMany({
      where: { paymentStatus: PaymentStatus.pending, expiresAt: { lte: this.clock.now() } },
      select: { id: true },
      orderBy: { expiresAt: "asc" },
      take: Math.max(1, Math.min(limit, 500)),
    });
    for (const order of due) await this.settleFailed(order.id, "expired");
    return due.length;
  }

  async ticketCancellationTerms(userId: string, id: string): Promise<CancellationTermsResponse> {
    const ticket = await this.database.ticket.findFirst({ where: { id, order: { buyerUserId: userId } }, include: { order: true } });
    if (!ticket) throw resourceNotFound("TICKET_NOT_FOUND");
    await this.expireIfDue(ticket.order);
    return cancellationTerms(id, ticket.status, ticket.order);
  }

  async bookingCancellationTerms(userId: string, id: string): Promise<CancellationTermsResponse> {
    const booking = await this.database.booking.findFirst({ where: { id, order: { buyerUserId: userId } }, include: { order: true } });
    if (!booking) throw resourceNotFound("BOOKING_NOT_FOUND");
    await this.expireIfDue(booking.order);
    return cancellationTerms(id, booking.status, booking.order);
  }

  async cancelTicket(userId: string, id: string, rawKey: string | undefined): Promise<CancellationResponse> {
    const key = idempotencyKey(rawKey);
    const prior = await this.replayedCancellation(userId, TICKET_CANCEL, key);
    if (prior) return prior;
    try {
      return await this.database.$transaction(async (transaction) => {
        const replay = await claimCancellation(transaction, userId, TICKET_CANCEL, key);
        if (replay) return replay;
        const current = await transaction.ticket.findFirst({ where: { id, order: { buyerUserId: userId } }, include: { order: true } });
        if (!current) throw resourceNotFound("TICKET_NOT_FOUND");
        await lockOrder(transaction, current.orderId);
        if (current.status === TicketStatus.used || current.status === TicketStatus.refunded) {
          throw cancellationNotAllowed("TICKET_CANCELLATION_NOT_ALLOWED");
        }
        const refundPending = current.order.paymentStatus === PaymentStatus.paid;
        if (current.status !== TicketStatus.cancelled) {
          const sold = current.status === TicketStatus.paid || current.status === TicketStatus.active;
          await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${current.ticketTypeId}`}, 0))`;
          await transaction.ticket.update({ where: { id }, data: { status: TicketStatus.cancelled, cancelledAt: this.clock.now() } });
          if (sold) await transaction.ticketType.update({ where: { id: current.ticketTypeId }, data: { quantitySold: { decrement: 1 } } });
          if (current.order.paymentStatus === PaymentStatus.pending) {
            const reservation = await transaction.ticketReservation.findFirst({ where: { orderId: current.orderId, status: TicketReservationStatus.active } });
            if (reservation) {
              await transaction.ticketReservation.update({ where: { id: reservation.id }, data: reservation.quantity > 1 ? { quantity: { decrement: 1 } } : { status: TicketReservationStatus.released } });
            }
            const remaining = await transaction.ticket.count({ where: { orderId: current.orderId, status: { not: TicketStatus.cancelled } } });
            if (remaining === 0) {
              await transaction.order.update({ where: { id: current.orderId }, data: { paymentStatus: PaymentStatus.cancelled } });
              await transaction.deposit.updateMany({ where: { orderId: current.orderId }, data: { status: PaymentStatus.cancelled } });
            }
          }
          await this.recordCancellation(transaction, userId, "ticket", id, refundPending, current.orderId);
        }
        const response = { resourceId: id, cancelled: true as const, refundPending };
        await saveResponse(transaction, userId, TICKET_CANCEL, key, id, response);
        return response;
      });
    } catch (error) {
      return this.resolveCancellationRace(error, userId, TICKET_CANCEL, key);
    }
  }

  async cancelBooking(userId: string, id: string, rawKey: string | undefined): Promise<CancellationResponse> {
    const key = idempotencyKey(rawKey);
    const prior = await this.replayedCancellation(userId, BOOKING_CANCEL, key);
    if (prior) return prior;
    try {
      return await this.database.$transaction(async (transaction) => {
        const replay = await claimCancellation(transaction, userId, BOOKING_CANCEL, key);
        if (replay) return replay;
        const booking = await transaction.booking.findFirst({ where: { id, order: { buyerUserId: userId } }, include: { order: true, tableHold: true } });
        if (!booking) throw resourceNotFound("BOOKING_NOT_FOUND");
        await lockOrder(transaction, booking.orderId);
        await lockTable(transaction, booking.tableId);
        if (booking.status === BookingStatus.expired) throw cancellationNotAllowed("BOOKING_CANCELLATION_NOT_ALLOWED");
        const refundPending = booking.order.paymentStatus === PaymentStatus.paid;
        if (booking.status !== BookingStatus.cancelled) {
          await transaction.booking.update({ where: { id }, data: { status: BookingStatus.cancelled } });
          if (booking.tableHold?.status === TableHoldStatus.active) {
            await transaction.tableHold.update({ where: { id: booking.tableHold.id }, data: { status: TableHoldStatus.released } });
          }
          await transaction.table.updateMany({
            where: { id: booking.tableId, status: { in: [TableStatus.held, TableStatus.booked] } },
            data: { status: TableStatus.available, holdToken: null, holdRequestKey: null, holdExpiresAt: null },
          });
          if (booking.order.paymentStatus === PaymentStatus.pending) {
            await transaction.order.update({ where: { id: booking.orderId }, data: { paymentStatus: PaymentStatus.cancelled } });
            await transaction.deposit.updateMany({ where: { orderId: booking.orderId }, data: { status: PaymentStatus.cancelled } });
          }
          await this.recordCancellation(transaction, userId, "booking", id, refundPending, booking.orderId);
        }
        const response = { resourceId: id, cancelled: true as const, refundPending };
        await saveResponse(transaction, userId, BOOKING_CANCEL, key, id, response);
        return response;
      }, { timeout: 15_000 });
    } catch (error) {
      return this.resolveCancellationRace(error, userId, BOOKING_CANCEL, key);
    }
  }

  async failOrderInTransaction(transaction: Prisma.TransactionClient, orderId: string, reason: "failed" | "expired"): Promise<void> {
    await lockOrder(transaction, orderId);
    const order = await transaction.order.findUnique({ where: { id: orderId }, include: { booking: { include: { tableHold: true } } } });
    if (!order || order.paymentStatus !== PaymentStatus.pending) return;
    await transaction.ticketReservation.updateMany({ where: { orderId, status: TicketReservationStatus.active }, data: { status: TicketReservationStatus.released } });
    await transaction.ticket.updateMany({ where: { orderId, status: TicketStatus.pending_payment }, data: { status: TicketStatus.cancelled, cancelledAt: this.clock.now() } });
    if (order.booking?.tableHold?.status === TableHoldStatus.active) {
      await lockTable(transaction, order.booking.tableId);
      await transaction.booking.update({ where: { id: order.booking.id }, data: { status: BookingStatus.expired } });
      await transaction.tableHold.update({ where: { id: order.booking.tableHold.id }, data: { status: TableHoldStatus.expired } });
      await transaction.table.updateMany({
        where: { id: order.booking.tableId, holdToken: order.booking.tableHold.token, status: TableStatus.held },
        data: { status: TableStatus.available, holdToken: null, holdRequestKey: null, holdExpiresAt: null },
      });
    }
    const paymentStatus = reason === "failed" ? PaymentStatus.failed : PaymentStatus.cancelled;
    await transaction.order.update({ where: { id: orderId }, data: { paymentStatus } });
    await transaction.deposit.updateMany({ where: { orderId }, data: { status: paymentStatus } });
    await this.domainEvents.append(transaction, {
      eventType: `checkout.${reason}`,
      aggregateType: "order",
      aggregateId: orderId,
      payload: { reason },
    });
  }

  private async recordCancellation(transaction: Prisma.TransactionClient, userId: string, kind: "ticket" | "booking", id: string, refundPending: boolean, orderId: string): Promise<void> {
    await this.domainEvents.append(transaction, {
      eventType: `${kind}.cancelled`,
      aggregateType: kind,
      aggregateId: id,
      payload: { userId, orderId, refundPending },
    });
    if (refundPending) {
      await this.domainEvents.append(transaction, {
        eventType: "refund.requested",
        aggregateType: "order",
        aggregateId: orderId,
        payload: { resourceType: kind, resourceId: id },
      });
    }
    await transaction.auditLog.create({
      data: { actorId: userId, action: `${kind}.cancelled`, entityType: kind, entityId: id, meta: { orderId, refundPending } },
    });
  }

  private async expireIfDue(order: { id: string; paymentStatus: PaymentStatus; expiresAt: Date | null }): Promise<void> {
    if (order.paymentStatus === PaymentStatus.pending && order.expiresAt && order.expiresAt <= this.clock.now()) {
      await this.settleFailed(order.id, "expired");
    }
  }

  private async replayed(userId: string, operation: string, key: string): Promise<CheckoutResponse | null> {
    const row = await this.database.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
    return row?.response ? checkoutResponse(row.response) : null;
  }

  private async replayedCancellation(userId: string, operation: string, key: string): Promise<CancellationResponse | null> {
    const row = await this.database.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
    return row?.response ? cancellationResponse(row.response) : null;
  }

  private async resolveRace(error: unknown, userId: string, operation: string, key: string): Promise<CheckoutResponse> {
    if (isUniqueError(error)) {
      const prior = await this.replayed(userId, operation, key);
      if (prior) {
        if (prior.paymentLink) return prior;
        const linked = await this.paymentLinks.createLink(userId, prior.orderId, `checkout-${key}`);
        const response = { ...prior, paymentLink: linked.paymentLink };
        await this.database.idempotencyRecord.update({ where: { userId_operation_key: { userId, operation, key } }, data: { response: json(response) } });
        return response;
      }
    }
    throw error;
  }

  private async resolveCancellationRace(error: unknown, userId: string, operation: string, key: string): Promise<CancellationResponse> {
    if (isUniqueError(error)) {
      const prior = await this.replayedCancellation(userId, operation, key);
      if (prior) return prior;
    }
    throw error;
  }
}

function paymentAmounts(
  event: { paymentMode: EventPaymentMode; showFullAmountForDeposit: boolean; depositTerms: string | null },
  unitFullAmount: number,
  unitDeposit: number,
  quantity: number,
): { amountDue: number; fullAmount: number | null } {
  const full = unitFullAmount * quantity;
  if (event.paymentMode === EventPaymentMode.full_payment) return { amountDue: full, fullAmount: full };
  if (unitDeposit <= 0) throw new ConflictException({ code: "DEPOSIT_AMOUNT_REQUIRED", message: "This item has no valid deposit amount" });
  requiredDepositTerms(event.depositTerms);
  return { amountDue: unitDeposit * quantity, fullAmount: event.showFullAmountForDeposit ? full : null };
}

function requiredDepositTerms(value: string | null): string {
  if (!value?.trim()) throw new ConflictException({ code: "DEPOSIT_TERMS_REQUIRED", message: "Deposit terms are not configured" });
  return value;
}

async function claim(transaction: Prisma.TransactionClient, userId: string, operation: string, key: string): Promise<CheckoutResponse | null> {
  const prior = await transaction.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
  if (prior?.response) return checkoutResponse(prior.response);
  if (prior) throw new ConflictException({ code: "IDEMPOTENCY_IN_PROGRESS", message: "An identical request is still processing" });
  await transaction.idempotencyRecord.create({ data: { userId, operation, key } });
  return null;
}

async function claimCancellation(transaction: Prisma.TransactionClient, userId: string, operation: string, key: string): Promise<CancellationResponse | null> {
  const prior = await transaction.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
  if (prior?.response) return cancellationResponse(prior.response);
  if (prior) throw new ConflictException({ code: "IDEMPOTENCY_IN_PROGRESS", message: "An identical request is still processing" });
  await transaction.idempotencyRecord.create({ data: { userId, operation, key } });
  return null;
}

async function saveResponse(transaction: Prisma.TransactionClient, userId: string, operation: string, key: string, resourceId: string, response: CheckoutResponse | CancellationResponse): Promise<void> {
  await transaction.idempotencyRecord.update({
    where: { userId_operation_key: { userId, operation, key } },
    data: { resourceId, response: json(response) },
  });
}

function cancellationTerms(resourceId: string, status: string, order: { amount: number; currency: string; paymentStatus: PaymentStatus; checkoutSnapshot: Prisma.JsonValue }): CancellationTermsResponse {
  const data = snapshot(order.checkoutSnapshot);
  return {
    resourceId,
    status,
    cancellationTerms: data.cancellationTerms,
    paymentMode: data.paymentMode,
    amountPaid: order.paymentStatus === PaymentStatus.paid ? order.amount : 0,
    currency: order.currency.trim(),
  };
}

function snapshot(value: Prisma.JsonValue): CheckoutSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConflictException({ code: "CHECKOUT_SNAPSHOT_INVALID", message: "Checkout snapshot is unavailable" });
  return value as unknown as CheckoutSnapshot;
}

function checkoutResponse(value: Prisma.JsonValue): CheckoutResponse { return value as unknown as CheckoutResponse; }
function cancellationResponse(value: Prisma.JsonValue): CancellationResponse { return value as unknown as CancellationResponse; }
function json(value: object): Prisma.InputJsonObject { return value as unknown as Prisma.InputJsonObject; }
function isUniqueError(error: unknown): boolean { return (error as { code?: string }).code === "P2002"; }

function idempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new BadRequestException({ code: "IDEMPOTENCY_KEY_INVALID", message: "Idempotency-Key must contain 8-128 safe characters" });
  }
  return key;
}

async function lockOrder(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order:${id}`}, 0))`;
}

function orderNotFound(): NotFoundException { return resourceNotFound("ORDER_NOT_FOUND"); }
function resourceNotFound(code: string): NotFoundException { return new NotFoundException({ code, message: "Resource was not found" }); }
function cancellationNotAllowed(code: string): ConflictException { return new ConflictException({ code, message: "Cancellation is not allowed in the current state" }); }
