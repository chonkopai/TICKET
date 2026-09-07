import { loadApiEnv } from "@event-platform/config";
import type { PrismaClient } from "@event-platform/database";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { BOOKING_CLOCK, type BookingClock } from "../booking/booking.constants.js";
import QRCode from "qrcode";
import { ru } from "@event-platform/shared-types";

/** Edits the one message created during verification: retries cannot send duplicate tickets. */
@Injectable()
export class QuickDeliveryService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private cursor: string | undefined;
  constructor(@Inject(DATABASE_CLIENT) private readonly db: PrismaClient, @Inject(BOOKING_CLOCK) private readonly clock: BookingClock) {}
  onModuleInit(): void {
    this.timer = setInterval(() => { void this.tick().catch(() => { /* Retry on next tick; never log payloads/tokens. */ }); }, 15000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  async tick(send: (chat: string, message: number, text: string) => Promise<void> = telegramEdit, sessionIds?: string[], sendPhoto: ((chat: string, image: Buffer, caption: string) => Promise<void>) | undefined = send === telegramEdit ? telegramPhoto : undefined): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let delivered = 0;
    try {
      const rows = await this.db.anonymousCheckoutSession.findMany({ where: { ...(sessionIds ? { id: { in: sessionIds } } : {}), deliveredAt: null, deliveryMessageId: { not: null }, order: { paymentStatus: "paid" } }, take: 25, orderBy: { id: "asc" }, ...(!sessionIds && this.cursor ? { cursor: { id: this.cursor }, skip: 1 } : {}), include: { order: { include: { tickets: { orderBy: { id: "asc" }, include: { ticketType: { select: { name: true } } } }, booking: { include: { table: { select: { number: true } } } } } } } });
      // Advance past permanently failing chats so they cannot starve later deliveries.
      if (!sessionIds) this.cursor = rows.length === 25 ? rows.at(-1)?.id : undefined;
      for (const row of rows) {
        const order = row.order;
        if (!order || !row.chatId || !row.deliveryMessageId) continue;
        const committed = await this.db.outboxEvent.findFirst({ where: { aggregateId: order.id, eventType: "checkout.paid" } });
        if (!committed) continue;
        const snapshot = order.checkoutSnapshot as { eventTitle: string; paymentMode: string };
        const activeTickets = order.tickets.filter(t => t.status === "active" || t.status === "used");
        const lines = [snapshot.eventTitle.slice(0, 200), `${snapshot.paymentMode === "deposit" ? ru.events.paymentModes.deposit : ru.events.paymentModes.full_payment}: ${(order.amount / 100).toFixed(2)} ${order.currency.trim()}`, ru.bot.paymentConfirmed,
          ...activeTickets.map(t => `${t.ticketType.name.slice(0, 80)}\n${ru.bot.qrWillSend}`),
          ...(order.booking?.status === "confirmed" ? [`${ru.bot.tableOption} №${order.booking.table.number}: ${ru.bot.tableConfirmed}`] : []),
          ru.bot.doNotShare];
        try { await send(row.chatId.toString(), row.deliveryMessageId, lines.join("\n\n")); }
        catch { continue; }
        if (sendPhoto) {
          try { for (const ticket of activeTickets) await sendPhoto(row.chatId.toString(), await QRCode.toBuffer(ticket.qrToken, { type: "png", width: 320, margin: 2 }), `${ru.bot.ticketCaption}: ${ticket.ticketType.name}`); }
          catch { continue; }
        }
        await this.db.$transaction(async tx => {
          const changed = await tx.anonymousCheckoutSession.updateMany({ where: { id: row.id, deliveredAt: null }, data: { deliveredAt: this.clock.now() } });
          if (changed.count) await tx.outboxEvent.create({ data: { eventType: "anonymous.delivery_completed", aggregateType: "order", aggregateId: order.id, payload: { sourceEventId: committed.id } } });
        });
        delivered++;
      }
      return delivered;
    } finally { this.running = false; }
  }
}

async function telegramEdit(chatId: string, messageId: number, text: string): Promise<void> {
  const env = loadApiEnv();
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });
  const result = await response.json() as { ok: boolean; description?: string };
  if (!result.ok && !result.description?.includes("message is not modified")) throw new Error("TELEGRAM_DELIVERY_FAILED");
}

async function telegramPhoto(chatId: string, image: Buffer, caption: string): Promise<void> {
  const env = loadApiEnv();
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("photo", new Blob([Uint8Array.from(image)], { type: "image/png" }), "ticket.png");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(10000) });
  const result = await response.json() as { ok: boolean };
  if (!result.ok) throw new Error("TELEGRAM_DELIVERY_FAILED");
}
