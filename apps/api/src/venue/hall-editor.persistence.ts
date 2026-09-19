import { randomUUID } from "node:crypto";
import type { Prisma } from "@event-platform/database";
import { effectivePrice, metres, rotatePoint, type HallEditor, type VenueLayoutJsonV2 } from "@event-platform/shared-types";
import { ConflictException } from "@nestjs/common";

/** Editor metadata and sellable inventory are committed under the caller's layout lock. */
export async function persistHallEditor(tx: Prisma.TransactionClient, layoutId: string, eventId: string | null, json: VenueLayoutJsonV2): Promise<VenueLayoutJsonV2> {
  if(eventId) {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
    const event=await tx.event.findUniqueOrThrow({where:{id:eventId},select:{status:true}});
    if(event.status!=="draft") throw new ConflictException({code:"VENUE_STRUCTURE_DRAFT_ONLY",message:"Venue structure can only change while the event is a draft"});
  }
  const editor = json.editor!;
  const objects = editor.objects;
  const existingSeats = await tx.seat.findMany({ where: { venueLayoutId: layoutId }, select: { id: true, ticketTypeId: true } });
  const existingTables = await tx.table.findMany({ where: { venueLayoutId: layoutId }, select: { id: true } });
  const existingRows = await tx.venueRow.findMany({ where: { venueLayoutId: layoutId }, select: { id: true } });
  const managedTypes = eventId ? await tx.ticketType.findMany({ where: { eventId, venueObjectId: { not: null } }, select: { id: true } }) : [];
  const previousTypeIds = [...new Set([...existingSeats.flatMap((s) => s.ticketTypeId ? [s.ticketTypeId] : []), ...managedTypes.map((t) => t.id)])];
  const history = await Promise.all([
    tx.seatAllocation.count({ where: { seat: { venueLayoutId: layoutId } } }),
    tx.tableHold.count({ where: { table: { venueLayoutId: layoutId } } }),
    tx.booking.count({ where: { table: { venueLayoutId: layoutId } } }),
    tx.ticket.count({ where: { ticketTypeId: { in: previousTypeIds } } }),
    tx.ticketReservation.count({ where: { ticketTypeId: { in: previousTypeIds } } }),
  ]);
  if (history.some(Boolean)) throw new ConflictException({ code: "VENUE_LAYOUT_HAS_HISTORY", message: "A layout with purchase or allocation history cannot be structurally edited" });
  // Reject IDs belonging to another layout before any upsert; UUIDs supplied by clients are not ownership proof.
  const objectIds = objects.map((o) => o.id);
  const foreign = await Promise.all([
    tx.table.count({ where: { id: { in: objectIds }, venueLayoutId: { not: layoutId } } }),
    tx.venueRow.count({ where: { id: { in: objectIds }, venueLayoutId: { not: layoutId } } }),
    tx.seat.count({ where: { id: { in: objectIds }, venueLayoutId: { not: layoutId } } }),
  ]);
  if (foreign.some(Boolean)) throw new ConflictException({ code: "VENUE_OBJECT_OWNER_MISMATCH", message: "Object IDs must belong to this layout" });
  const tableObjects = objects.filter((o) => o.type === "table_rect" || o.type === "table_round");
  const rowObjects = objects.filter((o) => o.type === "row");
  const seatObjects = objects.filter((o) => o.type === "seat");
  // Free the per-parent number indexes, retaining stable seat identities.
  await tx.seat.updateMany({ where: { venueLayoutId: layoutId }, data: { tableId: null, rowId: null } });
  await tx.seat.deleteMany({ where: { venueLayoutId: layoutId, id: { notIn: seatObjects.map((o) => o.id) } } });
  await tx.table.deleteMany({ where: { id: { in: existingTables.filter((t) => !tableObjects.some((o) => o.id === t.id)).map((t) => t.id) } } });
  await tx.venueRow.deleteMany({ where: { id: { in: existingRows.filter((t) => !rowObjects.some((o) => o.id === t.id)).map((t) => t.id) } } });
  // Temporary unique numbers permit reordering without unique-index collisions.
  for (let i = 0; i < existingTables.length; i++) await tx.table.updateMany({ where: { id: existingTables[i]!.id }, data: { number: 1_000_000 + i } });
  for (let i = 0; i < existingRows.length; i++) await tx.venueRow.updateMany({ where: { id: existingRows[i]!.id }, data: { number: 1_000_000 + i } });
  for (const [i, object] of tableObjects.entries()) {
    const data = { number: i + 1, name: object.name, seats: seatObjects.filter((s) => s.parentId === object.id).length, price: effectivePrice(object, editor) ?? 0, deposit: object.deposit, currency: "KZT", saleMode: object.saleMode, status: !seatObjects.some((s) => s.parentId === object.id) ? "unavailable" as const : "available" as const };
    await tx.table.upsert({ where: { id: object.id }, create: { id: object.id, venueLayoutId: layoutId, ...data }, update: data });
  }
  for (const [i, object] of rowObjects.entries()) {
    const data = { number: i + 1, name: object.name, price: effectivePrice(object, editor) ?? 0, deposit: object.deposit, currency: "KZT" };
    await tx.venueRow.upsert({ where: { id: object.id }, create: { id: object.id, venueLayoutId: layoutId, ...data }, update: data });
  }
  const activeTypeObjects: string[] = [];
  for (const [i, object] of seatObjects.entries()) {
    const parent = objects.find((o) => o.id === object.parentId);
    let ticketTypeId: string | null = null;
    if (eventId && (!parent || parent.type === "row" || parent.saleMode === "per_seat")) {
      activeTypeObjects.push(object.id);
      const price = effectivePrice(object, editor) ?? (parent ? effectivePrice(parent, editor) : null) ?? 0;
      const data = { name: `${object.name || `Место ${object.number}`} · ${object.id}`, price, deposit: object.deposit || parent?.deposit || 0, currency: "KZT", quantityTotal: 1, status: "active" as const };
      const type = await tx.ticketType.upsert({ where: { venueObjectId: object.id }, create: { id: randomUUID(), eventId, venueObjectId: object.id, ...data }, update: data });
      if (type.eventId !== eventId) throw new ConflictException({ code: "VENUE_OBJECT_OWNER_MISMATCH", message: "Ticket type belongs to another event" });
      ticketTypeId = type.id;
    }
    const data = { tableId: parent?.type.startsWith("table_") ? parent.id : null, rowId: parent?.type === "row" ? parent.id : null, number: object.number, label: object.name || String(object.number), sortOrder: i, ticketTypeId, status: object.locked ? "disabled" as const : "available" as const };
    await tx.seat.upsert({ where: { id: object.id }, create: { id: object.id, venueLayoutId: layoutId, ...data }, update: data });
  }
  for (const object of objects.filter((o) => o.type === "zone")) if (eventId) {
    activeTypeObjects.push(object.id);
    const data = { name: `${object.name || "Зона"} · ${object.id}`, price: effectivePrice(object, editor) ?? 0, deposit: object.deposit, currency: "KZT", quantityTotal: object.capacity, status: object.capacity ? "active" as const : "draft" as const };
    const type = await tx.ticketType.upsert({ where: { venueObjectId: object.id }, create: { id: randomUUID(), eventId, venueObjectId: object.id, ...data }, update: data });
    if (type.eventId !== eventId) throw new ConflictException({ code: "VENUE_OBJECT_OWNER_MISMATCH", message: "Ticket type belongs to another event" });
  }
  if (eventId) await tx.ticketType.updateMany({ where: { eventId, venueObjectId: { not: null, notIn: activeTypeObjects } }, data: { status: "draft" } });
  if (previousTypeIds.length) await tx.ticketType.updateMany({ where: { id: { in: previousTypeIds }, venueObjectId: null, seats: { none: {} } }, data: { status: "draft" } });
  return projectHallEditor(json, editor);
}

export function projectHallEditor(json: VenueLayoutJsonV2, editor: HallEditor): VenueLayoutJsonV2 {
  return { ...json, editor, stage: null,
    tables: editor.objects.filter((o) => o.type.startsWith("table_")).map((o) => ({ tableId: o.id, x: metres(o.x - o.width / 2), y: metres(o.y - o.height / 2), width: o.width, height: o.type === "table_round" ? o.width : o.height, rotation: o.rotation, shape: o.type === "table_round" ? "round" : "rectangle", preset: "custom", seats: editor.objects.filter((s) => s.parentId === o.id).map((s) => (() => { const local = rotatePoint(s.x-o.x,s.y-o.y,-o.rotation); return { number:s.number, x:metres(50+local.x/o.width*100), y:metres(50+local.y/o.height*100), ...(s.side ? {side:s.side} : {}) }; })()) })),
    rows: editor.objects.filter((o) => o.type === "row").map((o) => ({ rowId: o.id, x: metres(o.x - o.width / 2), y: metres(o.y - o.height / 2), width: o.width, height: o.height, rotation: o.rotation, seatCount: editor.objects.filter((s) => s.parentId === o.id).length, seatSpacing: 0.45 })),
  };
}

export function assertLegacyLayout(value: Prisma.JsonValue): void {
  if (value && typeof value === "object" && !Array.isArray(value) && value.editor) throw new ConflictException({ code: "VENUE_EDITOR_REQUIRED", message: "Update this layout through the hall editor with its current revision" });
}
