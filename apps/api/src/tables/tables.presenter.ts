import type { Table } from "@event-platform/database";
import type { VenueTable } from "@event-platform/shared-types";

export function presentTable(table: Table): VenueTable {
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
    status: table.status,
    holdExpiresAt: table.holdExpiresAt?.toISOString() ?? null,
  };
}
