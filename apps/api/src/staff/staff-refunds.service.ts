import {
  Inject,
  Injectable,
  ConflictException,
  ForbiddenException,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@event-platform/database";
import {
  parseHistoricalPurchaseSnapshot,
  readCheckoutSnapshot,
  refundAdminSchema,
} from "@event-platform/shared-types";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { PAYMENT_PROVIDER } from "../booking/booking.constants.js";
import type { PaymentProvider } from "../booking/payment-provider.js";
import { type StaffPrincipal, parse, staffAudit } from "./staff.config.js";
import { validId } from "./platform-support.service.js";
const orderInclude = {
  tickets: {
    include: {
      ticketType: { select: { eventId: true, isInternal: true } },
      seatAllocation: {
        select: { id: true, seatId: true, seat: { select: { tableId: true } } },
      },
    },
  },
  payments: true,
  refundRequest: true,
  booking: true,
  groupPass: true,
  deposit: true,
} satisfies Prisma.OrderInclude;
type RefundOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
async function lock(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order:${id}`},0))`;
}
function eligibleOrder(order: RefundOrder) {
  const payment = order.payments.filter((p) => p.status === "paid");
  if (
    order.paymentStatus !== "paid" ||
    payment.length !== 1 ||
    payment[0]!.amount !== order.amount ||
    payment[0]!.currency.trim() !== order.currency.trim() ||
    !payment[0]!.providerPaymentId
  )
    throw new ConflictException({ code: "REFUND_PAYMENT_UNVERIFIED" });
  if (order.refundRequest && order.refundRequest.status !== "failed")
    throw new ConflictException({ code: "LEGACY_REFUND_EXISTS" });
  return payment[0]!;
}
export function refundSelection(order: RefundOrder, ids?: string[]) {
  const selected = ids
    ? order.tickets.filter((t) => ids.includes(t.id))
    : order.tickets.filter((t) => t.status !== "refunded");
  if (
    (!selected.length && !!order.tickets.length) ||
    (!selected.length &&
      !order.booking &&
      !order.groupPass &&
      !order.deposit) ||
    (ids &&
      (selected.length !== new Set(ids).size ||
        ids.length !== new Set(ids).size)) ||
    selected.some((t) => !["active", "paid", "cancelled"].includes(t.status))
  )
    throw new ConflictException({ code: "REFUND_TICKET_NOT_ELIGIBLE" });
  const all = order.tickets.filter((t) => t.status !== "refunded");
  const full = selected.length === all.length;
  const parsed = parseHistoricalPurchaseSnapshot(order.checkoutSnapshot);
  if (
    !full &&
    (order.booking ||
      order.groupPass ||
      parsed.version !== 2 ||
      parsed.snapshot.selection?.groupPass ||
      parsed.snapshot.items.some((item) => item.kind === "table"))
  )
    throw new ConflictException({
      code: "PARTIAL_REFUND_UNSUPPORTED_FOR_BUNDLE",
    });
  let amount: number | null = null;
  if (parsed.version === 2 && !order.booking && !order.groupPass) {
    const counts = new Map<string, number>();
    if (parsed.snapshot.amount !== order.amount)
      throw new ConflictException({ code: "REFUND_SNAPSHOT_MISMATCH" });
    amount = selected.reduce((total, t) => {
      const resources = [t.ticketTypeId, t.seatAllocation?.seatId];
      const item = parsed.snapshot.items.find((i) =>
        resources.includes(i.resourceId),
      );
      if (!item)
        throw new ConflictException({ code: "REFUND_ITEM_SNAPSHOT_MISSING" });
      const count = (counts.get(item.resourceId) ?? 0) + 1;
      counts.set(item.resourceId, count);
      if (count > item.quantity)
        throw new ConflictException({
          code: "REFUND_SNAPSHOT_QUANTITY_MISMATCH",
        });
      return total + item.unitAmount;
    }, 0);
  }
  return { tickets: selected, full, amount };
}
@Injectable()
export class StaffRefundsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    @Inject(DATABASE_CLIENT) private db: PrismaClient,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch(() => {});
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async quote(id: string, ticketIds?: string[]) {
    const order = await this.db.order.findUniqueOrThrow({
      where: { id: validId(id) },
      include: orderInclude,
    });
    const rows = await this.db.staffRefund.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "desc" },
    });
    let reason: string | null = null;
    try {
      eligibleOrder(order);
    } catch (error) {
      reason =
        (error as { response?: { code?: string } }).response?.code ??
        "REFUND_NOT_ELIGIBLE";
    }
    if (
      !this.provider.requestRefund ||
      !this.provider.lookupRefund ||
      order.payments[0]?.provider !== this.provider.name
    )
      reason ??= "REFUND_PROVIDER_UNSUPPORTED";
    const refunded = rows
      .filter((r) => r.status === "succeeded")
      .reduce((n, r) => n + r.amount, 0);
    let selectedAmount: number | null = null,
      selectedTicketIds: string[] = [];
    try {
      const selection = refundSelection(order, ticketIds);
      selectedAmount = selection.full
        ? order.amount - refunded
        : selection.amount;
      selectedTicketIds = selection.tickets.map((t) => t.id);
    } catch (error) {
      reason ??=
        (error as { response?: { code?: string } }).response?.code ??
        "REFUND_NOT_ELIGIBLE";
    }
    return {
      selectedAmount,
      selectedTicketIds,
      orderId: id,
      amount: order.amount,
      currency: order.currency.trim(),
      refunded,
      remaining: order.amount - refunded,
      provider: order.payments[0]?.provider ?? null,
      testOnly: order.payments.some((p) => p.provider === "mock"),
      reason,
      policy:
        readCheckoutSnapshot(order.checkoutSnapshot).acceptedPolicy ?? null,
      tickets: order.tickets.map((t) => ({
        id: t.id,
        status: t.status,
        seatLabel: t.seatLabelSnapshot,
      })),
      requests: rows,
    };
  }
  async request(actor: StaffPrincipal, orderId: string, body: unknown) {
    validId(orderId);
    const input = parse(refundAdminSchema, body);
    if (input.override && actor.role !== "moderator")
      throw new ForbiddenException({ code: "MODERATOR_REQUIRED" });
    if (!this.provider.requestRefund || !this.provider.lookupRefund)
      throw new ConflictException({ code: "REFUND_PROVIDER_UNSUPPORTED" });
    const row = await this.db.$transaction(
      async (tx) => {
        await lock(tx, orderId);
        const prior = await tx.staffRefund.findUnique({
          where: { requestKey: input.key },
        });
        if (prior) {
          if (
            prior.orderId !== orderId ||
            prior.staffId !== actor.id ||
            prior.reason !== input.reason ||
            prior.exceptional !== input.override ||
            (input.ticketIds &&
              [...input.ticketIds].sort().join() !==
                [...prior.ticketIds].sort().join())
          )
            throw new ConflictException({ code: "REFUND_KEY_REUSED" });
          return prior;
        }
        const order = await tx.order.findUniqueOrThrow({
            where: { id: orderId },
            include: orderInclude,
          }),
          payment = eligibleOrder(order);
        if (payment.provider !== this.provider.name)
          throw new ConflictException({ code: "REFUND_PROVIDER_UNSUPPORTED" });
        const selected = refundSelection(order, input.ticketIds);
        const policy = readCheckoutSnapshot(
          order.checkoutSnapshot,
        ).acceptedPolicy;
        if (!input.override && policy?.available !== true)
          throw new ConflictException({
            code: "REFUND_POLICY_REQUIRES_MODERATOR_OVERRIDE",
          });
        const pending = await tx.staffRefund.findFirst({
          where: { orderId, status: { in: ["requested", "processing"] } },
        });
        if (pending)
          throw new ConflictException({ code: "REFUND_IN_PROGRESS" });
        const completed = await tx.staffRefund.aggregate({
            where: { orderId, status: "succeeded" },
            _sum: { amount: true },
          }),
          remaining = order.amount - (completed._sum.amount ?? 0);
        const amount = selected.full ? remaining : selected.amount;
        if (
          amount === null ||
          !Number.isSafeInteger(amount) ||
          amount <= 0 ||
          amount > remaining
        )
          throw new ConflictException({ code: "REFUND_AMOUNT_INVALID" });
        const created = await tx.staffRefund.create({
          data: {
            staffId: actor.id,
            orderId,
            paymentId: payment.id,
            requestKey: input.key,
            ticketIds: selected.tickets.map((t) => t.id),
            amount,
            currency: order.currency,
            reason: input.reason,
            provider: payment.provider,
            exceptional: input.override,
          },
        });
        await staffAudit(
          tx,
          actor,
          "refund.requested",
          "order",
          orderId,
          input.reason,
          undefined,
          {
            refundId: created.id,
            amount,
            currency: order.currency,
            exceptional: input.override,
          },
        );
        return created;
      },
      { timeout: 15000 },
    );
    return this.process(row.id);
  }
  async process(id: string) {
    validId(id);
    let row = await this.db.staffRefund.findUniqueOrThrow({ where: { id } });
    if (
      ["succeeded", "failed"].includes(row.status) ||
      row.provider !== this.provider.name ||
      !this.provider.lookupRefund ||
      !this.provider.requestRefund
    )
      return row;
    const payment = await this.db.payment.findUniqueOrThrow({
      where: { id: row.paymentId },
    });
    if (!payment.providerPaymentId) return row;
    if (row.status === "processing") {
      try {
        const result = await this.provider.lookupRefund(
          `staff-refund:${row.requestKey}`,
        );
        if (result.status === "succeeded")
          return this.finish(row.id, result.providerRefundId);
        if (result.status === "failed") return this.failed(row.id);
        if (result.status === "processing" || row.provider !== "mock")
          return row;
      } catch {
        return row;
      }
    }
    const claim = await this.db.staffRefund.updateMany({
      where: { id, status: "requested" },
      data: { status: "processing" },
    });
    if (!claim.count && row.status !== "processing")
      return this.db.staffRefund.findUniqueOrThrow({ where: { id } });
    try {
      const result = await this.provider.requestRefund({
        paymentId: payment.providerPaymentId,
        orderId: row.orderId,
        amount: row.amount,
        currency: row.currency.trim(),
        idempotencyKey: `staff-refund:${row.requestKey}`,
      });
      if (result.status === "succeeded")
        return await this.finish(id, result.providerRefundId);
      if (result.status === "failed") return this.failed(id);
      await this.db.staffRefund.update({
        where: { id },
        data: { providerRefundId: result.providerRefundId },
      });
    } catch {
      await this.db.staffRefund.update({
        where: { id },
        data: {
          lastError: "Provider outcome uncertain; reconciliation required",
        },
      });
    }
    return this.db.staffRefund.findUniqueOrThrow({ where: { id } });
  }
  private async failed(id: string) {
    return this.db.$transaction(async (tx) => {
      const initial = await tx.staffRefund.findUniqueOrThrow({ where: { id } });
      await lock(tx, initial.orderId);
      const current = await tx.staffRefund.findUniqueOrThrow({ where: { id } });
      if (["succeeded", "failed"].includes(current.status)) return current;
      const row = await tx.staffRefund.update({
        where: { id },
        data: { status: "failed", lastError: "Provider rejected refund" },
      });
      await staffAudit(
        tx,
        null,
        "refund.failed",
        "order",
        row.orderId,
        undefined,
        undefined,
        { refundId: id },
      );
      return row;
    });
  }
  private async finish(id: string, providerRefundId: string) {
    return this.db.$transaction(
      async (tx) => {
        const first = await tx.staffRefund.findUniqueOrThrow({ where: { id } });
        await lock(tx, first.orderId);
        const row = await tx.staffRefund.findUniqueOrThrow({ where: { id } });
        if (row.status === "succeeded") return row;
        const order = await tx.order.findUniqueOrThrow({
          where: { id: row.orderId },
          include: orderInclude,
        });
        const tickets = order.tickets.filter((t) =>
          row.ticketIds.includes(t.id),
        );
        if (tickets.some((t) => t.status === "used"))
          throw new ConflictException({ code: "REFUND_ADMISSION_CONFLICT" });
        for (const typeId of [
          ...new Set(
            tickets
              .filter(
                (t) =>
                  !t.ticketType.isInternal &&
                  ["active", "paid"].includes(t.status),
              )
              .map((t) => t.ticketTypeId),
          ),
        ].sort()) {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${typeId}`},0))`;
          await tx.ticketType.update({
            where: { id: typeId },
            data: {
              quantitySold: {
                decrement: tickets.filter(
                  (t) =>
                    t.ticketTypeId === typeId &&
                    ["active", "paid"].includes(t.status),
                ).length,
              },
            },
          });
        }
        const now = new Date();
        await tx.ticket.updateMany({
          where: {
            id: { in: row.ticketIds },
            status: { in: ["active", "paid", "cancelled"] },
          },
          data: { status: "refunded", refundedAt: now },
        });
        await tx.seatAllocation.updateMany({
          where: {
            ticketId: { in: row.ticketIds },
            status: { in: ["active", "consumed"] },
          },
          data: { status: "released", releasedAt: now },
        });
        const previous = await tx.staffRefund.aggregate({
          where: { orderId: row.orderId, status: "succeeded" },
          _sum: { amount: true },
        });
        if ((previous._sum.amount ?? 0) + row.amount === order.amount) {
          await tx.order.update({
            where: { id: order.id },
            data: { paymentStatus: "refunded" },
          });
          await tx.payment.update({
            where: { id: row.paymentId },
            data: { status: "refunded" },
          });
          await tx.deposit.updateMany({
            where: { orderId: row.orderId },
            data: { status: "refunded" },
          });
          await tx.groupPass.updateMany({
            where: { orderId: row.orderId, status: "active" },
            data: { status: "cancelled" },
          });
          if (order.booking) {
            await tx.booking.update({
              where: { id: order.booking.id },
              data: { status: "cancelled" },
            });
            await tx.table.updateMany({
              where: { id: order.booking.tableId, status: "booked" },
              data: {
                status: "available",
                holdToken: null,
                holdRequestKey: null,
                holdExpiresAt: null,
              },
            });
          }
        }
        const updated = await tx.staffRefund.update({
          where: { id },
          data: {
            status: "succeeded",
            completedAt: now,
            providerRefundId,
            lastError: null,
          },
        });
        await staffAudit(
          tx,
          null,
          "refund.succeeded",
          "order",
          order.id,
          undefined,
          undefined,
          { refundId: id, amount: row.amount, currency: row.currency.trim() },
        );
        await tx.outboxEvent.create({
          data: {
            eventType: "refund.succeeded",
            aggregateType: "order",
            aggregateId: order.id,
            payload: {
              refundId: id,
              amount: row.amount,
              currency: row.currency.trim(),
              partial: order.amount !== row.amount,
            },
          },
        });
        return updated;
      },
      { timeout: 15000 },
    );
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.db.staffRefund.findMany({
        where: { status: { in: ["requested", "processing"] } },
        orderBy: { createdAt: "asc" },
        take: 20,
      });
      for (const row of rows) await this.process(row.id);
    } finally {
      this.running = false;
    }
  }
}
