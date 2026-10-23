import type { Prisma, PrismaClient } from "@event-platform/database";
import { readCheckoutSnapshot } from "@event-platform/shared-types";
import { BadRequestException } from "@nestjs/common";

export function dateFilter(from?: string, to?: string) {
  for (const value of [from, to]) {
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(value) ||
        Number.isNaN(Date.parse(value)))
    )
      throw new BadRequestException({ code: "DATE_FILTER_INVALID" });
  }
  if (from && to && Date.parse(from) > Date.parse(to))
    throw new BadRequestException({ code: "DATE_FILTER_INVALID" });
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}
export interface FinanceGroup {
  organizerId: string;
  organizerName: string;
  currency: string;
  gross: number;
  refunds: number;
  commission: number | null;
  unknownCommissionOrders: number;
  payouts: number;
  outstanding: number | null;
  testOnly: boolean;
  providerFees: number | null;
  reconciliationRequired: boolean;
}
export async function financeFacts(
  db: PrismaClient | Prisma.TransactionClient,
  query: Record<string, string | undefined>,
) {
  const testOnly = query.testOnly === "true",
    range = dateFilter(query.from, query.to),
    period = !!(query.from || query.to);
  const inPeriod = (date: Date | null) =>
    !period ||
    (!!date &&
      (!range.gte || date >= range.gte) &&
      (!range.lte || date <= range.lte));
  const groups = new Map<string, FinanceGroup>(),
    ledger: Record<string, unknown>[] = [],
    unassigned: Record<string, unknown>[] = [];
  const page = Number(query.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    throw new BadRequestException({ code: "PAGINATION_INVALID" });
  const where: Prisma.PaymentWhereInput = {
    status: { in: ["paid", "refunded"] },
    provider: testOnly ? "mock" : { not: "mock" },
  };
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.payment.findMany({
      where,
      take: 200,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        order: {
          select: {
            id: true,
            amount: true,
            commissionAmount: true,
            checkoutSnapshot: true,
            tickets: {
              take: 1,
              select: {
                ticketType: {
                  select: {
                    event: {
                      select: {
                        id: true,
                        organizerId: true,
                        organizer: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
            refundRequest: {
              select: {
                id: true,
                amount: true,
                status: true,
                completedAt: true,
              },
            },
          },
        },
      },
    });
    if (!rows.length) break;
    for (const payment of rows) {
      let event = payment.order.tickets[0]?.ticketType.event;
      if (!event) {
        const id = readCheckoutSnapshot(payment.order.checkoutSnapshot).eventId;
        event = id
          ? ((await db.event.findUnique({
              where: { id },
              select: {
                id: true,
                organizerId: true,
                organizer: { select: { name: true } },
              },
            })) ?? undefined)
          : undefined;
      }
      if (
        (query.organizerId && event?.organizerId !== query.organizerId) ||
        (query.eventId && event?.id !== query.eventId)
      )
        continue;
      const refunds = await db.staffRefund.findMany({
        where: { paymentId: payment.id, status: "succeeded" },
        select: { id: true, amount: true, completedAt: true },
      });
      const legacy = payment.order.refundRequest;
      if (legacy?.status === "succeeded")
        refunds.push({
          id: legacy.id,
          amount: legacy.amount,
          completedAt: legacy.completedAt,
        });
      refunds.sort(
        (a, b) =>
          (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0) ||
          a.id.localeCompare(b.id),
      );
      const refunded = refunds.reduce((sum, row) => sum + row.amount, 0),
        saleIncluded = inPeriod(payment.webhookReceivedAt),
        periodRefunds = refunds.filter((row) => inPeriod(row.completedAt));
      const reconciliation =
        !payment.webhookReceivedAt ||
        payment.amount !== payment.order.amount ||
        refunded > payment.amount ||
        refunds.some((row) => !row.completedAt);
      const common = {
        orderId: payment.orderId,
        organizerId: event?.organizerId ?? null,
        eventId: event?.id ?? null,
        provider: payment.provider,
        currency: payment.currency.trim(),
        providerFees: testOnly ? 0 : null,
        reconciliationRequired:
          reconciliation || payment.order.commissionAmount === null || !event,
      };
      if (saleIncluded)
        ledger.push({
          ...common,
          id: payment.id,
          kind: "payment",
          reference: payment.providerPaymentId,
          status: payment.status,
          settledAt: payment.webhookReceivedAt,
          amount: payment.amount,
          refunded,
          commission: payment.order.commissionAmount,
        });
      for (const refund of periodRefunds)
        ledger.push({
          ...common,
          id: refund.id,
          kind: "refund",
          reference: refund.id,
          status: "succeeded",
          settledAt: refund.completedAt,
          amount: -refund.amount,
          refunded: refund.amount,
          commission: null,
        });
      if (!saleIncluded && !periodRefunds.length) continue;
      if (!event) {
        unassigned.push({
          ...common,
          paymentId: payment.id,
          amount: payment.amount,
        });
        continue;
      }
      const key = `${event.organizerId}:${payment.currency.trim()}`;
      const group = groups.get(key) ?? {
        organizerId: event.organizerId,
        organizerName: event.organizer.name ?? "",
        currency: payment.currency.trim(),
        gross: 0,
        refunds: 0,
        commission: 0,
        unknownCommissionOrders: 0,
        payouts: 0,
        outstanding: null,
        testOnly,
        providerFees: testOnly ? 0 : null,
        reconciliationRequired: false,
      };
      group.gross += saleIncluded ? payment.amount : 0;
      group.refunds += periodRefunds.reduce((sum, row) => sum + row.amount, 0);
      group.reconciliationRequired ||= reconciliation;
      if (payment.order.commissionAmount === null) {
        group.commission = null;
        group.unknownCommissionOrders++;
      } else if (group.commission !== null) {
        group.commission += saleIncluded ? payment.order.commissionAmount : 0;
        let cumulative = 0;
        for (const refund of refunds) {
          const before = Math.floor(
            (payment.order.commissionAmount * cumulative) /
              Math.max(payment.amount, 1),
          );
          cumulative += refund.amount;
          if (inPeriod(refund.completedAt))
            group.commission -=
              Math.floor(
                (payment.order.commissionAmount * cumulative) /
                  Math.max(payment.amount, 1),
              ) - before;
        }
      }
      groups.set(key, group);
    }
    cursor = rows.at(-1)!.id;
    if (rows.length < 200) break;
  }
  const payoutTotals = await db.organizerPayout.groupBy({
    by: ["organizerId", "currency"],
    where: {
      testOnly,
      reversedAt: null,
      ...(query.organizerId ? { organizerId: query.organizerId } : {}),
      ...(period ? { paidAt: range } : {}),
    },
    _sum: { amount: true },
  });
  for (const payout of payoutTotals) {
    const key = `${payout.organizerId}:${payout.currency.trim()}`,
      group = groups.get(key);
    if (group && !query.eventId) group.payouts = payout._sum.amount ?? 0;
    else if (!query.eventId) {
      const organizer = await db.user.findUnique({
        where: { id: payout.organizerId },
        select: { name: true },
      });
      groups.set(key, {
        organizerId: payout.organizerId,
        organizerName: organizer?.name ?? "",
        currency: payout.currency.trim(),
        gross: 0,
        refunds: 0,
        commission: null,
        unknownCommissionOrders: 0,
        payouts: payout._sum.amount ?? 0,
        outstanding: null,
        testOnly,
        providerFees: testOnly ? 0 : null,
        reconciliationRequired: true,
      });
    }
  }
  for (const group of groups.values())
    group.outstanding =
      period ||
      !!query.eventId ||
      group.commission === null ||
      group.reconciliationRequired
        ? null
        : group.gross - group.refunds - group.commission - group.payouts;
  ledger.sort(
    (a, b) =>
      (b.settledAt instanceof Date ? b.settledAt.getTime() : 0) -
        (a.settledAt instanceof Date ? a.settledAt.getTime() : 0) ||
      String(a.id).localeCompare(String(b.id)),
  );
  return {
    groups: [...groups.values()],
    transactions: ledger.slice((page - 1) * 20, page * 20),
    transactionTotal: ledger.length,
    page,
    unassigned,
    testOnly,
  };
}
