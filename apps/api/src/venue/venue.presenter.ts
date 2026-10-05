import type { Prisma, Seat, Table, VenueLayout as VenueLayoutRecord, VenueRow as VenueRowRecord } from "@event-platform/database";
import { venueLayoutSchemaAny, type VenueLayout } from "@event-platform/shared-types";

import { presentTable } from "../tables/tables.presenter.js";

export function presentVenueLayout(layout: VenueLayoutRecord & { tables: Table[]; rows?: Array<VenueRowRecord & { seats: Seat[] }> },projected?:VenueLayout["layoutJson"]): VenueLayout {
  return {
    id: layout.id,
    eventId: layout.eventId,
    organizerId: layout.organizerId,
    templateName: layout.templateName,
    layoutJson: projected??venueLayoutSchemaAny.parse(layout.layoutJson as Prisma.JsonValue) as VenueLayout["layoutJson"],
    revision: layout.revision,
    tables: layout.tables.map(presentTable),
    rows: layout.rows?.map((row) => ({ id: row.id, venueLayoutId: row.venueLayoutId, number: row.number, name: row.name, typeLabel: row.typeLabel, shortDescription: row.shortDescription, price: row.price, deposit: row.deposit, currency: row.currency.trim(), status: row.status, seats: row.seats.map((seat) => ({ id: seat.id, number: seat.number, label: seat.label, sortOrder: seat.sortOrder, status: seat.status, tableId: seat.tableId, rowId: seat.rowId, ticketTypeId: seat.ticketTypeId })) })) ?? [],
    createdAt: layout.createdAt.toISOString(),
    updatedAt: layout.updatedAt.toISOString(),
  };
}
