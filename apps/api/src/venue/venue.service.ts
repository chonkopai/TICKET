import { randomUUID } from "node:crypto";

import { Prisma, TableStatus, type PrismaClient } from "@event-platform/database";
import {
  venueLayoutSchema,
  type CreateVenueLayoutRequest,
  type UpdateVenueLayoutRequest,
  type VenueLayout,
  type VenueLayoutJson,
  type VenueTemplateList,
} from "@event-platform/shared-types";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import { presentVenueLayout } from "./venue.presenter.js";

const EMPTY_LAYOUT: VenueLayoutJson = { version: 1, canvas: { width: 1000, height: 700 }, tables: [] };
type LayoutWithTables = Prisma.VenueLayoutGetPayload<{ include: { tables: true } }>;

@Injectable()
export class VenueService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    @Inject(TablesService) private readonly tables: TablesService,
  ) {}

  async createForEvent(organizerId: string, eventId: string, input: CreateVenueLayoutRequest): Promise<VenueLayout> {
    const layoutJson = parseIncomingLayout(input.layoutJson ?? EMPTY_LAYOUT);
    if (layoutJson.tables.length > 0) {
      throw new BadRequestException({ code: "VENUE_LAYOUT_UNKNOWN_TABLE", message: "Create tables before adding their geometry" });
    }
    try {
      const layout = await this.database.$transaction(async (transaction) => {
        await requireOwnedEvent(transaction, organizerId, eventId);
        const created = await transaction.venueLayout.create({
          data: { eventId, templateName: normalizedName(input.templateName ?? "Схема зала"), layoutJson },
          include: { tables: true },
        });
        await this.record(transaction, organizerId, created.id, "venue_layout.created", { eventId });
        return created;
      });
      return presentVenueLayout(layout);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException({ code: "VENUE_LAYOUT_EXISTS", message: "This event already has a venue layout" });
      throw error;
    }
  }

  async getForEvent(organizerId: string, eventId: string): Promise<VenueLayout> {
    const layout = await this.database.venueLayout.findFirst({ where: { eventId, event: { organizerId } }, include: { tables: { orderBy: { number: "asc" } } } });
    if (!layout) throw venueNotFound();
    await this.tables.expireLayoutHolds(layout.id);
    return presentVenueLayout(await this.database.venueLayout.findUniqueOrThrow({ where: { id: layout.id }, include: { tables: { orderBy: { number: "asc" } } } }));
  }

  async get(organizerId: string, id: string): Promise<VenueLayout> {
    const layout = await this.findOwned(this.database, organizerId, id);
    await this.tables.expireLayoutHolds(id);
    return presentVenueLayout(await this.database.venueLayout.findUniqueOrThrow({ where: { id: layout.id }, include: { tables: { orderBy: { number: "asc" } } } }));
  }

  async update(organizerId: string, id: string, input: UpdateVenueLayoutRequest): Promise<VenueLayout> {
    if (Object.keys(input).length === 0) throw new BadRequestException({ code: "VENUE_LAYOUT_UPDATE_EMPTY", message: "At least one layout field is required" });
    const updated = await this.database.$transaction(async (transaction) => {
      await lockLayout(transaction, id);
      const current = await this.findOwned(transaction, organizerId, id);
      const data: Prisma.VenueLayoutUpdateInput = {};
      const changedFields: string[] = [];
      if (input.templateName !== undefined) {
        data.templateName = normalizedName(input.templateName);
        changedFields.push("templateName");
      }
      if (input.layoutJson !== undefined) {
        const parsed = parseIncomingLayout(input.layoutJson);
        assertExactTableIds(parsed, current.tables.map(({ id: tableId }) => tableId));
        data.layoutJson = parsed;
        changedFields.push("layoutJson");
      }
      const layout = await transaction.venueLayout.update({ where: { id }, data, include: { tables: { orderBy: { number: "asc" } } } });
      await this.record(transaction, organizerId, id, "venue_layout.updated", { changedFields });
      return layout;
    });
    return presentVenueLayout(updated);
  }

  async delete(organizerId: string, id: string): Promise<{ deleted: true; id: string }> {
    await this.database.$transaction(async (transaction) => {
      await lockLayout(transaction, id);
      const layout = await this.findOwned(transaction, organizerId, id);
      await assertDeletable(transaction, id);
      await transaction.venueLayout.delete({ where: { id } });
      await this.record(transaction, organizerId, id, "venue_layout.deleted", { eventId: layout.eventId, template: layout.eventId === null });
    });
    return { deleted: true, id };
  }

  async saveTemplate(organizerId: string, sourceId: string, name: string): Promise<VenueLayout> {
    const template = await this.database.$transaction(async (transaction) => {
      await lockLayout(transaction, sourceId);
      const source = await this.findOwned(transaction, organizerId, sourceId);
      const cloned = await cloneLayout(transaction, source, { organizerId, templateName: normalizedName(name) });
      await this.record(transaction, organizerId, cloned.id, "venue_layout.template_created", { sourceLayoutId: sourceId });
      return cloned;
    });
    return presentVenueLayout(template);
  }

  async listTemplates(organizerId: string, query: { page: number; limit: number }): Promise<VenueTemplateList> {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.database.$transaction([
      this.database.venueLayout.findMany({ where: { organizerId, eventId: null }, include: { tables: { orderBy: { number: "asc" } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take: query.limit }),
      this.database.venueLayout.count({ where: { organizerId, eventId: null } }),
    ]);
    return { items: items.map(presentVenueLayout), page: query.page, limit: query.limit, total, hasNext: skip + items.length < total };
  }

  async applyTemplate(organizerId: string, eventId: string, templateId: string): Promise<VenueLayout> {
    const result = await this.database.$transaction(async (transaction) => {
      await requireOwnedEvent(transaction, organizerId, eventId);
      await lockLayout(transaction, templateId);
      const template = await transaction.venueLayout.findFirst({ where: { id: templateId, organizerId, eventId: null }, include: { tables: { orderBy: { number: "asc" } } } });
      if (!template) throw venueNotFound();
      const existing = await transaction.venueLayout.findUnique({ where: { eventId } });
      if (existing) {
        await lockLayout(transaction, existing.id);
        await assertDeletable(transaction, existing.id);
        await transaction.venueLayout.delete({ where: { id: existing.id } });
      }
      const cloned = await cloneLayout(transaction, template, { eventId, templateName: template.templateName });
      await this.record(transaction, organizerId, cloned.id, "venue_layout.template_applied", { eventId, templateId });
      return cloned;
    });
    return presentVenueLayout(result);
  }

  private async findOwned(
    database: Pick<PrismaClient, "venueLayout"> | Pick<Prisma.TransactionClient, "venueLayout">,
    organizerId: string,
    id: string,
  ) {
    const layout = await database.venueLayout.findFirst({
      where: { id, OR: [{ organizerId }, { event: { organizerId } }] },
      include: { tables: { orderBy: { number: "asc" } } },
    });
    if (!layout) throw venueNotFound();
    return layout;
  }

  private async record(
    transaction: Pick<Prisma.TransactionClient, "auditLog" | "outboxEvent">,
    actorId: string,
    id: string,
    eventType: string,
    meta: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.domainEvents.append(transaction, { eventType, aggregateType: "venue_layout", aggregateId: id, payload: meta });
    await transaction.auditLog.create({ data: { actorId, action: eventType, entityType: "venue_layout", entityId: id, meta } });
  }
}

async function cloneLayout(
  transaction: Prisma.TransactionClient,
  source: LayoutWithTables,
  owner: { eventId: string; templateName: string } | { organizerId: string; templateName: string },
) {
  const sourceJson = parseIncomingLayout(source.layoutJson);
  const created = await transaction.venueLayout.create({ data: { ...owner, layoutJson: EMPTY_LAYOUT }, include: { tables: true } });
  const idMap = new Map<string, string>();
  for (const table of source.tables) {
    const id = randomUUID();
    idMap.set(table.id, id);
    await transaction.table.create({ data: {
      id,
      venueLayoutId: created.id,
      number: table.number,
      name: table.name,
      seats: table.seats,
      price: table.price,
      deposit: table.deposit,
      currency: table.currency,
      description: table.description,
      status: table.status === TableStatus.unavailable ? TableStatus.unavailable : TableStatus.available,
    } });
  }
  const layoutJson = venueLayoutSchema.parse({ ...sourceJson, tables: sourceJson.tables.map((geometry) => ({ ...geometry, tableId: idMap.get(geometry.tableId)! })) });
  return transaction.venueLayout.update({ where: { id: created.id }, data: { layoutJson }, include: { tables: { orderBy: { number: "asc" } } } });
}

async function requireOwnedEvent(transaction: Prisma.TransactionClient, organizerId: string, eventId: string): Promise<void> {
  const event = await transaction.event.findFirst({ where: { id: eventId, organizerId }, select: { id: true } });
  if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
}

async function assertDeletable(transaction: Prisma.TransactionClient, layoutId: string): Promise<void> {
  const [bookings, holds] = await Promise.all([
    transaction.booking.count({ where: { table: { venueLayoutId: layoutId } } }),
    transaction.tableHold.count({ where: { table: { venueLayoutId: layoutId } } }),
  ]);
  if (bookings > 0 || holds > 0) throw new ConflictException({ code: "VENUE_LAYOUT_HAS_HISTORY", message: "A layout with hold or booking history cannot be deleted or replaced" });
}

function parseIncomingLayout(value: unknown): VenueLayoutJson {
  const result = venueLayoutSchema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: "VENUE_LAYOUT_INVALID", message: "Venue layout geometry is invalid", details: result.error.flatten() });
  return result.data;
}

function assertExactTableIds(layout: VenueLayoutJson, tableIds: string[]): void {
  const supplied = new Set(layout.tables.map(({ tableId }) => tableId));
  if (supplied.size !== tableIds.length || tableIds.some((id) => !supplied.has(id))) {
    throw new BadRequestException({ code: "VENUE_LAYOUT_TABLE_IDS_INVALID", message: "Layout geometry must reference every table in this layout exactly once" });
  }
}

async function lockLayout(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`venue-layout:${id}`}, 0))`;
}

function normalizedName(value: string): string {
  const name = value.trim();
  if (!name) throw new BadRequestException({ code: "VENUE_LAYOUT_NAME_REQUIRED", message: "Venue layout name is required" });
  return name;
}

function venueNotFound(): NotFoundException { return new NotFoundException({ code: "VENUE_LAYOUT_NOT_FOUND", message: "Venue layout was not found" }); }
