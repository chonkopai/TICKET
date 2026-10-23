import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type PrismaClient } from "@event-platform/database";
import {
  commissionSchema,
  moderateEventSchema,
  payoutSchema,
  reasonSchema,
} from "@event-platform/shared-types";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import {
  type StaffPrincipal,
  parse,
  pageOf,
  staffAudit,
  digest,
} from "./staff.config.js";
import { validId } from "./platform-support.service.js";
import { TicketEmailDeliveryService } from "../orders/ticket-email-delivery.service.js";
import { financeFacts, dateFilter } from "./staff-finance.js";
import { EventNotificationsService } from "../events/event-notifications.service.js";
import { BookingService } from "../booking/booking.service.js";
const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  blockedAt: true,
  blockedReason: true,
  organizerVerifiedAt: true,
  commissionBps: true,
  createdAt: true,
} satisfies Prisma.UserSelect;
const eventSelect = {
  id: true,
  title: true,
  organizerId: true,
  date: true,
  time: true,
  timezone: true,
  status: true,
  moderationStatus: true,
  moderationReason: true,
  category: true,
  city: true,
  createdAt: true,
  organizer: {
    select: {
      id: true,
      name: true,
      organizerVerifiedAt: true,
      blockedAt: true,
    },
  },
} satisfies Prisma.EventSelect;
const orderSelect = {
  id: true,
  type: true,
  buyerUserId: true,
  amount: true,
  currency: true,
  paymentStatus: true,
  createdAt: true,
  commissionAmount: true,
  commissionBps: true,
  emailDeliveryAddress: true,
  checkoutSnapshot: true,
  buyer: { select: userSelect },
  anonymousSession: {
    select: { id: true, name: true, verifiedEmail: true, deliveredAt: true },
  },
  ticketEmailDelivery: {
    select: {
      status: true,
      acceptedAt: true,
      attempts: true,
      lastErrorCode: true,
    },
  },
  tickets: {
    select: {
      id: true,
      status: true,
      usedAt: true,
      refundedAt: true,
      seatLabelSnapshot: true,
      ticketTypeId: true,
      ticketType: {
        select: {
          name: true,
          eventId: true,
          event: { select: { title: true, organizerId: true } },
        },
      },
    },
  },
  payments: {
    select: {
      id: true,
      provider: true,
      providerPaymentId: true,
      amount: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  },
  refundRequest: {
    select: {
      id: true,
      status: true,
      amount: true,
      completedAt: true,
      lastError: true,
    },
  },
} satisfies Prisma.OrderSelect;
export function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
@Injectable()
export class StaffManagementService {
  constructor(
    @Inject(DATABASE_CLIENT) readonly db: PrismaClient,
    @Inject(TicketEmailDeliveryService)
    private delivery: TicketEmailDeliveryService,
    @Inject(BookingService) private booking: BookingService,
    @Inject(EventNotificationsService)
    private telegram: EventNotificationsService,
  ) {}
  async users(query: Record<string, string | undefined>) {
    const { page, limit, skip } = pageOf(query),
      q = query.search?.trim().slice(0, 160);
    const where: Prisma.UserWhereInput = {
      ...(query.tab === "organizers"
        ? { role: { in: ["organizer", "admin"] } }
        : { role: "guest" }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              {
                contactIdentities: {
                  some: {
                    normalizedIdentifier: { contains: q, mode: "insensitive" },
                  },
                },
              },
              ...(/^[0-9a-f-]{36}$/i.test(q) ? [{ id: q }] : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: userSelect,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.db.user.count({ where }),
    ]);
    return {
      items: rows,
      total,
      page,
      limit,
      hasNext: skip + rows.length < total,
    };
  }
  async user(id: string, actor: StaffPrincipal) {
    validId(id);
    const row = await this.db.user.findUnique({
      where: { id },
      select: {
        ...userSelect,
        organizerProfile: true,
        contactIdentities: {
          select: {
            method: true,
            normalizedIdentifier: true,
            verifiedAt: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException();
    const [orders, cases, eventsCreated, ticketsSold, history] =
      await Promise.all([
        this.db.order.findMany({
          where: { buyerUserId: id },
          select: orderSelect,
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        this.db.platformCase.findMany({
          where: { ownerId: id },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
        this.db.event.count({ where: { organizerId: id } }),
        this.db.ticket.count({
          where: {
            ticketType: { event: { organizerId: id } },
            status: { in: ["active", "paid", "used"] },
          },
        }),
        actor.role === "moderator"
          ? this.db.staffAudit.findMany({
              where: { targetId: id },
              orderBy: { createdAt: "desc" },
              take: 50,
            })
          : Promise.resolve([]),
      ]);
    return { ...row, orders, cases, eventsCreated, ticketsSold, history };
  }
  async block(
    id: string,
    actor: StaffPrincipal,
    blocked: boolean,
    body: unknown,
  ) {
    validId(id);
    const { reason } = parse(reasonSchema, body);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id } });
      const row = await tx.user.update({
        where: { id },
        data: {
          blockedAt: blocked ? new Date() : null,
          blockedReason: blocked ? reason : null,
          credentialVersion: { increment: 1 },
        },
        select: userSelect,
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await staffAudit(
        tx,
        actor,
        blocked ? "user.blocked" : "user.unblocked",
        "user",
        id,
        reason,
        { blocked: !!current.blockedAt },
        { blocked },
      );
      return row;
    });
  }
  async warning(id: string, actor: StaffPrincipal, body: unknown) {
    validId(id);
    const { reason } = parse(reasonSchema, body);
    await this.db.user.findUniqueOrThrow({ where: { id } });
    await this.db.$transaction((tx) =>
      staffAudit(tx, actor, "organizer.warning", "user", id, reason),
    );
    return { recorded: true };
  }
  async events(query: Record<string, string | undefined>) {
    const { page, limit, skip } = pageOf(query);
    const where: Prisma.EventWhereInput = {
      ...(query.search
        ? {
            title: {
              contains: query.search.slice(0, 160),
              mode: "insensitive",
            },
          }
        : {}),
      ...(query.organizerId ? { organizerId: validId(query.organizerId) } : {}),
      ...(query.status ? { moderationStatus: query.status } : {}),
      ...(query.from || query.to
        ? { date: dateFilter(query.from, query.to) }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.event.findMany({
        where,
        select: { ...eventSelect, _count: { select: { ticketTypes: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.db.event.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        ticketsSold: await this.db.ticket.count({
          where: {
            ticketType: { eventId: row.id },
            status: { in: ["paid", "active", "used"] },
          },
        }),
      })),
    );
    return { items, total, page, limit, hasNext: skip + rows.length < total };
  }
  async event(id: string) {
    validId(id);
    const event = await this.db.event.findUniqueOrThrow({
      where: { id },
      select: {
        ...eventSelect,
        description: true,
        address: true,
        cancellationTerms: true,
      },
    });
    const [affected, outcomes, refundWork, notifications] = await Promise.all([
      this.db.order.count({
        where: {
          tickets: { some: { ticketType: { eventId: id } } },
          paymentStatus: "paid",
        },
      }),
      this.db.notification.groupBy({
        by: ["channel", "status"],
        where: { eventId: id, type: "event.cancellation" },
        _count: { _all: true },
      }),
      this.db.staffRefund.groupBy({
        by: ["status"],
        where: {
          orderId: {
            in: (
              await this.db.order.findMany({
                where: { tickets: { some: { ticketType: { eventId: id } } } },
                select: { id: true },
              })
            ).map((v) => v.id),
          },
        },
        _count: { _all: true },
      }),
      this.db.outboxEvent.findFirst({
        where: { aggregateId: id, eventType: "event.cancelled" },
        select: { processedAt: true, lastError: true, attempts: true },
      }),
    ]);
    return {
      ...event,
      affectedPaidOrders: affected,
      notificationOutcomes: outcomes.map((row) => ({
        channel: row.channel,
        status: row.status,
        count: row._count._all,
      })),
      refundWork: refundWork.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      notificationRequest: notifications,
    };
  }
  async moderate(id: string, actor: StaffPrincipal, body: unknown) {
    validId(id);
    const input = parse(moderateEventSchema, body);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.event.findUniqueOrThrow({
        where: { id },
        include: { organizer: { select: { blockedAt: true } } },
      });
      if (
        current.organizer.blockedAt &&
        ["approve", "unhide", "resume"].includes(input.action)
      )
        throw new ConflictException({ code: "ORGANIZER_BLOCKED" });
      if (
        ["approve", "reject"].includes(input.action) &&
        current.moderationStatus !== "pending"
      )
        throw new ConflictException({ code: "EVENT_NOT_SUBMITTED_FOR_REVIEW" });
      if (
        (input.action === "unhide" && current.moderationStatus !== "hidden") ||
        (input.action === "resume" &&
          current.moderationStatus !== "sales_paused")
      )
        throw new ConflictException({ code: "EVENT_MODERATION_STATE_CHANGED" });
      const mapping = {
        approve: "approved",
        reject: "rejected",
        hide: "hidden",
        unhide: "clear",
        pause: "sales_paused",
        resume: "clear",
        cancel: "cancelled",
      };
      if (current.status === "cancelled" && input.action !== "cancel")
        throw new ConflictException({ code: "CANCELLED_EVENT_IMMUTABLE" });
      const row = await tx.event.update({
        where: { id },
        data: {
          moderationStatus: mapping[input.action],
          moderationReason: input.reason,
          ...(input.action === "cancel" ? { status: "cancelled" } : {}),
        },
        select: eventSelect,
      });
      if (input.action === "cancel" && input.notify) {
        const existing = await tx.outboxEvent.findFirst({
          where: { aggregateId: id, eventType: "event.cancelled" },
        });
        if (!existing)
          await tx.outboxEvent.create({
            data: {
              eventType: "event.cancelled",
              aggregateType: "event",
              aggregateId: id,
              payload: { eventId: id, reason: input.reason, staff: true },
            },
          });
      }
      await staffAudit(
        tx,
        actor,
        `event.${input.action}`,
        "event",
        id,
        input.reason,
        { status: current.status, moderationStatus: current.moderationStatus },
        {
          status: row.status,
          moderationStatus: row.moderationStatus,
          notify: input.notify,
        },
      );
      return row;
    });
  }
  async orders(query: Record<string, string | undefined>) {
    const { page, limit, skip } = pageOf(query),
      q = query.search?.trim().slice(0, 160);
    const compact = q?.replace(/^TKT-/i, "").replaceAll("-", "");
    const uuid =
      compact && /^[a-f0-9]{32}$/i.test(compact)
        ? `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
        : null;
    const shortIds =
      q && /^#?[a-f0-9]{8}$/i.test(q)
        ? await this.db.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM "Order" WHERE right(id::text,8)=lower(${q.replace(/^#/, "")}) LIMIT 100`
        : [];
    const where: Prisma.OrderWhereInput = {
      ...(query.organizerId
        ? {
            tickets: {
              some: {
                ticketType: {
                  event: { organizerId: validId(query.organizerId) },
                },
              },
            },
          }
        : {}),
      ...(query.eventId
        ? {
            tickets: {
              some: { ticketType: { eventId: validId(query.eventId) } },
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              ...(shortIds.length
                ? [{ id: { in: shortIds.map((row) => row.id) } }]
                : []),
              ...(uuid
                ? [{ id: uuid }, { tickets: { some: { id: uuid } } }]
                : []),
              { buyer: { name: { contains: q, mode: "insensitive" } } },
              { buyer: { email: { contains: q, mode: "insensitive" } } },
              { buyer: { phone: { contains: q } } },
              {
                anonymousSession: {
                  name: { contains: q, mode: "insensitive" },
                },
              },
              {
                anonymousSession: {
                  verifiedEmail: { contains: q, mode: "insensitive" },
                },
              },
              {
                tickets: {
                  some: {
                    ticketType: {
                      event: { title: { contains: q, mode: "insensitive" } },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.order.findMany({
        where,
        select: orderSelect,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.db.order.count({ where }),
    ]);
    return {
      items: items.map((row) => ({
        ...row,
        emailDeliveryAddress: undefined,
        buyer: row.buyer ? { id: row.buyer.id, name: row.buyer.name } : null,
        anonymousSession: row.anonymousSession
          ? { id: row.anonymousSession.id, name: row.anonymousSession.name }
          : null,
        checkoutSnapshot: undefined,
      })),
      total,
      page,
      limit,
      hasNext: skip + items.length < total,
    };
  }
  async order(id: string) {
    validId(id);
    const row = await this.db.order.findUniqueOrThrow({
      where: { id },
      select: orderSelect,
    });
    const [refunds, operations, telegramDelivery] = await Promise.all([
      this.db.staffRefund.findMany({
        where: { orderId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.db.staffOperation.findMany({
        where: { resourceId: id },
        select: { id: true, kind: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      this.db.notification.findMany({
        where: {
          type: "ticket.resend",
          payload: { path: ["orderId"], equals: id },
        },
        select: {
          status: true,
          sentAt: true,
          lastError: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    return { ...row, refunds, operations, telegramDelivery };
  }
  async resend(
    actor: StaffPrincipal,
    id: string,
    key: string,
    reason: string,
    channel: "auto" | "email" | "telegram" = "auto",
  ) {
    validId(id);
    validId(key);
    if (reason.trim().length < 3 || reason.length > 500)
      throw new BadRequestException();
    const requestHash = digest(`${id}:${reason}:${channel}`);
    const operation = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`staff-resend:${id}`},0))`;
      const prior = await tx.staffOperation.findUnique({
        where: { kind_key: { kind: "resend", key } },
      });
      if (prior) {
        if (
          prior.staffId !== actor.id ||
          prior.resourceId !== id ||
          prior.requestHash !== requestHash
        )
          throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED" });
        return prior;
      }
      const recent = await tx.staffOperation.findFirst({
        where: {
          resourceId: id,
          kind: "resend",
          createdAt: { gt: new Date(Date.now() - 600000) },
        },
      });
      if (recent) throw new ConflictException({ code: "TICKET_RESEND_LIMIT" });
      const row = await tx.staffOperation.create({
        data: {
          staffId: actor.id,
          key,
          kind: "resend",
          resourceId: id,
          requestHash,
        },
      });
      await staffAudit(
        tx,
        actor,
        "ticket.resend_requested",
        "order",
        id,
        reason,
      );
      return row;
    });
    if (operation.status !== "pending") return { status: operation.status };
    const claim = await this.db.staffOperation.updateMany({
      where: { id: operation.id, status: "pending" },
      data: { status: "dispatching" },
    });
    if (!claim.count) return { status: "dispatching" };
    try {
      const order = await this.db.order.findUniqueOrThrow({
        where: { id },
        select: {
          emailDeliveryAddress: true,
          tickets: {
            where: { status: "active" },
            select: {
              id: true,
              ticketType: {
                select: { event: { select: { id: true, organizerId: true } } },
              },
            },
          },
        },
      });
      const selectedChannel =
        channel === "auto"
          ? order.emailDeliveryAddress && this.delivery.available()
            ? "email"
            : "telegram"
          : channel;
      const broadcastIds: string[] = [];
      if (selectedChannel === "email") await this.delivery.resend(id);
      else {
        if (!order.tickets.length)
          throw new ConflictException({ code: "TICKET_NOT_ACTIVE" });
        for (const ticket of order.tickets) {
          const hash = digest(`staff-ticket:${key}:${ticket.id}`),
            requestKey = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
            event = ticket.ticketType.event;
          const result = await this.telegram.resendTicket(
            event.organizerId,
            event.id,
            id,
            ticket.id,
            requestKey,
            actor,
          );
          broadcastIds.push(result.id);
        }
      }
      await this.db.$transaction(async (tx) => {
        await tx.staffOperation.update({
          where: { id: operation.id },
          data: {
            status: "queued",
            response: { channel: selectedChannel, broadcastIds },
          },
        });
        await staffAudit(
          tx,
          actor,
          "ticket.resend_queued",
          "order",
          id,
          reason,
          undefined,
          { operationId: operation.id, channel: selectedChannel, broadcastIds },
        );
      });
      return { status: "queued", channel: selectedChannel };
    } catch (error) {
      await this.db.$transaction(async (tx) => {
        await tx.staffOperation.update({
          where: { id: operation.id },
          data: { status: "failed" },
        });
        await staffAudit(
          tx,
          actor,
          "ticket.resend_failed",
          "order",
          id,
          reason,
          undefined,
          { operationId: operation.id },
        );
      });
      throw error;
    }
  }
  async cancelUnpaid(
    actor: StaffPrincipal,
    id: string,
    key: string,
    reason: string,
  ) {
    validId(id);
    validId(key);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order:${id}`},0))`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        include: {
          tickets: {
            include: { ticketType: { select: { isInternal: true } } },
          },
          booking: true,
        },
      });
      if (order.paymentStatus === "paid" && order.amount > 0)
        throw new ConflictException({ code: "PAID_ORDER_REQUIRES_REFUND" });
      const old = await tx.staffOperation.findUnique({
        where: { kind_key: { kind: "cancel", key } },
      });
      if (old) {
        if (
          old.resourceId !== id ||
          old.staffId !== actor.id ||
          old.requestHash !== digest(reason)
        )
          throw new ConflictException();
        return { cancelled: true };
      }
      if (order.tickets.some((t) => t.status === "used"))
        throw new ConflictException({ code: "USED_TICKET" });
      if (order.paymentStatus === "pending")
        await this.booking.failOrderInTransaction(tx, id, "released");
      else if (order.amount === 0 && order.paymentStatus === "paid") {
        for (const typeId of [
          ...new Set(
            order.tickets
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
                decrement: order.tickets.filter(
                  (t) =>
                    t.ticketTypeId === typeId &&
                    ["active", "paid"].includes(t.status),
                ).length,
              },
            },
          });
        }
        await tx.ticket.updateMany({
          where: { orderId: id, status: { in: ["active", "paid"] } },
          data: { status: "cancelled", cancelledAt: new Date() },
        });
        await tx.seatAllocation.updateMany({
          where: { orderId: id, status: { in: ["active", "consumed"] } },
          data: { status: "released", releasedAt: new Date() },
        });
        await tx.groupPass.updateMany({
          where: { orderId: id, status: "active" },
          data: { status: "cancelled" },
        });
        if (order.booking) {
          await tx.booking.update({
            where: { id: order.booking.id },
            data: { status: "cancelled" },
          });
          await tx.table.updateMany({
            where: { id: order.booking.tableId, status: "booked" },
            data: { status: "available" },
          });
        }
        await tx.order.update({
          where: { id },
          data: { paymentStatus: "cancelled" },
        });
      } else if (order.paymentStatus !== "cancelled")
        throw new ConflictException({ code: "ORDER_NOT_CANCELLABLE" });
      await tx.staffOperation.create({
        data: {
          staffId: actor.id,
          key,
          kind: "cancel",
          resourceId: id,
          requestHash: digest(reason),
          status: "completed",
        },
      });
      await staffAudit(tx, actor, "order.cancelled", "order", id, reason);
      return { cancelled: true };
    });
  }
  async audit(query: Record<string, string | undefined>) {
    const { page, limit, skip } = pageOf(query);
    const where: Prisma.StaffAuditWhereInput = {
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search.slice(0, 100) } },
              { targetId: { contains: query.search.slice(0, 100) } },
            ],
          }
        : {}),
      ...(query.staffId ? { staffId: validId(query.staffId) } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.staffAudit.findMany({
        where,
        include: { staff: { select: { name: true, email: true } } },
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      this.db.staffAudit.count({ where }),
    ]);
    return { items, total, page, limit, hasNext: skip + items.length < total };
  }
  async issues() {
    const [missingTickets, failedDelivery, stuckRefunds, mismatches] =
      await Promise.all([
        this.db.order.findMany({
          where: { paymentStatus: "paid", tickets: { none: {} } },
          select: { id: true, amount: true, currency: true },
          take: 20,
        }),
        this.db.ticketEmailDelivery.findMany({
          where: { status: { in: ["failed", "uncertain"] } },
          select: { orderId: true, status: true, lastErrorCode: true },
          take: 20,
        }),
        this.db.staffRefund.findMany({
          where: {
            status: "processing",
            createdAt: { lt: new Date(Date.now() - 300000) },
          },
          select: { id: true, orderId: true, status: true, lastError: true },
          take: 20,
        }),
        this.db.outboxEvent.findMany({
          where: { eventType: "payment.review_required" },
          select: { aggregateId: true, occurredAt: true },
          orderBy: { occurredAt: "desc" },
          take: 20,
        }),
      ]);
    return { missingTickets, failedDelivery, stuckRefunds, mismatches };
  }
  async commission(actor: StaffPrincipal, body: unknown) {
    const input = parse(commissionSchema, body);
    return this.db.$transaction(async (tx) => {
      const key = input.organizerId ?? "commission.default";
      let previous: number | null;
      if (input.organizerId) {
        const current = await tx.user.findUniqueOrThrow({
          where: { id: input.organizerId },
        });
        if (!["organizer", "admin"].includes(current.role))
          throw new ConflictException({ code: "ORGANIZER_REQUIRED" });
        previous = current.commissionBps;
        await tx.user.update({
          where: { id: input.organizerId },
          data: { commissionBps: input.basisPoints },
        });
      } else {
        previous =
          (await tx.platformSetting.findUnique({ where: { key } }))?.value ??
          null;
        await tx.platformSetting.upsert({
          where: { key },
          create: { key, value: input.basisPoints },
          update: { value: input.basisPoints },
        });
      }
      await staffAudit(
        tx,
        actor,
        "commission.changed",
        input.organizerId ? "user" : "setting",
        key,
        input.reason,
        { basisPoints: previous },
        { basisPoints: input.basisPoints },
      );
      return { basisPoints: input.basisPoints };
    });
  }
  async finance(query: Record<string, string | undefined>) {
    if (query.organizerId) validId(query.organizerId);
    if (query.eventId) validId(query.eventId);
    const result = await financeFacts(this.db, query);
    const lifetime =
      query.from || query.to || query.eventId
        ? await financeFacts(this.db, {
            testOnly: String(result.testOnly),
            ...(query.organizerId ? { organizerId: query.organizerId } : {}),
            ...(query.eventId && !query.organizerId
              ? {
                  organizerId: (
                    await this.db.event.findUniqueOrThrow({
                      where: { id: query.eventId },
                      select: { organizerId: true },
                    })
                  ).organizerId,
                }
              : {}),
          })
        : result;
    const payouts = await this.db.organizerPayout.findMany({
      where: {
        testOnly: result.testOnly,
        ...(query.organizerId ? { organizerId: query.organizerId } : {}),
      },
      orderBy: { paidAt: "desc" },
      take: 100,
    });
    return {
      ...result,
      balances: lifetime.groups,
      groups: result.groups.map((group) => ({
        ...group,
        ...(query.from || query.to || query.eventId
          ? { outstanding: null }
          : {}),
        ...(query.eventId ? { payouts: null } : {}),
      })),
      payouts,
      defaultCommissionBps:
        (
          await this.db.platformSetting.findUnique({
            where: { key: "commission.default" },
          })
        )?.value ?? null,
      providerFeesAvailable: false,
      disputesAvailable: false,
    };
  }
  async payout(actor: StaffPrincipal, body: unknown) {
    const input = parse(payoutSchema, body);
    if (new Date(input.paidAt) > new Date())
      throw new BadRequestException({ code: "PAYOUT_DATE_FUTURE" });
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`payout:${input.organizerId}:${input.currency}`},0))`;
      const existing = await tx.organizerPayout.findUnique({
        where: { requestKey: input.key },
      });
      if (existing) {
        if (
          existing.organizerId !== input.organizerId ||
          existing.amount !== input.amount ||
          existing.currency !== input.currency ||
          existing.reference !== input.reference ||
          existing.testOnly !== input.testOnly ||
          existing.paidAt.toISOString() !== input.paidAt
        )
          throw new ConflictException({ code: "PAYOUT_KEY_REUSED" });
        return existing;
      }
      const user = await tx.user.findUniqueOrThrow({
        where: { id: input.organizerId },
      });
      if (!["organizer", "admin"].includes(user.role))
        throw new ConflictException({ code: "PAYOUT_ORGANIZER_UNAVAILABLE" });
      const { key, ...data } = input;
      const row = await tx.organizerPayout.create({
        data: {
          ...data,
          paidAt: new Date(data.paidAt),
          staffId: actor.id,
          requestKey: key,
        },
      });
      await staffAudit(
        tx,
        actor,
        "payout.recorded",
        "payout",
        row.id,
        "External payout recorded",
        undefined,
        {
          organizerId: row.organizerId,
          amount: row.amount,
          currency: row.currency,
          reference: row.reference,
          testOnly: row.testOnly,
        },
      );
      return row;
    });
  }
  async reversePayout(actor: StaffPrincipal, id: string, body: unknown) {
    validId(id);
    const { reason } = parse(reasonSchema, body);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OrganizerPayout" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.organizerPayout.findUniqueOrThrow({ where: { id } });
      if (row.reversedAt) return row;
      const updated = await tx.organizerPayout.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: reason },
      });
      await staffAudit(tx, actor, "payout.reversed", "payout", id, reason);
      return updated;
    });
  }
}
