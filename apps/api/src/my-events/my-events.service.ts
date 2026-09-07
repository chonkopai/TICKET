import type { Prisma, PrismaClient } from "@event-platform/database";
import { EventStatus, TicketStatus } from "@event-platform/database";
import type { GuestBooking, GuestEvent, GuestEventList, GuestParticipationStatus, GuestTicket } from "@event-platform/shared-types";
import { zonedInputToIso } from "@event-platform/shared-types";
import { Inject, Injectable } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";

const MAX_EVENT_SCAN = 500;
type EventWithGuestData = Prisma.EventGetPayload<{
  include: {
    ticketTypes: { include: { tickets: true } };
    venueLayout: { include: { tables: { include: { bookings: { include: { order: { include: { deposit: true } } } } } } } };
  };
}>;

@Injectable()
export class MyEventsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: PrismaClient) {}

  async list(userId: string, status: "upcoming" | "past", page: number, limit: number, now = new Date()): Promise<GuestEventList> {
    const include: Prisma.EventInclude = {
      ticketTypes: { include: { tickets: { where: { OR: [{ ownerUserId: userId }, { order: { buyerUserId: userId } }] } } } },
      venueLayout: { include: { tables: { include: { bookings: { where: { order: { buyerUserId: userId } }, include: { order: { include: { deposit: true } } } } } } } },
    };
    const events = await this.database.event.findMany({
      where: {
        OR: [
          { ticketTypes: { some: { tickets: { some: { OR: [{ ownerUserId: userId }, { order: { buyerUserId: userId } }] } } } } },
          { venueLayout: { tables: { some: { bookings: { some: { order: { buyerUserId: userId } } } } } } },
        ],
      },
      include,
      orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }],
      take: MAX_EVENT_SCAN,
    });

    const classified = events.map((event) => this.presentEvent(event as unknown as EventWithGuestData, now));
    const filtered = classified
      .filter((event) => status === "upcoming" ? new Date(event.startsAt) > now : new Date(event.startsAt) <= now)
      .sort((left, right) => {
        const delta = new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
        return status === "upcoming" ? delta : -delta;
      });
    const skip = (page - 1) * limit;
    const items = filtered.slice(skip, skip + limit);
    return { items, status, page, limit, total: filtered.length, hasNext: skip + items.length < filtered.length };
  }

  private presentEvent(event: EventWithGuestData, now: Date): GuestEvent {
    const date = dateString(event.date);
    const time = timeString(event.time);
    const startsAt = zonedInputToIso(`${date}T${time}`, event.timezone);
    const isPast = new Date(startsAt) <= now;
    const tickets = event.ticketTypes.flatMap((type) => type.tickets.map((ticket) => presentGuestTicket(ticket, type.name, event.id, event.title)));
    const bookings = event.venueLayout?.tables.flatMap((table) => table.bookings.map((booking) => presentBooking(booking, table))) ?? [];
    const participationStatus = eventParticipation(event.status, tickets, bookings, isPast);
    return {
      id: event.id,
      title: event.title,
      posterUrl: event.posterUrl,
      announcement: event.announcement,
      description: event.description,
      program: event.program,
      rules: event.rules,
      visitTerms: event.visitTerms,
      cancellationTerms: event.cancellationTerms,
      depositTerms: event.depositTerms,
      paymentMode: event.paymentMode,
      showFullAmountForDeposit: event.showFullAmountForDeposit,
      extraConditions: event.extraConditions,
      date,
      time,
      timezone: event.timezone,
      startsAt,
      venueName: event.venueName,
      address: event.address,
      eventStatus: event.status,
      participationStatus,
      tickets: tickets.map((ticket) => ({ ...ticket, participationStatus: ticketParticipation(ticket.status, isPast, ticket.usedAt) })),
      bookings,
    };
  }
}

function presentGuestTicket(ticket: { id: string; status: TicketStatus; usedAt: Date | null; createdAt: Date; updatedAt: Date }, typeName: string, eventId: string, eventTitle: string): GuestTicket {
  return {
    id: ticket.id, eventId, eventTitle, ticketTypeName: typeName, status: ticket.status,
    usedAt: ticket.usedAt?.toISOString() ?? null, qrPath: `/me/tickets/${ticket.id}/qr`, walletPath: `/me/tickets/${ticket.id}/wallet`,
    createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(),
  };
}

function presentBooking(
  booking: { id: string; status: "pending" | "confirmed" | "cancelled" | "expired"; order: { amount: number; currency: string; paymentStatus: string; deposit: { amount: number; currency: string; status: string; terms: string } | null } },
  table: { id: string; number: number; name: string | null; seats: number; price: number; deposit: number; currency: string },
): GuestBooking {
  const deposit = booking.order.deposit;
  return {
    id: booking.id,
    status: booking.status,
    table: { id: table.id, number: table.number, name: table.name, seats: table.seats, price: table.price, deposit: table.deposit, currency: table.currency.trim() },
    order: { amount: booking.order.amount, currency: booking.order.currency.trim(), paymentStatus: booking.order.paymentStatus },
    deposit: deposit ? { amount: deposit.amount, currency: deposit.currency.trim(), status: deposit.status, terms: deposit.terms } : null,
  };
}

function eventParticipation(eventStatus: EventStatus, tickets: GuestTicket[], bookings: GuestBooking[], isPast: boolean): GuestParticipationStatus {
  if (eventStatus === EventStatus.cancelled || tickets.some(({ status }) => status === "cancelled" || status === "refunded") || bookings.some(({ status }) => status === "cancelled")) return "cancelled";
  if (tickets.some(({ status }) => status === "used")) return "attended";
  if (isPast && tickets.some(({ status }) => status === "active" || status === "paid")) return "no_show";
  return "registered";
}

function ticketParticipation(status: TicketStatus, isPast: boolean, usedAt: string | null): GuestParticipationStatus {
  if (status === "cancelled" || status === "refunded") return "cancelled";
  if (status === "used" || usedAt) return "attended";
  if (isPast && (status === "active" || status === "paid")) return "no_show";
  return "registered";
}

function dateString(value: Date): string { return value.toISOString().slice(0, 10); }
function timeString(value: Date): string { return value.toISOString().slice(11, 16); }
