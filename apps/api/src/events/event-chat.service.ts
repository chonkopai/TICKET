import { Prisma, type PrismaClient } from "@event-platform/database";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { secretHash } from "../orders/anonymous.service.js";

type Participant = { kind: "organizer" | "guest"; userId?: string; accessToken?: string };

@Injectable()
export class EventChatService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: PrismaClient) {}

  async list(eventId: string, orderId: string, participant: Participant, before?: string) {
    await this.authorize(eventId, orderId, participant);
    const cursor = before ? await this.db.chatMessage.findFirst({ where: { id: before, orderId, eventId }, select: { id: true, createdAt: true } }) : null;
    if (before && !cursor) throw new BadRequestException({ code: "CHAT_CURSOR_INVALID" });
    const rows = await this.db.chatMessage.findMany({ where: { eventId, orderId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31, select: { id: true, sender: true, text: true, createdAt: true, readAt: true } });
    const hasMore = rows.length > 30;
    const page = rows.slice(0, 30);
    return { items: page.reverse().map((row) => ({ id: row.id, sender: row.sender, text: row.text, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null })), nextCursor: hasMore ? page[0]?.id ?? null : null };
  }

  async send(eventId: string, orderId: string, participant: Participant, raw: string, requestKey: string) {
    const text = raw.trim();
    if (!text || text.length > 2000) throw new BadRequestException({ code: "CHAT_TEXT_INVALID" });
    const { organizerId, guestUserId, anonymousSessionId } = await this.authorize(eventId, orderId, participant);
    const sender = participant.kind;
    const existing = await this.db.chatMessage.findUnique({ where: { clientMessageId: requestKey }, select: { id: true, eventId: true, orderId: true, sender: true, text: true, createdAt: true, readAt: true } });
    if (existing) return sameMessage(existing, eventId, orderId, sender, text);
    try {
      const row = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat:${orderId}:${sender}`}))`;
      const prior = await tx.chatMessage.findUnique({ where: { clientMessageId: requestKey }, select: { id: true, eventId: true, orderId: true, sender: true, text: true, createdAt: true, readAt: true } });
      if (prior) return prior;
      const recent = await tx.chatMessage.findFirst({ where: { orderId, sender, createdAt: { gte: new Date(Date.now() - 10_000) } }, select: { id: true } });
      if (recent) throw new ConflictException({ code: "CHAT_RATE_LIMITED" });
      const hourly = await tx.chatMessage.count({ where: { orderId, sender, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
      if (hourly >= 20) throw new ConflictException({ code: "CHAT_RATE_LIMITED" });
      const saved = await tx.chatMessage.create({ data: { eventId, orderId, clientMessageId: requestKey, organizerId, guestUserId, anonymousSessionId, sender, text }, select: { id: true, eventId: true, orderId: true, sender: true, text: true, createdAt: true, readAt: true } });
      await tx.auditLog.create({ data: { actorId: participant.userId ?? null, action: "chat.message_sent", entityType: "order", entityId: orderId, meta: { eventId, sender, chatMessageId: saved.id } } });
      return saved;
      });
      return sameMessage(row, eventId, orderId, sender, text);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await this.db.chatMessage.findUnique({ where: { clientMessageId: requestKey }, select: { id: true, eventId: true, orderId: true, sender: true, text: true, createdAt: true, readAt: true } });
        if (concurrent) return sameMessage(concurrent, eventId, orderId, sender, text);
      }
      throw error;
    }
  }

  async markRead(eventId: string, orderId: string, participant: Participant) {
    await this.authorize(eventId, orderId, participant);
    const opposite = participant.kind === "guest" ? "organizer" : "guest";
    const changed = await this.db.chatMessage.updateMany({ where: { eventId, orderId, sender: opposite, readAt: null }, data: { readAt: new Date() } });
    return { marked: changed.count };
  }

  private async authorize(eventId: string, orderId: string, participant: Participant) {
    const event = await this.db.event.findUnique({ where: { id: eventId }, select: { organizerId: true } });
    if (!event) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    if (participant.kind === "organizer" && event.organizerId !== participant.userId) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    const order = await this.db.order.findUnique({ where: { id: orderId }, select: {
      buyerUserId: true, paymentStatus: true,
      anonymousSession: { select: { id: true, accessHash: true, accessExpiresAt: true } },
      tickets: { select: { ticketType: { select: { eventId: true } } } },
      reservations: { select: { ticketType: { select: { eventId: true } } } },
      seatAllocations: { select: { seat: { select: { venueLayout: { select: { eventId: true } } } } } },
      booking: { select: { table: { select: { venueLayout: { select: { eventId: true } } } } } },
      deposit: { select: { eventId: true } },
    } });
    if (!order || !["paid", "refunded", "cancelled"].includes(order.paymentStatus)) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    if (!order.buyerUserId && !order.anonymousSession) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    const eventIds = new Set<string>();
    order.tickets.forEach((ticket) => eventIds.add(ticket.ticketType.eventId));
    order.reservations.forEach((reservation) => eventIds.add(reservation.ticketType.eventId));
    order.seatAllocations.forEach((allocation) => { if (allocation.seat.venueLayout.eventId) eventIds.add(allocation.seat.venueLayout.eventId); });
    if (order.booking?.table.venueLayout.eventId) eventIds.add(order.booking.table.venueLayout.eventId);
    if (order.deposit) eventIds.add(order.deposit.eventId);
    if (eventIds.size !== 1 || !eventIds.has(eventId)) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    if (participant.kind === "guest") {
      const ownedByUser = Boolean(participant.userId && order.buyerUserId === participant.userId);
      const ownedBySession = Boolean(participant.accessToken && order.anonymousSession?.accessHash === secretHash(participant.accessToken) && order.anonymousSession.accessExpiresAt > new Date());
      if (!ownedByUser && !ownedBySession) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
    }
    return { organizerId: event.organizerId, guestUserId: order.buyerUserId, anonymousSessionId: order.buyerUserId ? null : order.anonymousSession?.id ?? null };
  }
}

function sameMessage(row: { id: string; eventId: string; orderId: string | null; sender: "guest" | "organizer"; text: string; createdAt: Date; readAt: Date | null }, eventId: string, orderId: string, sender: "guest" | "organizer", text: string) {
  if (row.eventId !== eventId || row.orderId !== orderId) throw new NotFoundException({ code: "ORDER_NOT_FOUND" });
  if (row.sender !== sender || row.text !== text) throw new ConflictException({ code: "CHAT_REQUEST_KEY_CHANGED" });
  return { id: row.id, sender: row.sender, text: row.text, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null };
}
