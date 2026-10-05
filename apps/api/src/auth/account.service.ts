import { readCheckoutSnapshot } from "@event-platform/shared-types";
import type { Prisma, PrismaClient } from "@event-platform/database";
import type {
  AccountDashboard,
  AccountNotificationList,
  AccountOrder,
  AccountOrderList,
  NotificationPreferences,
  OrganizerProfile,
} from "@event-platform/shared-types";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_CLIENT } from "./auth.constants.js";
import type { AccountNotificationQueryDto, AccountOrderQueryDto, UpdateNotificationPreferencesDto, UpdateOrganizerProfileDto } from "./account.dto.js";

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

  async notifications(userId: string, query: AccountNotificationQueryDto): Promise<AccountNotificationList> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: Prisma.NotificationWhereInput = { userId, channel: "in_app", status: "sent", ...(query.unreadOnly === "true" ? { readAt: null } : {}) };
    const [rows, total, unreadCount] = await this.database.$transaction([
      this.database.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit, select: { id: true, eventId: true, type: true, payload: true, createdAt: true, readAt: true, event: { select: { title: true } } } }),
      this.database.notification.count({ where }),
      this.database.notification.count({ where: { userId, channel: "in_app", status: "sent", readAt: null } }),
    ]);
    return {
      items: rows.map((row) => {
        const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as { text?: unknown } : {};
        return { id: row.id, eventId: row.eventId, eventTitle: row.event?.title ?? null, type: row.type, text: typeof payload.text === "string" ? payload.text : "Уведомление о событии", createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null };
      }),
      page, limit, total, unreadCount, hasNext: page * limit < total,
    };
  }

  async readNotification(userId: string, id: string): Promise<{ readAt: string }> {
    const row = await this.database.notification.findFirst({ where: { id, userId, channel: "in_app", status: "sent" }, select: { id: true, readAt: true } });
    if (!row) throw new NotFoundException({ code: "NOTIFICATION_NOT_FOUND" });
    if (row.readAt) return { readAt: row.readAt.toISOString() };
    const now = new Date();
    await this.database.notification.updateMany({ where: { id, userId, channel: "in_app", status: "sent", readAt: null }, data: { readAt: now } });
    const saved = await this.database.notification.findUniqueOrThrow({ where: { id }, select: { readAt: true } });
    return { readAt: saved.readAt?.toISOString() ?? now.toISOString() };
  }

  async organizerProfile(userId: string, fallbackName: string | null): Promise<OrganizerProfile> {
    const [row, user] = await Promise.all([
      this.database.organizerProfile.findUnique({ where: { userId } }),
      this.database.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true, photoUrl: true } }),
    ]);
    return { organizationName: row?.organizationName ?? fallbackName ?? "Организатор", name: user.name, email: user.email, phone: user.phone, photoUrl: user.photoUrl, address: row?.address ?? null, showContactInfo: row?.showContactInfo ?? false };
  }

  async updateOrganizerProfile(userId: string, input: UpdateOrganizerProfileDto): Promise<OrganizerProfile> {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
      const currentProfile = await transaction.organizerProfile.findUnique({ where: { userId } });
      const organizationName = input.organizationName?.trim() ?? currentProfile?.organizationName ?? current.name ?? "Организатор";
      const address = input.address === undefined ? currentProfile?.address ?? null : input.address?.trim() || null;
      const showContactInfo = input.showContactInfo ?? currentProfile?.showContactInfo ?? false;
      const row = await transaction.organizerProfile.upsert({
        where: { userId },
        create: { userId, organizationName, address, showContactInfo },
        update: { organizationName, address, showContactInfo },
      });
      const user = await transaction.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        },
        select: { name: true, email: true, phone: true, photoUrl: true },
      });
      await recordAccountMutation(transaction, userId, "organizer_profile.updated", Object.keys(input));
      return { organizationName: row.organizationName, name: user.name, email: user.email, phone: user.phone, photoUrl: user.photoUrl, address: row.address, showContactInfo: row.showContactInfo };
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
  const snapshot = readCheckoutSnapshot(order.checkoutSnapshot);
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

async function recordAccountMutation(transaction: Prisma.TransactionClient, userId: string, action: string, changedFields: string[]): Promise<void> {
  const user = await transaction.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User was not found" });
  await transaction.auditLog.create({ data: { actorId: userId, action, entityType: "user", entityId: userId, meta: { changedFields } } });
  await transaction.outboxEvent.create({ data: { eventType: action, aggregateType: "user", aggregateId: userId, payload: { changedFields } } });
}
