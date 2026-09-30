import { loadApiEnv } from "@event-platform/config";
import { Prisma, type PrismaClient } from "@event-platform/database";
import { EVENT_NOTIFICATION_TYPES, zonedInputToIso, type EventNotificationType } from "@event-platform/shared-types";
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import QRCode from "qrcode";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { OBJECT_STORAGE } from "./events.constants.js";
import type { ObjectStorage } from "./object-storage.js";
import { Optional } from "@nestjs/common";

export const EVENT_MESSAGE_TYPES = EVENT_NOTIFICATION_TYPES;
export type EventMessageType = EventNotificationType;
type Recipient = { key: string; userId: string | null; chatId: bigint | null };
type Audience = { intended: number; reachable: Recipient[]; users: Array<{ userId: string; chatId: bigint | null; remindersEnabled: boolean; ticketDeliveryEnabled: boolean; marketingEnabled: boolean }> };
type TelegramSend = (chatId: string, text: string) => Promise<string>;
type TelegramPhotoSend = (chatId: string, image: Buffer, caption: string, contentType?: string) => Promise<string>;

@Injectable()
export class EventNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventNotificationsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(DATABASE_CLIENT) private readonly db: PrismaClient, @Optional() @Inject(OBJECT_STORAGE) private readonly storage?: ObjectStorage) {}

  async marketingAudience(eventId: string): Promise<Array<{ userId: string; chatId: bigint }>> {
    const audience = await this.audience(eventId, "important");
    const chats = new Set<string>();
    return audience.users.flatMap((user) => {
      if (!user.marketingEnabled || !user.chatId || chats.has(String(user.chatId))) return [];
      chats.add(String(user.chatId));
      return [{ userId: user.userId, chatId: user.chatId }];
    });
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) => this.logger.error("Event notification worker failed", error));
    }, 15_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async preview(organizerId: string, eventId: string, type: EventMessageType) {
    const event = await this.ownedEvent(organizerId, eventId);
    const audience = await this.audience(eventId, type);
    return { eventId, eventTitle: event.title, type, audienceCount: audience.intended, reachableCount: audience.reachable.length, unreachableCount: Math.max(0, audience.intended - audience.reachable.length), channel: "telegram" as const };
  }

  async queue(organizerId: string, eventId: string, input: { type: EventMessageType; message: string; requestKey: string }) {
    const event = await this.ownedEvent(organizerId, eventId);
    const message = input.message.trim();
    if (!message || message.length > 2000) throw new BadRequestException({ code: "EVENT_MESSAGE_INVALID" });
    if (event.status === "draft") throw new ConflictException({ code: "EVENT_NOT_PUBLISHED" });
    if (input.type !== "cancellation" && event.status === "cancelled") throw new ConflictException({ code: "EVENT_CANCELLED" });
    const existing = await this.db.broadcast.findUnique({ where: { requestKey: input.requestKey } });
    if (existing) {
      if (existing.organizerId !== organizerId || existing.eventId !== eventId) throw new ConflictException({ code: "REQUEST_KEY_USED" });
      if (existing.type !== input.type || existing.message !== message) throw new ConflictException({ code: "REQUEST_KEY_CHANGED" });
      return this.status(organizerId, eventId, existing.id);
    }
    const audience = await this.audience(eventId, input.type);
    const text = `${event.title}\n\n${message}`;
    try {
      const broadcast = await this.db.$transaction(async (tx) => {
        const row = await tx.broadcast.create({ data: {
          organizerId, eventId, requestKey: input.requestKey, type: input.type, message,
          audience: { kind: "event_orders", channel: "telegram", audienceCount: audience.intended, reachableCount: audience.reachable.length },
          audienceCount: audience.intended, recipientCount: audience.reachable.length,
          status: audience.reachable.length ? "queued" : "failed",
        } });
        if (audience.reachable.length) await tx.notification.createMany({ data: audience.reachable.map((recipient) => ({
          broadcastId: row.id, recipientKey: recipient.key, userId: recipient.userId, telegramId: recipient.chatId,
          eventId, channel: "telegram" as const, type: `event.${input.type}`, payload: { text }, nextAttemptAt: new Date(),
        })) });
        if (audience.users.length) await tx.notification.createMany({ data: audience.users.map((recipient) => ({
          broadcastId: row.id, recipientKey: `inbox:${recipient.userId}`, userId: recipient.userId,
          eventId, channel: "in_app" as const, type: `event.${input.type}`, payload: { text }, status: "sent" as const,
        })) });
        await tx.auditLog.create({ data: { actorId: organizerId, action: "event.notification_queued", entityType: "broadcast", entityId: row.id, meta: { eventId, type: input.type, audienceCount: audience.intended, reachableCount: audience.reachable.length } } });
        return row;
      });
      return this.status(organizerId, eventId, broadcast.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await this.db.broadcast.findUnique({ where: { requestKey: input.requestKey } });
        if (concurrent?.organizerId === organizerId && concurrent.eventId === eventId) {
          if (concurrent.type !== input.type || concurrent.message !== message) throw new ConflictException({ code: "REQUEST_KEY_CHANGED" });
          return this.status(organizerId, eventId, concurrent.id);
        }
      }
      throw error;
    }
  }

  // Transactional messages share the durable M5 worker, but the account inbox is
  // independent of whether Telegram is linked or accepts the message.
  async queueSystem(input: { eventId: string; requestKey: string; type: string; message: string; reminder?: boolean; buyerUserId?: string; eventStart?: string; eventUpdatedAt?: string }): Promise<string> {
    const event = await this.db.event.findUnique({ where: { id: input.eventId }, select: { id: true, organizerId: true, title: true, status: true } });
    if (!event || event.status === "draft" || (event.status === "cancelled" && !["event.cancellation", "refund.succeeded", "booking.cancelled", "ticket.cancelled"].includes(input.type))) return "";
    const audience = await this.audience(event.id, ["event.cancellation", "refund.succeeded", "booking.cancelled", "ticket.cancelled"].includes(input.type) ? "cancellation" : "important", Boolean(input.reminder));
    const users = audience.users.filter((user) => (!input.buyerUserId || user.userId === input.buyerUserId) && (!input.reminder || user.remindersEnabled));
    const permittedChats = new Set(users.filter((user) => !input.type.startsWith("purchase.") || user.ticketDeliveryEnabled).map((user) => user.chatId?.toString()).filter(Boolean));
    const reachable = input.buyerUserId
      ? audience.reachable.filter((recipient) => recipient.userId === input.buyerUserId && permittedChats.has(recipient.chatId?.toString()))
      : input.reminder ? audience.reachable.filter((recipient) => recipient.userId ? permittedChats.has(recipient.chatId?.toString()) : true) : audience.reachable;
    if (input.reminder && !users.length && !reachable.length) return "";
    const intended = input.buyerUserId ? users.length : input.reminder ? users.length + reachable.filter((recipient) => !recipient.userId).length : audience.intended;
    const text = `${event.title}\n\n${input.message.trim()}`;
    const existing = await this.db.broadcast.findUnique({ where: { requestKey: input.requestKey }, select: { id: true, eventId: true, type: true } });
    if (existing) {
      if (existing.eventId !== event.id || existing.type !== input.type) throw new ConflictException({ code: "REQUEST_KEY_USED" });
      if (input.reminder) await this.appendReminderRecipients(existing.id, event.id, input, text, users, reachable);
      return existing.id;
    }
    try {
      const row = await this.db.$transaction(async (tx) => {
        const broadcast = await tx.broadcast.create({ data: {
          organizerId: event.organizerId, eventId: event.id, requestKey: input.requestKey, type: input.type,
          message: input.message.trim(), audience: { kind: "transactional", source: input.type },
          audienceCount: intended, recipientCount: reachable.length, status: reachable.length ? "queued" : "sent",
        } });
        if (users.length) await tx.notification.createMany({ data: users.map((user) => ({
          broadcastId: broadcast.id, recipientKey: `inbox:${user.userId}`, dedupeKey: `inbox:${input.requestKey}:${user.userId}`,
          userId: user.userId, eventId: event.id, channel: "in_app" as const, type: input.type,
          payload: { text }, status: "sent" as const,
        })) });
        if (reachable.length) await tx.notification.createMany({ data: reachable.map((recipient) => ({
          broadcastId: broadcast.id, recipientKey: input.reminder && recipient.userId ? `user:${recipient.userId}` : recipient.key, userId: recipient.userId, telegramId: recipient.chatId,
          eventId: event.id, channel: "telegram" as const, type: input.type,
          payload: { text, eventId: event.id, ...(input.eventStart ? { eventStart: input.eventStart } : {}), ...(input.eventUpdatedAt ? { eventUpdatedAt: input.eventUpdatedAt } : {}) },
          nextAttemptAt: new Date(),
        })) });
        return broadcast;
      });
      return row.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.db.broadcast.findUnique({ where: { requestKey: input.requestKey }, select: { id: true, eventId: true, type: true } });
        if (raced?.eventId === event.id && raced.type === input.type) {
          if (input.reminder) await this.appendReminderRecipients(raced.id, event.id, input, text, users, reachable);
          return raced.id;
        }
      }
      throw error;
    }
  }

  private async appendReminderRecipients(
    broadcastId: string, eventId: string,
    input: { type: string; requestKey: string; eventStart?: string }, text: string,
    users: Audience["users"], reachable: Recipient[],
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      if (users.length) await tx.notification.createMany({ skipDuplicates: true, data: users.map((user) => ({
        broadcastId, recipientKey: `inbox:${user.userId}`, dedupeKey: `inbox:${input.requestKey}:${user.userId}`,
        userId: user.userId, eventId, channel: "in_app" as const, type: input.type,
        payload: { text }, status: "sent" as const,
      })) });
      if (reachable.length) await tx.notification.createMany({ skipDuplicates: true, data: reachable.map((recipient) => ({
        broadcastId, recipientKey: recipient.userId ? `user:${recipient.userId}` : recipient.key, userId: recipient.userId, telegramId: recipient.chatId,
        eventId, channel: "telegram" as const, type: input.type,
        payload: { text, eventId, ...(input.eventStart ? { eventStart: input.eventStart } : {}) }, nextAttemptAt: new Date(),
      })) });
      const recipientCount = await tx.notification.count({ where: { broadcastId, channel: "telegram" } });
      const audienceCount = await tx.notification.count({ where: { broadcastId, OR: [{ channel: "in_app" }, { channel: "telegram", userId: null }] } });
      const pending = await tx.notification.count({ where: { broadcastId, channel: "telegram", status: "pending" } });
      await tx.broadcast.update({ where: { id: broadcastId }, data: { recipientCount, audienceCount, ...(pending ? { status: "queued", sentAt: null } : {}) } });
    });
  }

  async list(organizerId: string, eventId: string) {
    await this.ownedEvent(organizerId, eventId);
    const rows = await this.db.broadcast.findMany({ where: { organizerId, eventId, type: { in: [...EVENT_MESSAGE_TYPES] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { id: true } });
    return Promise.all(rows.map((row) => this.status(organizerId, eventId, row.id)));
  }

  async resendTicket(organizerId: string, eventId: string, orderId: string, ticketId: string, requestKey: string) {
    await this.ownedEvent(organizerId, eventId);
    const order = await this.db.order.findFirst({ where: { id: orderId, tickets: { some: { id: ticketId, ticketType: { eventId } } } }, select: {
      id: true, paymentStatus: true, buyerUserId: true,
      buyer: { select: { telegramChatId: true, notificationPreference: { select: { transactionalTicketDelivery: true } } } },
      anonymousSession: { select: { chatId: true } },
      tickets: { select: { id: true, status: true, ticketType: { select: { eventId: true } } } },
      reservations: { select: { ticketType: { select: { eventId: true } } } },
      seatAllocations: { select: { seat: { select: { venueLayout: { select: { eventId: true } } } } } },
      booking: { select: { table: { select: { venueLayout: { select: { eventId: true } } } } } },
      deposit: { select: { eventId: true } },
    } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    const eventIds = new Set<string>();
    order.tickets.forEach((ticket) => eventIds.add(ticket.ticketType.eventId));
    order.reservations.forEach((reservation) => eventIds.add(reservation.ticketType.eventId));
    order.seatAllocations.forEach((allocation) => { if (allocation.seat.venueLayout.eventId) eventIds.add(allocation.seat.venueLayout.eventId); });
    if (order.booking?.table.venueLayout.eventId) eventIds.add(order.booking.table.venueLayout.eventId);
    if (order.deposit) eventIds.add(order.deposit.eventId);
    if (eventIds.size !== 1 || !eventIds.has(eventId)) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    if (order.paymentStatus !== "paid" || !order.tickets.some((ticket) => ticket.id === ticketId && ticket.status === "active")) throw new ConflictException({ code: "TICKET_NOT_ACTIVE" });
    if (order.buyer?.notificationPreference?.transactionalTicketDelivery === false) throw new ConflictException({ code: "TICKET_DELIVERY_DISABLED" });
    const chatId = order.buyer?.telegramChatId ?? order.anonymousSession?.chatId;
    if (!chatId) throw new ConflictException({ code: "TELEGRAM_LINK_REQUIRED" });
    const existing = await this.db.broadcast.findUnique({ where: { requestKey } });
    if (existing) {
      if (existing.organizerId !== organizerId || existing.eventId !== eventId || existing.type !== "ticket.resend" || (existing.audience as { ticketId?: string }).ticketId !== ticketId) throw new ConflictException({ code: "REQUEST_KEY_USED" });
      return this.status(organizerId, eventId, existing.id);
    }
    try {
      const row = await this.db.$transaction(async (tx) => {
        const broadcast = await tx.broadcast.create({ data: { organizerId, eventId, requestKey, type: "ticket.resend", message: "Повторная отправка билета", audience: { kind: "ticket_resend", orderId, ticketId }, audienceCount: 1, recipientCount: 1, status: "queued" } });
        await tx.notification.create({ data: { broadcastId: broadcast.id, recipientKey: `chat:${chatId}`, userId: order.buyerUserId, telegramId: chatId, channel: "telegram", type: "ticket.resend", payload: { ticketId, orderId }, nextAttemptAt: new Date() } });
        await tx.auditLog.create({ data: { actorId: organizerId, action: "ticket.resend_queued", entityType: "ticket", entityId: ticketId, meta: { eventId, orderId, broadcastId: broadcast.id } } });
        return broadcast;
      });
      return this.status(organizerId, eventId, row.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await this.db.broadcast.findUnique({ where: { requestKey } });
        if (concurrent?.organizerId === organizerId && concurrent.eventId === eventId && concurrent.type === "ticket.resend" && (concurrent.audience as { ticketId?: string }).ticketId === ticketId) return this.status(organizerId, eventId, concurrent.id);
      }
      throw error;
    }
  }

  async status(organizerId: string, eventId: string, broadcastId: string) {
    await this.ownedEvent(organizerId, eventId);
    const row = await this.db.broadcast.findFirst({ where: { id: broadcastId, organizerId, eventId }, select: {
      id: true, requestKey: true, type: true, message: true, status: true, audienceCount: true, recipientCount: true, createdAt: true, sentAt: true,
      notifications: { where: { channel: "telegram" }, select: { status: true, lastError: true } },
    } });
    if (!row) throw new NotFoundException({ code: "BROADCAST_NOT_FOUND" });
    const counts = { queued: 0, processing: 0, accepted: 0, failed: 0, uncertain: 0 };
    const reasons = new Map<string, number>();
    for (const notification of row.notifications) {
      if (notification.status === "pending") counts.queued++;
      if (notification.status === "processing") counts.processing++;
      if (notification.status === "sent") counts.accepted++;
      if (notification.status === "failed") counts.failed++;
      if (notification.status === "uncertain") counts.uncertain++;
      if (notification.lastError) reasons.set(notification.lastError, (reasons.get(notification.lastError) ?? 0) + 1);
    }
    return { id: row.id, requestKey: row.requestKey, type: row.type, message: row.message, status: row.status, audienceCount: row.audienceCount, reachableCount: row.recipientCount, counts, failureReasons: [...reasons.entries()].map(([code, count]) => ({ code, count })), createdAt: row.createdAt.toISOString(), sentAt: row.sentAt?.toISOString() ?? null };
  }

  async tick(send: TelegramSend = sendTelegram, sendPhoto: TelegramPhotoSend = sendTelegramPhoto): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let accepted = 0;
    try {
      const stale = await this.db.notification.findMany({ where: { broadcastId: { not: null }, status: "processing", claimedAt: { lt: new Date(Date.now() - 60_000) } }, select: { id: true, broadcastId: true }, take: 25 });
      for (const row of stale) {
        await this.db.notification.updateMany({ where: { id: row.id, status: "processing" }, data: { status: "uncertain", lastError: "DELIVERY_OUTCOME_UNKNOWN" } });
        if (row.broadcastId) await this.refreshBroadcast(row.broadcastId);
      }
      const due = await this.db.notification.findMany({ where: {
        broadcastId: { not: null }, channel: "telegram", attempts: { lt: 3 },
        status: { in: ["pending", "failed"] }, nextAttemptAt: { lte: new Date() },
      }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 25, select: { id: true, broadcastId: true, telegramId: true, userId: true, type: true, payload: true, status: true, attempts: true } });
      for (const row of due) {
        const claimed = await this.db.notification.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts }, data: { status: "processing", attempts: { increment: 1 }, claimedAt: new Date(), nextAttemptAt: null } });
        if (claimed.count !== 1) continue;
        const payload = row.payload as { text?: unknown; ticketId?: unknown; orderId?: unknown; eventId?: unknown; eventStart?: unknown; eventUpdatedAt?: unknown };
        const isTicket = typeof payload.ticketId === "string" && typeof payload.orderId === "string";
        if (!row.telegramId || (!isTicket && typeof payload.text !== "string")) {
          await this.db.notification.update({ where: { id: row.id }, data: { status: "failed", lastError: "INVALID_RECIPIENT" } });
          if (row.broadcastId) await this.refreshBroadcast(row.broadcastId);
          continue;
        }
        if (row.userId) {
          const user = await this.db.user.findUnique({ where: { id: row.userId }, select: { telegramChatId: true, notificationPreference: { select: { eventReminders: true, transactionalTicketDelivery: true, marketingAnnouncements: true } } } });
          const disabled = !user || user.telegramChatId !== row.telegramId
            || (row.type === "event.reminder" && user.notificationPreference?.eventReminders === false)
            || (row.type === "purchase.confirmed" && user.notificationPreference?.transactionalTicketDelivery === false)
            || (row.type === "marketing.campaign" && user.notificationPreference?.marketingAnnouncements !== true);
          if (disabled) {
            await this.db.notification.update({ where: { id: row.id }, data: { status: "failed", lastError: row.type === "marketing.campaign" ? "MARKETING_CONSENT_WITHDRAWN" : "RECIPIENT_PREFERENCE_OR_LINK_CHANGED" } });
            if (row.broadcastId) await this.refreshBroadcast(row.broadcastId);
            continue;
          }
        }
        if (typeof payload.eventId === "string" && (typeof payload.eventStart === "string" || typeof payload.eventUpdatedAt === "string" || row.type === "event.change" || row.type === "marketing.campaign")) {
          const event = await this.db.event.findUnique({ where: { id: payload.eventId }, select: { id: true, date: true, time: true, timezone: true, status: true, updatedAt: true } });
          const currentStart = event ? eventStartIso(event) : null;
          if (!event || event.status !== "published" || (row.type === "marketing.campaign" && currentStart !== null && new Date(currentStart).getTime() <= Date.now()) || (payload.eventStart && currentStart !== payload.eventStart) || (payload.eventUpdatedAt && event.updatedAt.toISOString() !== payload.eventUpdatedAt)) {
            await this.db.notification.update({ where: { id: row.id }, data: { status: "failed", lastError: "EVENT_CHANGED_OR_CANCELLED" } });
            if (row.broadcastId) await this.refreshBroadcast(row.broadcastId);
            continue;
          }
        }
        if (row.type === "event.reminder" && typeof payload.eventId === "string") {
          const currentAudience = await this.audience(payload.eventId, "important", true);
          if (!currentAudience.reachable.some((recipient) => recipient.chatId === row.telegramId)) {
            await this.db.notification.update({ where: { id: row.id }, data: { status: "failed", lastError: "ORDER_NOT_ELIGIBLE" } });
            if (row.broadcastId) await this.refreshBroadcast(row.broadcastId);
            continue;
          }
        }
        try {
          let providerMessageId: string;
          if (isTicket) {
            const ticket = await this.db.ticket.findFirst({ where: { id: payload.ticketId as string, orderId: payload.orderId as string, status: "active", order: { paymentStatus: "paid" } }, select: { qrToken: true, ticketType: { select: { name: true } } } });
            if (!ticket) throw new TelegramRejectedError("TICKET_NOT_ACTIVE", false);
            providerMessageId = await sendPhoto(row.telegramId.toString(), await QRCode.toBuffer(ticket.qrToken, { type: "png", width: 320, margin: 2 }), `Билет: ${ticket.ticketType.name}`);
          } else if (row.type === "marketing.campaign" && typeof (payload as { imageUrl?: unknown }).imageUrl === "string") {
            const key = ((payload as { imageUrl: string }).imageUrl).match(/^\/media\/posters\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/)?.[1];
            if (!key || !this.storage) throw new TelegramRejectedError("CAMPAIGN_IMAGE_UNAVAILABLE", false);
            const image = await this.storage.readPoster(key).catch(() => { throw new TelegramRejectedError("CAMPAIGN_IMAGE_UNAVAILABLE", false); });
            providerMessageId = await sendPhoto(row.telegramId.toString(), image.body, payload.text as string, image.contentType);
          } else providerMessageId = await send(row.telegramId.toString(), payload.text as string);
          await this.db.notification.update({ where: { id: row.id }, data: { status: "sent", sentAt: new Date(), providerMessageId, lastError: null } });
          accepted++;
        } catch (error) {
          const definite = error instanceof TelegramRejectedError;
          await this.db.notification.update({ where: { id: row.id }, data: {
            status: definite ? "failed" : "uncertain", lastError: definite ? error.code : "DELIVERY_OUTCOME_UNKNOWN",
            nextAttemptAt: definite && error.retryable && row.attempts < 2 ? new Date(Date.now() + 60_000 * (row.attempts + 1)) : null,
          } });
        }
        if (row.broadcastId) await this.refreshBroadcast(row.broadcastId);
      }
      return accepted;
    } finally { this.running = false; }
  }

  private async refreshBroadcast(id: string): Promise<void> {
    const rows = await this.db.notification.groupBy({ by: ["status"], where: { broadcastId: id, channel: "telegram" }, _count: { _all: true } });
    const counts = new Map(rows.map((row) => [row.status, row._count._all]));
    const unfinished = (counts.get("pending") ?? 0) + (counts.get("processing") ?? 0);
    const retries = await this.db.notification.count({ where: { broadcastId: id, channel: "telegram", status: "failed", nextAttemptAt: { not: null }, attempts: { lt: 3 } } });
    const failures = (counts.get("failed") ?? 0) + (counts.get("uncertain") ?? 0);
    await this.db.broadcast.update({ where: { id }, data: { status: unfinished || retries ? "sending" : failures ? "failed" : "sent", ...(unfinished || failures ? {} : { sentAt: new Date() }) } });
  }

  private async ownedEvent(organizerId: string, eventId: string) {
    const event = await this.db.event.findFirst({ where: { id: eventId, organizerId }, select: { id: true, title: true, status: true } });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND" });
    return event;
  }

  private async audience(eventId: string, type: EventMessageType, activeOnly = false): Promise<Audience> {
    const orders = await this.db.order.findMany({ where: {
      AND: [{ OR: [
        { tickets: { some: { ticketType: { eventId } } } },
        { booking: { table: { venueLayout: { eventId } } } },
        { seatAllocations: { some: { seat: { venueLayout: { eventId } } } } },
        { deposit: { eventId } },
      ] }, type === "cancellation" ? { OR: [
        { paymentStatus: { in: ["paid", "refunded"] } }, { payments: { some: { status: { in: ["paid", "refunded"] } } } }, { tickets: { some: { paidAt: { not: null } } } },
      ] } : { paymentStatus: "paid" }],
    }, take: 10_001, select: {
      id: true, buyerUserId: true, buyer: { select: { telegramChatId: true, notificationPreference: { select: { eventReminders: true, transactionalTicketDelivery: true, marketingAnnouncements: true } } } }, anonymousSession: { select: { id: true, chatId: true } },
      tickets: { select: { status: true, ticketType: { select: { eventId: true } } } },
      reservations: { select: { ticketType: { select: { eventId: true } } } },
      booking: { select: { status: true, table: { select: { venueLayout: { select: { eventId: true } } } } } },
      seatAllocations: { select: { seat: { select: { venueLayout: { select: { eventId: true } } } } } },
      deposit: { select: { eventId: true } },
    } });
    if (orders.length > 10_000) throw new ConflictException({ code: "AUDIENCE_TOO_LARGE" });
    const people = new Set<string>();
    const reachable = new Map<string, Recipient>();
    const users = new Map<string, Audience["users"][number]>();
    for (const order of orders) {
      const eventIds = new Set<string>();
      order.tickets.forEach((ticket) => eventIds.add(ticket.ticketType.eventId));
      order.reservations.forEach((reservation) => eventIds.add(reservation.ticketType.eventId));
      order.seatAllocations.forEach((allocation) => { if (allocation.seat.venueLayout.eventId) eventIds.add(allocation.seat.venueLayout.eventId); });
      if (order.booking?.table.venueLayout.eventId) eventIds.add(order.booking.table.venueLayout.eventId);
      if (order.deposit) eventIds.add(order.deposit.eventId);
      if (eventIds.size !== 1 || !eventIds.has(eventId)) continue;
      if (activeOnly && !order.tickets.some((ticket) => ticket.ticketType.eventId === eventId && (ticket.status === "active" || ticket.status === "paid")) && order.booking?.status !== "confirmed") continue;
      const personKey = order.buyerUserId ? `user:${order.buyerUserId}` : order.anonymousSession ? `session:${order.anonymousSession.id}` : `order:${order.id}`;
      people.add(personKey);
      const chatId = order.buyer?.telegramChatId ?? order.anonymousSession?.chatId ?? null;
      if (order.buyerUserId) users.set(order.buyerUserId, { userId: order.buyerUserId, chatId, remindersEnabled: order.buyer?.notificationPreference?.eventReminders ?? true, ticketDeliveryEnabled: order.buyer?.notificationPreference?.transactionalTicketDelivery ?? true, marketingEnabled: order.buyer?.notificationPreference?.marketingAnnouncements === true });
      if (chatId) reachable.set(`chat:${chatId}`, { key: `chat:${chatId}`, userId: order.buyerUserId, chatId });
    }
    return { intended: people.size, reachable: [...reachable.values()], users: [...users.values()] };
  }
}

class TelegramRejectedError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) { super(code); }
}

function eventStartIso(event: { date: Date; time: Date; timezone: string }): string {
  return zonedInputToIso(`${event.date.toISOString().slice(0, 10)}T${event.time.toISOString().slice(11, 16)}`, event.timezone);
}

async function sendTelegram(chatId: string, text: string): Promise<string> {
  const env = loadApiEnv();
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await response.json() as { ok?: boolean; result?: { message_id?: number }; error_code?: number };
  if (body.ok && body.result?.message_id) return String(body.result.message_id);
  if (body.error_code === 429) throw new TelegramRejectedError("RATE_LIMITED", true);
  if (body.error_code && body.error_code >= 400 && body.error_code < 500) throw new TelegramRejectedError("RECIPIENT_REJECTED", false);
  throw new Error("TELEGRAM_OUTCOME_UNKNOWN");
}

async function sendTelegramPhoto(chatId: string, image: Buffer, caption: string, contentType = "image/png"): Promise<string> {
  const env = loadApiEnv();
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("photo", new Blob([Uint8Array.from(image)], { type: contentType }), `image.${contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png"}`);
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
  const body = await response.json() as { ok?: boolean; result?: { message_id?: number }; error_code?: number };
  if (body.ok && body.result?.message_id) return String(body.result.message_id);
  if (body.error_code === 429) throw new TelegramRejectedError("RATE_LIMITED", true);
  if (body.error_code && body.error_code >= 400 && body.error_code < 500) throw new TelegramRejectedError("RECIPIENT_REJECTED", false);
  throw new Error("TELEGRAM_OUTCOME_UNKNOWN");
}
