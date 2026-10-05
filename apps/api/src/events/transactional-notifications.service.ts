import { createHash } from "node:crypto";

import { loadApiEnv } from "@event-platform/config";
import type { PrismaClient } from "@event-platform/database";
import { zonedInputToIso } from "@event-platform/shared-types";
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { EventNotificationsService } from "./event-notifications.service.js";

const CHANGE_FIELDS = new Set(["date", "time", "timezone", "venueName", "address", "program", "rules", "visitTerms", "cancellationTerms", "depositTerms", "extraConditions", "description"]);
const REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;
type EventTime = { date: Date; time: Date; timezone: string;startsAt?:Date|null };

@Injectable()
export class TransactionalNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransactionalNotificationsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private reminderCursor: string | undefined;
  private reminderWindow: string | undefined;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(EventNotificationsService) private readonly delivery: EventNotificationsService,
  ) {}

  onModuleInit(): void {
    const env = loadApiEnv();
    if (env.NODE_ENV !== "production" && !env.TRANSACTIONAL_NOTIFICATIONS_ENABLED) return;
    void this.tick().catch((error: unknown) => this.logger.error("Transactional notification scan failed", error));
    this.timer = setInterval(() => void this.tick().catch((error: unknown) => this.logger.error("Transactional notification scan failed", error)), 60_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processChanges();
      await this.scheduleReminders(now);
    } finally { this.running = false; }
  }

  private async processChanges(): Promise<void> {
    const rows = await this.db.outboxEvent.findMany({
      where: { processedAt: null, attempts: { lt: 5 }, eventType: { in: ["event.updated", "event.cancelled", "checkout.paid", "booking.cancelled", "ticket.cancelled", "refund.succeeded"] } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 100,
      select: { id: true, eventType: true, aggregateId: true, payload: true },
    });
    for (const row of rows) {
      try {
        const payload = jsonObject(row.payload);
        if (row.eventType === "checkout.paid") await this.paidOrder(row.aggregateId, row.id);
        else if (row.eventType === "booking.cancelled" || row.eventType === "ticket.cancelled" || row.eventType === "refund.succeeded") await this.orderChange(row.eventType === "refund.succeeded" ? row.aggregateId : typeof payload.orderId === "string" ? payload.orderId : "", row.id, row.eventType);
        else if (row.eventType === "event.cancelled") await this.cancelledEvent(row.aggregateId, row.id);
        else {
          const fields = Array.isArray(payload.changedFields) ? payload.changedFields.filter((field): field is string => typeof field === "string" && CHANGE_FIELDS.has(field)) : [];
          if (fields.length && typeof payload.eventUpdatedAt === "string") await this.updatedEvent(row.aggregateId, row.id, fields);
        }
        await this.db.outboxEvent.updateMany({ where: { id: row.id, processedAt: null }, data: { processedAt: new Date() } });
      } catch (error) {
        this.logger.error(`Notification trigger ${row.id} could not be queued`, error);
        await this.db.outboxEvent.updateMany({ where: { id: row.id, processedAt: null }, data: { attempts: { increment: 1 }, lastError: "R2_NOTIFICATION_QUEUE_FAILED" } });
        // Leave the trigger pending for bounded retry. The request key is stable.
      }
    }
  }

  private async updatedEvent(eventId: string, triggerId: string, fields: string[]): Promise<void> {
    const event = await this.db.event.findUnique({ where: { id: eventId }, select: { id: true, status: true, updatedAt: true, date: true, time: true, timezone: true, venueName: true, address: true } });
    if (!event || event.status !== "published") return;
    if (fields.some((field) => field === "date" || field === "time" || field === "timezone")) await this.supersedeReminders(eventId);
    const labels: Record<string, string> = { date: "дата", time: "время", timezone: "часовой пояс", venueName: "площадка", address: "адрес", program: "программа", rules: "правила", visitTerms: "условия посещения", cancellationTerms: "условия отмены", depositTerms: "условия депозита", extraConditions: "дополнительные условия",description:"описание" };
    const changed = fields.map((field) => labels[field]).filter(Boolean).join(", ");
    const message = `Изменились: ${changed}. Начало: ${event.date.toISOString().slice(0, 10)} ${event.time.toISOString().slice(11, 16)} (${event.timezone}). Место: ${event.venueName}, ${event.address}. Проверьте актуальные подробности на странице события.`;
    await this.delivery.queueSystem({ eventId, requestKey: triggerId, type: "event.change", message });
  }

  private async cancelledEvent(eventId: string, triggerId: string): Promise<void> {
    const event = await this.db.event.findUnique({ where: { id: eventId }, select: { status: true } });
    if (event?.status !== "cancelled") return;
    await this.supersedeReminders(eventId);
    await this.delivery.queueSystem({ eventId, requestKey: triggerId, type: "event.cancellation", message: "Мероприятие отменено. Информация о заказе и возврате доступна в личном кабинете или по ссылке быстрого заказа." });
  }

  private async supersedeReminders(eventId: string): Promise<void> {
    await this.db.notification.updateMany({ where: { eventId, type: "event.reminder", channel: "in_app", status: "sent" }, data: { status: "failed", lastError: "EVENT_CHANGED_OR_CANCELLED" } });
    await this.db.notification.updateMany({ where: { eventId, type: "event.reminder", channel: "telegram", status: { in: ["pending", "failed"] } }, data: { status: "failed", nextAttemptAt: null, lastError: "EVENT_CHANGED_OR_CANCELLED" } });
  }

  private async paidOrder(orderId: string, triggerId: string): Promise<void> {
    const order = await this.db.order.findUnique({ where: { id: orderId }, select: {
      paymentStatus: true, buyerUserId: true,
      tickets: { select: { ticketType: { select: { eventId: true } } } },
      reservations: { select: { ticketType: { select: { eventId: true } } } },
      seatAllocations: { select: { seat: { select: { venueLayout: { select: { eventId: true } } } } } },
      booking: { select: { table: { select: { venueLayout: { select: { eventId: true } } } } } },
      deposit: { select: { eventId: true } },
    } });
    if (!order || order.paymentStatus !== "paid" || !order.buyerUserId) return;
    const ids = new Set<string>();
    order.tickets.forEach((item) => ids.add(item.ticketType.eventId));
    order.reservations.forEach((item) => ids.add(item.ticketType.eventId));
    order.seatAllocations.forEach((item) => { if (item.seat.venueLayout.eventId) ids.add(item.seat.venueLayout.eventId); });
    if (order.booking?.table.venueLayout.eventId) ids.add(order.booking.table.venueLayout.eventId);
    if (order.deposit) ids.add(order.deposit.eventId);
    if (ids.size !== 1) return;
    const extra = order.deposit ? " Депозит зачислен в этот заказ." : "";
    await this.delivery.queueSystem({ eventId: [...ids][0]!, requestKey: triggerId, type: "purchase.confirmed", buyerUserId: order.buyerUserId, message: `Оплата подтверждена.${extra} Ваши билеты и детали заказа доступны в личном кабинете TICKET.` });
  }

  private async orderChange(aggregateId: string, triggerId: string, eventType: string): Promise<void> {
    if (!aggregateId) return;
    const order = await this.db.order.findUnique({ where: { id: aggregateId }, select: {
      buyerUserId: true, paymentStatus: true,
      tickets: { select: { ticketType: { select: { eventId: true } } } },
      reservations: { select: { ticketType: { select: { eventId: true } } } },
      booking: { select: { table: { select: { venueLayout: { select: { eventId: true } } } } } },
      seatAllocations: { select: { seat: { select: { venueLayout: { select: { eventId: true } } } } } },
      deposit: { select: { eventId: true } },
    } });
    if (!order?.buyerUserId) return;
    const ids = new Set<string>();
    order.tickets.forEach((item) => ids.add(item.ticketType.eventId));
    order.reservations.forEach((item) => ids.add(item.ticketType.eventId));
    order.seatAllocations.forEach((item) => { if (item.seat.venueLayout.eventId) ids.add(item.seat.venueLayout.eventId); });
    if (order.booking?.table.venueLayout.eventId) ids.add(order.booking.table.venueLayout.eventId);
    if (order.deposit) ids.add(order.deposit.eventId);
    if (ids.size !== 1) return;
    const message = eventType === "refund.succeeded" ? "Возврат по вашему заказу подтверждён. Проверьте статус и сумму в личном кабинете."
      : eventType === "booking.cancelled" ? "Бронирование столика отменено. Данные заказа обновлены в личном кабинете."
      : "Билет отменён. Данные заказа обновлены в личном кабинете.";
    await this.delivery.queueSystem({ eventId: [...ids][0]!, requestKey: triggerId, type: eventType, buyerUserId: order.buyerUserId, message });
  }

  private async scheduleReminders(now: Date): Promise<void> {
    // Event dates are stored as local date + time. A three-day date window covers
    // all supported timezones around the next 24 hours without guessing UTC offsets.
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3));
    const windowKey = from.toISOString();
    if (this.reminderWindow !== windowKey) { this.reminderWindow = windowKey; this.reminderCursor = undefined; }
    let cursor = this.reminderCursor;
    for (let batch = 0; batch < 10; batch++) {
      const rows = await this.db.event.findMany({ where: { status: "published", date: { gte: from, lt: to } }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, date: true, time: true, timezone: true, startsAt:true, title: true, venueName: true, address: true } });
      for (const event of rows) {
        const start = startIso(event);
        const until = new Date(start).getTime() - now.getTime();
        if (until > 0 && until <= REMINDER_BEFORE_MS) {
          try {
            await this.delivery.queueSystem({ eventId: event.id, requestKey: stableUuid(`reminder:${event.id}:${start}`), type: "event.reminder", reminder: true, eventStart: start,
              message: `Напоминаем: начало ${event.date.toISOString().slice(0, 10)} в ${event.time.toISOString().slice(11, 16)} (${event.timezone}). Проверьте актуальную площадку и условия на странице события.` });
          } catch (error) { this.logger.error(`Reminder for event ${event.id} could not be queued`, error); }
        }
      }
      if (rows.length < 100) { cursor = undefined; break; }
      cursor = rows.at(-1)?.id;
    }
    this.reminderCursor = cursor;
  }
}

function startIso(event: EventTime): string { if(event.startsAt)return event.startsAt.toISOString();return zonedInputToIso(`${event.date.toISOString().slice(0, 10)}T${event.time.toISOString().slice(11, 16)}`, event.timezone); }
function jsonObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}
