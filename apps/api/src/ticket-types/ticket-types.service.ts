import { randomBytes } from "node:crypto";

import {
  Prisma,
  EventPaymentMode,
  TicketReservationStatus,
  TicketStatus,
  TicketTypeStatus,
  type PrismaClient,
  type TicketType,
} from "@event-platform/database";
import type {
  CreateTicketTypeRequest,
  DeleteTicketTypeResponse,
  InventoryReservation,
  OrganizerTicketType,
  OrganizerTicketTypeList,
  PublicTicketType,
  TicketTypeCounters,
  UpdateTicketTypeRequest,
} from "@event-platform/shared-types";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { presentTicketType } from "./ticket-types.presenter.js";

const SOLD_STATUSES: TicketStatus[] = [TicketStatus.paid, TicketStatus.active, TicketStatus.used];

@Injectable()
export class TicketTypesService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
  ) {}

  async create(
    organizerId: string,
    eventId: string,
    input: CreateTicketTypeRequest,
  ): Promise<OrganizerTicketType> {
    validateSalesWindow(input.salesStartAt, input.salesEndAt);
    try {
      const created = await this.database.$transaction(async (transaction) => {
        const event = await this.requireOwnedEvent(transaction, organizerId, eventId);
        assertDeposit(event, input.deposit ?? 0, input.price);
        const ticketType = await transaction.ticketType.create({
          data: {
            eventId,
            name: requiredName(input.name),
            price: input.price,
            deposit: input.deposit ?? 0,
            currency: normalizeCurrency(input.currency),
            quantityTotal: input.quantityTotal,
            description: nullableText(input.description),
            salesStartAt: optionalDate(input.salesStartAt),
            salesEndAt: optionalDate(input.salesEndAt),
            restrictions: nullableText(input.restrictions),
            status: input.status ?? TicketTypeStatus.draft,
          },
        });
        await this.recordMutation(transaction, organizerId, ticketType, "ticket_type.created", [
          "name",
          "price",
          "deposit",
          "currency",
          "quantityTotal",
          "description",
          "salesStartAt",
          "salesEndAt",
          "restrictions",
          "status",
        ]);
        return ticketType;
      });
      return presentTicketType(created, emptyCounters(created.quantityTotal));
    } catch (error) {
      throw mapUniqueNameError(error);
    }
  }

  async list(
    organizerId: string,
    eventId: string,
    query: { page: number; limit: number },
  ): Promise<OrganizerTicketTypeList> {
    await this.requireOwnedEvent(this.database, organizerId, eventId);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.database.$transaction([
      this.database.ticketType.findMany({
        where: { eventId, event: { organizerId } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit,
      }),
      this.database.ticketType.count({ where: { eventId, event: { organizerId } } }),
    ]);
    const counters = await this.countersFor(items);
    return {
      items: items.map((item) => presentTicketType(item, counters.get(item.id)!)),
      page: query.page,
      limit: query.limit,
      total,
      hasNext: skip + items.length < total,
    };
  }

  async get(organizerId: string, id: string): Promise<OrganizerTicketType> {
    const ticketType = await this.findOwned(this.database, organizerId, id);
    return presentTicketType(ticketType, (await this.countersFor([ticketType])).get(id)!);
  }

  async publicForEvent(eventId: string, now = new Date(), includeUnpublished = false): Promise<PublicTicketType[]> {
    const types = await this.database.ticketType.findMany({
      where: {
        eventId,
        status: { in: [TicketTypeStatus.active, TicketTypeStatus.sold_out] },
        ...(includeUnpublished ? {} : { event: { status: "published" } }),
      },
      orderBy: [{ price: "asc" }, { name: "asc" }],
      include: { event: true },
    });
    const counters = await this.countersFor(types);
    return types.map((type) => {
      const current = counters.get(type.id)!;
      const inWindow = (!type.salesStartAt || type.salesStartAt <= now) && (!type.salesEndAt || type.salesEndAt > now);
      return {
        id: type.id,
        name: type.name,
        price:
          type.event.paymentMode === EventPaymentMode.deposit &&
          !type.event.showFullAmountForDeposit
            ? null
            : type.price,
        deposit: type.deposit,
        currency: type.currency.trim(),
        description: type.description,
        restrictions: type.restrictions,
        salesStartAt: type.salesStartAt?.toISOString() ?? null,
        salesEndAt: type.salesEndAt?.toISOString() ?? null,
        remaining: inWindow ? current.remaining : 0,
        status: current.remaining > 0 && inWindow ? "active" : "sold_out",
        payment: paymentOption(type.event, type.price, type.deposit, type.currency.trim()),
      };
    });
  }

  async update(
    organizerId: string,
    id: string,
    input: UpdateTicketTypeRequest,
  ): Promise<OrganizerTicketType> {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({
        code: "TICKET_TYPE_UPDATE_EMPTY",
        message: "At least one ticket-type field is required",
      });
    }

    try {
      const updated = await this.database.$transaction(async (transaction) => {
        await lockTicketType(transaction, id);
        const current = await this.findOwned(transaction, organizerId, id);
        const data = updateData(input);
        const event = await transaction.event.findUniqueOrThrow({ where: { id: current.eventId } });
        assertDeposit(event, data.deposit ?? current.deposit, data.price ?? current.price);
        const nextStart = data.salesStartAt === undefined ? current.salesStartAt : data.salesStartAt;
        const nextEnd = data.salesEndAt === undefined ? current.salesEndAt : data.salesEndAt;
        validateDateWindow(nextStart, nextEnd);

        if (data.quantityTotal !== undefined) {
          const inventory = await authoritativeInventory(transaction, id, new Date());
          const committed = inventory.reserved + inventory.sold;
          if (data.quantityTotal < committed) {
            throw new ConflictException({
              code: "TICKET_TYPE_INVENTORY_CONFLICT",
              message: "Quantity cannot be lower than reserved and sold inventory",
              details: { committed },
            });
          }
        }

        const ticketType = await transaction.ticketType.update({ where: { id }, data });
        await this.recordMutation(
          transaction,
          organizerId,
          ticketType,
          "ticket_type.updated",
          Object.keys(input),
        );
        return ticketType;
      });
      return presentTicketType(updated, (await this.countersFor([updated])).get(id)!);
    } catch (error) {
      throw mapUniqueNameError(error);
    }
  }

  async delete(organizerId: string, id: string): Promise<DeleteTicketTypeResponse> {
    await this.database.$transaction(async (transaction) => {
      await lockTicketType(transaction, id);
      const ticketType = await this.findOwned(transaction, organizerId, id);
      const tickets = await transaction.ticket.count({ where: { ticketTypeId: id } });
      const reservations = await transaction.ticketReservation.count({ where: { ticketTypeId: id } });
      if (tickets + reservations > 0) {
        throw new ConflictException({
          code: "TICKET_TYPE_HAS_ACTIVITY",
          message: "A ticket type with tickets or reservations cannot be deleted",
        });
      }

      await transaction.ticketType.delete({ where: { id } });
      await this.recordMutation(
        transaction,
        organizerId,
        ticketType,
        "ticket_type.deleted",
        [],
      );
    });
    return { deleted: true, id };
  }

  async reserve(
    ticketTypeId: string,
    quantity: number,
    expiresAt: Date,
  ): Promise<InventoryReservation> {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new BadRequestException({ code: "RESERVATION_QUANTITY_INVALID", message: "Quantity must be positive" });
    }
    const now = new Date();
    if (expiresAt <= now) {
      throw new BadRequestException({ code: "RESERVATION_EXPIRY_INVALID", message: "Expiry must be in the future" });
    }

    const reservation = await this.database.$transaction((transaction) =>
      this.reserveInTransaction(transaction, ticketTypeId, quantity, expiresAt),
    );
    return {
      token: reservation.token,
      ticketTypeId: reservation.ticketTypeId,
      quantity: reservation.quantity,
      expiresAt: reservation.expiresAt.toISOString(),
    };
  }

  async reserveInTransaction(
    transaction: Prisma.TransactionClient,
    ticketTypeId: string,
    quantity: number,
    expiresAt: Date,
    orderId?: string,
    now = new Date(),
  ) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || expiresAt <= now) {
      throw new BadRequestException({ code: "RESERVATION_INVALID", message: "Reservation quantity and expiry are invalid" });
    }
    await lockTicketType(transaction, ticketTypeId);
    const ticketType = await transaction.ticketType.findUnique({ where: { id: ticketTypeId } });
    if (!ticketType) throw ticketTypeNotFound();
    assertOnSale(ticketType, now);
    const inventory = await authoritativeInventory(transaction, ticketTypeId, now);
    if (ticketType.quantityTotal - inventory.reserved - inventory.sold < quantity) {
      throw new ConflictException({ code: "INSUFFICIENT_INVENTORY", message: "Not enough tickets remain" });
    }
    const created = await transaction.ticketReservation.create({
      data: { ticketTypeId, orderId: orderId ?? null, token: opaqueToken(), quantity, expiresAt },
    });
    await this.domainEvents.append(transaction, {
      eventType: "ticket_inventory.reserved",
      aggregateType: "ticket_type",
      aggregateId: ticketTypeId,
      payload: { reservationId: created.id, orderId: orderId ?? null, quantity, expiresAt: expiresAt.toISOString() },
    });
    return created;
  }

  release(token: string): Promise<void> {
    return this.finishReservation(token, TicketReservationStatus.released);
  }

  consume(token: string): Promise<void> {
    return this.finishReservation(token, TicketReservationStatus.consumed);
  }

  async reconcile(id: string): Promise<{ stored: number; authoritative: number; matches: boolean }> {
    const ticketType = await this.database.ticketType.findUnique({ where: { id } });
    if (!ticketType) throw ticketTypeNotFound();
    const { sold } = await authoritativeInventory(this.database, id, new Date());
    return { stored: ticketType.quantitySold, authoritative: sold, matches: ticketType.quantitySold === sold };
  }

  private async finishReservation(
    token: string,
    status: "released" | "consumed",
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const current = await transaction.ticketReservation.findUnique({ where: { token } });
      if (!current) {
        throw new NotFoundException({ code: "RESERVATION_NOT_FOUND", message: "Reservation was not found" });
      }
      await lockTicketType(transaction, current.ticketTypeId);
      const changed = await transaction.ticketReservation.updateMany({
        where: { id: current.id, status: TicketReservationStatus.active },
        data: { status },
      });
      if (changed.count !== 1) {
        throw new ConflictException({ code: "RESERVATION_NOT_ACTIVE", message: "Reservation is no longer active" });
      }
      await this.domainEvents.append(transaction, {
        eventType: `ticket_inventory.${status}`,
        aggregateType: "ticket_type",
        aggregateId: current.ticketTypeId,
        payload: { reservationId: current.id, quantity: current.quantity },
      });
    });
  }

  private async countersFor(ticketTypes: TicketType[]): Promise<Map<string, TicketTypeCounters>> {
    const ids = ticketTypes.map(({ id }) => id);
    const result = new Map(ticketTypes.map((type) => [type.id, emptyCounters(type.quantityTotal)]));
    if (ids.length === 0) return result;
    const now = new Date();
    const [byStatus, paid, reservations] = await Promise.all([
      this.database.ticket.groupBy({
        by: ["ticketTypeId", "status"],
        where: { ticketTypeId: { in: ids } },
        _count: { _all: true },
      }),
      this.database.ticket.groupBy({
        by: ["ticketTypeId"],
        where: { ticketTypeId: { in: ids }, paidAt: { not: null } },
        _count: { _all: true },
      }),
      this.database.ticketReservation.groupBy({
        by: ["ticketTypeId"],
        where: { ticketTypeId: { in: ids }, status: TicketReservationStatus.active, expiresAt: { gt: now } },
        _sum: { quantity: true },
      }),
    ]);

    for (const row of byStatus) {
      const counters = result.get(row.ticketTypeId)!;
      counters.created += row._count._all;
      if (SOLD_STATUSES.includes(row.status)) counters.sold += row._count._all;
      if (row.status === TicketStatus.refunded) counters.refunded += row._count._all;
      if (row.status === TicketStatus.cancelled) counters.cancelled += row._count._all;
    }
    for (const row of paid) result.get(row.ticketTypeId)!.paid = row._count._all;
    for (const row of reservations) result.get(row.ticketTypeId)!.reserved = row._sum.quantity ?? 0;
    for (const counters of result.values()) {
      counters.remaining = Math.max(0, counters.total - counters.reserved - counters.sold);
    }
    return result;
  }

  private async findOwned(
    database: Pick<PrismaClient, "ticketType"> | Pick<Prisma.TransactionClient, "ticketType">,
    organizerId: string,
    id: string,
  ): Promise<TicketType> {
    const ticketType = await database.ticketType.findFirst({
      where: { id, event: { organizerId } },
    });
    if (!ticketType) throw ticketTypeNotFound();
    return ticketType;
  }

  private async requireOwnedEvent(
    database: Pick<PrismaClient, "event"> | Pick<Prisma.TransactionClient, "event">,
    organizerId: string,
    eventId: string,
  ) {
    const event = await database.event.findFirst({ where: { id: eventId, organizerId } });
    if (!event) {
      throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    }
    return event;
  }

  private async recordMutation(
    transaction: Pick<Prisma.TransactionClient, "auditLog" | "outboxEvent">,
    actorId: string,
    ticketType: TicketType,
    eventType: string,
    changedFields: string[],
  ): Promise<void> {
    await this.domainEvents.append(transaction, {
      eventType,
      aggregateType: "ticket_type",
      aggregateId: ticketType.id,
      payload: { eventId: ticketType.eventId, changedFields },
    });
    await transaction.auditLog.create({
      data: {
        actorId,
        action: eventType,
        entityType: "ticket_type",
        entityId: ticketType.id,
        meta: { eventId: ticketType.eventId, changedFields },
      },
    });
  }
}

async function lockTicketType(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${id}`}, 0))`;
}

async function authoritativeInventory(
  database: Pick<PrismaClient, "ticket" | "ticketReservation"> | Pick<Prisma.TransactionClient, "ticket" | "ticketReservation">,
  ticketTypeId: string,
  now: Date,
): Promise<{ reserved: number; sold: number }> {
  const sold = await database.ticket.count({ where: { ticketTypeId, status: { in: SOLD_STATUSES } } });
  const reserved = await database.ticketReservation.aggregate({
    where: { ticketTypeId, status: TicketReservationStatus.active, expiresAt: { gt: now } },
    _sum: { quantity: true },
  });
  return { sold, reserved: reserved._sum.quantity ?? 0 };
}

type TicketTypeUpdates = {
  name?: string;
  price?: number;
  deposit?: number;
  currency?: string;
  quantityTotal?: number;
  description?: string | null;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
  restrictions?: string | null;
  status?: TicketTypeStatus;
};

function updateData(input: UpdateTicketTypeRequest): TicketTypeUpdates {
  const data: TicketTypeUpdates = {};
  if (input.name !== undefined) data.name = requiredName(input.name);
  if (input.price !== undefined) data.price = input.price;
  if (input.deposit !== undefined) data.deposit = input.deposit;
  if (input.currency !== undefined) data.currency = normalizeCurrency(input.currency);
  if (input.quantityTotal !== undefined) data.quantityTotal = input.quantityTotal;
  if (input.description !== undefined) data.description = nullableText(input.description);
  if (input.salesStartAt !== undefined) data.salesStartAt = optionalDate(input.salesStartAt);
  if (input.salesEndAt !== undefined) data.salesEndAt = optionalDate(input.salesEndAt);
  if (input.restrictions !== undefined) data.restrictions = nullableText(input.restrictions);
  if (input.status !== undefined) data.status = input.status;
  return data;
}

function assertDeposit(
  event: { paymentMode: EventPaymentMode; showFullAmountForDeposit: boolean },
  deposit: number,
  price: number,
): void {
  if (event.paymentMode === EventPaymentMode.deposit && deposit <= 0) {
    throw new BadRequestException({
      code: "DEPOSIT_AMOUNT_REQUIRED",
      message: "A positive ticket deposit is required for deposit events",
    });
  }
  if (event.paymentMode === EventPaymentMode.deposit && event.showFullAmountForDeposit && price < deposit) {
    throw new BadRequestException({ code: "DEPOSIT_EXCEEDS_FULL_AMOUNT", message: "Deposit cannot exceed the displayed full ticket amount" });
  }
}

function paymentOption(
  event: { paymentMode: EventPaymentMode; showFullAmountForDeposit: boolean; depositTerms: string | null; cancellationTerms: string | null },
  price: number,
  deposit: number,
  currency: string,
) {
  const isDeposit = event.paymentMode === EventPaymentMode.deposit;
  return {
    mode: event.paymentMode,
    label: event.paymentMode,
    amountDue: isDeposit ? deposit : price,
    fullAmount: !isDeposit || event.showFullAmountForDeposit ? price : null,
    currency,
    depositTerms: event.depositTerms,
    cancellationTerms: event.cancellationTerms,
  };
}

function emptyCounters(total: number): TicketTypeCounters {
  return { total, created: 0, reserved: 0, sold: 0, paid: 0, remaining: total, refunded: 0, cancelled: 0 };
}

function requiredName(value: string): string {
  const name = value.trim();
  if (!name) throw new BadRequestException({ code: "TICKET_TYPE_NAME_REQUIRED", message: "Name cannot be blank" });
  return name;
}

function normalizeCurrency(value: string | undefined): string {
  return (value ?? "KZT").toUpperCase();
}

function nullableText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function optionalDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function validateSalesWindow(start: string | null | undefined, end: string | null | undefined): void {
  validateDateWindow(optionalDate(start), optionalDate(end));
}

function validateDateWindow(start: Date | null, end: Date | null): void {
  if (start && end && start >= end) {
    throw new BadRequestException({
      code: "TICKET_TYPE_SALES_WINDOW_INVALID",
      message: "Sales end must be later than sales start",
    });
  }
}

function assertOnSale(ticketType: TicketType, now: Date): void {
  const inWindow = (!ticketType.salesStartAt || ticketType.salesStartAt <= now)
    && (!ticketType.salesEndAt || ticketType.salesEndAt > now);
  if (ticketType.status !== TicketTypeStatus.active || !inWindow) {
    throw new ConflictException({ code: "TICKET_TYPE_NOT_ON_SALE", message: "Ticket type is not on sale" });
  }
}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function ticketTypeNotFound(): NotFoundException {
  return new NotFoundException({ code: "TICKET_TYPE_NOT_FOUND", message: "Ticket type was not found" });
}

function mapUniqueNameError(error: unknown): unknown {
  if ((error as { code?: string }).code === "P2002") {
    return new ConflictException({ code: "TICKET_TYPE_NAME_CONFLICT", message: "Ticket type name must be unique per event" });
  }
  return error;
}
