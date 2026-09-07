import type { Prisma, Table, VenueLayout as VenueLayoutRecord } from "@event-platform/database";
import { venueLayoutSchema, type VenueLayout } from "@event-platform/shared-types";

import { presentTable } from "../tables/tables.presenter.js";

export function presentVenueLayout(layout: VenueLayoutRecord & { tables: Table[] }): VenueLayout {
  return {
    id: layout.id,
    eventId: layout.eventId,
    organizerId: layout.organizerId,
    templateName: layout.templateName,
    layoutJson: venueLayoutSchema.parse(layout.layoutJson as Prisma.JsonValue),
    tables: layout.tables.map(presentTable),
    createdAt: layout.createdAt.toISOString(),
    updatedAt: layout.updatedAt.toISOString(),
  };
}
