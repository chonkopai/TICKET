import { EventStatus, TicketStatus, type Prisma, type PrismaClient } from "@event-platform/database";
import type {
  EventCategory,
  EventLocale,
  EventPaymentMode,
  OrganizerEventPreview,
  PublicEvent,
  PublicEventList,
  PublicEventSummary,
  PublicSaleStatus,
} from "@event-platform/shared-types";
import { EVENT_LOCALES, zonedInputToIso } from "@event-platform/shared-types";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { TablesService } from "../tables/tables.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { eventContent, eventContentHash } from "../events/event-translation-content.js";

function normalizeLocale(value: string | undefined): EventLocale {
  return EVENT_LOCALES.find((locale) => locale === value) ?? "ru";
}

const LOCALIZED_CITIES: Record<string, Partial<Record<EventLocale, string>>> = {
  "Алматы": { kk: "Алматы", en: "Almaty" },
  "Астана": { kk: "Астана", en: "Astana" },
  "Шымкент": { kk: "Шымкент", en: "Shymkent" },
  "Туркестан": { kk: "Түркістан", en: "Turkestan" },
  "Караганда": { kk: "Қарағанды", en: "Karaganda" },
  "Москва": { kk: "Мәскеу", en: "Moscow" },
  "Ташкент": { kk: "Ташкент", en: "Tashkent" },
};

function localizedCity(city: string, locale: EventLocale): string {
  return LOCALIZED_CITIES[city]?.[locale] ?? city;
}

const LOCALIZED_TICKET_NAMES: Record<string, Partial<Record<EventLocale, string>>> = {
  "Стандарт": { kk: "Стандарт", en: "Standard" },
  "Стандартный билет": { kk: "Стандарт билет", en: "Standard ticket" },
  "Вход": { kk: "Кіру", en: "Entry" },
  "Входной билет": { kk: "Кіру билеті", en: "Admission" },
  "Вход на день": { kk: "Бір күндік билет", en: "Day pass" },
  "VIP-зона": { kk: "VIP аймағы", en: "VIP area" },
  "Лаунж и VIP-зона": { kk: "Лаунж және VIP аймағы", en: "Lounge & VIP" },
  "Участник": { kk: "Қатысушы", en: "Participant" },
  "Студент": { kk: "Студент", en: "Student" },
  "Пара": { kk: "Жұптық билет", en: "Pair ticket" },
  "Парный билет": { kk: "Жұптық билет", en: "Pair ticket" },
  "Партер": { kk: "Партер", en: "Floor" },
  "Балкон": { kk: "Балкон", en: "Balcony" },
  "Взрослый": { kk: "Ересек", en: "Adult" },
  "Детский": { kk: "Балалар билеті", en: "Child" },
  "Обычный билет": { kk: "Қалыпты билет", en: "General admission" },
  "Стартовый пакет": { kk: "Старттық жинақ", en: "Starter pack" },
  "Конференция": { kk: "Конференция", en: "Conference" },
  "Утренний поток": { kk: "Таңғы топ", en: "Morning session" },
  "Дневной поток": { kk: "Күндізгі топ", en: "Afternoon session" },
  "Корпоративное приглашение": { kk: "Корпоративтік шақыру", en: "Corporate invitation" },
  "Семейный": { kk: "Отбасылық", en: "Family" },
  "Тихий сеанс": { kk: "Тыныш сеанс", en: "Quiet session" },
  "Мастер-класс": { kk: "Шеберлік сабағы", en: "Workshop pass" },
  "Семейный билет": { kk: "Отбасылық билет", en: "Family pass" },
  "Фан-зона": { kk: "Жанкүйер аймағы", en: "Fan zone" },
  "Гастрономия": { kk: "Ас аймағы", en: "Food court" },
  "Семейные мастерские": { kk: "Отбасылық шеберханалар", en: "Family workshops" },
  "Танцевальная площадка": { kk: "Би алаңы", en: "Dance floor" },
};

function localizedTicketTypes<T extends PublicEvent["ticketTypes"]>(ticketTypes: T, locale: EventLocale): T {
  if (locale === "ru") return ticketTypes;
  return ticketTypes.map((ticket) => {
    const seat = ticket.name.match(/^Место (\d+)$/);
    const name = seat
      ? locale === "en" ? `Seat ${seat[1]}` : `${seat[1]}-орын`
      : LOCALIZED_TICKET_NAMES[ticket.name]?.[locale] ?? ticket.name;
    return { ...ticket, name };
  }) as T;
}

const LOCALIZED_TABLE_NAMES: Record<string, Partial<Record<EventLocale, string>>> = {
  "Стол у сцены": { kk: "Сахна жанындағы үстел", en: "Stage-side table" },
  "Общий стол": { kk: "Ортақ үстел", en: "Community table" },
  "Мастера керамики": { kk: "Керамика шеберлері", en: "Ceramics makers" },
  "Текстиль и вышивка": { kk: "Тоқыма және кесте", en: "Textiles & embroidery" },
  "Дерево и орнамент": { kk: "Ағаш пен өрнек", en: "Woodwork & ornament" },
};

function localizedTableLabel(value: string, locale: EventLocale): string {
  if (locale === "ru") return value;
  const tableNumber = value.match(/^Стол (\d+)$/);
  if (tableNumber) return locale === "en" ? `Table ${tableNumber[1]}` : `${tableNumber[1]}-үстел`;
  const seatNumber = value.match(/^Место (\d+)$/);
  if (seatNumber) return locale === "en" ? `Seat ${seatNumber[1]}` : `${seatNumber[1]}-орын`;
  return LOCALIZED_TABLE_NAMES[value]?.[locale] ?? value;
}

function localizedTables<T extends PublicEvent["tables"]>(tables: T, locale: EventLocale): T {
  if (locale === "ru") return tables;
  return tables.map((table) => ({
    ...table,
    name: table.name ? localizedTableLabel(table.name, locale) : null,
    seatsDetail: table.seatsDetail.map((seat) => ({ ...seat, label: localizedTableLabel(seat.label, locale) })),
  })) as T;
}

function localizedFields(translation: {
  title: string; venueName: string; address: string; announcement: string | null;
  description: string | null; program: string | null; rules: string | null;
  visitTerms: string | null; cancellationTerms: string | null; depositTerms: string | null;
  extraConditions: string | null;
}) {
  return {
    title: translation.title, venueName: translation.venueName, address: translation.address,
    announcement: translation.announcement, description: translation.description,
    program: translation.program, rules: translation.rules, visitTerms: translation.visitTerms,
    cancellationTerms: translation.cancellationTerms, depositTerms: translation.depositTerms,
    extraConditions: translation.extraConditions,
  };
}

@Injectable()
export class PublicEventsService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(TicketTypesService) private readonly ticketTypes: TicketTypesService,
    @Inject(TablesService) private readonly tables: TablesService,
  ) {}

  async locations(): Promise<Array<{ countryCode: string; cities: string[] }>> {
    const rows = await this.database.event.findMany({
      where: { status: EventStatus.published },
      select: { countryCode: true, city: true },
      distinct: ["countryCode", "city"],
    });
    const groups = new Map<string, Set<string>>();
    for (const row of rows) {
      const cities = groups.get(row.countryCode) ?? new Set<string>();
      cities.add(row.city);
      groups.set(row.countryCode, cities);
    }
    return [...groups].map(([countryCode, cities]) => ({ countryCode, cities: [...cities].sort() }));
  }

  async list(query: {
    locale?: EventLocale;
    page: number;
    limit: number;
    sort: "recent" | "popular";
    search?: string;
    from?: string;
    to?: string;
    city?: string;
    countryCode?: string;
    category?: EventCategory;
    datePreset?: "today" | "weekend";
    paymentMode?: EventPaymentMode;
    free?: boolean;
    minPrice?: number;
    maxPrice?: number;
  }, now = new Date()): Promise<PublicEventList> {
    if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
      throw new BadRequestException({ code: "EVENT_PRICE_RANGE_INVALID", message: "Minimum price must not exceed maximum price" });
    }
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
        { translations: { some: { locale: query.locale ?? "ru", OR: [
          { title: { contains: search, mode: "insensitive" } },
          { announcement: { contains: search, mode: "insensitive" } },
          { venueName: { contains: search, mode: "insensitive" } },
          { address: { contains: search, mode: "insensitive" } },
        ] } } },
      ];
    }
    if (query.city?.trim()) where.city = { contains: query.city.trim(), mode: "insensitive" };
    if (query.countryCode) where.countryCode = query.countryCode;
    if (query.category) where.category = query.category;
    if (query.paymentMode) where.paymentMode = query.paymentMode;
    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: dateAtUtcStart(query.from) } : {}),
        ...(query.to ? { lte: dateAtUtcEnd(query.to) } : {}),
      };
    }

    // The common recent listing can be paged in SQL. Do this before the costly
    // inventory presenter so later pages are not silently lost after 500 events.
    if (!search && query.sort === "recent" && query.free !== true && query.minPrice === undefined && query.maxPrice === undefined && (!query.datePreset || query.from || query.to)) {
      const [total, pageEvents] = await Promise.all([
        this.database.event.count({ where }),
        this.database.event.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            organizer: { select: { name: true, photoUrl: true } },
            ticketTypes: { where: { isInternal: false }, select: { tickets: { where: { status: { in: [TicketStatus.paid, TicketStatus.active, TicketStatus.used] } }, select: { id: true } } } },
          },
        }),
      ]);
      const items = (await Promise.all(pageEvents.map(event => this.toSummary(event, now)))).map(({ popularity: _popularity, publishedAt: _publishedAt, ...summary }) => summary);
      return { items: await this.localizeSummaries(items, query.locale), page: query.page, limit: query.limit, total, hasNext: query.page * query.limit < total };
    }

    // These modes need live inventory or event-local date evaluation before
    // sorting/filtering. Scan in bounded chunks; never silently truncate totals.
    const candidateCount = await this.database.event.count({ where });
    let summaries: Array<PublicEventSummary & { popularity: number; publishedAt: string }> = [];
    for (let skip = 0; skip < candidateCount; skip += 100) {
      const events = await this.database.event.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: 100,
        include: {
          organizer: { select: { name: true, photoUrl: true } },
          ticketTypes: { where: { isInternal: false }, select: { tickets: { where: { status: { in: [TicketStatus.paid, TicketStatus.active, TicketStatus.used] } }, select: { id: true } } } },
        },
      });
      for (let index = 0; index < events.length; index += 20) {
        summaries.push(...await Promise.all(events.slice(index, index + 20).map(event => this.toSummary(event, now))));
      }
    }
    if (!query.from && !query.to && query.datePreset) {
      summaries = summaries.filter((summary) => matchesDatePreset(summary, query.datePreset!, now));
    }
    if (query.free === true) summaries = summaries.filter((summary) => summary.startingPrices.some((price) => price.amount === 0));
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      summaries = summaries.filter((summary) => summary.startingPrices.some((price) =>
        price.currency === "KZT" &&
        (query.minPrice === undefined || price.amount >= query.minPrice * 100) &&
        (query.maxPrice === undefined || price.amount <= query.maxPrice * 100),
      ));
    }
    // Search must match the text that the visitor will actually see. A stale
    // machine translation can still exist in the database for organizer review,
    // but it must not make an unrelated fallback result appear in search.
    if (search) {
      const localized = await this.localizeSummaries(summaries, query.locale);
      const needle = search.toLocaleLowerCase();
      const visibleIds = new Set(localized.filter((item) =>
        [item.title, item.announcement, item.venueName, item.address, item.city]
          .some((value) => value?.toLocaleLowerCase().includes(needle)),
      ).map((item) => item.id));
      summaries = summaries.filter((item) => visibleIds.has(item.id));
    }
    if (query.sort === "popular") {
      summaries.sort((left, right) => {
        const popularity = right.popularity - left.popularity;
        return popularity || right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id);
      });
    }
    const skip = (query.page - 1) * query.limit;
    const items = summaries.slice(skip, skip + query.limit).map(({ popularity: _popularity, publishedAt: _publishedAt, ...summary }) => summary);
    return { items: await this.localizeSummaries(items, query.locale), page: query.page, limit: query.limit, total: summaries.length, hasNext: skip + items.length < summaries.length };
  }

  async summary(id: string, now = new Date(), locale?: string): Promise<PublicEventSummary | null> {
    const event = await this.database.event.findFirst({
      where: { id, status: EventStatus.published },
      include: {
        organizer: { select: { name: true, photoUrl: true } },
        ticketTypes: {
          where: { isInternal: false },
          select: {
            tickets: {
              where: { status: { in: [TicketStatus.paid, TicketStatus.active, TicketStatus.used] } },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!event) return null;
    const { popularity: _popularity, publishedAt: _publishedAt, ...summary } = await this.toSummary(event, now);
    return (await this.localizeSummaries([summary], locale))[0] ?? null;
  }

  async get(id: string, now = new Date(), locale?: string): Promise<PublicEvent> {
    const event = await this.database.event.findFirst({
      where: { id, status: EventStatus.published },
      include: { organizer: { select: { name: true, photoUrl: true, email: true, phone: true, organizerProfile: { select: { organizationName: true, address: true, showContactInfo: true } } } } },
    });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    const serialized = await this.serialize(event, now, false);
    const requested = normalizeLocale(locale);
    const candidate = requested === event.sourceLocale ? null : await this.database.eventTranslation.findUnique({
      where: { eventId_locale: { eventId: id, locale: requested } },
    });
    const translation = candidate && (candidate.origin === "manual" || candidate.sourceHash === eventContentHash(eventContent(event))) ? candidate : null;
    return {
      ...serialized,
      ...(translation ? localizedFields(translation) : {}),
      city: localizedCity(event.city, requested),
      ticketTypes: localizedTicketTypes(serialized.ticketTypes, requested),
      tables: localizedTables(serialized.tables, requested),
      contentLocale: translation ? requested : event.sourceLocale as EventLocale,
      sourceLocale: event.sourceLocale as EventLocale,
    };
  }

  private async localizeSummaries(items: PublicEventSummary[], locale?: string): Promise<PublicEventSummary[]> {
    if (!items.length) return items;
    const requested = normalizeLocale(locale);
    const ids = items.map((item) => item.id);
    const [events, translations] = await Promise.all([
      this.database.event.findMany({ where: { id: { in: ids } } }),
      this.database.eventTranslation.findMany({ where: { eventId: { in: ids }, locale: requested } }),
    ]);
    const sources = new Map(events.map((event) => [event.id, event]));
    const localized = new Map(translations.map((translation) => [translation.eventId, translation]));
    return items.map((item) => {
      const source = sources.get(item.id);
      const sourceLocale = source?.sourceLocale as EventLocale | undefined ?? "ru";
      const candidate = requested === sourceLocale ? null : localized.get(item.id);
      const translation = candidate && source && (candidate.origin === "manual" || candidate.sourceHash === eventContentHash(eventContent(source))) ? candidate : null;
      return {
        ...item,
        ...(translation ? { title: translation.title, announcement: translation.announcement, venueName: translation.venueName, address: translation.address } : {}),
        city: localizedCity(item.city, requested),
        contentLocale: translation ? requested : sourceLocale,
        sourceLocale,
      };
    });
  }

  async preview(
    organizerId: string,
    id: string,
    now = new Date(),
    isAdmin = false,
    locale?: string,
  ): Promise<OrganizerEventPreview> {
    const event = await this.database.event.findFirst({
      where: isAdmin ? { id } : { id, organizerId },
      include: { organizer: { select: { name: true, photoUrl: true, email: true, phone: true, organizerProfile: { select: { organizationName: true, address: true, showContactInfo: true } } } } },
    });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    const serialized = await this.serialize(event, now, true);
    const requested = normalizeLocale(locale);
    const candidate = requested === event.sourceLocale ? null : await this.database.eventTranslation.findUnique({
      where: { eventId_locale: { eventId: id, locale: requested } },
    });
    const translation = candidate && (candidate.origin === "manual" || candidate.sourceHash === eventContentHash(eventContent(event))) ? candidate : null;
    return {
      ...serialized,
      ...(translation ? localizedFields(translation) : {}),
      city: localizedCity(event.city, requested),
      ticketTypes: localizedTicketTypes(serialized.ticketTypes, requested),
      tables: localizedTables(serialized.tables, requested),
      contentLocale: translation ? requested : event.sourceLocale as EventLocale,
      sourceLocale: event.sourceLocale as EventLocale,
      status: event.status,
    };
  }

  private async serialize(
    event: Prisma.EventGetPayload<{ include: { organizer: { select: { name: true; photoUrl: true; email: true; phone: true; organizerProfile: { select: { organizationName: true; address: true; showContactInfo: true } } } } } }>,
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
      countryCode: event.countryCode,
      posterUrl: event.posterUrl,
      galleryUrls: event.galleryUrls,
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
      ageRestriction: event.ageRestriction as PublicEvent["ageRestriction"],
      startsAt: zonedInputToIso(`${date}T${time}`, event.timezone),
      venueName: event.venueName,
      address: event.address,
      ticketTypes,
      tables,
      organizer: {
        name: event.organizer.organizerProfile?.organizationName ?? event.organizer.name,
        personName: event.organizer.organizerProfile?.showContactInfo ? event.organizer.name : null,
        photoUrl: event.organizer.organizerProfile?.showContactInfo ? event.organizer.photoUrl : null,
        contact: event.organizer.organizerProfile?.showContactInfo
          ? [event.organizer.phone, event.organizer.email, event.organizer.organizerProfile.address].filter(Boolean).join(" · ") || null
          : null,
      },
    };
  }

  private async toSummary(event: {
    id: string;
    title: string;
    category: "music" | "nightlife" | "festival" | "comedy" | "theatre" | "business" | "education" | "workshop" | "sport" | "family" | "food" | "other";
    countryCode: string;
    city: string;
    posterUrl: string | null;
    announcement: string | null;
    date: Date;
    time: Date;
    timezone: string;
    ageRestriction: number;
    venueName: string;
    address: string;
    paymentMode: "deposit" | "full_payment";
    showFullAmountForDeposit: boolean;
    publishedAt: Date | null;
    updatedAt: Date;
    organizer: { name: string | null; photoUrl: string | null };
    ticketTypes: Array<{ tickets: Array<{ id: string }> }>;
  }, now = new Date()): Promise<PublicEventSummary & { popularity: number; publishedAt: string }> {
    const date = formatDate(event.date);
    const time = formatTime(event.time);
    const [ticketTypes, tables, seatCandidates, activeTicketHolds, activeSeatHolds, activeTableHolds] = await Promise.all([
      this.ticketTypes.publicForEvent(event.id, now),
      this.tables.publicForEvent(event.id),
      this.database.seat.findMany({
        where: {
          venueLayout: { eventId: event.id },
          status: "available",
          ticketType: { status: "active", eventId: event.id },
          allocations: { none: { status: { in: ["active", "consumed"] } } },
          OR: [{ tableId: null }, { table: { saleMode: "per_seat" } }],
        },
        select: { ticketType: { select: { price: true, deposit: true, currency: true, salesStartAt: true, salesEndAt: true } } },
      }),
      this.database.ticketReservation.count({ where: { ticketType: { eventId: event.id, isInternal: false }, status: "active", expiresAt: { gt: now }, OR: [{ orderId: null }, { order: { paymentStatus: "pending" } }] } }),
      this.database.seatAllocation.count({ where: { seat: { venueLayout: { eventId: event.id }, status: "available" }, status: "active", order: { paymentStatus: "pending" } } }),
      this.database.table.count({ where: { venueLayout: { eventId: event.id }, saleMode: "whole_table", status: "held", holdExpiresAt: { gt: now } } }),
    ]);
    const seats = seatCandidates.filter((seat) => isInSalesWindow(seat.ticketType, now));
    const options = [
      ...ticketTypes.filter((ticket) => ticket.remaining > 0).map((ticket) => ({ amount: ticket.payment.amountDue, fullAmount: ticket.payment.fullAmount, currency: ticket.payment.currency, unit: "ticket" as const })),
      ...tables.filter((table) => table.availability === "available" && table.saleMode === "whole_table").map((table) => ({ amount: table.payment.amountDue, fullAmount: table.payment.fullAmount, currency: table.payment.currency, unit: "table" as const })),
      ...seats.map((seat) => ({
        amount: event.paymentMode === "deposit" ? seat.ticketType!.deposit : seat.ticketType!.price,
        fullAmount: event.paymentMode === "deposit" && !event.showFullAmountForDeposit ? null : seat.ticketType!.price,
        currency: seat.ticketType!.currency.trim(),
        unit: "seat" as const,
      })),
    ];
    const startingPrices = [...new Set(options.map((option) => option.currency))].sort().map((currency) =>
      options.filter((option) => option.currency === currency).sort((left, right) => left.amount - right.amount)[0]!,
    );
    const singleCurrency = startingPrices.length === 1 ? startingPrices[0] : null;
    return {
      id: event.id,
      title: event.title,
      category: event.category,
      city: event.city,
      countryCode: event.countryCode,
      posterUrl: event.posterUrl,
      announcement: event.announcement,
      date,
      time,
      timezone: event.timezone,
      ageRestriction: event.ageRestriction as PublicEventSummary["ageRestriction"],
      startsAt: zonedInputToIso(`${date}T${time}`, event.timezone),
      venueName: event.venueName,
      address: event.address,
      paymentMode: event.paymentMode,
      paymentLabel: event.paymentMode,
      startingAmount: singleCurrency?.amount ?? null,
      startingFullAmount: singleCurrency?.fullAmount ?? null,
      startingCurrency: singleCurrency?.currency ?? null,
      startingUnit: singleCurrency?.unit ?? null,
      startingPrices,
      remainingTickets: ticketTypes.reduce((sum, ticket) => sum + ticket.remaining, 0),
      remainingTables: tables.filter((table) => table.availability === "available" && table.saleMode === "whole_table").length,
      remainingSeats: seats.length,
      saleStatus: saleStatus(ticketTypes, tables, seats.length, seatCandidates.length > seats.length && seatCandidates.some((seat) => seat.ticketType?.salesStartAt && seat.ticketType.salesStartAt > now), seatCandidates.length > seats.length && seatCandidates.every((seat) => seat.ticketType?.salesEndAt && seat.ticketType.salesEndAt <= now), activeTicketHolds + activeSeatHolds + activeTableHolds > 0, now),
      organizer: { name: event.organizer.name, photoUrl: event.organizer.photoUrl },
      popularity: event.ticketTypes.reduce((sum, type) => sum + type.tickets.length, 0),
      publishedAt: (event.publishedAt ?? event.updatedAt).toISOString(),
    };
  }
}

function saleStatus(
  ticketTypes: Array<{ remaining: number; salesStartAt: string | null; salesEndAt: string | null }>,
  tables: Array<{ availability: string; saleMode: string }>,
  remainingSeats: number,
  futureSeats: boolean,
  endedSeats: boolean,
  hasActiveHolds: boolean,
  now: Date,
): PublicSaleStatus {
  const remaining = ticketTypes.reduce((sum, ticket) => sum + ticket.remaining, 0)
    + tables.filter((table) => table.availability === "available" && table.saleMode === "whole_table").length + remainingSeats;
  if (remaining > 0) return remaining <= 5 ? "few_left" : "available";
  if (hasActiveHolds) return "temporarily_unavailable";
  const hasFutureSales = futureSeats || ticketTypes.some((ticket) => ticket.salesStartAt && new Date(ticket.salesStartAt) > now);
  if (hasFutureSales) return "sales_not_started";
  const hasSalesWindows = ticketTypes.length > 0;
  const allSalesEnded = hasSalesWindows && ticketTypes.every((ticket) => ticket.salesEndAt && new Date(ticket.salesEndAt) <= now);
  return (allSalesEnded || (ticketTypes.length === 0 && endedSeats)) ? "sales_ended" : "sold_out";
}

function isInSalesWindow(ticketType: { salesStartAt: Date | null; salesEndAt: Date | null } | null, now: Date): boolean {
  return Boolean(ticketType && (!ticketType.salesStartAt || ticketType.salesStartAt <= now) && (!ticketType.salesEndAt || ticketType.salesEndAt > now));
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
