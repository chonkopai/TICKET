import { createHash, createHmac } from "node:crypto";

import { EventStatus, PaymentStatus, TicketStatus, type PrismaClient } from "@event-platform/database";
import type {
  BotIdentityRequest,
  BotIdentityResponse,
  BotOrganizerTodayResponse,
  BotTicketSummary,
  BotTicketsResponse,
  PublicEvent,
  PublicEventList,
} from "@event-platform/shared-types";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig, type BotPrincipal } from "../auth/auth.constants.js";
import { AnonymousService } from "../orders/anonymous.service.js";
import { PublicEventsService } from "../public-events/public-events.service.js";
import { TicketsService } from "../tickets/tickets.service.js";

const BOT_TOKEN_TTL_SECONDS = 300;
const UPDATE_LEASE_SECONDS = 60;

@Injectable()
export class BotService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(PublicEventsService) private readonly publicEvents: PublicEventsService,
    @Inject(TicketsService) private readonly tickets: TicketsService,
    @Inject(AnonymousService) private readonly anonymous: AnonymousService,
  ) {}

  async identity(input: BotIdentityRequest): Promise<BotIdentityResponse> {
    if (!/^-?\d+$/.test(input.telegramId) || !/^-?\d+$/.test(input.chatId)) throw new BadRequestException({ code: "BOT_IDENTITY_INVALID" });
    const user = await this.db.user.findFirst({ where: { telegramId: BigInt(input.telegramId), telegramChatId: BigInt(input.chatId) } });
    if (!user) throw new NotFoundException({ code: "BOT_IDENTITY_NOT_LINKED" });
    const expiresAt = Date.now() + BOT_TOKEN_TTL_SECONDS * 1000;
    const payload = Buffer.from(JSON.stringify({ sub: user.id, telegramId: input.telegramId, chatId: input.chatId, exp: expiresAt })).toString("base64url");
    const signature = createHmac("sha256", this.config.botApiSecret).update(payload).digest("base64url");
    return { token: `bot.${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString(), user: { id: user.id, role: user.role } };
  }

  listEvents(query: { page: number; limit: number; sort: "recent" | "popular"; search?: string; from?: string; to?: string }): Promise<PublicEventList> {
    return this.publicEvents.list(query);
  }

  getEvent(id: string): Promise<PublicEvent> {
    return this.publicEvents.get(id);
  }

  async ticketsFor(actor: BotPrincipal): Promise<BotTicketsResponse> {
    const user = await this.requireActor(actor);
    const owned = await this.db.ticket.findMany({
      where: { OR: [{ ownerUserId: user.id }, { order: { buyerUserId: user.id } }], status: { notIn: [TicketStatus.cancelled, TicketStatus.refunded] } },
      include: { ticketType: { select: { name: true, eventId: true, event: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    const anonymous = await this.anonymousTickets(actor.telegramId, actor.chatId);
    const result: BotTicketSummary[] = owned.map((ticket) => ({ id: ticket.id, eventId: ticket.ticketType.eventId, eventTitle: ticket.ticketType.event.title, ticketTypeName: ticket.ticketType.name, status: ticket.status, usedAt: ticket.usedAt?.toISOString() ?? null, anonymous: false }));
    for (const session of anonymous) for (const ticket of session.order?.tickets ?? []) {
      if (result.some((item) => item.id === ticket.id)) continue;
      result.push({ id: ticket.id, eventId: ticket.ticketType.eventId, eventTitle: ticket.ticketType.event.title, ticketTypeName: ticket.ticketType.name, status: ticket.status, usedAt: ticket.usedAt?.toISOString() ?? null, anonymous: true });
    }
    return { items: result };
  }

  async anonymousTickets(telegramId: string, chatId: string) {
    return this.db.anonymousCheckoutSession.findMany({
      where: { telegramId: BigInt(telegramId), chatId: BigInt(chatId), order: { paymentStatus: PaymentStatus.paid } },
      include: { order: { include: { tickets: { include: { ticketType: { select: { name: true, eventId: true, event: { select: { title: true } } } } } } } } },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  async qrForActor(actor: BotPrincipal, id: string): Promise<Buffer> {
    await this.requireActor(actor);
    return this.tickets.renderQrForUser(actor.userId, id);
  }

  async qrForAnonymous(telegramId: string, chatId: string, id: string): Promise<Buffer> {
    const row = await this.db.anonymousCheckoutSession.findFirst({ where: { telegramId: BigInt(telegramId), chatId: BigInt(chatId), order: { paymentStatus: PaymentStatus.paid, tickets: { some: { id } } } } });
    if (!row?.orderId) throw new NotFoundException({ code: "TICKET_NOT_FOUND" });
    return this.tickets.assetForAnonymousOrder(row.orderId, id, false);
  }

  async startQuickSession(input: { name: string; telegramId: string; chatId: string }) {
    if (input.telegramId !== input.chatId) throw new BadRequestException({ code: "BOT_PRIVATE_CHAT_REQUIRED" });
    return this.anonymous.startForVerifiedRecipient(input.name.slice(0, 120), input.telegramId, input.chatId);
  }

  async setQuickDeliveryMessage(input: { sessionToken: string; telegramId: string; chatId: string; messageId: number }): Promise<{ saved: true }> {
    const row = await this.db.anonymousCheckoutSession.findUnique({ where: { sessionHash: createHash("sha256").update(input.sessionToken).digest("hex") } });
    if (!row || row.telegramId?.toString() !== input.telegramId || row.chatId?.toString() !== input.chatId || !Number.isSafeInteger(input.messageId) || input.messageId < 1) throw new NotFoundException({ code: "BOT_SESSION_NOT_FOUND" });
    await this.db.anonymousCheckoutSession.update({ where: { id: row.id }, data: { deliveryMessageId: input.messageId } });
    return { saved: true };
  }

  async today(actor: BotPrincipal): Promise<BotOrganizerTodayResponse> {
    const user = await this.requireActor(actor);
    if (user.role !== "organizer" && user.role !== "admin") throw new NotFoundException({ code: "BOT_FEATURE_NOT_AVAILABLE" });
    const events = await this.db.event.findMany({ where: { organizerId: user.id, status: EventStatus.published }, orderBy: [{ date: "asc" }, { time: "asc" }], take: 100 });
    const items = events.filter((event) => localDate(new Date(), event.timezone) === event.date.toISOString().slice(0, 10));
    return { items: await Promise.all(items.map(async (event) => ({ id: event.id, title: event.title, date: event.date.toISOString().slice(0, 10), time: event.time.toISOString().slice(11, 16), timezone: event.timezone, guestCount: await this.guestCount(event.id) }))) };
  }

  async guests(actor: BotPrincipal, eventId: string): Promise<{ eventId: string; guestCount: number }> {
    const user = await this.requireActor(actor);
    const event = await this.db.event.findFirst({ where: { id: eventId, organizerId: user.id }, select: { id: true } });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND" });
    return { eventId, guestCount: await this.guestCount(eventId) };
  }

  async claimUpdate(botId: string, updateId: string, payloadHash: string): Promise<{ process: boolean; retry?: boolean }> {
    if (!/^\d+$/.test(updateId) || !/^[a-f0-9]{64}$/.test(payloadHash)) throw new BadRequestException({ code: "BOT_UPDATE_INVALID" });
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const existing = await tx.telegramUpdate.findUnique({ where: { botId_updateId: { botId, updateId: BigInt(updateId) } } });
      if (existing?.payloadHash && existing.payloadHash !== payloadHash) throw new ConflictException({ code: "BOT_UPDATE_CONFLICT" });
      if (existing?.status === "completed") return { process: false };
      // Keep Telegram retryable while another worker still owns the lease.
      if (existing?.status === "processing" && existing.leaseUntil && existing.leaseUntil > now) return { process: false, retry: true };
      const data = { payloadHash, status: "processing" as const, leaseUntil: new Date(now.getTime() + UPDATE_LEASE_SECONDS * 1000), attempts: { increment: 1 } };
      if (existing) await tx.telegramUpdate.update({ where: { id: existing.id }, data });
      else await tx.telegramUpdate.create({ data: { botId, updateId: BigInt(updateId), payloadHash, leaseUntil: data.leaseUntil } });
      return { process: true };
    });
  }

  async completeUpdate(botId: string, updateId: string, payloadHash: string, failed = false): Promise<void> {
    const row = await this.db.telegramUpdate.findUnique({ where: { botId_updateId: { botId, updateId: BigInt(updateId) } } });
    if (!row || row.payloadHash !== payloadHash) return;
    await this.db.telegramUpdate.update({ where: { id: row.id }, data: failed ? { status: "failed", leaseUntil: null } : { status: "completed", processedAt: new Date(), leaseUntil: null } });
  }

  private async requireActor(actor: BotPrincipal) {
    const user = await this.db.user.findFirst({ where: { id: actor.userId, telegramId: BigInt(actor.telegramId), telegramChatId: BigInt(actor.chatId) } });
    if (!user) throw new NotFoundException({ code: "BOT_IDENTITY_NOT_LINKED" });
    return user;
  }

  private async guestCount(eventId: string): Promise<number> {
    const [tickets, bookings] = await Promise.all([
      this.db.ticket.count({ where: { ticketType: { eventId }, status: { in: [TicketStatus.paid, TicketStatus.active, TicketStatus.used] } } }),
      this.db.booking.count({ where: { table: { venueLayout: { eventId } }, status: { in: ["pending", "confirmed"] } } }),
    ]);
    return tickets + bookings;
  }
}

function localDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function hashTelegramPayload(raw: Buffer | string): string {
  return createHash("sha256").update(raw).digest("hex");
}
