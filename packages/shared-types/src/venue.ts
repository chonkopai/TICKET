import { z } from "zod";
import { hallEditorSchema } from "./hall-editor.js";

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

const venueLayoutV1Schema = z
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

const seatArrangementSchema = z.object({
  number: z.number().int().min(1).max(1_000_000),
  x: finiteNumber.min(-10000).max(10000),
  y: finiteNumber.min(-10000).max(10000),
  side: z.enum(["top", "right", "bottom", "left"]).optional(),
}).strict();

export const tableGeometryV2Schema = z.object({
  tableId: z.string().uuid(),
  x: finiteNumber.min(-1000).max(1000),
  y: finiteNumber.min(-1000).max(1000),
  width: finiteNumber.min(0.1).max(200),
  height: finiteNumber.min(0.1).max(200),
  rotation: finiteNumber.min(-180).max(180).optional(),
  shape: z.enum(["round", "square", "rectangle"]).default("square"),
  preset: z.enum(["one", "two", "four", "six", "eight", "custom"]).default("four"),
  seats: z.array(seatArrangementSchema).max(2000),
}).strict();

export const rowGeometryV2Schema = z.object({
  rowId: z.string().uuid(),
  x: finiteNumber.min(-1000).max(1000),
  y: finiteNumber.min(-1000).max(1000),
  width: finiteNumber.min(0.1).max(200),
  height: finiteNumber.min(0.1).max(200),
  rotation: finiteNumber.min(-180).max(180).optional(),
  seatCount: z.number().int().min(0).max(2000),
  seatSpacing: finiteNumber.min(0).max(10),
}).strict();

export const venueLayoutSchemaV2 = z.object({
  version: z.literal(2),
  editor: hallEditorSchema.optional(),
  room: z.object({ widthM: finiteNumber.min(1).max(200), heightM: finiteNumber.min(1).max(200) }).strict(),
  stage: z.object({ label: z.string().trim().min(1).max(80), x: finiteNumber.min(-1000).max(1000), y: finiteNumber.min(-1000).max(1000), width: finiteNumber.min(0.5).max(200), height: finiteNumber.min(0.5).max(200), rotation: finiteNumber.min(-180).max(180).optional() }).strict().nullable().optional(),
  tables: z.array(tableGeometryV2Schema).max(500),
  rows: z.array(rowGeometryV2Schema).max(100),
}).strict().superRefine((layout, context) => {
  if (layout.editor && (layout.room.widthM < 2 || layout.room.heightM < 2)) context.addIssue({code:"custom",message:"Editor rooms must be at least 2 metres"});
  const tableIds = new Set<string>();
  for (const [index, table] of layout.tables.entries()) {
    if (tableIds.has(table.tableId)) context.addIssue({ code: "custom", path: ["tables", index, "tableId"], message: "Table IDs must be unique" });
    tableIds.add(table.tableId);
    const seatNumbers = new Set<number>();
    for (const [seatIndex, seat] of table.seats.entries()) {
      if (seatNumbers.has(seat.number)) context.addIssue({ code: "custom", path: ["tables", index, "seats", seatIndex, "number"], message: "Seat numbers must be unique within a table" });
      seatNumbers.add(seat.number);
    }
    if (!layout.editor && (table.x + table.width > layout.room.widthM || table.y + table.height > layout.room.heightM)) context.addIssue({ code: "custom", path: ["tables", index], message: "Table exceeds room bounds" });
  }
  const rowIds = new Set<string>();
  for (const [index, row] of layout.rows.entries()) {
    if (rowIds.has(row.rowId)) context.addIssue({ code: "custom", path: ["rows", index, "rowId"], message: "Row IDs must be unique" });
    rowIds.add(row.rowId);
    if (!layout.editor && (row.x + row.width > layout.room.widthM || row.y + row.height > layout.room.heightM)) context.addIssue({ code: "custom", path: ["rows", index], message: "Row exceeds room bounds" });
  }
  if (!layout.editor && layout.stage && (layout.stage.x + layout.stage.width > layout.room.widthM || layout.stage.y + layout.stage.height > layout.room.heightM)) context.addIssue({ code: "custom", path: ["stage"], message: "Stage exceeds room bounds" });
  const seatCount = layout.tables.reduce((sum, table) => sum + table.seats.length, 0) + layout.rows.reduce((sum, row) => sum + row.seatCount, 0);
  if (seatCount > 2_000) context.addIssue({ code: "custom", path: ["tables"], message: "A layout cannot contain more than 2,000 seats" });
});

export const venueLayoutSchema = venueLayoutV1Schema;
export const venueLayoutSchemaAny = z.union([venueLayoutV1Schema, venueLayoutSchemaV2]);

export type TableGeometry = z.infer<typeof tableGeometrySchema>;
export type VenueLayoutJsonV1 = z.infer<typeof venueLayoutV1Schema>;
export type VenueLayoutJsonV2 = z.infer<typeof venueLayoutSchemaV2>;
export type VenueLayoutJson = VenueLayoutJsonV1;
export type VenueLayoutAny = VenueLayoutJsonV1 | VenueLayoutJsonV2;
export type TableGeometryV2 = VenueLayoutJsonV2["tables"][number];
export type RowGeometryV2 = VenueLayoutJsonV2["rows"][number];

/** Shared deterministic visual defaults; organizers choose seats, not physical measurements. */
export function defaultTableSize(seatCount: number, shape: "round" | "square" | "rectangle" = "square"): { width: number; height: number } {
  const count = Math.max(1, Math.min(100, Math.trunc(seatCount)));
  const side = count <= 2 ? 1.2 : count <= 4 ? 1.6 : count <= 6 ? 2 : count <= 8 ? 2.4 : 2.4 + Math.ceil((count - 8) / 2) * 0.55;
  if (shape === "round") return { width: side, height: side };
  if (shape === "rectangle") return { width: side * 1.35, height: side };
  return { width: side, height: side };
}
export type ManagedTableStatus = "available" | "unavailable";
export type TableStatus = ManagedTableStatus | "held" | "booked";
export type TableSaleMode = "whole_table" | "per_seat";
export type SeatStatus = "available" | "disabled";
export type SeatAllocationStatus = "active" | "released" | "consumed";

export interface VenueSeat {
  id: string;
  number: number;
  label: string;
  sortOrder: number;
  status: SeatStatus;
  tableId: string | null;
  rowId: string | null;
  ticketTypeId: string | null;
}

export interface VenueRow {
  id: string;
  venueLayoutId: string;
  number: number;
  name: string | null;
  typeLabel: string | null;
  shortDescription: string | null;
  price: number;
  deposit: number;
  currency: string;
  status: TableStatus;
  seats: VenueSeat[];
}

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
  typeLabel: string | null;
  shortDescription: string | null;
  saleMode: TableSaleMode;
  status: TableStatus;
  holdExpiresAt: string | null;
  seatRecords?: VenueSeat[];
}

export interface VenueLayout {
  id: string;
  eventId: string | null;
  organizerId: string | null;
  templateName: string;
  layoutJson: VenueLayoutAny;
  revision: number;
  tables: VenueTable[];
  rows: VenueRow[];
  seats?: VenueSeat[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateVenueLayoutRequest {
  templateName?: string;
  layoutJson?: VenueLayoutAny;
}

export interface UpdateVenueLayoutRequest {
  templateName?: string;
  layoutJson?: VenueLayoutAny;
  revision?: number;
}

export interface CreateVenueTemplateRequest {
  name: string;
  objectIds?: string[];
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
  typeLabel?: string | null;
  shortDescription?: string | null;
  saleMode?: TableSaleMode;
  status?: ManagedTableStatus;
  geometry: Omit<TableGeometry, "tableId"> | Omit<TableGeometryV2, "tableId">;
}

export type UpdateTableRequest = Partial<Omit<CreateTableRequest, "geometry">>;

export interface CreateVenueRowRequest {
  number: number;
  name?: string | null;
  typeLabel?: string | null;
  shortDescription?: string | null;
  price: number;
  deposit: number;
  currency?: string;
  seatCount: number;
  startSeatNumber?: number;
  geometry?: Omit<RowGeometryV2, "rowId" | "seatCount">;
  status?: ManagedTableStatus;
  ticketTypeId?: string | null;
}

export type UpdateVenueRowRequest = Partial<CreateVenueRowRequest>;

export interface CreateSeatRequest {
  number: number;
  sortOrder?: number;
  ticketTypeId?: string | null;
}

export interface CreateTableSeatsRequest {
  numbers: number[];
  ticketTypeId?: string | null;
}

export interface DuplicateVenueElementResponse {
  layoutId: string;
  revision: number;
  table?: VenueTable;
  row?: VenueRow;
  geometry: TableGeometryV2 | RowGeometryV2;
}

export interface PublicVenueSeat extends VenueSeat {
  availability: "available" | "unavailable";
  tariffName: string | null;
  price: number | null;
  deposit: number;
  currency: string;
}

export interface PublicVenueRow {
  id: string;
  number: number;
  name: string | null;
  typeLabel: string | null;
  shortDescription: string | null;
  price: number | null;
  deposit: number;
  currency: string;
  availability: "available" | "unavailable";
  seats: PublicVenueSeat[];
}

export interface PublicVenueTable {
  id: string;
  number: number;
  name: string | null;
  seats: number;
  price: number | null;
  deposit: number;
  currency: string;
  description: string | null;
  typeLabel: string | null;
  shortDescription: string | null;
  saleMode: TableSaleMode;
  status: TableStatus;
  holdExpiresAt: string | null;
  seatRecords: Array<VenueSeat & { availability: "available" | "unavailable" }>;
}

export interface PublicVenueLayout {
  seats?: PublicVenueSeat[];
  id: string;
  eventId: string;
  layoutJson: VenueLayoutAny;
  tables: PublicVenueTable[];
  rows: PublicVenueRow[];
}

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
