import { randomUUID } from "node:crypto";

import { EventStatus, Prisma, SeatStatus, TableSaleMode, TableStatus, TicketTypeStatus, type PrismaClient } from "@event-platform/database";
import { rowGeometryV2Schema, venueLayoutSchemaAny, type CreateTableSeatsRequest, type CreateVenueRowRequest, type DuplicateVenueElementResponse, type PublicVenueLayout, type UpdateVenueRowRequest, type VenueLayoutJsonV2, type VenueRow } from "@event-platform/shared-types";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { assertLegacyLayout } from "../venue/hall-editor.persistence.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import { presentTable } from "../tables/tables.presenter.js";
import { presentRow } from "./seats.presenter.js";

@Injectable()
export class SeatsService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    @Inject(TablesService) private readonly tables: TablesService,
  ) {}

  async createForTable(organizerId: string, tableId: string, input: CreateTableSeatsRequest) {
    const numbers = normalizeNumbers(input.numbers);
    return this.database.$transaction(async (transaction) => {
      await lockSeatParent(transaction, tableId);
      const table = await transaction.table.findFirst({ where: { id: tableId, venueLayout: { OR: [{ organizerId }, { event: { organizerId } }] } }, include: { venueLayout: { include: { event: true } } } });
      if (!table) throw notFound("TABLE_NOT_FOUND");
      assertLegacyLayout(table.venueLayout.layoutJson);
      if (table.venueLayout.event && table.venueLayout.event.status !== EventStatus.draft) throw new ConflictException({ code: "VENUE_STRUCTURE_DRAFT_ONLY", message: "Seat numbering can only change while the event is a draft" });
      if (table.saleMode !== TableSaleMode.per_seat) throw new ConflictException({ code: "TABLE_NOT_PER_SEAT", message: "The table is configured for whole-table sales" });
      const existing = await transaction.seat.findMany({ where: { tableId }, select: { number: true } });
      assertNewNumbers(existing.map(({ number }) => number), numbers);
      if (existing.length + numbers.length > 100) throw new BadRequestException({ code: "SEAT_LIMIT_EXCEEDED", message: "A table cannot contain more than 100 seats" });
      const currency = normalizeCurrency(table.currency);
      const ticketType = input.ticketTypeId
        ? (table.venueLayout.event ? (await assertTicketType(transaction, input.ticketTypeId, table.venueLayoutId), { id: input.ticketTypeId }) : null)
        : (table.venueLayout.event ? await ensureSeatTicketType(transaction, table.venueLayout.event.id, `Места стола ${table.number}`, numbers.length, table.price, table.deposit, currency) : null);
      const totalSeats = existing.length + numbers.length;
      if (ticketType && table.venueLayout.event) await syncSeatTicketType(transaction, ticketType.id, table.venueLayout.event.id, totalSeats, table.price, table.deposit, currency);
      const seats = [];
      for (const [index, number] of numbers.entries()) seats.push(await transaction.seat.create({ data: { id: randomUUID(), venueLayoutId: table.venueLayoutId, tableId, number, label: String(number), sortOrder: existing.length + index, ticketTypeId: ticketType?.id ?? null } }));
      await transaction.table.update({ where: { id: tableId }, data: { seats: totalSeats } });
      await this.record(transaction, organizerId, tableId, "table.seats_created", { tableId, count: seats.length });
      return seats;
    });
  }

  async deleteSeat(organizerId: string, seatId: string): Promise<{ deleted: true; id: string }> {
    await this.database.$transaction(async (transaction) => {
      const seat = await transaction.seat.findFirst({
        where: { id: seatId, venueLayout: { OR: [{ organizerId }, { event: { organizerId } }] } },
        include: { venueLayout: { include: { event: true } }, allocations: { select: { id: true } } },
      });
      if (!seat) throw notFound("SEAT_NOT_FOUND");
      assertLegacyLayout(seat.venueLayout.layoutJson);
      if (seat.venueLayout.event && seat.venueLayout.event.status !== EventStatus.draft) throw structureLocked();
      if (seat.allocations.length) throw new ConflictException({ code: "SEAT_HAS_HISTORY", message: "A seat with allocation history cannot be deleted" });
      await transaction.seat.delete({ where: { id: seatId } });
      if (seat.tableId) {
        const count = await transaction.seat.count({ where: { tableId: seat.tableId } });
        await transaction.table.update({ where: { id: seat.tableId }, data: { seats: Math.max(1, count) } });
      }
      await this.record(transaction, organizerId, seatId, "seat.deleted", { layoutId: seat.venueLayoutId, tableId: seat.tableId, rowId: seat.rowId });
    });
    return { deleted: true, id: seatId };
  }

  async createRow(organizerId: string, layoutId: string, input: CreateVenueRowRequest): Promise<VenueRow> {
    const numbers = consecutiveNumbers(input.startSeatNumber ?? 1, input.seatCount);
    return this.database.$transaction(async (transaction) => {
      await lockLayout(transaction, layoutId);
      const layout = await transaction.venueLayout.findFirst({ where: { id: layoutId, OR: [{ organizerId }, { event: { organizerId } }] }, include: { event: true } });
      if (!layout) throw notFound("VENUE_LAYOUT_NOT_FOUND");
      assertLegacyLayout(layout.layoutJson);
      if (layout.event && layout.event.status !== EventStatus.draft) throw new ConflictException({ code: "ROW_EDIT_DRAFT_ONLY", message: "Rows can only be created on a draft event" });
      if (await transaction.venueRow.findFirst({ where: { venueLayoutId: layoutId, number: input.number }, select: { id: true } })) throw new ConflictException({ code: "ROW_NUMBER_EXISTS", message: "A row with this number already exists" });
      const currency = normalizeCurrency(input.currency);
      const ticketType = input.ticketTypeId
        ? (layout.event ? (await assertTicketType(transaction, input.ticketTypeId, layoutId), { id: input.ticketTypeId }) : (() => { throw new ConflictException({ code: "TICKET_TYPE_EVENT_REQUIRED", message: "Template rows cannot reference an event ticket type" }); })())
        : (layout.event ? await ensureSeatTicketType(transaction, layout.event.id, `Места ряда ${input.number}`, numbers.length, input.price, input.deposit, currency) : null);
      if (ticketType && layout.event) await syncSeatTicketType(transaction, ticketType.id, layout.event.id, numbers.length, input.price, input.deposit, currency);
      const rowId = randomUUID();
      const row = await transaction.venueRow.create({ data: { id: rowId, venueLayoutId: layoutId, number: input.number, name: nullable(input.name), typeLabel: nullable(input.typeLabel), shortDescription: nullable(input.shortDescription), price: input.price, deposit: input.deposit, currency, status: input.status ?? TableStatus.available, seats: { create: numbers.map((number, index) => ({ id: randomUUID(), venueLayoutId: layoutId, number, label: String(number), sortOrder: index, ticketTypeId: ticketType?.id ?? null })) } }, include: { seats: { orderBy: { sortOrder: "asc" } } } });
      if (input.geometry) {
        const layoutJson = requireV2(layout.layoutJson);
        const geometry = rowGeometryV2Schema.parse({ rowId, ...input.geometry, seatCount: numbers.length });
        await transaction.venueLayout.update({ where: { id: layoutId }, data: { layoutJson: { ...layoutJson, rows: [...layoutJson.rows, geometry] }, revision: { increment: 1 } } });
      }
      await this.record(transaction, organizerId, row.id, "venue_row.created", { layoutId, seatCount: numbers.length });
      return presentRow(row);
    });
  }

  async updateRow(organizerId: string, rowId: string, input: UpdateVenueRowRequest): Promise<VenueRow> {
    if (!Object.keys(input).length) throw new BadRequestException({ code: "ROW_UPDATE_EMPTY", message: "At least one row field is required" });
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.venueRow.findFirst({ where: { id: rowId, venueLayout: { OR: [{ organizerId }, { event: { organizerId } }] } }, include: { venueLayout: { include: { event: true } }, seats: { orderBy: { sortOrder: "asc" } } } });
      if (!current) throw notFound("VENUE_ROW_NOT_FOUND");
      assertLegacyLayout(current.venueLayout.layoutJson);
      const event = current.venueLayout.event;
      const hasStructuralChange = input.number !== undefined || input.seatCount !== undefined || input.startSeatNumber !== undefined;
      if (event && event.status !== EventStatus.draft && hasStructuralChange) throw new ConflictException({ code: "VENUE_STRUCTURE_DRAFT_ONLY", message: "Seat numbering can only change while the event is a draft" });
      const allocationCount = await transaction.seatAllocation.count({ where: { seat: { rowId }, status: { in: ["active", "consumed"] } } });
      const startSeatNumber = input.startSeatNumber ?? current.seats[0]?.number ?? 1;
      const numbers = input.seatCount !== undefined || input.startSeatNumber !== undefined
        ? consecutiveNumbers(startSeatNumber, input.seatCount ?? current.seats.length)
        : current.seats.map((seat) => seat.number);
      if (allocationCount > 0 && (input.seatCount !== undefined || input.startSeatNumber !== undefined)) throw new ConflictException({ code: "ROW_HAS_SEAT_HISTORY", message: "A row with sold or held seats cannot change its numbering" });
      const number = input.number ?? current.number;
      const duplicate = await transaction.venueRow.findFirst({ where: { venueLayoutId: current.venueLayoutId, number, NOT: { id: rowId } }, select: { id: true } });
      if (duplicate) throw new ConflictException({ code: "ROW_NUMBER_EXISTS", message: "A row with this number already exists" });
      const currency = input.currency === undefined ? current.currency.trim() : normalizeCurrency(input.currency);
      const price = input.price ?? current.price;
      const deposit = input.deposit ?? current.deposit;
      const ticketTypeId = input.ticketTypeId ?? current.seats.find((seat) => seat.ticketTypeId)?.ticketTypeId ?? (event ? (await ensureSeatTicketType(transaction, event.id, `Места ряда ${number}`, numbers.length, price, deposit, currency)).id : null);
      if (ticketTypeId && event) await syncSeatTicketType(transaction, ticketTypeId, event.id, numbers.length, price, deposit, currency);
      const replaceSeats = input.seatCount !== undefined || input.startSeatNumber !== undefined;
      const row = await transaction.venueRow.update({ where: { id: rowId }, data: { number, ...(input.name !== undefined ? { name: nullable(input.name) } : {}), ...(input.typeLabel !== undefined ? { typeLabel: nullable(input.typeLabel) } : {}), ...(input.shortDescription !== undefined ? { shortDescription: nullable(input.shortDescription) } : {}), price, deposit, currency, ...(input.status !== undefined ? { status: input.status } : {}), ...(replaceSeats ? { seats: { deleteMany: {}, create: numbers.map((seatNumber, index) => ({ id: randomUUID(), venueLayoutId: current.venueLayoutId, number: seatNumber, label: String(seatNumber), sortOrder: index, ticketTypeId })) } } : {}) }, include: { seats: { orderBy: { sortOrder: "asc" } } } });
      await this.record(transaction, organizerId, row.id, "venue_row.updated", { layoutId: current.venueLayoutId, changedFields: Object.keys(input) });
      return presentRow(row);
    });
  }

  async deleteRow(organizerId: string, rowId: string): Promise<{ deleted: true; id: string }> {
    await this.database.$transaction(async (transaction) => {
      const row = await transaction.venueRow.findFirst({ where: { id: rowId, venueLayout: { OR: [{ organizerId }, { event: { organizerId } }] } }, include: { venueLayout: { include: { event: true } } } });
      if (!row) throw notFound("VENUE_ROW_NOT_FOUND");
      assertLegacyLayout(row.venueLayout.layoutJson);
      if (row.venueLayout.event && row.venueLayout.event.status !== EventStatus.draft) throw new ConflictException({ code: "VENUE_STRUCTURE_DRAFT_ONLY", message: "Venue structure can only change while the event is a draft" });
      const history = await transaction.seatAllocation.count({ where: { seat: { rowId } } });
      if (history) throw new ConflictException({ code: "ROW_HAS_SEAT_HISTORY", message: "A row with booking history cannot be deleted" });
      await transaction.venueRow.delete({ where: { id: rowId } });
      const layoutJson = venueLayoutSchemaAny.parse(row.venueLayout.layoutJson);
      if (layoutJson.version === 2) {
        await transaction.venueLayout.update({ where: { id: row.venueLayoutId }, data: { layoutJson: { ...layoutJson, rows: layoutJson.rows.filter(({ rowId: id }) => id !== rowId) }, revision: { increment: 1 } } });
      }
      await this.record(transaction, organizerId, rowId, "venue_row.deleted", { layoutId: row.venueLayoutId });
    });
    return { deleted: true, id: rowId };
  }

  async duplicateTable(organizerId: string, tableId: string): Promise<DuplicateVenueElementResponse> {
    return this.database.$transaction(async (transaction) => {
      const source = await transaction.table.findFirst({
        where: { id: tableId, venueLayout: { OR: [{ organizerId }, { event: { organizerId } }] } },
        include: { seatRecords: { orderBy: { sortOrder: "asc" } }, venueLayout: { include: { event: true } } },
      });
      if (!source) throw notFound("TABLE_NOT_FOUND");
      assertLegacyLayout(source.venueLayout.layoutJson);
      await lockLayout(transaction, source.venueLayoutId);
      if (source.venueLayout.event && source.venueLayout.event.status !== EventStatus.draft) throw structureLocked();
      const layoutJson = requireV2(source.venueLayout.layoutJson);
      const sourceGeometry = layoutJson.tables.find(({ tableId: id }) => id === tableId);
      if (!sourceGeometry) throw new ConflictException({ code: "VENUE_TABLE_GEOMETRY_MISSING", message: "Table geometry is missing" });
      const number = (await layoutNumbers(transaction, source.venueLayoutId)).nextTableNumber;
      const id = randomUUID();
      const geometry = offsetTable(sourceGeometry, id, layoutJson.room);
      const ticketType = source.venueLayout.event && source.saleMode === TableSaleMode.per_seat
        ? await ensureSeatTicketType(transaction, source.venueLayout.event.id, `Места стола ${number}`, source.seatRecords.length, source.price, source.deposit, normalizeCurrency(source.currency))
        : null;
      const duplicated = await transaction.table.create({
        data: {
          id, venueLayoutId: source.venueLayoutId, number, name: source.name ? `${source.name} (копия)` : `Стол ${number}`,
          seats: source.seats, price: source.price, deposit: source.deposit, currency: source.currency, description: source.description,
          typeLabel: source.typeLabel, shortDescription: source.shortDescription, saleMode: source.saleMode,
          status: source.status === TableStatus.unavailable ? TableStatus.unavailable : TableStatus.available,
          seatRecords: { create: source.seatRecords.map((seat) => ({ id: randomUUID(), venueLayoutId: source.venueLayoutId, number: seat.number, label: String(seat.number), sortOrder: seat.sortOrder, status: seat.status, ticketTypeId: ticketType?.id ?? null })) },
        },
        include: { seatRecords: { orderBy: { sortOrder: "asc" } } },
      });
      const updated = await transaction.venueLayout.update({ where: { id: source.venueLayoutId }, data: { layoutJson: { ...layoutJson, tables: [...layoutJson.tables, geometry] }, revision: { increment: 1 } }, select: { revision: true } });
      await this.record(transaction, organizerId, id, "table.duplicated", { sourceTableId: source.id, layoutId: source.venueLayoutId, number });
      return { layoutId: source.venueLayoutId, revision: updated.revision, table: presentTable(duplicated), geometry };
    });
  }

  async duplicateRow(organizerId: string, rowId: string): Promise<DuplicateVenueElementResponse> {
    return this.database.$transaction(async (transaction) => {
      const source = await transaction.venueRow.findFirst({
        where: { id: rowId, venueLayout: { OR: [{ organizerId }, { event: { organizerId } }] } },
        include: { seats: { orderBy: { sortOrder: "asc" } }, venueLayout: { include: { event: true } } },
      });
      if (!source) throw notFound("VENUE_ROW_NOT_FOUND");
      assertLegacyLayout(source.venueLayout.layoutJson);
      await lockLayout(transaction, source.venueLayoutId);
      if (source.venueLayout.event && source.venueLayout.event.status !== EventStatus.draft) throw structureLocked();
      const layoutJson = requireV2(source.venueLayout.layoutJson);
      const sourceGeometry = layoutJson.rows.find(({ rowId: id }) => id === rowId);
      if (!sourceGeometry) throw new ConflictException({ code: "VENUE_ROW_GEOMETRY_MISSING", message: "Row geometry is missing" });
      const number = (await layoutNumbers(transaction, source.venueLayoutId)).nextRowNumber;
      const id = randomUUID();
      const geometry = offsetRow(sourceGeometry, id, layoutJson.room);
      const ticketType = source.venueLayout.event
        ? await ensureSeatTicketType(transaction, source.venueLayout.event.id, `Места ряда ${number}`, source.seats.length, source.price, source.deposit, normalizeCurrency(source.currency))
        : null;
      const duplicated = await transaction.venueRow.create({
        data: {
          id, venueLayoutId: source.venueLayoutId, number, name: source.name ? `${source.name} (копия)` : `Ряд ${number}`,
          typeLabel: source.typeLabel, shortDescription: source.shortDescription, price: source.price, deposit: source.deposit, currency: source.currency,
          status: source.status === TableStatus.unavailable ? TableStatus.unavailable : TableStatus.available,
          seats: { create: source.seats.map((seat) => ({ id: randomUUID(), venueLayoutId: source.venueLayoutId, number: seat.number, label: String(seat.number), sortOrder: seat.sortOrder, status: seat.status, ticketTypeId: ticketType?.id ?? null })) },
        },
        include: { seats: { orderBy: { sortOrder: "asc" } } },
      });
      const updated = await transaction.venueLayout.update({ where: { id: source.venueLayoutId }, data: { layoutJson: { ...layoutJson, rows: [...layoutJson.rows, geometry] }, revision: { increment: 1 } }, select: { revision: true } });
      await this.record(transaction, organizerId, id, "venue_row.duplicated", { sourceRowId: source.id, layoutId: source.venueLayoutId, number });
      return { layoutId: source.venueLayoutId, revision: updated.revision, row: presentRow(duplicated), geometry };
    });
  }

  async publicForEvent(eventId: string): Promise<PublicVenueLayout | null> {
    const layout = await this.database.venueLayout.findFirst({ where: { eventId, event: { status: EventStatus.published } }, include: { event: true, tables: { include: { seatRecords: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } }, rows: { include: { seats: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } } } });
    if (!layout) return null;
    await this.tables.expireLayoutHolds(layout.id);
    const refreshed = await this.database.venueLayout.findUniqueOrThrow({
      where: { id: layout.id },
      include: {
        event: true,
        seats: { include: { ticketType: true, allocations: { where: { status: { in: ["active", "consumed"] } }, select: { id: true } } }, orderBy: { sortOrder: "asc" } },
        tables: {
          include: {
            seatRecords: {
              include: { allocations: { where: { status: { in: ["active", "consumed"] } }, select: { id: true } } },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { number: "asc" },
        },
        rows: {
          include: {
            seats: {
              include: { allocations: { where: { status: { in: ["active", "consumed"] } }, select: { id: true } } },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { number: "asc" },
        },
      },
    });
    const parsed = venueLayoutSchemaAny.safeParse(refreshed.layoutJson);
    if (!parsed.success) throw new ConflictException({ code: "VENUE_LAYOUT_INVALID", message: "The venue layout is invalid" });
    const hideFullPrices = refreshed.event?.paymentMode === "deposit" && !refreshed.event.showFullAmountForDeposit;
    // Prices in editor metadata follow the same deposit visibility policy as public ticket types.
    const publicJson = parsed.data.version === 2 && parsed.data.editor && hideFullPrices
      ? { ...parsed.data, editor: { ...parsed.data.editor, tariffs: parsed.data.editor.tariffs.map((t) => ({ ...t, price: 0 })), objects: parsed.data.editor.objects.map((o) => ({ ...o, price: null })) } }
      : parsed.data;
    return {
      seats: refreshed.seats.map((seat) => ({ id: seat.id, number: seat.number, label: seat.label, sortOrder: seat.sortOrder, status: seat.status, tableId: seat.tableId, rowId: seat.rowId, ticketTypeId: seat.ticketTypeId, availability: seat.status === "available" && seat.allocations.length === 0 && seat.ticketType?.status === "active" ? "available" as const : "unavailable" as const, price: hideFullPrices ? null : seat.ticketType?.price ?? null, deposit: seat.ticketType?.deposit ?? 0, currency: seat.ticketType?.currency.trim() ?? "KZT" })),
      id: refreshed.id,
      eventId,
      layoutJson: publicJson as PublicVenueLayout["layoutJson"],
      tables: refreshed.tables.map((table) => ({ id: table.id, number: table.number, name: table.name, seats: table.seats, price: hideFullPrices ? null : table.price, deposit: table.deposit, currency: table.currency.trim(), description: table.description, typeLabel: table.typeLabel, shortDescription: table.shortDescription, saleMode: table.saleMode, status: table.status, holdExpiresAt: table.holdExpiresAt?.toISOString() ?? null, seatRecords: table.seatRecords.map((seat) => ({ id: seat.id, number: seat.number, label: seat.label, sortOrder: seat.sortOrder, status: seat.status, tableId: seat.tableId, rowId: seat.rowId, ticketTypeId: seat.ticketTypeId, availability: seat.status === SeatStatus.available && seat.allocations.length === 0 ? "available" : "unavailable" })) })),
      rows: refreshed.rows.map((row) => ({ id: row.id, number: row.number, name: row.name, typeLabel: row.typeLabel, shortDescription: row.shortDescription, price: hideFullPrices ? null : row.price, deposit: row.deposit, currency: row.currency.trim(), availability: row.status === TableStatus.available && row.seats.some((seat) => seat.status === SeatStatus.available && seat.allocations.length === 0) ? "available" : "unavailable", seats: row.seats.map((seat) => ({ id: seat.id, number: seat.number, label: seat.label, sortOrder: seat.sortOrder, status: seat.status, tableId: seat.tableId, rowId: seat.rowId, ticketTypeId: seat.ticketTypeId, availability: seat.status === SeatStatus.available && seat.allocations.length === 0 ? "available" : "unavailable", price: hideFullPrices ? null : row.price, deposit: row.deposit, currency: row.currency.trim() })) })),
    };
  }

  private async record(transaction: Prisma.TransactionClient, actorId: string, entityId: string, eventType: string, payload: Prisma.InputJsonObject): Promise<void> {
    await this.domainEvents.append(transaction, { eventType, aggregateType: "venue_seating", aggregateId: entityId, payload });
    await transaction.auditLog.create({ data: { actorId, action: eventType, entityType: "venue_seating", entityId, meta: payload } });
  }
}

function normalizeNumbers(numbers: number[]): number[] {
  if (!numbers.length || numbers.length > 100 || numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 1_000_000) || new Set(numbers).size !== numbers.length) {
    throw new BadRequestException({ code: "SEAT_NUMBERS_INVALID", message: "Seat numbers must contain 1-100 unique positive integers" });
  }
  return numbers;
}
function consecutiveNumbers(start: number, count: number): number[] {
  if (!Number.isInteger(start) || start < 1 || !Number.isInteger(count) || count < 1 || count > 100 || start + count - 1 > 1_000_000) {
    throw new BadRequestException({ code: "SEAT_NUMBERS_INVALID", message: "Seat range must contain 1-100 positive integers" });
  }
  return Array.from({ length: count }, (_, index) => start + index);
}
function assertNewNumbers(existing: number[], numbers: number[]): void { if (numbers.some((number) => existing.includes(number))) throw new ConflictException({ code: "SEAT_NUMBER_EXISTS", message: "A seat number already exists" }); }
function requireV2(value: Prisma.JsonValue): VenueLayoutJsonV2 {
  const parsed = venueLayoutSchemaAny.safeParse(value);
  if (!parsed.success || parsed.data.version !== 2) throw new ConflictException({ code: "VENUE_LAYOUT_V2_REQUIRED", message: "Convert the layout to the visual editor before duplicating elements" });
  return parsed.data;
}
async function lockLayout(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`venue-layout:${id}`}, 0))`;
}
async function lockSeatParent(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`seat-parent:${id}`}, 0))`;
}
async function layoutNumbers(transaction: Prisma.TransactionClient, layoutId: string): Promise<{ nextTableNumber: number; nextRowNumber: number }> {
  const [table, row] = await Promise.all([
    transaction.table.findFirst({ where: { venueLayoutId: layoutId }, orderBy: { number: "desc" }, select: { number: true } }),
    transaction.venueRow.findFirst({ where: { venueLayoutId: layoutId }, orderBy: { number: "desc" }, select: { number: true } }),
  ]);
  return { nextTableNumber: (table?.number ?? 0) + 1, nextRowNumber: (row?.number ?? 0) + 1 };
}
function offsetTable(source: VenueLayoutJsonV2["tables"][number], id: string, room: VenueLayoutJsonV2["room"]): VenueLayoutJsonV2["tables"][number] {
  const x = Math.min(source.x + 0.5, room.widthM - source.width);
  const y = Math.min(source.y + 0.5, room.heightM - source.height);
  if (x < 0 || y < 0 || (x === source.x && y === source.y)) throw new ConflictException({ code: "VENUE_DUPLICATE_NO_SPACE", message: "There is no room for an offset duplicate" });
  return { ...source, tableId: id, x, y };
}
function offsetRow(source: VenueLayoutJsonV2["rows"][number], id: string, room: VenueLayoutJsonV2["room"]): VenueLayoutJsonV2["rows"][number] {
  const x = Math.min(source.x + 0.5, room.widthM - source.width);
  const y = Math.min(source.y + 0.5, room.heightM - source.height);
  if (x < 0 || y < 0 || (x === source.x && y === source.y)) throw new ConflictException({ code: "VENUE_DUPLICATE_NO_SPACE", message: "There is no room for an offset duplicate" });
  return { ...source, rowId: id, x, y };
}
function structureLocked(): ConflictException { return new ConflictException({ code: "VENUE_STRUCTURE_DRAFT_ONLY", message: "Venue structure can only change while the event is a draft" }); }
function nullable(value: string | null | undefined): string | null { const normalized = value?.trim(); return normalized || null; }
function normalizeCurrency(value: string | undefined): string { const currency = (value ?? "KZT").trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException({ code: "CURRENCY_INVALID", message: "Currency must be a 3-letter code" }); return currency; }
async function assertTicketType(transaction: Prisma.TransactionClient, id: string, layoutId: string): Promise<void> { const type = await transaction.ticketType.findFirst({ where: { id, event: { venueLayout: { id: layoutId } } }, select: { id: true } }); if (!type) throw notFound("TICKET_TYPE_NOT_FOUND"); }
async function ensureSeatTicketType(transaction: Prisma.TransactionClient, eventId: string, name: string, quantity: number, price: number, deposit: number, currency: string): Promise<{ id: string }> {
  const existing = await transaction.ticketType.findFirst({ where: { eventId, name, isInternal: false }, select: { id: true } });
  if (existing) return existing;
  try {
    return await transaction.ticketType.create({ data: { eventId, name: name.slice(0, 120), price, deposit, currency, quantityTotal: Math.max(1, quantity), status: TicketTypeStatus.active }, select: { id: true } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const raced = await transaction.ticketType.findFirst({ where: { eventId, name, isInternal: false }, select: { id: true } });
    if (raced) return raced;
    throw error;
  }
}
async function syncSeatTicketType(transaction: Prisma.TransactionClient, id: string, eventId: string, quantity: number, price: number, deposit: number, currency: string): Promise<void> {
  const type = await transaction.ticketType.findFirst({ where: { id, eventId, isInternal: false }, select: { id: true, quantitySold: true } });
  if (!type) throw notFound("TICKET_TYPE_NOT_FOUND");
  if (type.quantitySold > quantity) throw new ConflictException({ code: "SEAT_INVENTORY_BELOW_SOLD", message: "Seat capacity cannot be reduced below sold seats" });
  await transaction.ticketType.update({ where: { id }, data: { price, deposit, currency, quantityTotal: Math.max(quantity, type.quantitySold), status: TicketTypeStatus.active } });
}
function notFound(code: string): NotFoundException { return new NotFoundException({ code, message: "Resource was not found" }); }
