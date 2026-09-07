import { EventStatus, TicketStatus, type Prisma, type PrismaClient } from "@event-platform/database";
import type {
  EventCategory,
  EventPaymentMode,
  OrganizerEventPreview,
  PublicEvent,
  PublicEventList,
  PublicEventSummary,
  PublicSaleStatus,
} from "@event-platform/shared-types";
import { zonedInputToIso } from "@event-platform/shared-types";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { TablesService } from "../tables/tables.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";

@Injectable()
export class PublicEventsService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(TicketTypesService) private readonly ticketTypes: TicketTypesService,
    @Inject(TablesService) private readonly tables: TablesService,
  ) {}

  async list(query: {
    page: number;
    limit: number;
    sort: "recent" | "popular";
    search?: string;
    from?: string;
    to?: string;
    city?: string;
    category?: EventCategory;
    datePreset?: "today" | "weekend";
    paymentMode?: EventPaymentMode;
    free?: boolean;
  }, now = new Date()): Promise<PublicEventList> {
    if (query.free === true && query.paymentMode === "deposit") {
      throw new BadRequestException({
        code: "EVENT_FILTER_COMBINATION_INVALID",
        message: "Free events cannot use deposit payment mode",
      });
    }
    validateDateRange(query.from, query.to);
    const where: Prisma.EventWhereInput = { status: EventStatus.published };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { announcement: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { venueName: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ];
    }
    if (query.city?.trim()) where.city = { contains: query.city.trim(), mode: "insensitive" };
    if (query.category) where.category = query.category;
    if (query.paymentMode) where.paymentMode = query.paymentMode;
    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: dateAtUtcStart(query.from) } : {}),
        ...(query.to ? { lte: dateAtUtcEnd(query.to) } : {}),
      };
    }

    const events = await this.database.event.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 500,
      include: {
        organizer: { select: { name: true, photoUrl: true } },
        ticketTypes: {
          select: {
            tickets: {
              where: { status: { in: [TicketStatus.paid, TicketStatus.active, TicketStatus.used] } },
              select: { id: true },
            },
          },
        },
      },
    });

    let summaries = await Promise.all(events.map((event) => this.toSummary(event, now)));
    if (!query.from && !query.to && query.datePreset) {
      summaries = summaries.filter((summary) => matchesDatePreset(summary, query.datePreset!, now));
    }
    if (query.free === true) summaries = summaries.filter((summary) => summary.startingAmount === 0);
    if (query.sort === "popular") {
      summaries.sort((left, right) => {
        const popularity = right.popularity - left.popularity;
        return popularity || right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id);
      });
    }
    const skip = (query.page - 1) * query.limit;
    const items = summaries.slice(skip, skip + query.limit).map(({ popularity: _popularity, publishedAt: _publishedAt, ...summary }) => summary);
    return { items, page: query.page, limit: query.limit, total: summaries.length, hasNext: skip + items.length < summaries.length };
  }

  async summary(id: string, now = new Date()): Promise<PublicEventSummary | null> {
    const event = await this.database.event.findFirst({
      where: { id, status: EventStatus.published },
      include: {
        organizer: { select: { name: true, photoUrl: true } },
        ticketTypes: {
          select: {
            tickets: {
              where: { status: { in: [TicketStatus.paid, TicketStatus.active, TicketStatus.used] } },
              select: { id: true },
            },
          },
        },
      },
    });
    return event ? this.toSummary(event, now).then(({ popularity: _popularity, publishedAt: _publishedAt, ...summary }) => summary) : null;
  }

  async get(id: string, now = new Date()): Promise<PublicEvent> {
    const event = await this.database.event.findFirst({
      where: { id, status: EventStatus.published },
      include: { organizer: { select: { name: true, photoUrl: true } } },
    });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    return this.serialize(event, now, false);
  }

  async preview(
    organizerId: string,
    id: string,
    now = new Date(),
    isAdmin = false,
  ): Promise<OrganizerEventPreview> {
    const event = await this.database.event.findFirst({
      where: isAdmin ? { id } : { id, organizerId },
      include: { organizer: { select: { name: true, photoUrl: true } } },
    });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    return { ...(await this.serialize(event, now, true)), status: event.status };
  }

  private async serialize(
    event: Prisma.EventGetPayload<{ include: { organizer: { select: { name: true; photoUrl: true } } } }>,
    now: Date,
    includeUnpublished: boolean,
  ): Promise<PublicEvent> {
    const date = event.date.toISOString().slice(0, 10);
    const time = event.time.toISOString().slice(11, 16);
    const [ticketTypes, tables] = await Promise.all([
      this.ticketTypes.publicForEvent(event.id, now, includeUnpublished),
      this.tables.publicForEvent(event.id, includeUnpublished),
    ]);
    return {
      id: event.id,
      title: event.title,
      category: event.category,
      city: event.city,
      posterUrl: event.posterUrl,
      announcement: event.announcement,
      description: event.description,
      program: event.program,
      rules: event.rules,
      visitTerms: event.visitTerms,
      cancellationTerms: event.cancellationTerms,
      paymentMode: event.paymentMode,
      showFullAmountForDeposit: event.showFullAmountForDeposit,
      depositTerms: event.depositTerms,
      extraConditions: event.extraConditions,
      date,
      time,
      timezone: event.timezone,
      startsAt: zonedInputToIso(`${date}T${time}`, event.timezone),
      venueName: event.venueName,
      address: event.address,
      ticketTypes,
      tables,
      organizer: { name: event.organizer.name, photoUrl: event.organizer.photoUrl, contact: null },
    };
  }

  private async toSummary(event: {
    id: string;
    title: string;
    category: "music" | "nightlife" | "festival" | "comedy" | "theatre" | "business" | "education" | "workshop" | "sport" | "family" | "food" | "other";
    city: string;
    posterUrl: string | null;
    announcement: string | null;
    date: Date;
    time: Date;
    timezone: string;
    venueName: string;
    address: string;
    paymentMode: "deposit" | "full_payment";
    publishedAt: Date | null;
    updatedAt: Date;
    organizer: { name: string | null; photoUrl: string | null };
    ticketTypes: Array<{ tickets: Array<{ id: string }> }>;
  }, now = new Date()): Promise<PublicEventSummary & { popularity: number; publishedAt: string }> {
    const date = formatDate(event.date);
    const time = formatTime(event.time);
    const [ticketTypes, tables] = await Promise.all([
      this.ticketTypes.publicForEvent(event.id, now),
      this.tables.publicForEvent(event.id),
    ]);
    const options = [
      ...ticketTypes.map((ticket) => ({ amount: ticket.payment.amountDue, fullAmount: ticket.payment.fullAmount, currency: ticket.payment.currency })),
      ...tables.map((table) => ({ amount: table.payment.amountDue, fullAmount: table.payment.fullAmount, currency: table.payment.currency })),
    ].sort((left, right) => left.amount - right.amount);
    return {
      id: event.id,
      title: event.title,
      category: event.category,
      city: event.city,
      posterUrl: event.posterUrl,
      announcement: event.announcement,
      date,
      time,
      timezone: event.timezone,
      startsAt: zonedInputToIso(`${date}T${time}`, event.timezone),
      venueName: event.venueName,
      address: event.address,
      paymentMode: event.paymentMode,
      paymentLabel: event.paymentMode,
      startingAmount: options[0]?.amount ?? null,
      startingFullAmount: options[0]?.fullAmount ?? null,
      startingCurrency: options[0]?.currency ?? null,
      remainingTickets: ticketTypes.reduce((sum, ticket) => sum + ticket.remaining, 0),
      remainingTables: tables.filter((table) => table.availability === "available").length,
      saleStatus: saleStatus(ticketTypes, tables, now),
      organizer: { name: event.organizer.name, photoUrl: event.organizer.photoUrl },
      popularity: event.ticketTypes.reduce((sum, type) => sum + type.tickets.length, 0),
      publishedAt: (event.publishedAt ?? event.updatedAt).toISOString(),
    };
  }
}

function saleStatus(
  ticketTypes: Array<{ remaining: number; salesStartAt: string | null; salesEndAt: string | null }>,
  tables: Array<{ availability: string }>,
  now: Date,
): PublicSaleStatus {
  const remaining = ticketTypes.reduce((sum, ticket) => sum + ticket.remaining, 0)
    + tables.filter((table) => table.availability === "available").length;
  if (remaining > 0) return remaining <= 5 ? "few_left" : "available";
  const hasFutureSales = ticketTypes.some((ticket) => ticket.salesStartAt && new Date(ticket.salesStartAt) > now);
  if (hasFutureSales) return "sales_not_started";
  const hasSalesWindows = ticketTypes.length > 0;
  const allSalesEnded = hasSalesWindows && ticketTypes.every((ticket) => ticket.salesEndAt && new Date(ticket.salesEndAt) <= now);
  return allSalesEnded ? "sales_ended" : "sold_out";
}

function matchesDatePreset(summary: PublicEventSummary, preset: "today" | "weekend", now: Date): boolean {
  const eventLocalDate = summary.date;
  const today = localDate(now, summary.timezone);
  if (preset === "today") return eventLocalDate === today;
  return ["Sat", "Sun"].includes(localWeekday(eventLocalDate, summary.timezone));
}

function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function localWeekday(date: string, timezone: string): string {
  // Interpret the date in the event's timezone before asking Intl for its weekday.
  // Using a UTC noon here changes the calendar day for positive/negative offsets.
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date(zonedInputToIso(`${date}T12:00`, timezone)));
  } catch {
    return "";
  }
}

function formatDate(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`;
}

function formatTime(value: Date): string {
  return `${value.getUTCHours().toString().padStart(2, "0")}:${value.getUTCMinutes().toString().padStart(2, "0")}`;
}

function dateAtUtcStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateAtUtcEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function validateDateRange(from: string | undefined, to: string | undefined): void {
  for (const value of [from, to]) {
    if (!value) continue;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException({ code: "EVENT_DATE_FILTER_INVALID", message: "Date filters are invalid" });
    }
  }
  if (from && to && from > to) {
    throw new BadRequestException({ code: "EVENT_DATE_FILTER_RANGE_INVALID", message: "The start date must not be after the end date" });
  }
}
