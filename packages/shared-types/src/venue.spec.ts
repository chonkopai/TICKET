import { describe, expect, it } from "vitest";

import { defaultTableSize, venueLayoutSchema, venueLayoutSchemaV2 } from "./venue.js";

const valid = {
  version: 1 as const,
  canvas: { width: 800, height: 600 },
  tables: [{ tableId: "00000000-0000-4000-8000-000000000001", x: 20, y: 30, width: 100, height: 80 }],
};

describe("venueLayoutSchema", () => {
  it("accepts bounded version-one geometry", () => {
    expect(venueLayoutSchema.parse(valid)).toEqual(valid);
  });

  it("rejects duplicate IDs, unknown fields, and geometry outside the canvas", () => {
    expect(venueLayoutSchema.safeParse({ ...valid, unknown: true }).success).toBe(false);
    expect(venueLayoutSchema.safeParse({ ...valid, tables: [...valid.tables, valid.tables[0]] }).success).toBe(false);
    expect(venueLayoutSchema.safeParse({ ...valid, tables: [{ ...valid.tables[0], x: 750 }] }).success).toBe(false);
  });
});

describe("venueLayoutSchemaV2", () => {
  const v2 = {
    version: 2 as const,
    room: { widthM: 20, heightM: 14 },
    stage: { label: "Сцена", x: 6, y: 1, width: 8, height: 2 },
    tables: [{
      tableId: "00000000-0000-4000-8000-000000000001",
      x: 3,
      y: 5,
      width: 2,
      height: 2,
      shape: "square" as const,
      preset: "four" as const,
      seats: [
        { number: 1, x: 25, y: 0, side: "top" as const },
        { number: 2, x: 100, y: 25, side: "right" as const },
      ],
    }],
    rows: [{ rowId: "00000000-0000-4000-8000-000000000002", x: 2, y: 10, width: 8, height: 1, seatCount: 10, seatSpacing: 0.15 }],
  };

  it("accepts numeric seats, room dimensions, stage, tables and rows", () => {
    expect(venueLayoutSchemaV2.parse(v2)).toMatchObject(v2);
  });

  it("rejects duplicate local seat numbers and objects outside the room", () => {
    const duplicateSeat = { ...v2, tables: [{ ...v2.tables[0]!, seats: [{ number: 1, x: 0, y: 0 }, { number: 1, x: 100, y: 100 }] }] };
    expect(venueLayoutSchemaV2.safeParse(duplicateSeat).success).toBe(false);
    expect(venueLayoutSchemaV2.safeParse({ ...v2, stage: { ...v2.stage, x: 19 } }).success).toBe(false);
  });

  it("grows deterministic table defaults with capacity", () => {
    expect(defaultTableSize(8).width).toBeGreaterThan(defaultTableSize(2).width);
    expect(defaultTableSize(8, "round").width).toBe(defaultTableSize(8, "round").height);
    expect(defaultTableSize(6, "rectangle").width).toBeGreaterThan(defaultTableSize(6, "rectangle").height);
  });
});
