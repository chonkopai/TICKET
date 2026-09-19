import type { Table } from "@event-platform/database";
import type { VenueSeat, VenueTable } from "@event-platform/shared-types";

type TableWithSeats = Table & { seatRecords?: Array<{ id: string; number: number; label: string; sortOrder: number; status: "available" | "disabled"; tableId: string | null; rowId: string | null; ticketTypeId: string | null }> };

export function presentTable(table: TableWithSeats): VenueTable {
  return {
    id: table.id,
    venueLayoutId: table.venueLayoutId,
    number: table.number,
    name: table.name,
    seats: table.seats,
    price: table.price,
    deposit: table.deposit,
    currency: table.currency,
    description: table.description,
    typeLabel: table.typeLabel,
    shortDescription: table.shortDescription,
    saleMode: table.saleMode,
    status: table.status,
    holdExpiresAt: table.holdExpiresAt?.toISOString() ?? null,
    ...(table.seatRecords ? { seatRecords: table.seatRecords.map((seat): VenueSeat => ({
      id: seat.id,
      number: seat.number,
      label: seat.label,
      sortOrder: seat.sortOrder,
      status: seat.status,
      tableId: seat.tableId,
      rowId: seat.rowId,
      ticketTypeId: seat.ticketTypeId,
    })) } : {}),
  };
}
