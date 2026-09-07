import { describe, expect, it } from "vitest";

import { venueLayoutSchema } from "./venue.js";

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
