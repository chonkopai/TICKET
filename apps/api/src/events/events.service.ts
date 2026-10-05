import { assertCurrentSale } from "./current-sale-policy.js";
import { readCheckoutSnapshot } from "@event-platform/shared-types";
import type { Event, Prisma, PrismaClient } from "@event-platform/database";
import {
  EventStatus,
  eventV2CompatibilityRead,
  GroupPassStatus,
  PaymentStatus,
  SeatAllocationStatus,
  SeatStatus,
  TableStatus,
  TicketStatus,
} from "@event-platform/database";
import type {
  DeleteEventResponse,
  OrganizerEvent,
  OrganizerDashboard,
  OrganizerEventMetrics,
  OrganizerEventSort,
  OrganizerEventStatusGroup,
  OrganizerWorkspaceEventList,
  ManagementEventSummary,
} from "@event-platform/shared-types";
import {
  MANAGEMENT_ANALYTICS_MAX_DAYS,
  MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS,
  zonedInputToIso,
} from "@event-platform/shared-types";
import type {
  ManagementAnalyticsQuery,
  ManagementAnalyticsResponse,
  ManagementCurrencyMoney,
  ManagementOrderDetail,
  ManagementOrderFilterOptions,
  ManagementOrderList,
  ManagementOrdersQuery,
  ManagementOrderRow,
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
import { OBJECT_STORAGE } from "./events.constants.js";
import { presentEvent } from "./events.presenter.js";
import type { ObjectStorage } from "./object-storage.js";

type EventTransaction = Pick<Prisma.TransactionClient, "auditLog" | "event" | "outboxEvent">;

@Injectable()
export class EventsService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
  ) {}

  async list(
    organizerId: string,
    query: { page: number; limit: number; statusGroup?: OrganizerEventStatusGroup; sort?: OrganizerEventSort },
  ): Promise<OrganizerWorkspaceEventList> {
    const skip = (query.page - 1) * query.limit;
    const statuses = statusesForGroup(query.statusGroup ?? "all");
    const where: Prisma.EventWhereInput = { organizerId, ...(statuses ? { status: { in: statuses } } : {}) };
    const orderBy = eventOrder(query.sort ?? "updated_desc");
    const [events, total] = await this.database.$transaction([
      this.database.event.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: eventMetricInclude,
      }),
      this.database.event.count({ where }),
    ]);

    const revenue = await this.revenueByEvent(events.map(({ id }) => id));

    return {
      items: events.map((event) => ({
        ...presentEvent(event),
        displayId: event.id.slice(0, 8).toUpperCase(),
        metrics: eventMetrics(event, revenue.get(event.id)),
      })),
      page: query.page,
      limit: query.limit,
      total,
      hasNext: skip + events.length < total,
    };
  }

  async dashboard(organizerId: string): Promise<OrganizerDashboard> {
    const [statusRows, inventory, wholeTables, eventIds] = await this.database.$transaction([
      this.database.event.groupBy({ by: ["status"], where: { organizerId }, _count: { _all: true } }),
      this.database.ticketType.aggregate({
        where: { event: { organizerId }, isInternal: false },
        _sum: { quantityTotal: true, quantitySold: true },
      }),
      this.database.table.findMany({
        where: { venueLayout: { event: { organizerId } }, saleMode: "whole_table" },
        select: { bookings: { where: { status: "confirmed", order: { paymentStatus: "paid" } }, select: { id: true } } },
      }),
      this.database.event.findMany({ where: { organizerId }, select: { id: true } }),
    ]);
    const byStatus = new Map(statusRows.map((row) => [row.status, row._count._all]));
    const ids = eventIds.map(({ id }) => id);
    const revenues = await this.revenueByEvent(ids);
    const money = combineMoney([...revenues.values()]);
    const wholeSold = wholeTables.filter(({ bookings }) => bookings.length > 0).length;
    return {
      totalEvents: statusRows.reduce((sum, row) => sum + row._count._all, 0),
      publishedEvents: byStatus.get("published") ?? 0,
      draftEvents: byStatus.get("draft") ?? 0,
      completedEvents: byStatus.get("completed") ?? 0,
      cancelledEvents: byStatus.get("cancelled") ?? 0,
      settledRevenue: money.amount,
      currency: money.currency,
      soldAdmissions: (inventory._sum.quantitySold ?? 0) + wholeSold,
      totalAdmissions: (inventory._sum.quantityTotal ?? 0) + wholeTables.length,
    };
  }

  async get(organizerId: string, id: string): Promise<OrganizerEvent> {
    return presentEvent(await eventV2CompatibilityRead(this.database, await this.findOwned(this.database, organizerId, id)));
  }

  /**
   * Returns a read-only, owner-scoped snapshot.  It deliberately does not run
   * hold cleanup: a read must not make stock available or mutate a checkout.
   */
  async managementSummary(organizerId: string, id: string): Promise<ManagementEventSummary> {
    const asOf = new Date();
    return this.database.$transaction(async (transaction) => {
      const event = await this.findOwned(transaction, organizerId, id);
      const [ticketTypes, seats, wholeTables, ticketStatusRows, usedTickets, usedPasses, orders, deposits, cancelledTickets, cancelledBookings] = await Promise.all([
        transaction.ticketType.findMany({
          where: { eventId: id, isInternal: false },
          select: {
            id: true,
            name: true,
            venueObjectId: true,
            price: true,
            currency: true,
            quantityTotal: true,
            quantitySold: true,
            status: true,
            salesStartAt: true,
            salesEndAt: true,
            seats: { select: { id: true, rowId: true, tableId: true, row: { select: { number: true, name: true } }, table: { select: { number: true, name: true } } } },
            reservations: {
              where: { status: "active", expiresAt: { gt: asOf } },
              select: { quantity: true },
            },
          },
        }),
        transaction.seat.findMany({
          where: {
            venueLayout: { eventId: id },
            OR: [{ tableId: null }, { table: { saleMode: "per_seat" } }],
          },
          select: {
            ticketTypeId: true,
            status: true,
            allocations: {
              where: { status: { in: ["active", "consumed"] } },
              select: {
                status: true,
                order: { select: { paymentStatus: true, expiresAt: true } },
                ticket: { select: { status: true } },
              },
            },
          },
        }),
        transaction.table.findMany({
          where: { venueLayout: { eventId: id }, saleMode: "whole_table" },
          select: {
            id: true,
            number: true,
            name: true,
            price: true,
            currency: true,
            seats: true,
            status: true,
            holds: {
              where: { status: "active", expiresAt: { gt: asOf } },
              select: { id: true },
            },
            bookings: {
              where: { status: "confirmed", order: { paymentStatus: "paid" } },
              select: { order: { select: { groupPass: { select: { totalSeats: true, status: true } } } } },
            },
          },
        }),
        transaction.ticket.groupBy({
          by: ["status"],
          where: { ticketType: { eventId: id } },
          _count: { _all: true },
        }),
        transaction.ticket.count({ where: { ticketType: { eventId: id }, status: "used" } }),
        transaction.groupPass.count({
          where: { table: { venueLayout: { eventId: id } }, status: "used" },
        }),
        transaction.order.findMany({
          where: {
            OR: [
              { tickets: { some: { ticketType: { eventId: id } } } },
              { reservations: { some: { ticketType: { eventId: id } } } },
              { seatAllocations: { some: { seat: { venueLayout: { eventId: id } } } } },
              { booking: { table: { venueLayout: { eventId: id } } } },
              { deposit: { eventId: id } },
            ],
          },
          select: {
            id: true,
            buyerUserId: true,
            paymentStatus: true,
            amount: true,
            currency: true,
            anonymousSession: { select: { id: true } },
            tickets: { select: { paidAt: true, ticketType: { select: { eventId: true } } } },
            reservations: { select: { ticketType: { select: { eventId: true } } } },
            seatAllocations: { select: { seat: { select: { venueLayout: { select: { eventId: true } } } } } },
            booking: { select: { table: { select: { venueLayout: { select: { eventId: true } } } } } },
            deposit: { select: { eventId: true, status: true, paidAt: true } },
            payments: { select: { status: true } },
            refundRequest: { select: { status: true, amount: true, currency: true, completedAt: true } },
          },
        }),
        transaction.deposit.findMany({
          where: { eventId: id, status: { in: ["paid", "refunded"] }, paidAt: { not: null } },
          select: { amount: true, currency: true },
        }),
        transaction.ticket.count({ where: { ticketType: { eventId: id }, status: "cancelled" } }),
        transaction.booking.count({ where: { table: { venueLayout: { eventId: id } }, status: "cancelled" } }),
      ]);

      const ordinaryTypes = ticketTypes.filter((type) => type.seats.length === 0);
      const ordinaryTypeIds = new Set(ordinaryTypes.map((type) => type.id));
      const ticketTypeSummary = ticketTypes.map((type) => {
        if (type.seats.length > 0) {
          const assigned = summarizeSeats(seats.filter((seat) => seat.ticketTypeId === type.id), asOf);
          return {
            id: type.id,
            name: type.name,
            price: type.price,
            currency: type.currency,
            configured: assigned.configured,
            held: assigned.held,
            sold: assigned.sold,
            buyable: assigned.buyable,
          };
        }
        const held = type.reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
        const onSale = type.status === "active"
          && (!type.salesStartAt || type.salesStartAt <= asOf)
          && (!type.salesEndAt || type.salesEndAt > asOf);
        return {
          id: type.id,
          name: type.name,
          price: type.price,
          currency: type.currency,
          configured: type.quantityTotal,
          held,
          sold: type.quantitySold,
          buyable: onSale ? Math.max(0, type.quantityTotal - type.quantitySold - held) : 0,
        };
      });
      const saleGroups = new Map<string, ManagementEventSummary["inventory"]["saleGroups"][number]>();
      for (const type of ticketTypes) {
        const summary = ticketTypeSummary.find((item) => item.id === type.id)!;
        const placement = type.seats[0];
        const kind = placement?.rowId ? "row" : placement?.tableId ? "table" : type.venueObjectId ? "zone" : "ticket_type";
        const key = placement?.rowId ? `row:${placement.rowId}` : placement?.tableId ? `table:${placement.tableId}` : type.venueObjectId ? `zone:${type.venueObjectId}` : `ticket:${type.id}`;
        const name = placement?.rowId ? placement.row?.name || `Ряд ${placement.row?.number ?? ""}` : placement?.tableId ? placement.table?.name || `Стол ${placement.table?.number ?? ""}` : type.name.replace(/ · [0-9a-f-]{36}$/i, "");
        const existing = saleGroups.get(key);
        if (existing) {
          existing.configured += summary.configured;
          existing.held += summary.held;
          existing.sold += summary.sold;
          existing.buyable += summary.buyable;
          existing.ticketTypeIds.push(type.id);
          if (existing.price !== summary.price || existing.currency !== summary.currency) existing.price = null;
        } else saleGroups.set(key, { id: key, kind, name, unit: kind === "row" || kind === "table" ? "seats" : "tickets", price: summary.price, currency: summary.currency, configured: summary.configured, held: summary.held, sold: summary.sold, buyable: summary.buyable, ticketTypeIds: [type.id] });
      }
      for (const table of wholeTables) {
        const paidPass = table.bookings[0]?.order.groupPass;
        const sold = Boolean(paidPass && paidPass.status !== "cancelled");
        const held = !sold && table.holds.length > 0;
        saleGroups.set(`table:${table.id}`, { id: `table:${table.id}`, kind: "table", name: table.name || `Стол ${table.number}`, unit: "tables", price: table.price, currency: table.currency, configured: 1, held: held ? 1 : 0, sold: sold ? 1 : 0, buyable: !sold && !held && (table.status === "available" || table.status === "held") ? 1 : 0, ticketTypeIds: [] });
      }

      const seatInventory = summarizeSeats(seats, asOf);
      const tableInventory = summarizeWholeTables(wholeTables);
      const issued = ticketStatusMap(ticketStatusRows);
      const ownedOrders = orders.filter((order) => belongsOnlyToEvent(order, id));
      const orderIds = ownedOrders.map((order) => order.id);
      const refundRequests = orderIds.length === 0
        ? 0
        : await transaction.outboxEvent.count({
          where: { aggregateType: "order", aggregateId: { in: orderIds }, eventType: { in: ["refund.requested", "refund.operation_requested"] } },
        });
      const paidOrders = ownedOrders.filter(hasConfirmedPaymentEvidence);
      const knownRefunds = ownedOrders.flatMap((order) => order.refundRequest?.status === "succeeded" && order.refundRequest.completedAt ? [order.refundRequest] : []);
      const unknownRefunds = ownedOrders.some((order) => order.paymentStatus === "refunded" && !order.refundRequest?.completedAt);
      const grossMoney = moneyByCurrency(paidOrders);
      const refundedMoney = moneyByCurrency(knownRefunds);
      const registeredBuyers = new Set(ownedOrders.flatMap((order) => order.buyerUserId ? [order.buyerUserId] : []));
      const anonymousOrders = ownedOrders.filter((order) => !order.buyerUserId && order.anonymousSession).length;
      const ordinarySummary = ticketTypeSummary.filter((type) => ordinaryTypeIds.has(type.id));
      const ordinaryConfigured = ordinarySummary.reduce((sum, type) => sum + type.configured, 0);
      const ordinaryHeld = ordinarySummary.reduce((sum, type) => sum + type.held, 0);
      const ordinarySold = ordinarySummary.reduce((sum, type) => sum + type.sold, 0);
      const ordinaryBuyable = ordinarySummary.reduce((sum, type) => sum + type.buyable, 0);
      const salesModes: ManagementEventSummary["event"]["salesModes"] = [];
      if (ordinaryTypes.length > 0) salesModes.push("ordinary");
      if (seats.length > 0) salesModes.push("per_seat");
      if (wholeTables.length > 0) salesModes.push("whole_table");

      return {
        event: {
          id: event.id,
          title: event.title,
          status: event.status,
          paymentMode: event.paymentMode,
          timezone: event.timezone,
          date: event.date.toISOString().slice(0, 10),
          time: event.time.toISOString().slice(11, 16),
          venueName: event.venueName,
          address: event.address,
          salesModes,
        },
        asOf: asOf.toISOString(),
        inventory: {
          configuredAdmissionCapacity: ordinaryConfigured + seatInventory.configured + tableInventory.configuredAdmissions,
          buyableAdmissions: ordinaryBuyable + seatInventory.buyable + tableInventory.buyableAdmissions,
          heldAdmissions: ordinaryHeld + seatInventory.held + tableInventory.heldAdmissions,
          soldAdmissions: ordinarySold + seatInventory.sold + tableInventory.soldAdmissions,
          issuedTickets: issued,
          wholeTables: tableInventory.tables,
          seats: seatInventory,
          ticketTypes: ticketTypeSummary,
          saleGroups: [...saleGroups.values()],
        },
        money: {
          grossReceived: grossMoney,
          completedRefunds: unknownRefunds ? null : refundedMoney,
          netReceived: unknownRefunds ? null : subtractMoney(grossMoney, refundedMoney),
          depositsReceived: moneyByCurrency(deposits),
          completeness: { settlementTime: "partial", completedRefundMoney: unknownRefunds ? "partial" : "complete" },
        },
        attendance: {
          checkedInTickets: usedTickets,
          checkedInGroupPasses: usedPasses,
          individualAttendanceKnown: true,
        },
        buyers: { registered: registeredBuyers.size, anonymousOrders, unknown: ownedOrders.some((order) => !order.buyerUserId && !order.anonymousSession) },
        cancellations: { tickets: cancelledTickets, bookings: cancelledBookings, refundRequests },
      } satisfies ManagementEventSummary;
    });
  }

  async managementAnalytics(
    organizerId: string,
    id: string,
    query: ManagementAnalyticsQuery,
  ): Promise<ManagementAnalyticsResponse> {
    const from = parseAnalyticsInstant(query.from, "from");
    const to = parseAnalyticsInstant(query.to, "to");
    validateAnalyticsRange(from, to, query.bucket);
    const asOf = new Date();

    return this.database.$transaction(async (transaction) => {
      const event = await this.findOwned(transaction, organizerId, id);
      const buckets = createAnalyticsBuckets(from, to, query.bucket, event.timezone);
      const orders = await transaction.order.findMany({
        where: {
          OR: [
            { tickets: { some: { ticketType: { eventId: id } } } },
            { reservations: { some: { ticketType: { eventId: id } } } },
            { seatAllocations: { some: { seat: { venueLayout: { eventId: id } } } } },
            { booking: { table: { venueLayout: { eventId: id } } } },
            { deposit: { eventId: id } },
          ],
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentStatus: true,
          tickets: {
            select: {
              paidAt: true,
              status: true,
              ticketType: { select: { id: true, name: true, currency: true, eventId: true, isInternal: true } },
            },
          },
          reservations: { select: { ticketType: { select: { eventId: true } } } },
          seatAllocations: { select: { seat: { select: { venueLayout: { select: { eventId: true } } } } } },
          booking: {
            select: {
              table: { select: { venueLayout: { select: { eventId: true } } } },
              order: { select: { groupPass: { select: { totalSeats: true, status: true } } } },
            },
          },
          deposit: { select: { eventId: true, amount: true, currency: true, status: true, paidAt: true } },
          payments: {
            where: { status: { in: ["paid", "refunded"] } },
            select: { status: true, webhookReceivedAt: true },
          },
          refundRequest: { select: { status: true, amount: true, currency: true, completedAt: true } },
        },
      });

      let unknownSettlement = 0;
      let unknownSale = 0;
      let unknownRefund = false;
      for (const order of orders) {
        if (!belongsOnlyToEvent(order, id)) continue;
        // A later refund changes the current status but must not erase an
        // earlier, provable sale. A refunded payment alone has no reliable
        // original settlement timestamp in the current schema, so it is
        // retained as incomplete history rather than assigned to a bucket.
        const paidEvidence = hasConfirmedPaymentEvidence(order);
        if (!paidEvidence) continue;

        const settlementTime = earliestDate([
          ...order.payments.filter((payment) => payment.status === "paid" || payment.status === "refunded").map(({ webhookReceivedAt }) => webhookReceivedAt),
          ...order.tickets.map(({ paidAt }) => paidAt),
          order.deposit?.status === "paid" ? order.deposit.paidAt : null,
        ]);
        if (!settlementTime) {
          unknownSettlement += 1;
        } else {
          const bucket = findAnalyticsBucket(buckets, settlementTime);
          if (isInRange(settlementTime, from, to) && bucket) {
            addMoney(bucket.gross, order.currency, order.amount);
          }
        }

        if (order.deposit?.eventId === id && (order.deposit.status === "paid" || order.deposit.status === "refunded") && order.deposit.paidAt) {
          const bucket = findAnalyticsBucket(buckets, order.deposit.paidAt);
          if (isInRange(order.deposit.paidAt, from, to) && bucket) addMoney(bucket.deposits, order.deposit.currency, order.deposit.amount);
        }

        if (order.refundRequest?.status === "succeeded" && order.refundRequest.completedAt) {
          const refundTime = order.refundRequest.completedAt;
          const bucket = findAnalyticsBucket(buckets, refundTime);
          if (isInRange(refundTime, from, to) && bucket) addMoney(bucket.refunds, order.refundRequest.currency, order.refundRequest.amount);
        } else if (order.paymentStatus === "refunded") unknownRefund = true;

        const groupPass = order.booking?.order.groupPass;
        const groupPassSold = Boolean(groupPass && groupPass.status !== "cancelled");
        if (groupPassSold) {
          const saleTime = earliestDate(order.tickets.map(({ paidAt }) => paidAt));
          if (!saleTime) {
            unknownSale += 1;
          } else {
            const bucket = findAnalyticsBucket(buckets, saleTime);
            if (isInRange(saleTime, from, to) && bucket) {
              bucket.soldAdmissions += groupPass!.totalSeats;
              bucket.issuedTickets += order.tickets.filter((ticket) => ticket.ticketType.isInternal && ticket.paidAt).length;
            }
          }
        }

        for (const ticket of order.tickets) {
          if (ticket.ticketType.eventId !== id || ticket.ticketType.isInternal || !ticket.paidAt) {
            if (ticket.ticketType.eventId === id && !ticket.paidAt) unknownSale += 1;
            continue;
          }
          const bucket = findAnalyticsBucket(buckets, ticket.paidAt);
          if (!isInRange(ticket.paidAt, from, to) || !bucket) continue;
          bucket.soldAdmissions += 1;
          bucket.issuedTickets += 1;
          const type = bucket.salesByType.get(ticket.ticketType.id) ?? {
            ticketTypeId: ticket.ticketType.id,
            name: ticket.ticketType.name,
            currency: ticket.ticketType.currency,
            soldAdmissions: 0,
            grossReceived: null,
          };
          type.soldAdmissions += 1;
          bucket.salesByType.set(type.ticketTypeId, type);
        }

      }

      const totals = analyticsTotals(buckets, unknownSettlement > 0, unknownRefund);
      const hasUnavailablePerTypeRevenue = unknownSale > 0
        || buckets.some((bucket) => bucket.salesByType.size > 0);
      return {
        eventId: id,
        timezone: event.timezone,
        from: from.toISOString(),
        to: to.toISOString(),
        bucket: query.bucket,
        asOf: asOf.toISOString(),
        totals,
        buckets: buckets.map((bucket) => ({
          startsAt: bucket.startsAt.toISOString(),
          label: bucket.label,
          money: analyticsMoney(bucket, unknownRefund),
          soldAdmissions: bucket.soldAdmissions,
          issuedTickets: bucket.issuedTickets,
          salesByType: [...bucket.salesByType.values()].sort((left, right) => left.ticketTypeId.localeCompare(right.ticketTypeId)),
        })),
        unavailable: [
          ...(unknownSettlement > 0 ? ["settlement_time" as const] : []),
          ...(unknownRefund ? ["completed_refund_money" as const] : []),
          ...(hasUnavailablePerTypeRevenue ? ["per_type_revenue" as const] : []),
        ],
      };
    });
  }

  async managementOrders(
    organizerId: string,
    id: string,
    query: ManagementOrdersQuery,
  ): Promise<ManagementOrderList> {
    const asOf = new Date();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const items: ManagementOrderRow[] = [];
    let total = 0;
    const statusCounts = {
      all: 0,
      pending: 0,
      paid: 0,
      failed: 0,
      cancelled: 0,
      refunded: 0,
    } as ManagementOrderList["statusCounts"];

    await this.scanManagementOrderRows(organizerId, id, { ...query, payment: "all" }, (row) => {
      if (!matchesManagementOrder(row, query, true)) return;
      statusCounts.all += 1;
      statusCounts[row.payment.status] += 1;
      if (!matchesManagementOrder(row, query, false)) return;
      total += 1;
      if (total > skip && items.length < limit) items.push(row);
    });

    return {
      asOf: asOf.toISOString(),
      items,
      page,
      limit,
      total,
      hasNext: skip + items.length < total,
      statusCounts,
    };
  }

  async managementOrderFilterOptions(organizerId: string, id: string): Promise<ManagementOrderFilterOptions> {
    await this.findOwned(this.database, organizerId, id);
    const tables = await this.database.table.findMany({
      where: { venueLayout: { eventId: id } },
      select: { id: true, number: true, name: true },
      orderBy: [{ number: "asc" }, { id: "asc" }],
    });
    return { tables: tables.map(({ id: tableId, number, name }) => ({ id: tableId, label: tableLabel({ number, name }) })) };
  }

  async managementOrdersExport(organizerId: string, id: string, query: ManagementOrdersQuery): Promise<string> {
    const lines: Array<Array<string | number | null>> = [
      ["Заказ", "Создан", "Тип", "Покупатель", "Контакт", "Оплата", "Сумма", "Валюта", "Депозит", "Билеты", "Места", "Стол", "Посещение"],
    ];
    let total = 0;
    await this.scanManagementOrderRows(organizerId, id, query, (row) => {
      if (!matchesManagementOrder(row, query, false)) return;
      total += 1;
      if (total > 10_000) {
        throw new BadRequestException({ code: "EXPORT_TOO_LARGE", message: "Narrow the filters to export at most 10,000 orders" });
      }
      lines.push([
        row.id,
        row.createdAt,
        row.type,
        row.buyer.name,
        row.buyer.contact,
        row.payment.status,
        row.payment.amount,
        row.payment.currency,
        row.payment.depositAmount,
        row.resources.ticketCount,
        row.resources.allocatedSeatCount,
        row.booking.tableLabel,
        row.attendance.state,
      ]);
    });
    return csvDocument(lines);
  }

  async managementAnalyticsExport(organizerId: string, id: string, query: ManagementAnalyticsQuery): Promise<string> {
    const report = await this.managementAnalytics(organizerId, id, query);
    const lines: Array<Array<string | number | null>> = [["Период", "Метка", "Тип", "Валюта", "Валовая выручка", "Возвраты", "Чистая выручка", "Депозиты", "Продано мест", "Выдано билетов"]];
    for (const bucket of report.buckets) {
      for (const money of bucket.money) lines.push([bucket.startsAt, bucket.label, "Итого", money.currency, money.grossReceived, money.completedRefunds, money.netReceived, money.depositsReceived, null, null]);
      lines.push([bucket.startsAt, bucket.label, "Объём продаж", null, null, null, null, null, bucket.soldAdmissions, bucket.issuedTickets]);
      for (const type of bucket.salesByType) lines.push([bucket.startsAt, bucket.label, type.name, type.currency, type.grossReceived, null, null, null, type.soldAdmissions, null]);
    }
    lines.push(["#", `from=${report.from}; to=${report.to}; timezone=${report.timezone}; unavailable=${report.unavailable.join(",")}`, null, null, null, null, null, null, null, null]);
    return csvDocument(lines);
  }

  async managementOrderDetail(organizerId: string, eventId: string, orderId: string): Promise<ManagementOrderDetail> {
    await this.findOwned(this.database, organizerId, eventId);
    const record = await this.database.order.findFirst({
      where: { id: orderId, ...managementOrderWhere(eventId) },
      select: managementOrderSelect,
    });
    if (!record || !belongsOnlyToEvent(record, eventId)) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order was not found" });
    }
    const row = presentManagementOrder(record, eventId);
    const ids = [record.id, ...record.tickets.map((ticket) => ticket.id), ...(record.booking ? [record.booking.id] : [])];
    const recipientFilters: Prisma.NotificationWhereInput[] = [];
    if (record.buyerUserId) recipientFilters.push({ userId: record.buyerUserId });
    if (record.anonymousSession?.chatId) recipientFilters.push({ telegramId: record.anonymousSession.chatId });
    const [audit, outbox, notifications] = await Promise.all([
      this.database.auditLog.findMany({
        where: { entityId: { in: ids } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
      }),
      this.database.outboxEvent.findMany({
        where: { aggregateId: record.id },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: { id: true, eventType: true, occurredAt: true },
      }),
      recipientFilters.length ? this.database.notification.findMany({
        where: { broadcast: { eventId }, OR: recipientFilters },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
        select: { type: true, payload: true, status: true, createdAt: true, sentAt: true },
      }) : Promise.resolve([]),
    ]);
    const history = [
      ...audit.filter(({ action }) => SAFE_ORDER_HISTORY.has(action)).map((item) => ({ occurredAt: item.createdAt.toISOString(), kind: item.entityType, description: historyDescription(item.action) })),
      ...outbox.filter(({ eventType }) => SAFE_ORDER_HISTORY.has(eventType)).map((item) => ({ occurredAt: item.occurredAt.toISOString(), kind: "order", description: historyDescription(item.eventType) })),
      ...notifications.filter((item) => item.type !== "ticket.resend" || (typeof item.payload === "object" && item.payload !== null && !Array.isArray(item.payload) && item.payload.orderId === record.id)).map((item) => ({
        occurredAt: (item.sentAt ?? item.createdAt).toISOString(), kind: "communication",
        description: item.type === "ticket.resend" ? `Повторная отправка билета: ${notificationHistoryStatus(item.status)}` : `Уведомление о событии: ${notificationHistoryStatus(item.status)}`,
      })),
    ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    return {
      ...row,
      eventId,
      acceptedPolicy:readCheckoutSnapshot(record.checkoutSnapshot).acceptedPolicy??null,
      payments: record.payments.map((payment) => ({ status: payment.status, amount: payment.amount, currency: payment.currency.trim(), settledAt: payment.webhookReceivedAt?.toISOString() ?? null })),
      tickets: record.tickets.filter((ticket) => ticket.ticketType.eventId === eventId).map((ticket) => ({
        id: ticket.id,
        typeName: ticket.ticketType.name,
        seatLabel: ticket.seatLabelSnapshot,
        status: ticket.status,
        paidAt: ticket.paidAt?.toISOString() ?? null,
        usedAt: ticket.usedAt?.toISOString() ?? null,
        cancelledAt: ticket.cancelledAt?.toISOString() ?? null,
        refundedAt: ticket.refundedAt?.toISOString() ?? null,
      })),
      history,
    };
  }

  private async scanManagementOrderRows(
    organizerId: string,
    id: string,
    query: ManagementOrdersQuery,
    visit: (row: ManagementOrderRow) => void,
  ): Promise<void> {
    await this.findOwned(this.database, organizerId, id);
    if (query.sectorId) {
      throw new BadRequestException({ code: "SECTOR_FILTER_UNSUPPORTED", message: "This event has no persisted sector mapping" });
    }
    const where = managementOrderWhere(id, query);
    let cursor: string | undefined;
    do {
      const records = await this.database.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MANAGEMENT_ORDER_SCAN_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: managementOrderSelect,
      });
      for (const record of records) {
        if (belongsOnlyToEvent(record, id)) visit(presentManagementOrder(record, id));
      }
      cursor = records.at(-1)?.id;
      if (records.length < MANAGEMENT_ORDER_SCAN_BATCH_SIZE) return;
    } while (cursor);
  }

  reopen(organizerId: string, id: string): Promise<OrganizerEvent> {
    return this.transition(organizerId, id, EventStatus.published, EventStatus.completed);
  }

  cancel(organizerId: string, id: string): Promise<OrganizerEvent> {
    return this.transition(organizerId, id, EventStatus.cancelled);
  }

  complete(organizerId: string, id: string): Promise<OrganizerEvent> {
    return this.transition(organizerId, id, EventStatus.completed);
  }

  async deleteDraft(organizerId: string, id: string): Promise<DeleteEventResponse> {
    const posterKey = await this.database.$transaction(async (transaction) => {
      const current = await this.findOwned(transaction, organizerId, id);
      if (current.status !== EventStatus.draft) {
        throw new ConflictException({
          code: "EVENT_DELETE_NOT_ALLOWED",
          message: "Only a never-published draft can be permanently deleted",
        });
      }

      const deleted = await transaction.event.deleteMany({
        where: { id, organizerId, status: EventStatus.draft },
      });
      if (deleted.count !== 1) throw invalidTransition();

      await this.domainEvents.append(transaction, {
        eventType: "event.deleted",
        aggregateType: "event",
        aggregateId: id,
        payload: { organizerId, status: EventStatus.draft },
      });
      await transaction.auditLog.create({
        data: {
          actorId: organizerId,
          action: "event.deleted",
          entityType: "event",
          entityId: id,
          meta: { previousStatus: EventStatus.draft },
        },
      });
      return managedPosterKey(current.posterUrl);
    });

    if (posterKey) await this.storage.deletePoster(posterKey);
    return { deleted: true, id };
  }

  private async transition(
    organizerId: string,
    id: string,
    target: "published" | "cancelled" | "completed",
    source?: "completed",
  ): Promise<OrganizerEvent> {
    const event = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = await this.findOwned(transaction, organizerId, id);
      const expected = source ?? (target === EventStatus.published ? EventStatus.draft : EventStatus.published);
      if (current.status !== expected) throw invalidTransition(current.status, target);
      if (target === EventStatus.published) {
        if (current.creationVersion !== 2) assertPublishable(current);
        assertCurrentSale(current);
      }

      const changed = await transaction.event.updateMany({
        where: { id, organizerId, status: expected },
        data: {
          status: target,
          ...(target === EventStatus.published ? { publishedAt: new Date() } : {}),
        },
      });
      if (changed.count !== 1) throw invalidTransition(current.status, target);

      const updated = await transaction.event.findUniqueOrThrow({ where: { id } });
      await this.recordMutation(transaction, organizerId, updated, source ? "event.reopened" : `event.${target}`, ["status"], {
        previousStatus: current.status,
      });
      return updated;
    });
    return presentEvent(event);
  }

  private async findOwned(
    database: Pick<PrismaClient, "event"> | Pick<Prisma.TransactionClient, "event">,
    organizerId: string,
    id: string,
  ): Promise<Event> {
    const event = await database.event.findFirst({ where: { id, organizerId } });
    if (!event) {
      throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    }
    return event;
  }

  private async revenueByEvent(eventIds: string[]): Promise<Map<string, Money>> {
    if (eventIds.length === 0) return new Map();
    const rows = await this.database.order.findMany({
      where: {
        paymentStatus: "paid",
        OR: [
          { tickets: { some: { ticketType: { eventId: { in: eventIds } } } } },
          { booking: { table: { venueLayout: { eventId: { in: eventIds } } } } },
        ],
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        checkoutSnapshot: true,
        tickets: { take: 1, select: { ticketType: { select: { eventId: true } } } },
        booking: { select: { table: { select: { venueLayout: { select: { eventId: true } } } } } },
      },
    });
    const result = new Map<string, Money>();
    for (const row of rows) {
      const snapshot = jsonObject(row.checkoutSnapshot);
      const eventId = typeof snapshot.eventId === "string"
        ? snapshot.eventId
        : row.tickets[0]?.ticketType.eventId ?? row.booking?.table.venueLayout.eventId;
      if (!eventId || !eventIds.includes(eventId)) continue;
      const currency = row.currency.trim();
      const current = result.get(eventId);
      result.set(eventId, current && current.currency === currency
        ? { amount: current.amount + row.amount, currency }
        : current ? { amount: 0, currency: null } : { amount: row.amount, currency });
    }
    return result;
  }

  private async recordMutation(
    database: EventTransaction,
    actorId: string,
    event: Event,
    eventType: string,
    changedFields: string[],
    extraMeta: Prisma.InputJsonObject = {},
  ): Promise<void> {
    const meta: Prisma.InputJsonObject = { changedFields, ...extraMeta };
    await this.domainEvents.append(database, {
      eventType,
      aggregateType: "event",
      aggregateId: event.id,
      payload: {
        organizerId: event.organizerId,
        status: event.status,
        changedFields,
        occurredForTimezone: event.timezone,
        eventUpdatedAt: event.updatedAt.toISOString(),
      },
    });
    await database.auditLog.create({
      data: {
        actorId,
        action: eventType,
        entityType: "event",
        entityId: event.id,
        meta,
      },
    });
  }
}

const eventMetricInclude = {
  ticketTypes: {
    where: { isInternal: false },
    select: { quantityTotal: true, quantitySold: true, currency: true },
  },
  venueLayout: {
    select: {
      seats: {
        select: {
          status: true,
          allocations: {
            where: { status: { in: ["active", "consumed"] }, order: { paymentStatus: "paid" } },
            select: { id: true },
          },
        },
      },
      tables: {
        select: {
          saleMode: true,
          seats: true,
          currency: true,
          bookings: {
            where: { status: "confirmed", order: { paymentStatus: "paid" } },
            select: { id: true },
          },
        },
      },
    },
  },
} satisfies Prisma.EventInclude;

type EventWithMetrics = Prisma.EventGetPayload<{ include: typeof eventMetricInclude }>;
type Money = { amount: number; currency: string | null };
const MANAGEMENT_ORDER_SCAN_BATCH_SIZE = 250;

const managementOrderSelect = {
  id: true,checkoutSnapshot:true,
  type: true,
  createdAt: true,
  amount: true,
  currency: true,
  paymentStatus: true,
  buyerUserId: true,
  guestContact: true,
  buyer: { select: { name: true, phone: true, email: true } },
  anonymousSession: { select: { id: true, chatId: true } },
  tickets: {
    select: {
      id: true,
      status: true,
      paidAt: true,
      usedAt: true,
      cancelledAt: true,
      refundedAt: true,
      seatLabelSnapshot: true,
      ticketType: { select: { id: true, name: true, eventId: true, currency: true, isInternal: true } },
    },
  },
  reservations: { select: { ticketType: { select: { eventId: true } } } },
  seatAllocations: {
    select: {
      id: true,
      status: true,
      seat: {
        select: {
          id: true,
          label: true,
          number: true,
          venueLayout: { select: { eventId: true } },
          table: { select: { id: true, number: true, name: true } },
          row: { select: { id: true, number: true, name: true } },
        },
      },
    },
  },
  booking: {
    select: {
      id: true,
      status: true,
      table: { select: { id: true, number: true, name: true, saleMode: true, venueLayout: { select: { eventId: true } } } },
    },
  },
  groupPass: { select: { status: true } },
  deposit: { select: { eventId: true, amount: true, currency: true, status: true } },
  payments: { select: { status: true, amount: true, currency: true, webhookReceivedAt: true } },
} satisfies Prisma.OrderSelect;

type ManagementOrderRecord = Prisma.OrderGetPayload<{ select: typeof managementOrderSelect }>;

const SAFE_ORDER_HISTORY = new Set([
  "order.claimed",
  "payment.attempt_created",
  "payment.succeeded",
  "payment.failed",
  "payment.review_required",
  "checkout.paid",
  "checkout.expired",
  "ticket.cancelled",
  "booking.cancelled",
  "booking.booking_cancelled",
  "refund.requested",
  "refund.operation_requested",
  "refund.succeeded",
  "checkout.hold_released",
]);

type SummarySeat = {
  status: SeatStatus;
  allocations: Array<{
    status: SeatAllocationStatus;
    order: { paymentStatus: PaymentStatus; expiresAt: Date | null };
    ticket: { status: TicketStatus } | null;
  }>;
};

type SummaryWholeTable = {
  seats: number;
  status: TableStatus;
  holds: Array<{ id: string }>;
  bookings: Array<{ order: { groupPass: { totalSeats: number; status: GroupPassStatus } | null } }>;
};

function summarizeSeats(seats: SummarySeat[], asOf: Date): ManagementEventSummary["inventory"]["seats"] {
  let configured = 0;
  let held = 0;
  let sold = 0;
  let buyable = 0;
  let disabled = 0;

  for (const seat of seats) {
    if (seat.status === "disabled") {
      disabled += 1;
      continue;
    }
    configured += 1;
    const allocated = seat.allocations.some((allocation) =>
      allocation.status === "consumed"
        && allocation.order.paymentStatus === "paid"
        && allocation.ticket?.status !== "cancelled"
        && allocation.ticket?.status !== "refunded",
    );
    const heldAllocation = seat.allocations.some((allocation) =>
      allocation.status === "active"
        && allocation.order.paymentStatus === "pending"
        && (!allocation.order.expiresAt || allocation.order.expiresAt > asOf),
    );
    if (allocated) sold += 1;
    else if (heldAllocation) held += 1;
    else buyable += 1;
  }
  return { configured, held, sold, buyable, disabled };
}

function summarizeWholeTables(tables: SummaryWholeTable[]): {
  configuredAdmissions: number;
  heldAdmissions: number;
  soldAdmissions: number;
  buyableAdmissions: number;
  tables: ManagementEventSummary["inventory"]["wholeTables"];
} {
  let configuredAdmissions = 0;
  let heldAdmissions = 0;
  let soldAdmissions = 0;
  let buyableAdmissions = 0;
  let held = 0;
  let sold = 0;
  let buyable = 0;

  for (const table of tables) {
    configuredAdmissions += table.seats;
    const paidPass = table.bookings[0]?.order.groupPass;
    const hasSoldBooking = Boolean(paidPass && paidPass.status !== "cancelled");
    const hasActiveHold = table.holds.length > 0;
    if (hasSoldBooking) {
      sold += 1;
      soldAdmissions += paidPass!.totalSeats;
      continue;
    }
    if (hasActiveHold) {
      held += 1;
      heldAdmissions += table.seats;
      continue;
    }
    // A stale `held` status is deliberately treated as buyable when its active
    // hold has expired. Reads must reflect checkout expiry without performing cleanup.
    if (table.status === "available" || table.status === "held") {
      buyable += 1;
      buyableAdmissions += table.seats;
    }
  }
  return {
    configuredAdmissions,
    heldAdmissions,
    soldAdmissions,
    buyableAdmissions,
    tables: { configured: tables.length, held, sold, buyable },
  };
}

function ticketStatusMap(rows: Array<{ status: string; _count: { _all: number } }>): ManagementEventSummary["inventory"]["issuedTickets"] {
  const counts = new Map(rows.map((row) => [row.status, row._count._all]));
  const pendingPayment = counts.get("pending_payment") ?? 0;
  const active = (counts.get("active") ?? 0) + (counts.get("paid") ?? 0);
  const used = counts.get("used") ?? 0;
  const cancelled = counts.get("cancelled") ?? 0;
  const refunded = counts.get("refunded") ?? 0;
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    pendingPayment,
    active,
    used,
    cancelled,
    refunded,
  };
}

function belongsOnlyToEvent(order: {
  tickets: Array<{ ticketType: { eventId: string } }>;
  reservations: Array<{ ticketType: { eventId: string } }>;
  seatAllocations: Array<{ seat: { venueLayout: { eventId: string | null } } }>;
  booking: { table: { venueLayout: { eventId: string | null } } } | null;
  deposit: { eventId: string } | null;
}, eventId: string): boolean {
  const eventIds = new Set<string>();
  for (const ticket of order.tickets) eventIds.add(ticket.ticketType.eventId);
  for (const reservation of order.reservations) eventIds.add(reservation.ticketType.eventId);
  for (const allocation of order.seatAllocations) {
    if (allocation.seat.venueLayout.eventId) eventIds.add(allocation.seat.venueLayout.eventId);
  }
  if (order.booking?.table.venueLayout.eventId) eventIds.add(order.booking.table.venueLayout.eventId);
  if (order.deposit) eventIds.add(order.deposit.eventId);
  return eventIds.size === 1 && eventIds.has(eventId);
}

function hasConfirmedPaymentEvidence(order: {
  paymentStatus: PaymentStatus;
  tickets: Array<{ paidAt: Date | null }>;
  deposit: { status: PaymentStatus; paidAt: Date | null } | null;
  payments: Array<{ status: PaymentStatus }>;
}): boolean {
  return order.paymentStatus === "paid"
    || order.paymentStatus === "refunded"
    || order.payments.some(({ status }) => status === "paid" || status === "refunded")
    || order.tickets.some(({ paidAt }) => Boolean(paidAt))
    || Boolean(order.deposit?.paidAt && (order.deposit.status === "paid" || order.deposit.status === "refunded"));
}

function moneyByCurrency(rows: Array<{ amount: number; currency: string }>): ManagementCurrencyMoney[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency.trim();
    totals.set(currency, (totals.get(currency) ?? 0) + row.amount);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }));
}

function subtractMoney(gross: ManagementCurrencyMoney[], refunded: ManagementCurrencyMoney[]): ManagementCurrencyMoney[] {
  const values = new Map(gross.map(({ currency, amount }) => [currency, amount]));
  for (const { currency, amount } of refunded) values.set(currency, (values.get(currency) ?? 0) - amount);
  return [...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount }));
}

type AnalyticsTypeState = {
  ticketTypeId: string;
  name: string;
  currency: string;
  soldAdmissions: number;
  grossReceived: number | null;
};

type AnalyticsBucketState = {
  startsAt: Date;
  endsAt: Date;
  label: string;
  gross: Map<string, number>;
  refunds: Map<string, number>;
  deposits: Map<string, number>;
  soldAdmissions: number;
  issuedTickets: number;
  salesByType: Map<string, AnalyticsTypeState>;
};

function parseAnalyticsInstant(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new BadRequestException({ code: "ANALYTICS_RANGE_INVALID", message: `${field} must be a valid ISO instant` });
  }
  return parsed;
}

function validateAnalyticsRange(from: Date, to: Date, bucket: "day" | "hour"): void {
  const duration = to.getTime() - from.getTime();
  const maximum = (bucket === "day" ? MANAGEMENT_ANALYTICS_MAX_DAYS : MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS) * 86_400_000;
  if (duration <= 0 || duration > maximum) {
    throw new BadRequestException({
      code: "ANALYTICS_RANGE_INVALID",
      message: bucket === "day" ? "The daily range must be positive and at most 366 days" : "The hourly range must be positive and at most 31 days",
    });
  }
}

function createAnalyticsBuckets(from: Date, to: Date, bucket: "day" | "hour", timezone: string): AnalyticsBucketState[] {
  let cursor = localBoundary(from, bucket, timezone);
  if (cursor.getTime() > from.getTime()) {
    cursor = bucket === "hour" ? new Date(cursor.getTime() - 3_600_000) : previousLocalDay(cursor, timezone);
  }
  const result: AnalyticsBucketState[] = [];
  while (cursor < to) {
    const next = bucket === "hour" ? new Date(cursor.getTime() + 3_600_000) : nextLocalDay(cursor, timezone);
    result.push({
      startsAt: cursor,
      endsAt: next,
      label: analyticsLabel(cursor, timezone, bucket),
      gross: new Map(),
      refunds: new Map(),
      deposits: new Map(),
      soldAdmissions: 0,
      issuedTickets: 0,
      salesByType: new Map(),
    });
    cursor = next;
  }
  return result;
}

function localBoundary(value: Date, bucket: "day" | "hour", timezone: string): Date {
  const parts = localParts(value, timezone);
  const local = `${parts.year}-${parts.month}-${parts.day}T${bucket === "day" ? "00" : parts.hour}:00`;
  return new Date(zonedInputToIso(local, timezone));
}

function nextLocalDay(value: Date, timezone: string): Date {
  const parts = localParts(value, timezone);
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1));
  const local = `${day.getUTCFullYear().toString().padStart(4, "0")}-${(day.getUTCMonth() + 1).toString().padStart(2, "0")}-${day.getUTCDate().toString().padStart(2, "0")}T00:00`;
  return new Date(zonedInputToIso(local, timezone));
}

function previousLocalDay(value: Date, timezone: string): Date {
  const parts = localParts(value, timezone);
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - 1));
  const local = `${day.getUTCFullYear().toString().padStart(4, "0")}-${(day.getUTCMonth() + 1).toString().padStart(2, "0")}-${day.getUTCDate().toString().padStart(2, "0")}T00:00`;
  return new Date(zonedInputToIso(local, timezone));
}

function localParts(value: Date, timezone: string): { year: string; month: string; day: string; hour: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return {
    year: parts.find((part) => part.type === "year")?.value ?? "0000",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    hour: parts.find((part) => part.type === "hour")?.value ?? "00",
  };
}

function analyticsLabel(value: Date, timezone: string, bucket: "day" | "hour"): string {
  const parts = localParts(value, timezone);
  return bucket === "day" ? `${parts.year}-${parts.month}-${parts.day}` : `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:00`;
}

function findAnalyticsBucket(buckets: AnalyticsBucketState[], value: Date): AnalyticsBucketState | undefined {
  return buckets.find((bucket) => value >= bucket.startsAt && value < bucket.endsAt);
}

function isInRange(value: Date, from: Date, to: Date): boolean {
  return value >= from && value < to;
}

function earliestDate(values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date && Number.isFinite(value.getTime()));
  return dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
}

function addMoney(target: Map<string, number>, currency: string, amount: number): void {
  const normalized = currency.trim();
  target.set(normalized, (target.get(normalized) ?? 0) + amount);
}

function analyticsMoney(bucket: AnalyticsBucketState, unknownRefund: boolean): Array<{ currency: string; grossReceived: number | null; completedRefunds: number | null; netReceived: number | null; depositsReceived: number | null }> {
  const currencies = [...new Set([...bucket.gross.keys(), ...bucket.refunds.keys(), ...bucket.deposits.keys()])].sort();
  return currencies.map((currency) => ({
    currency,
    grossReceived: bucket.gross.get(currency) ?? 0,
    completedRefunds: unknownRefund ? null : bucket.refunds.get(currency) ?? 0,
    netReceived: unknownRefund ? null : (bucket.gross.get(currency) ?? 0) - (bucket.refunds.get(currency) ?? 0),
    depositsReceived: bucket.deposits.get(currency) ?? 0,
  }));
}

function analyticsTotals(buckets: AnalyticsBucketState[], hasUnknownSettlement: boolean, unknownRefund: boolean): ManagementEventSummary["money"] {
  const gross = new Map<string, number>();
  const refunds = new Map<string, number>();
  const deposits = new Map<string, number>();
  for (const bucket of buckets) {
    for (const [currency, amount] of bucket.gross) addMoney(gross, currency, amount);
    for (const [currency, amount] of bucket.refunds) addMoney(refunds, currency, amount);
    for (const [currency, amount] of bucket.deposits) addMoney(deposits, currency, amount);
  }
  return {
    grossReceived: moneyMap(gross),
    completedRefunds: unknownRefund ? null : moneyMap(refunds),
    netReceived: unknownRefund ? null : subtractMoney(moneyMap(gross), moneyMap(refunds)),
    depositsReceived: moneyMap(deposits),
    completeness: { settlementTime: hasUnknownSettlement ? "partial" : "complete", completedRefundMoney: unknownRefund ? "partial" : "complete" },
  };
}

function moneyMap(values: Map<string, number>): ManagementCurrencyMoney[] {
  return [...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount }));
}

function managementOrderWhere(eventId: string, query?: ManagementOrdersQuery): Prisma.OrderWhereInput {
  const filters: Prisma.OrderWhereInput[] = [{
    OR: [
      { tickets: { some: { ticketType: { eventId } } } },
      { reservations: { some: { ticketType: { eventId } } } },
      { seatAllocations: { some: { seat: { venueLayout: { eventId } } } } },
      { booking: { table: { venueLayout: { eventId } } } },
      { deposit: { eventId } },
    ],
  }];
  if (query?.payment && query.payment !== "all") filters.push({ paymentStatus: query.payment });
  if (query?.tableId) {
    filters.push({
      OR: [
        { booking: { tableId: query.tableId } },
        { seatAllocations: { some: { seat: { tableId: query.tableId } } } },
      ],
    });
  }
  const createdAt: Prisma.DateTimeFilter = {};
  if (query?.createdFrom) createdAt.gte = parseOrderInstant(query.createdFrom, "createdFrom");
  if (query?.createdTo) createdAt.lt = parseOrderInstant(query.createdTo, "createdTo");
  if (createdAt.gte && createdAt.lt && createdAt.gte >= createdAt.lt) {
    throw new BadRequestException({ code: "ORDER_DATE_INVALID", message: "createdFrom must be before createdTo" });
  }
  if (createdAt.gte || createdAt.lt) filters.push({ createdAt });
  return { AND: filters };
}

function presentManagementOrder(record: ManagementOrderRecord, eventId: string): ManagementOrderRow {
  const tickets = record.tickets.filter((ticket) => ticket.ticketType.eventId === eventId);
  const allocations = record.seatAllocations.filter((allocation) => allocation.seat.venueLayout.eventId === eventId);
  const booking = record.booking?.table.venueLayout.eventId === eventId ? record.booking : null;
  const allocatedTable = allocations.find((allocation) => allocation.seat.table)?.seat.table ?? null;
  const resourceTable = booking?.table ?? allocatedTable;
  const guestContact = jsonObject(record.guestContact);
  const registered = Boolean(record.buyerUserId);
  const anonymous = !registered && (Boolean(record.anonymousSession) || Object.keys(guestContact).length > 0);
  const buyerKind: ManagementOrderRow["buyer"]["kind"] = registered ? "registered" : anonymous ? "anonymous" : "unknown";
  const buyerName = record.buyer?.name ?? stringValue(guestContact.name);
  const buyerContact = record.buyer?.phone
    ?? record.buyer?.email
    ?? (guestContact.channel === "telegram" ? "Telegram" : stringValue(guestContact.contact));
  const checkedInTickets = tickets.filter((ticket) => ticket.status === "used" || Boolean(ticket.usedAt)).length;
  const totalTickets = tickets.length;
  const attendance: ManagementOrderRow["attendance"] = {
    state: totalTickets === 0
      ? record.groupPass?.status === "used" ? "unknown" : "none"
      : checkedInTickets === 0 ? "none" : checkedInTickets === totalTickets ? "all_checked_in" : "partial",
    checkedInTickets,
    totalTickets,
    groupPassStatus: record.groupPass?.status ?? null,
  };
  const labels = uniqueStrings([
    ...tickets.map((ticket) => ticket.seatLabelSnapshot ?? ticket.ticketType.name),
    ...allocations.map((allocation) => allocation.seat.label),
    ...(resourceTable ? [tableLabel(resourceTable)] : []),
  ]);
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    type: record.type,
    buyer: { kind: buyerKind, name: buyerName, contact: buyerContact },
    payment: {
      status: record.paymentStatus,
      amount: record.amount,
      currency: record.currency.trim(),
      depositAmount: record.deposit?.amount ?? null,
      depositStatus: record.deposit?.status ?? null,
    },
    resources: {
      ticketCount: tickets.length,
      allocatedSeatCount: allocations.length,
      wholeTableCount: booking?.table.saleMode === "whole_table" ? 1 : 0,
      labels,
    },
    attendance,
    booking: {
      status: booking?.status ?? null,
      tableId: resourceTable?.id ?? null,
      tableLabel: resourceTable ? tableLabel(resourceTable) : null,
      sectorId: null,
      sectorLabel: null,
    },
  };
}

function matchesManagementOrder(row: ManagementOrderRow, query: ManagementOrdersQuery, ignorePayment: boolean): boolean {
  if (!ignorePayment && query.payment && query.payment !== "all" && row.payment.status !== query.payment) return false;
  if (query.booking && query.booking !== "all") {
    if (query.booking === "none" ? row.booking.status !== null : row.booking.status !== query.booking) return false;
  }
  if (query.attendance && query.attendance !== "all") {
    if (query.attendance === "group_pass_used" ? row.attendance.groupPassStatus !== "used" : row.attendance.state !== query.attendance) return false;
  }
  if (query.tableId && row.booking.tableId !== query.tableId) return false;
  const createdAt = new Date(row.createdAt);
  if (query.createdFrom && createdAt < parseOrderInstant(query.createdFrom, "createdFrom")) return false;
  if (query.createdTo && createdAt >= parseOrderInstant(query.createdTo, "createdTo")) return false;
  const search = query.search?.trim().toLocaleLowerCase("ru-RU");
  if (search) {
    const haystack = [row.id, row.buyer.name, row.buyer.contact, row.booking.tableLabel, ...row.resources.labels]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLocaleLowerCase("ru-RU");
    if (!haystack.includes(search)) return false;
  }
  return true;
}

function parseOrderInstant(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new BadRequestException({ code: "ORDER_DATE_INVALID", message: `${field} must be a valid ISO instant` });
  return parsed;
}

function tableLabel(table: { number: number; name: string | null }): string {
  return table.name?.trim() || `Стол ${table.number}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stringValue(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function notificationHistoryStatus(status: string): string {
  if (status === "sent") return "Telegram принял сообщение";
  if (status === "failed") return "Telegram отклонил отправку";
  if (status === "uncertain") return "результат доставки неизвестен";
  return "ожидает отправки";
}

function historyDescription(action: string): string {
  const labels: Record<string, string> = {
    "order.claimed": "Покупка привязана к аккаунту",
    "payment.attempt_created": "Создана попытка оплаты",
    "payment.succeeded": "Оплата подтверждена",
    "payment.failed": "Оплата не прошла",
    "payment.review_required": "Платёж отправлен на проверку",
    "checkout.paid": "Заказ оплачен",
    "checkout.expired": "Резерв заказа истёк",
    "ticket.cancelled": "Билет отменён",
    "booking.cancelled": "Бронирование отменено",
    "booking.booking_cancelled": "Бронирование отменено",
    "refund.requested": "Запрошен возврат",
    "refund.operation_requested": "Создан запрос на возврат",
    "refund.succeeded": "Возврат подтверждён",
    "checkout.hold_released": "Бронь снята",
  };
  return labels[action] ?? action;
}

function csvDocument(rows: Array<Array<string | number | null>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function statusesForGroup(group: OrganizerEventStatusGroup): Event["status"][] | null {
  if (group === "on_sale") return ["published"];
  if (group === "draft") return ["draft"];
  if (group === "archive") return ["completed", "cancelled"];
  return null;
}

function eventOrder(sort: OrganizerEventSort): Prisma.EventOrderByWithRelationInput[] {
  if (sort === "date_asc") return [{ date: "asc" }, { time: "asc" }, { id: "asc" }];
  if (sort === "date_desc") return [{ date: "desc" }, { time: "desc" }, { id: "desc" }];
  return [{ updatedAt: "desc" }, { id: "desc" }];
}

function eventMetrics(event: EventWithMetrics, revenue?: Money): OrganizerEventMetrics {
  const layout = event.venueLayout;
  const wholeTables = layout?.tables.filter(({ saleMode }) => saleMode === "whole_table") ?? [];
  if (wholeTables.length > 0) {
    const soldTables = wholeTables.filter(({ bookings }) => bookings.length > 0);
    return {
      mode: "whole_table",
      sold: soldTables.length,
      capacity: wholeTables.length,
      remaining: wholeTables.length - soldTables.length,
      settledRevenue: revenue?.amount ?? 0,
      currency: revenue?.currency ?? singleCurrency(wholeTables.map(({ currency }) => currency.trim())),
      includedSeats: soldTables.reduce((sum, table) => sum + table.seats, 0),
    };
  }

  if (layout?.seats.length) {
    const capacity = layout.seats.filter(({ status }) => status === "available").length;
    const sold = layout.seats.filter(({ status, allocations }) => status === "available" && allocations.length > 0).length;
    return {
      mode: "per_seat",
      sold,
      capacity,
      remaining: Math.max(0, capacity - sold),
      settledRevenue: revenue?.amount ?? 0,
      currency: revenue?.currency ?? singleCurrency(event.ticketTypes.map(({ currency }) => currency.trim())),
      includedSeats: null,
    };
  }

  const capacity = event.ticketTypes.reduce((sum, type) => sum + type.quantityTotal, 0);
  const sold = event.ticketTypes.reduce((sum, type) => sum + type.quantitySold, 0);
  return {
    mode: "ordinary",
    sold,
    capacity,
    remaining: Math.max(0, capacity - sold),
    settledRevenue: revenue?.amount ?? 0,
    currency: revenue?.currency ?? singleCurrency(event.ticketTypes.map(({ currency }) => currency.trim())),
    includedSeats: null,
  };
}

function singleCurrency(currencies: string[]): string | null {
  const unique = [...new Set(currencies.filter(Boolean))];
  return unique.length === 1 ? unique[0]! : null;
}

function combineMoney(values: Money[]): Money {
  const currencies = [...new Set(values.map(({ currency }) => currency).filter((value): value is string => Boolean(value)))];
  if (currencies.length !== 1) return { amount: 0, currency: null };
  return { amount: values.reduce((sum, value) => sum + value.amount, 0), currency: currencies[0]! };
}

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function assertPublishable(event: Event): void {
  const missingFields: string[] = [];
  if (!event.title.trim()) missingFields.push("title");
  if (!event.category) missingFields.push("category");
  if (!event.city.trim()) missingFields.push("city");
  if (!event.venueName.trim()) missingFields.push("venueName");
  if (!event.address.trim()) missingFields.push("address");
  if (!event.description?.trim()) missingFields.push("description");
  if (!event.cancellationTerms?.trim()) missingFields.push("cancellationTerms");
  if (missingFields.length > 0) {
    throw new BadRequestException({
      code: "EVENT_PUBLISH_VALIDATION_FAILED",
      message: "Event is missing fields required for publication",
      details: { missingFields },
    });
  }
}

function invalidTransition(current?: string, target?: string): ConflictException {
  return new ConflictException({
    code: "EVENT_INVALID_TRANSITION",
    message: "Event lifecycle transition is not allowed",
    details: current && target ? { current, target } : undefined,
  });
}

function managedPosterKey(url: string | null): string | null {
  const prefix = "/media/posters/";
  return url?.startsWith(prefix) ? url.slice(prefix.length) : null;
}
