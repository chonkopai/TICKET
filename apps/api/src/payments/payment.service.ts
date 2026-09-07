import { PaymentStatus, Prisma, type PrismaClient } from "@event-platform/database";
import type { PaymentLinkResponse, PaymentStatusResponse } from "@event-platform/shared-types";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { BOOKING_CLOCK, PAYMENT_PROVIDER, type BookingClock } from "../booking/booking.constants.js";
import type { NormalizedPaymentWebhook, PaymentProvider } from "../booking/payment-provider.js";

const PAY_OPERATION = "order.pay";

@Injectable()
export class PaymentService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  /** Creates or resumes one provider attempt. The provider call is deliberately outside a DB transaction. */
  async createLink(userId: string, orderId: string, rawKey: string | undefined, anonymous = false): Promise<PaymentLinkResponse> {
    const key = idempotencyKey(rawKey);
    const prior = anonymous ? null : await this.database.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation: PAY_OPERATION, key } } });
    if (prior?.response) return prior.response as unknown as PaymentLinkResponse;
    const intent = await this.database.$transaction(async (transaction) => {
      await lockOrder(transaction, orderId);
      const order = await transaction.order.findFirst({ where: { id: orderId, ...(anonymous ? { buyerUserId: null, anonymousSession: { id: userId } } : { buyerUserId: userId }) }, include: { payments: { where: { provider: this.provider.name }, orderBy: { createdAt: "desc" } } } });
      if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order was not found" });
      if (order.paymentStatus !== PaymentStatus.pending || (order.expiresAt && order.expiresAt <= this.clock.now())) {
        throw new ConflictException({ code: "ORDER_NOT_PAYABLE", message: "Order is no longer payable" });
      }
      const existing = order.payments.find((payment) => payment.status === PaymentStatus.pending);
      const payment = existing ?? await transaction.payment.create({
        data: { orderId, provider: this.provider.name, providerRequestKey: `order:${orderId}`, amount: order.amount, currency: order.currency, status: PaymentStatus.pending },
      });
      if (!existing) {
        await this.domainEvents.append(transaction, { eventType: "payment.attempt_created", aggregateType: "payment", aggregateId: payment.id, payload: { orderId, provider: this.provider.name, amount: order.amount, currency: order.currency } });
        await transaction.auditLog.create({ data: { actorId: anonymous ? null : userId, action: "payment.attempt_created", entityType: "payment", entityId: payment.id, meta: { orderId, provider: this.provider.name } } });
      }
      return { order, payment };
    }, { timeout: 15_000 });

    if (intent.payment.paymentLink && intent.payment.providerPaymentId) {
      const result = response(intent.order, intent.payment);
      if (!anonymous) await this.saveIdempotency(userId, key, result);
      return result;
    }
    if (intent.order.amount === 0) {
      const result = response(intent.order, intent.payment);
      if (!anonymous) await this.saveIdempotency(userId, key, result);
      return result;
    }

    let link;
    try {
      link = await this.provider.createPaymentLink({
        orderId,
        amount: intent.order.amount,
        currency: intent.order.currency.trim(),
        description: `Order ${orderId}`,
        providerRequestKey: intent.payment.providerRequestKey,
        anonymous,
      });
    } catch (error) {
      throw new ServiceUnavailableException({ code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "Payment provider is temporarily unavailable" }, { cause: error as Error });
    }

    const saved = await this.database.$transaction(async (transaction) => {
      await lockOrder(transaction, orderId);
      const priorLink = await transaction.payment.findUniqueOrThrow({ where: { id: intent.payment.id } });
      if (priorLink.paymentLink) return priorLink;
      const payment = await transaction.payment.update({ where: { id: intent.payment.id }, data: { providerPaymentId: link.providerId, paymentLink: link.url } });
      await transaction.order.update({ where: { id: orderId }, data: { paymentLink: link.url, paymentProviderId: link.providerId } });
      await this.domainEvents.append(transaction, { eventType: "payment.link_created", aggregateType: "payment", aggregateId: payment.id, payload: { orderId, provider: this.provider.name } });
      return payment;
    }, { timeout: 15_000 });
    const result = response(intent.order, saved);
    if (!anonymous) await this.saveIdempotency(userId, key, result);
    return result;
  }

  async status(userId: string, orderId: string): Promise<PaymentStatusResponse> {
    const order = await this.database.order.findFirst({ where: { id: orderId, buyerUserId: userId }, include: { payments: { where: { provider: this.provider.name }, orderBy: { createdAt: "desc" } } } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order was not found" });
    const snapshot = order.checkoutSnapshot as { paymentMode?: "deposit" | "full_payment"; paymentLabel?: "deposit" | "full_payment" } | null;
    const attempt = order.payments[0];
    const reviewRequired = Boolean(await this.database.outboxEvent.findFirst({ where: { eventType: "payment.review_required", aggregateId: orderId } }));
    const expired = order.paymentStatus === PaymentStatus.pending && !!order.expiresAt && order.expiresAt <= this.clock.now();
    return {
      orderId,
      status: reviewRequired ? "review_required" : expired ? "expired" : order.paymentStatus,
      amount: order.amount,
      currency: order.currency.trim(),
      paymentMode: snapshot?.paymentMode ?? "full_payment",
      paymentLabel: snapshot?.paymentLabel ?? "full_payment",
      paymentLink: attempt?.paymentLink ?? order.paymentLink,
      providerPaymentId: attempt?.providerPaymentId ?? order.paymentProviderId,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      reviewRequired,
    };
  }

  verifyWebhook(providerName: string, rawBody: Buffer, headers: Record<string, string | undefined>, now?: Date): NormalizedPaymentWebhook {
    if (providerName !== this.provider.name) throw new BadRequestException({ code: "PAYMENT_PROVIDER_UNKNOWN", message: "Payment provider is not configured" });
    try {
      return now ? this.provider.verifyWebhook({ rawBody, headers, now }) : this.provider.verifyWebhook({ rawBody, headers });
    }
    catch (error) {
      const code = (error as { code?: string }).code ?? "PAYMENT_PAYLOAD_INVALID";
      throw new BadRequestException({ code, message: (error as Error).message });
    }
  }

  private async saveIdempotency(userId: string, key: string, result: PaymentLinkResponse): Promise<void> {
    await this.database.idempotencyRecord.upsert({
      where: { userId_operation_key: { userId, operation: PAY_OPERATION, key } },
      create: { userId, operation: PAY_OPERATION, key, resourceId: result.orderId, response: result as unknown as Prisma.InputJsonObject },
      update: { resourceId: result.orderId, response: result as unknown as Prisma.InputJsonObject },
    });
  }
}

function response(order: { id: string; amount: number; currency: string; expiresAt: Date | null; paymentStatus: PaymentStatus }, payment: { paymentLink: string | null; providerPaymentId: string | null; status: PaymentStatus }): PaymentLinkResponse {
  return { orderId: order.id, paymentLink: payment.paymentLink ?? "", providerPaymentId: payment.providerPaymentId ?? "", amount: order.amount, currency: order.currency.trim(), status: payment.status === PaymentStatus.pending ? "pending" : payment.status, expiresAt: order.expiresAt?.toISOString() ?? null };
}

function idempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw new BadRequestException({ code: "IDEMPOTENCY_KEY_INVALID", message: "Idempotency-Key must contain 8-128 safe characters" });
  return key;
}
async function lockOrder(transaction: Prisma.TransactionClient, id: string): Promise<void> { await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order:${id}`}, 0))`; }
