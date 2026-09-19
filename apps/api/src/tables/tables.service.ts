import { randomBytes, randomUUID } from "node:crypto";

import {
  BookingStatus,
  EventPaymentMode,
  EventStatus,
  Prisma,
  SeatAllocationStatus,
  TableHoldStatus,
  TableStatus,
  TicketStatus,
  type PrismaClient,
  type Table,
  type TableHold,
} from "@event-platform/database";
import {
  tableGeometrySchema,
  tableGeometryV2Schema,
  venueLayoutSchemaAny,
  type CreateTableRequest,
  type ReleaseTableHoldResponse,
  type PublicTable,
  type TableHoldResponse,
  type UpdateTableRequest,
  type VenueLayoutAny,
  type VenueTable,
} from "@event-platform/shared-types";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { assertLegacyLayout } from "../venue/hall-editor.persistence.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TABLES_CLOCK, TABLES_CONFIG, type Clock, type TablesConfig } from "./tables.constants.js";
import { presentTable } from "./tables.presenter.js";

type TableTransaction = Prisma.TransactionClient;

@Injectable()
export class TablesService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    @Inject(TABLES_CONFIG) private readonly config: TablesConfig,
    @Inject(TABLES_CLOCK) private readonly clock: Clock,
  ) {}

  async create(organizerId: string, layoutId: string, input: CreateTableRequest): Promise<VenueTable> {
    assertManagedStatus(input.status);
    const id = randomUUID();
    try {
      const table = await this.database.$transaction(async (transaction) => {
        await lockLayout(transaction, layoutId);
        const layout = await this.findOwnedLayout(transaction, organizerId, layoutId);
        assertLegacyLayout(layout.layoutJson);
        if (layout.eventId) {
          const event = await transaction.event.findUniqueOrThrow({ where: { id: layout.eventId } });
          // Keep the legacy whole-table creation contract usable for already-published events;
          // any numbered/per-seat structure must still be created while the event is a draft.
          if (event.status !== EventStatus.draft && input.saleMode !== undefined) throw new ConflictException({ code: "VENUE_STRUCTURE_DRAFT_ONLY", message: "Venue structure can only be changed while the event is a draft" });
          assertDeposit(event, input.deposit, input.price);
        }
        const currentJson = parseLayout(layout.layoutJson);
        if (currentJson.tables.length >= 500) throw layoutLimit();
        const nextGeometry = currentJson.version === 2
          ? tableGeometryV2Schema.parse({ tableId: id, ...input.geometry })
          : tableGeometrySchema.parse({ tableId: id, ...input.geometry });
        const nextJson = venueLayoutSchemaAny.parse({
          ...currentJson,
          tables: [...currentJson.tables, nextGeometry],
        });
        const created = await transaction.table.create({
          data: {
            id,
            venueLayoutId: layoutId,
            number: input.number,
            name: nullableText(input.name),
            seats: input.seats,
            price: input.price,
            deposit: input.deposit,
            currency: normalizeCurrency(input.currency),
            description: nullableText(input.description),
            typeLabel: nullableText(input.typeLabel),
            shortDescription: nullableText(input.shortDescription),
            saleMode: input.saleMode ?? "whole_table",
            status: input.status ?? TableStatus.available,
          },
        });
        await transaction.venueLayout.update({ where: { id: layoutId }, data: { layoutJson: nextJson, revision: { increment: 1 } } });
        await this.record(transaction, organizerId, created.id, "table.created", {
          layoutId,
          changedFields: ["number", "name", "seats", "price", "deposit", "currency", "description", "status", "geometry"],
        });
        return created;
      });
      return presentTable(table);
    } catch (error) {
      throw mapTableConstraint(error);
    }
  }

  async list(organizerId: string, layoutId: string, query: { page: number; limit: number }) {
    await this.findOwnedLayout(this.database, organizerId, layoutId);
    await this.expireLayoutHolds(layoutId);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.database.$transaction([
      this.database.table.findMany({ where: { venueLayoutId: layoutId }, orderBy: [{ number: "asc" }, { id: "asc" }], skip, take: query.limit }),
      this.database.table.count({ where: { venueLayoutId: layoutId } }),
    ]);
    return { items: items.map(presentTable), page: query.page, limit: query.limit, total, hasNext: skip + items.length < total };
  }

  async get(organizerId: string, id: string): Promise<VenueTable> {
    await this.expireTableIfDue(id);
    return presentTable(await this.findOwnedTable(this.database, organizerId, id));
  }

  async publicForEvent(eventId: string, includeUnpublished = false): Promise<PublicTable[]> {
    const layout = await this.database.venueLayout.findFirst({
      where: { eventId, ...(includeUnpublished ? {} : { event: { status: EventStatus.published } }) },
      include: { event: true },
    });
    if (!layout) return [];
    await this.expireLayoutHolds(layout.id);
    const tables = await this.database.table.findMany({ where: { venueLayoutId: layout.id }, include: { seatRecords: { include: { allocations: { where: { status: { in: ["active", "consumed"] } }, select: { id: true } } }, orderBy: { sortOrder: "asc" } } }, orderBy: [{ number: "asc" }, { id: "asc" }] });
    return tables.map((table) => ({
      id: table.id,
      number: table.number,
      name: table.name,
      seats: table.seats,
      price:
        layout.event?.paymentMode === EventPaymentMode.deposit &&
        !layout.event.showFullAmountForDeposit
          ? null
          : table.price,
      deposit: table.deposit,
      currency: table.currency.trim(),
      description: table.description,
      typeLabel: table.typeLabel,
      shortDescription: table.shortDescription,
      saleMode: table.saleMode,
      seatsDetail: table.seatRecords.map((seat) => ({
        id: seat.id,
        number: seat.number,
        label: seat.label,
        sortOrder: seat.sortOrder,
        status: seat.status === "available" && seat.allocations.length === 0 ? "available" : "unavailable",
      })),
      availability: table.status === TableStatus.booked ? "booked" : table.status === TableStatus.available ? "available" : "unavailable",
      payment: paymentOption(layout.event!, table.price, table.deposit, table.currency.trim()),
    }));
  }

  async update(organizerId: string, id: string, input: UpdateTableRequest): Promise<VenueTable> {
    if (Object.keys(input).length === 0) throw new BadRequestException({ code: "TABLE_UPDATE_EMPTY", message: "At least one table field is required" });
    assertManagedStatus(input.status);
    try {
      const updated = await this.database.$transaction(async (transaction) => {
        await lockTable(transaction, id);
        let current = await this.findOwnedTable(transaction, organizerId, id);
        await this.expireLocked(transaction, current, this.clock.now());
        current = await this.findOwnedTable(transaction, organizerId, id);
        if (current.status === TableStatus.held || current.status === TableStatus.booked) {
          throw new ConflictException({ code: "TABLE_STATE_LOCKED", message: "A held or booked table cannot be edited" });
        }
        const layout = await transaction.venueLayout.findUniqueOrThrow({ where: { id: current.venueLayoutId } });
        assertLegacyLayout(layout.layoutJson);
        if (layout.eventId) {
          const event = await transaction.event.findUniqueOrThrow({ where: { id: layout.eventId } });
          if (event.status !== EventStatus.draft && (input.number !== undefined || input.seats !== undefined || input.saleMode !== undefined)) throw new ConflictException({ code: "VENUE_STRUCTURE_DRAFT_ONLY", message: "Seat numbering and sale mode can only change while the event is a draft" });
          assertDeposit(event, input.deposit ?? current.deposit, input.price ?? current.price);
        }
        const data: Prisma.TableUpdateInput = {};
        if (input.number !== undefined) data.number = input.number;
        if (input.name !== undefined) data.name = nullableText(input.name);
        if (input.seats !== undefined) data.seats = input.seats;
        if (input.price !== undefined) data.price = input.price;
        if (input.deposit !== undefined) data.deposit = input.deposit;
        if (input.currency !== undefined) data.currency = normalizeCurrency(input.currency);
        if (input.description !== undefined) data.description = nullableText(input.description);
        if (input.typeLabel !== undefined) data.typeLabel = nullableText(input.typeLabel);
        if (input.shortDescription !== undefined) data.shortDescription = nullableText(input.shortDescription);
        if (input.saleMode !== undefined) {
          if (input.saleMode === "whole_table" && await transaction.seat.count({ where: { tableId: id } })) {
            throw new ConflictException({ code: "TABLE_HAS_SEAT_INVENTORY", message: "A table with seats cannot switch to whole-table mode" });
          }
          data.saleMode = input.saleMode;
        }
        if (input.status !== undefined) data.status = input.status;
        const table = await transaction.table.update({ where: { id }, data });
        if (table.saleMode === "per_seat") {
          const mapped = await transaction.seat.findMany({ where: { tableId: id, ticketTypeId: { not: null } }, select: { ticketTypeId: true } });
          const ids = [...new Set(mapped.map((seat) => seat.ticketTypeId).filter((value): value is string => Boolean(value)))];
          for (const ticketTypeId of ids) {
            const ticketType = await transaction.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId }, select: { quantitySold: true } });
            await transaction.ticketType.update({ where: { id: ticketTypeId }, data: { price: table.price, deposit: table.deposit, currency: table.currency, quantityTotal: Math.max(table.seats, ticketType.quantitySold) } });
          }
        }
        await this.record(transaction, organizerId, id, "table.updated", { layoutId: table.venueLayoutId, changedFields: Object.keys(input) });
        return table;
      });
      return presentTable(updated);
    } catch (error) {
      throw mapTableConstraint(error);
    }
  }

  async delete(organizerId: string, id: string): Promise<{ deleted: true; id: string }> {
    await this.database.$transaction(async (transaction) => {
      await lockTable(transaction, id);
      const table = await this.findOwnedTable(transaction, organizerId, id);
      const bookingCount = await transaction.booking.count({ where: { tableId: id } });
      const holdCount = await transaction.tableHold.count({ where: { tableId: id } });
      if (bookingCount > 0 || holdCount > 0 || table.status === TableStatus.held || table.status === TableStatus.booked) {
        throw new ConflictException({ code: "TABLE_HAS_HISTORY", message: "A table with a hold or booking history cannot be deleted" });
      }
      const layout = await transaction.venueLayout.findUniqueOrThrow({ where: { id: table.venueLayoutId } });
      assertLegacyLayout(layout.layoutJson);
      if (layout.eventId) {
        const event = await transaction.event.findUniqueOrThrow({ where: { id: layout.eventId } });
        const numberedSeats = await transaction.seat.count({ where: { tableId: id } });
        if (event.status !== EventStatus.draft && numberedSeats > 0) throw new ConflictException({ code: "VENUE_STRUCTURE_DRAFT_ONLY", message: "Venue structure can only be changed while the event is a draft" });
      }
      const layoutJson = parseLayout(layout.layoutJson);
      await transaction.table.delete({ where: { id } });
      await transaction.venueLayout.update({
        where: { id: table.venueLayoutId },
        data: { layoutJson: { ...layoutJson, tables: layoutJson.tables.filter((geometry) => geometry.tableId !== id) }, revision: { increment: 1 } },
      });
      await this.record(transaction, organizerId, id, "table.deleted", { layoutId: table.venueLayoutId });
    });
    return { deleted: true, id };
  }

  async hold(tableId: string, rawRequestKey: string | undefined): Promise<TableHoldResponse> {
    const requestKey = validateRequestKey(rawRequestKey);
    const now = this.clock.now();
    const hold = await this.database.$transaction((transaction) =>
      this.holdInTransaction(transaction, tableId, requestKey, now),
    );
    return holdResponse(hold);
  }

  async holdInTransaction(
    transaction: TableTransaction,
    tableId: string,
    rawRequestKey: string,
    now = this.clock.now(),
  ): Promise<TableHold> {
      const requestKey = validateRequestKey(rawRequestKey);
      await lockTable(transaction, tableId);
      let table = await transaction.table.findFirst({
        where: { id: tableId, venueLayout: { event: { status: EventStatus.published } } },
      });
      if (!table) throw tableNotFound();
      if (table.saleMode === "per_seat") throw new ConflictException({ code: "TABLE_REQUIRES_SEAT_SELECTION", message: "Select individual seats for this table" });
      await this.expireLocked(transaction, table, now);
      table = await transaction.table.findUniqueOrThrow({ where: { id: tableId } });

      const prior = await transaction.tableHold.findUnique({
        where: { tableId_requestKey: { tableId, requestKey } },
      });
      if (prior) {
        if (prior.status === TableHoldStatus.active && prior.expiresAt > now && table.holdToken === prior.token) {
          return prior;
        }
        throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "This idempotency key already completed another hold attempt" });
      }
      if (table.status !== TableStatus.available) throw tableUnavailable();

      const expiresAt = new Date(now.getTime() + this.config.holdTtlSeconds * 1_000);
      const token = randomBytes(32).toString("base64url");
      const hold = await transaction.tableHold.create({ data: { tableId, requestKey, token, expiresAt } });
      const changed = await transaction.table.updateMany({
        where: { id: tableId, status: TableStatus.available },
        data: { status: TableStatus.held, holdToken: token, holdRequestKey: requestKey, holdExpiresAt: expiresAt },
      });
      if (changed.count !== 1) throw tableUnavailable();
      await this.domainEvents.append(transaction, {
        eventType: "table.hold_created",
        aggregateType: "table",
        aggregateId: tableId,
        payload: { holdId: hold.id, expiresAt: expiresAt.toISOString() },
      });
      return hold;
  }

  async release(tableId: string, token: string): Promise<ReleaseTableHoldResponse> {
    return this.database.$transaction((transaction) =>
      this.releaseInTransaction(transaction, tableId, token),
    );
  }

  async releaseInTransaction(
    transaction: TableTransaction,
    tableId: string,
    token: string,
    actorId: string | null = null,
  ): Promise<ReleaseTableHoldResponse> {
      await lockTable(transaction, tableId);
      const table = await transaction.table.findUnique({ where: { id: tableId } });
      const hold = await transaction.tableHold.findUnique({ where: { token } });
      if (!table || !hold || hold.tableId !== tableId) throw holdNotFound();
      await this.expireLocked(transaction, table, this.clock.now());
      const current = await transaction.tableHold.findUniqueOrThrow({ where: { id: hold.id } });
      if (current.status === TableHoldStatus.released || current.status === TableHoldStatus.expired) {
        return { tableId, released: true, status: current.status };
      }
      if (current.status === TableHoldStatus.confirmed) {
        throw new ConflictException({ code: "TABLE_ALREADY_BOOKED", message: "A confirmed table cannot be released" });
      }
      const refreshed = await transaction.table.findUniqueOrThrow({ where: { id: tableId } });
      if (refreshed.status !== TableStatus.held || refreshed.holdToken !== token) throw holdConflict();
      await transaction.booking.updateMany({ where: { tableId, status: BookingStatus.pending }, data: { status: BookingStatus.expired } });
      await transaction.seatAllocation.updateMany({ where: { order: { booking: { tableId } }, status: SeatAllocationStatus.active }, data: { status: SeatAllocationStatus.released, releasedAt: this.clock.now() } });
      await transaction.ticket.updateMany({ where: { order: { booking: { tableId } }, status: TicketStatus.pending_payment }, data: { status: TicketStatus.cancelled, cancelledAt: this.clock.now() } });
      await transaction.groupPass.updateMany({ where: { table: { id: tableId }, status: "active" }, data: { status: "cancelled" } });
      await transaction.tableHold.update({ where: { id: current.id }, data: { status: TableHoldStatus.released } });
      await transaction.table.update({ where: { id: tableId }, data: clearHold(TableStatus.available) });
      await this.record(transaction, actorId, tableId, "table.hold_released", { holdId: current.id }, true);
      return { tableId, released: true, status: "released" };
  }

  async confirm(tableId: string, token: string, orderId: string, actorId: string | null = null): Promise<VenueTable> {
    const table = await this.database.$transaction((transaction) =>
      this.confirmInTransaction(transaction, tableId, token, orderId, actorId),
    );
    return presentTable(table);
  }

  async confirmInTransaction(
    transaction: TableTransaction,
    tableId: string,
    token: string,
    orderId: string,
    actorId: string | null = null,
  ): Promise<Table> {
      await lockTable(transaction, tableId);
      let table = await transaction.table.findUnique({ where: { id: tableId } });
      const hold = await transaction.tableHold.findUnique({ where: { token } });
      if (!table || !hold || hold.tableId !== tableId) throw holdConflict();
      const booking = await transaction.booking.findUnique({ where: { orderId } });
      if (hold.status === TableHoldStatus.confirmed) {
        if (booking?.tableId === tableId && booking.status === BookingStatus.confirmed && table.status === TableStatus.booked) return table;
        throw confirmationConflict();
      }
      await this.expireLocked(transaction, table, this.clock.now());
      table = await transaction.table.findUniqueOrThrow({ where: { id: tableId } });
      const activeHold = await transaction.tableHold.findUniqueOrThrow({ where: { id: hold.id } });
      if (
        activeHold.status !== TableHoldStatus.active ||
        activeHold.expiresAt <= this.clock.now() ||
        table.status !== TableStatus.held ||
        table.holdToken !== token ||
        booking?.tableId !== tableId ||
        booking.status !== BookingStatus.pending
      ) throw confirmationConflict();

      await transaction.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.confirmed } });
      await transaction.tableHold.update({ where: { id: activeHold.id }, data: { status: TableHoldStatus.confirmed } });
      const booked = await transaction.table.update({ where: { id: tableId }, data: clearHold(TableStatus.booked) });
      await this.record(transaction, actorId, tableId, "table.booking_confirmed", { holdId: activeHold.id, bookingId: booking.id, orderId }, true);
      return booked;
  }

  async expireDueHolds(limit: number): Promise<number> {
    const due = await this.database.tableHold.findMany({
      where: { status: TableHoldStatus.active, expiresAt: { lte: this.clock.now() } },
      select: { tableId: true },
      orderBy: { expiresAt: "asc" },
      take: Math.max(1, Math.min(limit, 500)),
    });
    let expired = 0;
    for (const { tableId } of due) if (await this.expireTableIfDue(tableId)) expired += 1;
    return expired;
  }

  async expireLayoutHolds(layoutId: string): Promise<number> {
    const due = await this.database.tableHold.findMany({
      where: { status: TableHoldStatus.active, expiresAt: { lte: this.clock.now() }, table: { venueLayoutId: layoutId } },
      select: { tableId: true },
      take: 500,
    });
    let expired = 0;
    for (const { tableId } of due) if (await this.expireTableIfDue(tableId)) expired += 1;
    return expired;
  }

  private async expireTableIfDue(tableId: string): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      await lockTable(transaction, tableId);
      const table = await transaction.table.findUnique({ where: { id: tableId } });
      if (!table) return false;
      return this.expireLocked(transaction, table, this.clock.now());
    });
  }

  private async expireLocked(transaction: TableTransaction, table: Table, now: Date): Promise<boolean> {
    if (table.status !== TableStatus.held || !table.holdExpiresAt || table.holdExpiresAt > now || !table.holdToken) return false;
    const hold = await transaction.tableHold.findUnique({ where: { token: table.holdToken } });
    if (!hold || hold.status !== TableHoldStatus.active) return false;
    await transaction.booking.updateMany({ where: { tableId: table.id, status: BookingStatus.pending }, data: { status: BookingStatus.expired } });
    await transaction.seatAllocation.updateMany({ where: { order: { booking: { tableId: table.id } }, status: SeatAllocationStatus.active }, data: { status: SeatAllocationStatus.released, releasedAt: now } });
    await transaction.ticket.updateMany({ where: { order: { booking: { tableId: table.id } }, status: TicketStatus.pending_payment }, data: { status: TicketStatus.cancelled, cancelledAt: now } });
    await transaction.groupPass.updateMany({ where: { tableId: table.id, status: "active" }, data: { status: "cancelled" } });
    await transaction.tableHold.update({ where: { id: hold.id }, data: { status: TableHoldStatus.expired } });
    await transaction.table.update({ where: { id: table.id }, data: clearHold(TableStatus.available) });
    await this.domainEvents.append(transaction, {
      eventType: "table.hold_expired",
      aggregateType: "table",
      aggregateId: table.id,
      payload: { holdId: hold.id, expiredAt: now.toISOString() },
    });
    return true;
  }

  private async findOwnedLayout(
    database: Pick<PrismaClient, "venueLayout"> | Pick<TableTransaction, "venueLayout">,
    organizerId: string,
    id: string,
  ) {
    const layout = await database.venueLayout.findFirst({
      where: { id, OR: [{ organizerId }, { event: { organizerId } }] },
    });
    if (!layout) throw layoutNotFound();
    return layout;
  }

  private async findOwnedTable(
    database: Pick<PrismaClient, "table"> | Pick<TableTransaction, "table">,
    organizerId: string,
    id: string,
  ): Promise<Table> {
    const table = await database.table.findFirst({
      where: { id, venueLayout: { OR: [{ organizerId }, { event: { organizerId } }] } },
    });
    if (!table) throw tableNotFound();
    return table;
  }

  private async record(
    transaction: Pick<TableTransaction, "auditLog" | "outboxEvent">,
    actorId: string | null,
    tableId: string,
    eventType: string,
    payload: Prisma.InputJsonObject,
    alwaysAudit = true,
  ): Promise<void> {
    await this.domainEvents.append(transaction, { eventType, aggregateType: "table", aggregateId: tableId, payload });
    if (alwaysAudit) {
      await transaction.auditLog.create({ data: { actorId, action: eventType, entityType: "table", entityId: tableId, meta: payload } });
    }
  }
}

export async function lockTable(transaction: TableTransaction, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`table:${id}`}, 0))`;
}

async function lockLayout(transaction: TableTransaction, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`venue-layout:${id}`}, 0))`;
}

function clearHold(status: "available" | "booked"): Prisma.TableUpdateInput {
  return { status, holdToken: null, holdRequestKey: null, holdExpiresAt: null };
}

function parseLayout(value: Prisma.JsonValue): VenueLayoutAny {
  const parsed = venueLayoutSchemaAny.safeParse(value);
  if (!parsed.success) throw new ConflictException({ code: "VENUE_LAYOUT_DATA_INVALID", message: "Stored layout geometry is invalid" });
  return parsed.data;
}

function validateRequestKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new BadRequestException({ code: "IDEMPOTENCY_KEY_INVALID", message: "Idempotency-Key must contain 8-128 safe characters" });
  }
  return key;
}

function normalizeCurrency(value: string | undefined): string { return (value ?? "KZT").toUpperCase(); }
function assertManagedStatus(status: unknown): void {
  if (status !== undefined && status !== TableStatus.available && status !== TableStatus.unavailable) {
    throw new BadRequestException({ code: "TABLE_STATUS_MANAGED_ONLY", message: "General table mutations may only set available or unavailable" });
  }
}
function nullableText(value: string | null | undefined): string | null { return value?.trim() || null; }
function holdResponse(hold: TableHold): TableHoldResponse { return { tableId: hold.tableId, holdToken: hold.token, expiresAt: hold.expiresAt.toISOString() }; }
function tableNotFound(): NotFoundException { return new NotFoundException({ code: "TABLE_NOT_FOUND", message: "Table was not found" }); }
function layoutNotFound(): NotFoundException { return new NotFoundException({ code: "VENUE_LAYOUT_NOT_FOUND", message: "Venue layout was not found" }); }
function holdNotFound(): NotFoundException { return new NotFoundException({ code: "TABLE_HOLD_NOT_FOUND", message: "Table hold was not found" }); }
function tableUnavailable(): ConflictException { return new ConflictException({ code: "TABLE_UNAVAILABLE", message: "Table is not available" }); }
function holdConflict(): ConflictException { return new ConflictException({ code: "TABLE_HOLD_CONFLICT", message: "Hold token does not match the active table hold" }); }
function confirmationConflict(): ConflictException { return new ConflictException({ code: "TABLE_CONFIRMATION_CONFLICT", message: "Table hold and pending booking cannot be confirmed" }); }
function layoutLimit(): ConflictException { return new ConflictException({ code: "VENUE_LAYOUT_TABLE_LIMIT", message: "A venue layout can contain at most 500 tables" }); }

function assertDeposit(
  event: { paymentMode: EventPaymentMode; showFullAmountForDeposit: boolean },
  deposit: number,
  price: number,
): void {
  if (event.paymentMode === EventPaymentMode.deposit && deposit <= 0) {
    throw new BadRequestException({ code: "DEPOSIT_AMOUNT_REQUIRED", message: "A positive table deposit is required for deposit events" });
  }
  if (event.paymentMode === EventPaymentMode.deposit && event.showFullAmountForDeposit && price < deposit) {
    throw new BadRequestException({ code: "DEPOSIT_EXCEEDS_FULL_AMOUNT", message: "Deposit cannot exceed the displayed full table amount" });
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

function mapTableConstraint(error: unknown): unknown {
  if ((error as { code?: string }).code === "P2002") {
    return new ConflictException({ code: "TABLE_NUMBER_CONFLICT", message: "Table number must be unique within the layout" });
  }
  return error;
}
