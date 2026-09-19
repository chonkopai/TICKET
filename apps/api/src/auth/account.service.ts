import type { Prisma, PrismaClient } from "@event-platform/database";
import type {
  AccountDashboard,
  AccountOrder,
  AccountOrderList,
  NotificationPreferences,
  OrganizerProfile,
} from "@event-platform/shared-types";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_CLIENT } from "./auth.constants.js";
import type { AccountOrderQueryDto, UpdateNotificationPreferencesDto, UpdateOrganizerProfileDto } from "./account.dto.js";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  transactionalTicketDelivery: true,
  eventReminders: true,
  marketingAnnouncements: false,
};

@Injectable()
export class AccountService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: PrismaClient) {}

  async dashboard(userId: string): Promise<AccountDashboard> {
    const [activeTickets, activeGroupPasses, usedTickets] = await this.database.$transaction([
      this.database.ticket.count({
        where: {
          OR: [{ ownerUserId: userId }, { order: { buyerUserId: userId } }],
          status: { in: ["paid", "active"] },
          ticketType: { isInternal: false },
        },
      }),
      this.database.groupPass.count({ where: { order: { buyerUserId: userId, paymentStatus: "paid" }, status: "active" } }),
      this.database.ticket.findMany({
        where: { OR: [{ ownerUserId: userId }, { order: { buyerUserId: userId } }], status: "used" },
        select: { ticketType: { select: { eventId: true } } },
      }),
    ]);
    return {
      activeAdmissions: activeTickets + activeGroupPasses,
      attendedEvents: new Set(usedTickets.map(({ ticketType }) => ticketType.eventId)).size,
    };
  }

  async preferences(userId: string): Promise<NotificationPreferences> {
    const row = await this.database.userNotificationPreference.findUnique({ where: { userId } });
    return row ? presentPreferences(row) : DEFAULT_PREFERENCES;
  }

  async updatePreferences(userId: string, input: UpdateNotificationPreferencesDto): Promise<NotificationPreferences> {
    return this.database.$transaction(async (transaction) => {
      const row = await transaction.userNotificationPreference.upsert({
        where: { userId },
        create: { userId, ...DEFAULT_PREFERENCES, ...input },
        update: input,
      });
      await recordAccountMutation(transaction, userId, "notification_preferences.updated", Object.keys(input));
      return presentPreferences(row);
    });
  }

  async organizerProfile(userId: string, fallbackName: string | null): Promise<OrganizerProfile> {
    const row = await this.database.organizerProfile.findUnique({ where: { userId } });
    return { organizationName: row?.organizationName ?? fallbackName ?? "Организатор" };
  }

  async updateOrganizerProfile(userId: string, input: UpdateOrganizerProfileDto): Promise<OrganizerProfile> {
    const organizationName = input.organizationName.trim();
    return this.database.$transaction(async (transaction) => {
      const row = await transaction.organizerProfile.upsert({
        where: { userId },
        create: { userId, organizationName },
        update: { organizationName },
      });
      await recordAccountMutation(transaction, userId, "organizer_profile.updated", ["organizationName"]);
      return { organizationName: row.organizationName };
    });
  }

  async orders(userId: string, query: AccountOrderQueryDto): Promise<AccountOrderList> {
    const where: Prisma.OrderWhereInput = { buyerUserId: userId, ...(query.status ? { paymentStatus: query.status } : {}) };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.database.$transaction([
      this.database.order.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: query.limit }),
      this.database.order.count({ where }),
    ]);
    return {
      items: rows.map(presentOrder),
      page: query.page,
      limit: query.limit,
      total,
      hasNext: skip + rows.length < total,
    };
  }
}

function presentPreferences(row: NotificationPreferences): NotificationPreferences {
  return {
    transactionalTicketDelivery: row.transactionalTicketDelivery,
    eventReminders: row.eventReminders,
    marketingAnnouncements: row.marketingAnnouncements,
  };
}

function presentOrder(order: { id: string; type: "ticket" | "table" | "deposit"; paymentStatus: AccountOrder["status"]; amount: number; currency: string; createdAt: Date; checkoutSnapshot: Prisma.JsonValue }): AccountOrder {
  const snapshot = object(order.checkoutSnapshot);
  const quantity = typeof snapshot.quantity === "number" ? snapshot.quantity : null;
  const name = typeof snapshot.itemName === "string" ? snapshot.itemName : order.type === "table" ? "Стол" : "Билет";
  return {
    id: order.id,
    type: order.type,
    status: order.paymentStatus,
    amount: order.amount,
    currency: order.currency.trim(),
    createdAt: order.createdAt.toISOString(),
    eventId: typeof snapshot.eventId === "string" ? snapshot.eventId : null,
    eventTitle: typeof snapshot.eventTitle === "string" ? snapshot.eventTitle : "Событие",
    itemSummary: quantity && quantity > 1 ? `${name} × ${quantity}` : name,
    receiptUrl: null,
  };
}

function object(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

async function recordAccountMutation(transaction: Prisma.TransactionClient, userId: string, action: string, changedFields: string[]): Promise<void> {
  const user = await transaction.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User was not found" });
  await transaction.auditLog.create({ data: { actorId: userId, action, entityType: "user", entityId: userId, meta: { changedFields } } });
  await transaction.outboxEvent.create({ data: { eventType: action, aggregateType: "user", aggregateId: userId, payload: { changedFields } } });
}
