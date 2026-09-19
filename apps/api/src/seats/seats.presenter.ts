import type { Seat, VenueRow as VenueRowRecord } from "@event-platform/database";
import type { VenueRow, VenueSeat } from "@event-platform/shared-types";

export function presentSeat(seat: Seat): VenueSeat {
  return { id: seat.id, number: seat.number, label: seat.label, sortOrder: seat.sortOrder, status: seat.status, tableId: seat.tableId, rowId: seat.rowId, ticketTypeId: seat.ticketTypeId };
}

export function presentRow(row: VenueRowRecord & { seats: Seat[] }): VenueRow {
  return {
    id: row.id,
    venueLayoutId: row.venueLayoutId,
    number: row.number,
    name: row.name,
    typeLabel: row.typeLabel,
    shortDescription: row.shortDescription,
    price: row.price,
    deposit: row.deposit,
    currency: row.currency.trim(),
    status: row.status,
    seats: row.seats.map(presentSeat),
  };
}
