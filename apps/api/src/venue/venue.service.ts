import { assertCurrentResourceWrite,rejectHallDepositInput } from "../events/current-sale-policy.js";
import { randomUUID } from "node:crypto";

import { Prisma, TableStatus, type PrismaClient } from "@event-platform/database";
import {
  venueLayoutSchemaAny,
  publishedHallV3Schema,canonicalHallGeometry,editorHallV3,newEventCreationDraft,type EventLocale,
  type CreateVenueLayoutRequest,
  type UpdateVenueLayoutRequest,
  type VenueLayout,
  type VenueLayoutAny,
  type VenueLayoutJson,
  type VenueTemplateList,
} from "@event-platform/shared-types";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import { persistHallEditor } from "./hall-editor.persistence.js";
import { readCanonicalHall,canonicalHallCompatibility,canonicalHallSource } from "./canonical-hall.compat.js";
import { persistCanonicalHall,persistSelectedSale,validateSelectedSale } from "../creation-drafts/creation-sale.persistence.js";
import { configuredPaymentCurrencies } from "../booking/payment-provider.js";
import { loadApiEnv } from "@event-platform/config";
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
    rejectHallDepositInput(input.layoutJson);
    const layoutJson = parseIncomingLayout(input.layoutJson ?? EMPTY_LAYOUT);
    if (layoutJson.tables.length > 0 || (layoutJson.version === 2 && (layoutJson.rows.length > 0 || (layoutJson.editor?.objects.length ?? 0) > 0))) {
      throw new BadRequestException({ code: "VENUE_LAYOUT_UNKNOWN_TABLE", message: "Create tables before adding their geometry" });
    }
    try {
      const layout = await this.database.$transaction(async (transaction) => {
        await requireOwnedEvent(transaction, organizerId, eventId);
        const created = await transaction.venueLayout.create({
          data: { eventId, templateName: normalizedName(input.templateName ?? "Схема зала"), layoutJson },
          include: { tables: { include: { seatRecords: { orderBy: { sortOrder: "asc" } } } }, rows: { include: { seats: { orderBy: { sortOrder: "asc" } } } } },
        });
        await this.record(transaction, organizerId, created.id, "venue_layout.created", { eventId });
        return created;
      });
      return this.present(layout);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException({ code: "VENUE_LAYOUT_EXISTS", message: "This event already has a venue layout" });
      throw error;
    }
  }

  async getForEvent(organizerId: string, eventId: string): Promise<VenueLayout> {
    const layout = await this.database.venueLayout.findFirst({ where: { eventId, event: { organizerId } }, include: { tables: { include: { seatRecords: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } }, rows: { include: { seats: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } } } });
    if (!layout) throw venueNotFound();
    await this.tables.expireLayoutHolds(layout.id);
    return this.present(await this.database.venueLayout.findUniqueOrThrow({ where: { id: layout.id }, include: { tables: { include: { seatRecords: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } }, rows: { include: { seats: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } } } }));
  }

  async get(organizerId: string, id: string): Promise<VenueLayout> {
    const layout = await this.findOwned(this.database, organizerId, id);
    await this.tables.expireLayoutHolds(id);
    return this.present(await this.database.venueLayout.findUniqueOrThrow({ where: { id: layout.id }, include: { tables: { include: { seatRecords: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } }, rows: { include: { seats: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } } } }));
  }

  async update(organizerId: string, id: string, input: UpdateVenueLayoutRequest): Promise<VenueLayout> {
    rejectHallDepositInput(input.layoutJson);
    if (Object.keys(input).length === 0) throw new BadRequestException({ code: "VENUE_LAYOUT_UPDATE_EMPTY", message: "At least one layout field is required" });
    const updated = await this.database.$transaction(async (transaction) => {
      await lockLayout(transaction, id);
      const current = await this.findOwned(transaction, organizerId, id);
      if(current.eventId)assertCurrentResourceWrite(await transaction.event.findUniqueOrThrow({where:{id:current.eventId}}));
      if (input.revision !== undefined && input.revision !== current.revision) {
        throw new ConflictException({ code: "VENUE_LAYOUT_STALE_REVISION", message: "The venue layout changed. Reload before saving" });
      }
      const data: Prisma.VenueLayoutUpdateInput = {};
      const changedFields: string[] = [];
      if (input.templateName !== undefined) {
        data.templateName = normalizedName(input.templateName);
        changedFields.push("templateName");
      }
      if (input.layoutJson !== undefined) {
        let parsed = parseIncomingLayout(input.layoutJson,publishedHallV3Schema.safeParse(current.layoutJson).success);
        if(publishedHallV3Schema.safeParse(current.layoutJson).success){
          if(parsed.version!==2||!parsed.editor||input.revision===undefined)throw new BadRequestException({code:"VENUE_EDITOR_REQUIRED"});
          const event=current.eventId?await transaction.event.findUniqueOrThrow({where:{id:current.eventId}}):null;
          const previous=await readCanonicalHall(transaction,id,current.layoutJson),source=event?.sourceLocale as EventLocale??canonicalHallSource(previous);
          let hall;try{hall=editorHallV3(parsed.room,parsed.editor,previous,source);}catch{throw new BadRequestException({code:"VENUE_LAYOUT_INVALID"});}
          const currency=event?.currency?.trim()??(await transaction.hallTariff.findFirst({where:{venueLayoutId:id}}))?.currency?.trim()??"KZT";
          validateSelectedSale({...newEventCreationDraft(randomUUID(),source),selectedMode:"paid_seated",paidSeated:hall,currency},configuredPaymentCurrencies(loadApiEnv()));
          data.layoutJson=await persistCanonicalHall(transaction,current.eventId,id,hall,source,currency);
          changedFields.push("layoutJson");
        }else{
        if (!(parsed.version === 2 && parsed.editor)) {
          if (parseIncomingLayout(current.layoutJson).version === 2 && (current.layoutJson as Prisma.JsonObject).editor) throw new ConflictException({ code: "VENUE_EDITOR_REQUIRED", message: "Use the hall editor to update this layout" });
          assertExactTableIds(parsed, current.tables.map(({ id: tableId }) => tableId));
          if (parsed.version === 2) assertExactRowIds(parsed, current.rows.map(({ id: rowId }) => rowId));
        } else if (input.revision === undefined) throw new BadRequestException({ code: "VENUE_REVISION_REQUIRED", message: "A revision is required" });
        if (current.eventId) {
          const event = await transaction.event.findUniqueOrThrow({ where: { id: current.eventId }, select: { status: true } });
          if (event.status !== "draft" && parsed.version === 2) throw new ConflictException({ code: "VENUE_STRUCTURE_DRAFT_ONLY", message: "Venue structure can only change while the event is a draft" });
        }
        if (parsed.version === 2 && parsed.editor) parsed = await persistHallEditor(transaction, id, current.eventId, parsed);
        data.layoutJson = parsed;
        changedFields.push("layoutJson");
        }
      }
      const layout = await transaction.venueLayout.update({ where: { id }, data: { ...data, revision: { increment: 1 } }, include: { tables: { include: { seatRecords: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } }, rows: { include: { seats: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } } } });
      await this.record(transaction, organizerId, id, "venue_layout.updated", { changedFields });
      return layout;
    }, { timeout: 60_000 });
    return this.present(updated);
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

  async saveTemplate(organizerId: string, sourceId: string, name: string, objectIds?: string[]): Promise<VenueLayout> {
    const template = await this.database.$transaction(async (transaction) => {
      await lockLayout(transaction, sourceId);
      const source = await this.findOwned(transaction, organizerId, sourceId);
      let templateSource = source;
      if (objectIds) {
        const canonical=publishedHallV3Schema.safeParse(source.layoutJson).success;
        const original=canonical?await readCanonicalHall(transaction,source.id,source.layoutJson):null;
        const json=original?canonicalHallCompatibility(original,canonicalHallSource(original)):parseIncomingLayout(source.layoutJson);
        if (json.version !== 2 || !json.editor || objectIds.some((id) => !json.editor!.objects.some((o) => o.id === id))) throw new BadRequestException({code:"VENUE_TEMPLATE_SELECTION_INVALID",message:"Select objects belonging to this layout"});
        const selected = new Set(objectIds);
        const objects = json.editor.objects.filter((o) => selected.has(o.id) || (o.parentId && selected.has(o.parentId))).map((o) => ({...o, parentId:o.parentId && selected.has(o.parentId) ? o.parentId : null, side:o.parentId && !selected.has(o.parentId) ? null : o.side}));
        const selectedEditor={...json.editor,objects,tariffs:json.editor.tariffs.filter((t)=>objects.some((o)=>o.tariffId===t.id))};
        templateSource = {...source,layoutJson:original?JSON.parse(JSON.stringify(canonicalHallGeometry(editorHallV3(json.room,selectedEditor,original,canonicalHallSource(original))))):{...json,editor:selectedEditor}};
      }
      const cloned = await cloneLayout(transaction, templateSource, { organizerId, templateName: normalizedName(name) });
      await this.record(transaction, organizerId, cloned.id, "venue_layout.template_created", { sourceLayoutId: sourceId });
      return cloned;
    }, { timeout: 60_000 });
    return this.present(template);
  }

  async listTemplates(organizerId: string, query: { page: number; limit: number }): Promise<VenueTemplateList> {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.database.$transaction([
      this.database.venueLayout.findMany({
        where: { organizerId, eventId: null },
        include: {
          tables: { include: { seatRecords: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } },
          rows: { include: { seats: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit,
      }),
      this.database.venueLayout.count({ where: { organizerId, eventId: null } }),
    ]);
    return { items: await Promise.all(items.map(item=>this.present(item))), page: query.page, limit: query.limit, total, hasNext: skip + items.length < total };
  }

  async applyTemplate(organizerId: string, eventId: string, templateId: string): Promise<VenueLayout> {
    const result = await this.database.$transaction(async (transaction) => {
      await requireOwnedEvent(transaction, organizerId, eventId);
      await lockLayout(transaction, templateId);
      const template = await transaction.venueLayout.findFirst({ where: { id: templateId, organizerId, eventId: null }, include: { tables: { orderBy: { number: "asc" } }, rows: { include: { seats: true }, orderBy: { number: "asc" } } } });
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
    }, { timeout: 60_000 });
    return this.present(result);
  }

  private async present(layout:Parameters<typeof presentVenueLayout>[0]):Promise<VenueLayout>{
    if(!publishedHallV3Schema.safeParse(layout.layoutJson).success)return presentVenueLayout(layout);
    const hall=await readCanonicalHall(this.database,layout.id,layout.layoutJson);
    const source=layout.eventId?await this.database.event.findUniqueOrThrow({where:{id:layout.eventId},select:{sourceLocale:true}}):null;
    return {...presentVenueLayout(layout,canonicalHallCompatibility(hall,(source?.sourceLocale??canonicalHallSource(hall)) as EventLocale)),canonicalVersion:3};
  }

  private async findOwned(
    database: Pick<PrismaClient, "venueLayout"> | Pick<Prisma.TransactionClient, "venueLayout">,
    organizerId: string,
    id: string,
  ) {
    const layout = await database.venueLayout.findFirst({
      where: { id, OR: [{ organizerId }, { event: { organizerId } }] },
      include: { tables: { include: { seatRecords: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } }, rows: { select: { id: true } } },
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
  if(publishedHallV3Schema.safeParse(source.layoutJson).success){
    const original=await readCanonicalHall(transaction,source.id,source.layoutJson),locale=canonicalHallSource(original),resources=await transaction.hallTariff.findMany({where:{venueLayoutId:source.id},select:{currency:true}}),currencies=[...new Set(resources.map(row=>row.currency?.trim()).filter((code):code is string=>!!code))];
    if(currencies.length>1)throw new ConflictException({code:"EVENT_CURRENCY_REVIEW_REQUIRED"});
    const currency=currencies[0]??"KZT",objectIds=new Map(original.objects.map(object=>[object.id,randomUUID()])),tariffIds=new Map(original.tariffs.map(tariff=>[tariff.id,randomUUID()]));
    const hall={...original,objects:original.objects.map(object=>({...object,id:objectIds.get(object.id)!,parentId:object.parentId?objectIds.get(object.parentId)!:null,tariffId:object.tariffId?tariffIds.get(object.tariffId)!:null})),tariffs:original.tariffs.map(tariff=>({...tariff,id:tariffIds.get(tariff.id)!}))};
    const created=await transaction.venueLayout.create({data:{...owner,layoutJson:EMPTY_LAYOUT},include:{tables:true}});
    if("eventId" in owner){const event=await transaction.event.findUniqueOrThrow({where:{id:owner.eventId}});if(event.currency&&event.currency.trim()!==currency)throw new ConflictException({code:"CURRENCY_RELABEL_CONFIRMATION_REQUIRED"});const draft={...newEventCreationDraft(randomUUID(),event.sourceLocale as EventLocale),selectedMode:"paid_seated" as const,paidSeated:hall,currency};await persistSelectedSale(transaction,event.id,event.organizerId,draft,configuredPaymentCurrencies(loadApiEnv()));}
    else await persistCanonicalHall(transaction,null,created.id,hall,locale,currency);
    return transaction.venueLayout.findUniqueOrThrow({where:{id:created.id},include:{tables:{include:{seatRecords:true}},rows:{include:{seats:true}}}});
  }
  const legacyPricing=await transaction.table.count({where:{venueLayoutId:source.id,deposit:{gt:0}}})+await transaction.venueRow.count({where:{venueLayoutId:source.id,deposit:{gt:0}}});
  if(legacyPricing)throw new ConflictException({code:"LEGACY_DEPOSIT_TEMPLATE_REVIEW_REQUIRED"});
  const sourceJson = parseIncomingLayout(source.layoutJson);
  if(sourceJson.version===2&&sourceJson.editor?.objects.some(object=>object.deposit>0))throw new ConflictException({code:"LEGACY_DEPOSIT_TEMPLATE_REVIEW_REQUIRED"});
  const sourceResources=[...(await transaction.table.findMany({where:{venueLayoutId:source.id},select:{currency:true}})),...(await transaction.venueRow.findMany({where:{venueLayoutId:source.id},select:{currency:true}})),...(source.eventId?await transaction.ticketType.findMany({where:{eventId:source.eventId},select:{currency:true}}):[])];
  const sourceCurrencies=[...new Set(sourceResources.map(resource=>resource.currency.trim()))];
  if(sourceCurrencies.length>1)throw new ConflictException({code:"EVENT_CURRENCY_REVIEW_REQUIRED"});
  const sourceCurrency=sourceCurrencies[0]??"KZT";
  if("eventId" in owner){const event=await transaction.event.findUniqueOrThrow({where:{id:owner.eventId}});if(event.currency&&event.currency.trim()!==sourceCurrency)throw new ConflictException({code:"CURRENCY_RELABEL_CONFIRMATION_REQUIRED"});}
  const created = await transaction.venueLayout.create({ data: { ...owner, layoutJson: EMPTY_LAYOUT }, include: { tables: true } });
  if (sourceJson.version === 2 && sourceJson.editor) {
    const ids = new Map(sourceJson.editor.objects.map((o) => [o.id, randomUUID()]));
    const tariffIds = new Map(sourceJson.editor.tariffs.map((t) => [t.id, randomUUID()]));
    const editor = { ...sourceJson.editor,
      objects: sourceJson.editor.objects.map((o) => ({ ...o, id: ids.get(o.id)!, parentId: o.parentId ? ids.get(o.parentId)! : null, tariffId: o.tariffId ? tariffIds.get(o.tariffId)! : null })),
      tariffs: sourceJson.editor.tariffs.map((t) => ({ ...t, id: tariffIds.get(t.id)! })),
    };
    const layoutJson = await persistHallEditor(transaction, created.id, "eventId" in owner ? owner.eventId : null, { ...sourceJson, editor },sourceCurrency);
    return transaction.venueLayout.update({ where: { id: created.id }, data: { layoutJson }, include: { tables: { include: { seatRecords: true }, orderBy: { number: "asc" } }, rows: { include: { seats: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } } } });
  }

  const sourceTables = await transaction.table.findMany({ where: { venueLayoutId: source.id }, include: { seatRecords: true }, orderBy: { number: "asc" } });
  const sourceRows = await transaction.venueRow.findMany({ where: { venueLayoutId: source.id }, include: { seats: true }, orderBy: { number: "asc" } });
  const idMap = new Map<string, string>();
  const rowIdMap = new Map<string, string>();
  for (const table of sourceTables) {
    const id = randomUUID();
    idMap.set(table.id, id);
    await transaction.table.create({ data: {
      id,
      venueLayoutId: created.id,
      number: table.number,
      name: table.name,
      seats: table.seats,
      price: table.price,
      deposit: 0,
      currency: table.currency,
      description: table.description,
      typeLabel: table.typeLabel,
      shortDescription: table.shortDescription,
      saleMode: table.saleMode,
      status: table.status === TableStatus.unavailable ? TableStatus.unavailable : TableStatus.available,
    } });
    for (const seat of table.seatRecords) {
      await transaction.seat.create({ data: { id: randomUUID(), venueLayoutId: created.id, tableId: id, number: seat.number, label: String(seat.number), sortOrder: seat.sortOrder, status: seat.status } });
    }
  }
  for (const row of sourceRows) {
    const id = randomUUID();
    rowIdMap.set(row.id, id);
    await transaction.venueRow.create({ data: { id, venueLayoutId: created.id, number: row.number, name: row.name, typeLabel: row.typeLabel, shortDescription: row.shortDescription, price: row.price, deposit: 0, currency: row.currency, status: row.status === TableStatus.unavailable ? TableStatus.unavailable : TableStatus.available } });
    for (const seat of row.seats) {
      await transaction.seat.create({ data: { id: randomUUID(), venueLayoutId: created.id, rowId: id, number: seat.number, label: String(seat.number), sortOrder: seat.sortOrder, status: seat.status } });
    }
  }
  const layoutJson = venueLayoutSchemaAny.parse({
    ...sourceJson,
    tables: sourceJson.tables.map((geometry) => ({ ...geometry, tableId: idMap.get(geometry.tableId)! })),
    ...(sourceJson.version === 2 ? { rows: sourceJson.rows.map((row) => ({ ...row, rowId: rowIdMap.get(row.rowId)! })) } : {}),
  });
  return transaction.venueLayout.update({ where: { id: created.id }, data: { layoutJson }, include: { tables: { orderBy: { number: "asc" } }, rows: { include: { seats: { orderBy: { sortOrder: "asc" } } }, orderBy: { number: "asc" } } } });
}

async function requireOwnedEvent(transaction: Prisma.TransactionClient, organizerId: string, eventId: string): Promise<void> {
  const event = await transaction.event.findFirst({ where: { id: eventId, organizerId }, select: { id: true, status: true, paymentMode: true, creationVersion: true } });
  if(event)assertCurrentResourceWrite(event);
  if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
}

async function assertDeletable(transaction: Prisma.TransactionClient, layoutId: string): Promise<void> {
  const layout=await transaction.venueLayout.findUniqueOrThrow({where:{id:layoutId},include:{event:{select:{status:true}}}});
  if(layout.event&&layout.event.status!=="draft"&&layout.layoutJson&&typeof layout.layoutJson==="object"&&!Array.isArray(layout.layoutJson)&&(layout.layoutJson.version===3||layout.layoutJson.editor))throw new ConflictException({code:"VENUE_STRUCTURE_DRAFT_ONLY"});
  const history = await Promise.all([
    transaction.booking.count({ where: { table: { venueLayoutId: layoutId } } }),
    transaction.tableHold.count({ where: { table: { venueLayoutId: layoutId } } }),
    transaction.seatAllocation.count({where:{seat:{venueLayoutId:layoutId}}}),
    transaction.ticket.count({where:{ticketType:{seats:{some:{venueLayoutId:layoutId}}}}}),
    transaction.ticketReservation.count({where:{ticketType:{seats:{some:{venueLayoutId:layoutId}}}}}),
  ]);
  if (history.some(Boolean)) throw new ConflictException({ code: "VENUE_LAYOUT_HAS_HISTORY", message: "A layout with purchase, seat, hold or booking history cannot be deleted or replaced" });
}

function parseIncomingLayout(value: unknown,canonical=false): VenueLayoutAny {
  let candidate=value;
  if(canonical&&value&&typeof value==="object"&&"editor" in value){
    const v=value as Extract<VenueLayoutAny,{version:2}>;
    if(v.editor&&Array.isArray(v.editor.objects)&&Array.isArray(v.editor.tariffs))candidate={...v,editor:{...v.editor,objects:v.editor.objects.map(o=>({...o,name:typeof o.name==="string"?"":o.name,description:typeof o.description==="string"?"":o.description})),tariffs:v.editor.tariffs.map(t=>({...t,name:typeof t.name==="string"?"Tariff":t.name}))}};
  }
  const result = venueLayoutSchemaAny.safeParse(candidate);
  if (!result.success) throw new BadRequestException({ code: "VENUE_LAYOUT_INVALID", message: "Venue layout geometry is invalid", details: result.error.flatten() });
  return canonical?value as VenueLayoutAny:result.data;
}

function assertExactTableIds(layout: VenueLayoutAny, tableIds: string[]): void {
  const supplied = new Set(layout.tables.map(({ tableId }) => tableId));
  if (supplied.size !== tableIds.length || tableIds.some((id) => !supplied.has(id))) {
    throw new BadRequestException({ code: "VENUE_LAYOUT_TABLE_IDS_INVALID", message: "Layout geometry must reference every table in this layout exactly once" });
  }
}

function assertExactRowIds(layout: Extract<VenueLayoutAny, { version: 2 }>, rowIds: string[]): void {
  const supplied = new Set(layout.rows.map(({ rowId }) => rowId));
  if (supplied.size !== rowIds.length || rowIds.some((id) => !supplied.has(id))) {
    throw new BadRequestException({ code: "VENUE_LAYOUT_ROW_IDS_INVALID", message: "Layout geometry must reference every row in this layout exactly once" });
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
