import { BookingStatus, PaymentStatus, Prisma, RefundStatus, SeatAllocationStatus, TableStatus, TicketStatus, type PrismaClient } from "@event-platform/database";
import type { ManagementRefundQuote, ManagementRefundRequest } from "@event-platform/shared-types";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { BOOKING_CLOCK, PAYMENT_PROVIDER, type BookingClock } from "./booking.constants.js";
import type { PaymentProvider } from "./payment-provider.js";

const refundOrderSelect = {
  id: true, amount: true, currency: true, paymentStatus: true,
  tickets: { select: { id: true, status: true, ticketTypeId: true, ticketType: { select: { eventId: true, isInternal: true } } } },
  reservations: { select: { ticketType: { select: { eventId: true } } } },
  seatAllocations: { select: { seat: { select: { venueLayout: { select: { eventId: true } } } } } },
  booking: { select: { id: true, status: true, tableId: true, table: { select: { number: true, venueLayout: { select: { eventId: true } } } } } },
  deposit: { select: { amount: true, currency: true } },
  payments: { select: { id: true, status: true, amount: true, currency: true, provider: true, providerPaymentId: true } },
  refundRequest: true,
} satisfies Prisma.OrderSelect;

type RefundOrder = Prisma.OrderGetPayload<{ select: typeof refundOrderSelect }>;
type RefundRow = NonNullable<RefundOrder["refundRequest"]>;

@Injectable()
export class RefundService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  async quote(organizerId: string, eventId: string, orderId: string): Promise<ManagementRefundQuote> {
    const order = await ownedOrder(this.database, organizerId, eventId, orderId);
    return this.calculateQuote(order);
  }

  async status(organizerId: string, eventId: string, orderId: string): Promise<ManagementRefundRequest | null> {
    const order = await ownedOrder(this.database, organizerId, eventId, orderId);
    return order.refundRequest ? presentRefund(order.refundRequest) : null;
  }

  async request(organizerId: string, eventId: string, orderId: string, reason: string): Promise<ManagementRefundRequest> {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) throw new ConflictException({ code: "REFUND_REASON_INVALID", message: "Explain the refund reason in 10–500 characters" });
    const row = await this.database.$transaction(async (transaction) => {
      await lockOrder(transaction, orderId);
      const order = await ownedOrder(transaction, organizerId, eventId, orderId);
      if (order.refundRequest) {
        if (order.refundRequest.status === RefundStatus.failed) {
          const payment = paidPayment(order);
          if (order.tickets.some((ticket) => ticket.status === TicketStatus.used) || !payment || payment.amount !== order.refundRequest.amount || payment.currency.trim() !== order.refundRequest.currency.trim()) {
            throw new ConflictException({ code: "REFUND_RETRY_NOT_ELIGIBLE", message: "Refund conditions changed; manual review is required" });
          }
          return transaction.refundRequest.update({ where: { id: order.refundRequest.id }, data: { status: RefundStatus.requested, lastError: null } });
        }
        return order.refundRequest;
      }
      const quote = this.calculateQuote(order);
      if (!quote.eligible) throw new ConflictException({ code: "REFUND_NOT_ELIGIBLE", message: `Refund unavailable: ${quote.reason}` });
      const payment = paidPayment(order);
      if (!payment?.providerPaymentId) throw new ConflictException({ code: "REFUND_PAYMENT_UNVERIFIED", message: "Confirmed provider payment is required" });
      const requestKey = `refund:${orderId}`;
      const created = await transaction.refundRequest.create({ data: { orderId, paymentId: payment.id, organizerId, provider: payment.provider, requestKey, amount: quote.amount, currency: quote.currency, reason: normalizedReason } });
      await this.domainEvents.append(transaction, { eventType: "refund.operation_requested", aggregateType: "order", aggregateId: orderId, payload: { eventId, refundId: created.id, amount: quote.amount, currency: quote.currency } });
      await transaction.auditLog.create({ data: { actorId: organizerId, action: "refund.operation_requested", entityType: "order", entityId: orderId, meta: { eventId, refundId: created.id } } });
      return created;
    }, { timeout: 15_000 });
    if (row.status === RefundStatus.succeeded) return presentRefund(row);
    return this.process(row.id);
  }

  /** Reconcile first after an uncertain result; only the mock adapter can safely retry by its stable key. */
  async process(id: string): Promise<ManagementRefundRequest> {
    const row = await this.database.refundRequest.findUniqueOrThrow({ where: { id }, include: { payment: true } });
    if (row.status === RefundStatus.succeeded || row.status === RefundStatus.failed) return presentRefund(row);
    if (!this.provider.requestRefund || !this.provider.lookupRefund || row.provider !== this.provider.name || !row.payment.providerPaymentId) return presentRefund(row);
    if (row.status === RefundStatus.processing) {
      try {
        const found = await this.provider.lookupRefund(row.requestKey);
        if (found.status === "succeeded") return this.finish(id, found.providerRefundId);
        if (found.status === "failed") return this.markFailed(id, "Provider rejected the refund");
        if (found.status === "processing" || row.provider !== "mock") return presentRefund(row);
      } catch { return presentRefund(row); }
    }
    const claimed = await this.database.refundRequest.updateMany({ where: { id, status: RefundStatus.requested }, data: { status: RefundStatus.processing, processedAt: this.clock.now() } });
    if (!claimed.count && row.status !== RefundStatus.processing) return presentRefund((await this.database.refundRequest.findUniqueOrThrow({ where: { id } })));
    try {
      const result = await this.provider.requestRefund({ paymentId: row.payment.providerPaymentId, orderId: row.orderId, amount: row.amount, currency: row.currency.trim(), idempotencyKey: row.requestKey });
      if (result.status === "succeeded") return this.finish(id, result.providerRefundId);
      if (result.status === "failed") return this.markFailed(id, "Provider rejected the refund");
      await this.database.refundRequest.update({ where: { id }, data: { providerRefundId: result.providerRefundId } });
    } catch {
      await this.database.refundRequest.update({ where: { id }, data: { lastError: "Provider response is uncertain; reconciliation required" } });
    }
    return presentRefund(await this.database.refundRequest.findUniqueOrThrow({ where: { id } }));
  }

  async processPending(limit: number): Promise<void> {
    if (!this.provider.requestRefund || !this.provider.lookupRefund) return;
    const rows = await this.database.refundRequest.findMany({ where: { provider: this.provider.name, status: { in: [RefundStatus.requested, RefundStatus.processing] } }, select: { id: true }, orderBy: { createdAt: "asc" }, take: Math.min(Math.max(limit, 1), 50) });
    for (const row of rows) await this.process(row.id);
  }

  private calculateQuote(order: RefundOrder): ManagementRefundQuote {
    const payment = paidPayment(order);
    const hasUsed = order.tickets.some((ticket) => ticket.status === TicketStatus.used);
    const match = payment && order.payments.filter((candidate) => candidate.status === PaymentStatus.paid).length === 1 && payment.amount === order.amount && payment.currency.trim() === order.currency.trim() && !!payment.providerPaymentId;
    const reason: ManagementRefundQuote["reason"] = order.refundRequest ? order.refundRequest.status === RefundStatus.succeeded ? "already_refunded" : "already_requested"
      : order.paymentStatus === PaymentStatus.refunded ? "already_refunded"
      : hasUsed ? "used_ticket" : !payment ? "not_paid" : !match ? "payment_mismatch" : payment.provider !== this.provider.name || !this.provider.requestRefund || !this.provider.lookupRefund ? "unsupported_provider" : "available";
    return { orderId: order.id, eligible: reason === "available", reason, amount: payment?.amount ?? order.amount, currency: (payment?.currency ?? order.currency).trim(), depositAmount: order.deposit?.amount ?? null, provider: payment?.provider ?? null, testOnly: payment?.provider === "mock", resourceLabels: [
      ...(order.booking ? [`Стол ${order.booking.table.number}`] : []),
      ...(!order.booking && order.tickets.length ? [`${order.tickets.length} билет(ов)`] : []),
    ] };
  }

  private async markFailed(id: string, error: string): Promise<ManagementRefundRequest> {
    await this.database.refundRequest.updateMany({ where: { id, status: { in: [RefundStatus.requested, RefundStatus.processing] } }, data: { status: RefundStatus.failed, lastError: error } });
    return presentRefund(await this.database.refundRequest.findUniqueOrThrow({ where: { id } }));
  }

  private async finish(id: string, providerRefundId: string): Promise<ManagementRefundRequest> {
    return this.database.$transaction(async (transaction) => {
      const initial = await transaction.refundRequest.findUniqueOrThrow({ where: { id } });
      await lockOrder(transaction, initial.orderId);
      const row = await transaction.refundRequest.findUniqueOrThrow({ where: { id } });
      if (row.status === RefundStatus.succeeded) return presentRefund(row);
      const order = await transaction.order.findUniqueOrThrow({ where: { id: row.orderId }, select: refundOrderSelect });
      if (order.tickets.some((ticket) => ticket.status === TicketStatus.used)) throw new ConflictException({ code: "REFUND_ADMISSION_CONFLICT", message: "A ticket was admitted during refund processing" });
      const releasable = order.tickets.filter((ticket) => ticket.status === TicketStatus.active || ticket.status === TicketStatus.paid);
      for (const ticketTypeId of [...new Set(releasable.filter((ticket) => !ticket.ticketType.isInternal).map((ticket) => ticket.ticketTypeId))].sort()) {
        await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${ticketTypeId}`}, 0))`;
        const count = releasable.filter((ticket) => ticket.ticketTypeId === ticketTypeId).length;
        await transaction.ticketType.update({ where: { id: ticketTypeId }, data: { quantitySold: { decrement: count } } });
      }
      const now = this.clock.now();
      await transaction.ticket.updateMany({ where: { orderId: row.orderId, status: { in: [TicketStatus.active, TicketStatus.paid] } }, data: { status: TicketStatus.refunded, refundedAt: now } });
      await transaction.ticketReservation.updateMany({ where: { orderId: row.orderId, status: "active" }, data: { status: "released" } });
      await transaction.seatAllocation.updateMany({ where: { orderId: row.orderId, status: { in: [SeatAllocationStatus.active, SeatAllocationStatus.consumed] } }, data: { status: SeatAllocationStatus.released, releasedAt: now } });
      await transaction.groupPass.updateMany({ where: { orderId: row.orderId, status: "active" }, data: { status: "cancelled" } });
      if (order.booking?.status === BookingStatus.confirmed) {
        await transaction.booking.update({ where: { id: order.booking.id }, data: { status: BookingStatus.cancelled } });
        await transaction.table.updateMany({ where: { id: order.booking.tableId, status: TableStatus.booked }, data: { status: TableStatus.available, holdToken: null, holdRequestKey: null, holdExpiresAt: null } });
      }
      await transaction.order.update({ where: { id: row.orderId }, data: { paymentStatus: PaymentStatus.refunded } });
      await transaction.payment.update({ where: { id: row.paymentId }, data: { status: PaymentStatus.refunded } });
      await transaction.deposit.updateMany({ where: { orderId: row.orderId }, data: { status: PaymentStatus.refunded } });
      const updated = await transaction.refundRequest.update({ where: { id }, data: { status: RefundStatus.succeeded, providerRefundId, completedAt: now, lastError: null } });
      await this.domainEvents.append(transaction, { eventType: "refund.succeeded", aggregateType: "order", aggregateId: row.orderId, payload: { refundId: id, amount: row.amount, currency: row.currency.trim() } });
      await transaction.auditLog.create({ data: { actorId: row.organizerId, action: "refund.succeeded", entityType: "order", entityId: row.orderId, meta: { refundId: id, amount: row.amount, currency: row.currency.trim() } } });
      return presentRefund(updated);
    }, { timeout: 15_000 });
  }
}

async function ownedOrder(database: Pick<Prisma.TransactionClient, "event" | "order">, organizerId: string, eventId: string, orderId: string): Promise<RefundOrder> {
  const event = await database.event.findFirst({ where: { id: eventId, organizerId }, select: { id: true } });
  if (!event) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order was not found" });
  const order = await database.order.findUnique({ where: { id: orderId }, select: refundOrderSelect });
  const memberships = order ? [
    ...order.tickets.map((ticket) => ticket.ticketType.eventId),
    ...order.reservations.map((reservation) => reservation.ticketType.eventId),
    ...order.seatAllocations.map((allocation) => allocation.seat.venueLayout.eventId),
    ...(order.booking ? [order.booking.table.venueLayout.eventId] : []),
  ] : [];
  if (!order || !memberships.length || memberships.some((id) => id !== eventId)) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order was not found" });
  return order;
}

function paidPayment(order: RefundOrder): RefundOrder["payments"][number] | undefined { return order.payments.find((payment) => payment.status === PaymentStatus.paid); }
function presentRefund(row: RefundRow): ManagementRefundRequest { return { id: row.id, orderId: row.orderId, status: row.status, amount: row.amount, currency: row.currency.trim(), provider: row.provider, testOnly: row.provider === "mock", lastError: row.lastError, completedAt: row.completedAt?.toISOString() ?? null }; }
async function lockOrder(transaction: Prisma.TransactionClient, id: string): Promise<void> { await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order:${id}`}, 0))`; }
