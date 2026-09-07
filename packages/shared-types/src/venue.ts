import { z } from "zod";

const finiteNumber = z.number().finite();

export const tableGeometrySchema = z
  .object({
    tableId: z.string().uuid(),
    x: finiteNumber.min(0).max(5_000),
    y: finiteNumber.min(0).max(5_000),
    width: finiteNumber.min(24).max(400),
    height: finiteNumber.min(24).max(400),
    rotation: finiteNumber.min(-180).max(180).optional(),
  })
  .strict();

export const venueLayoutSchema = z
  .object({
    version: z.literal(1),
    canvas: z
      .object({
        width: finiteNumber.min(320).max(5_000),
        height: finiteNumber.min(320).max(5_000),
      })
      .strict(),
    tables: z.array(tableGeometrySchema).max(500),
  })
  .strict()
  .superRefine((layout, context) => {
    const ids = new Set<string>();
    for (const [index, table] of layout.tables.entries()) {
      if (ids.has(table.tableId)) {
        context.addIssue({
          code: "custom",
          path: ["tables", index, "tableId"],
          message: "Table IDs must be unique",
        });
      }
      ids.add(table.tableId);
      if (table.x + table.width > layout.canvas.width) {
        context.addIssue({ code: "custom", path: ["tables", index, "x"], message: "Table exceeds canvas width" });
      }
      if (table.y + table.height > layout.canvas.height) {
        context.addIssue({ code: "custom", path: ["tables", index, "y"], message: "Table exceeds canvas height" });
      }
    }
  });

export type TableGeometry = z.infer<typeof tableGeometrySchema>;
export type VenueLayoutJson = z.infer<typeof venueLayoutSchema>;
export type ManagedTableStatus = "available" | "unavailable";
export type TableStatus = ManagedTableStatus | "held" | "booked";

export interface VenueTable {
  id: string;
  venueLayoutId: string;
  number: number;
  name: string | null;
  seats: number;
  price: number;
  deposit: number;
  currency: string;
  description: string | null;
  status: TableStatus;
  holdExpiresAt: string | null;
}

export interface VenueLayout {
  id: string;
  eventId: string | null;
  organizerId: string | null;
  templateName: string;
  layoutJson: VenueLayoutJson;
  tables: VenueTable[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateVenueLayoutRequest {
  templateName?: string;
  layoutJson?: VenueLayoutJson;
}

export interface UpdateVenueLayoutRequest {
  templateName?: string;
  layoutJson?: VenueLayoutJson;
}

export interface CreateVenueTemplateRequest {
  name: string;
}

export interface ApplyVenueTemplateRequest {
  templateId: string;
}

export interface VenueTemplateList {
  items: VenueLayout[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export interface CreateTableRequest {
  number: number;
  name?: string | null;
  seats: number;
  price: number;
  deposit: number;
  currency?: string;
  description?: string | null;
  status?: ManagedTableStatus;
  geometry: Omit<TableGeometry, "tableId">;
}

export type UpdateTableRequest = Partial<Omit<CreateTableRequest, "geometry">>;

export interface TableHoldResponse {
  tableId: string;
  holdToken: string;
  expiresAt: string;
}

export interface ReleaseTableHoldRequest {
  holdToken: string;
}

export interface ReleaseTableHoldResponse {
  tableId: string;
  released: true;
  status: "released" | "expired";
}
