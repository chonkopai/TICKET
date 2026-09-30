import { z } from "zod";

const metre = z.number().finite().min(-1000).max(1000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, "Use at most two decimal places");
const size = z.number().finite().min(0.1).max(200).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, "Use at most two decimal places");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const money = z.number().int().min(0).max(2_000_000_000);
export const hallObjectSchema = z.object({
  id: z.string().uuid(), type: z.enum(["table_rect", "table_round", "seat", "row", "zone", "prop", "entrance"]),
  name: z.string().max(120), x: metre, y: metre, width: size, height: size,
  rotation: z.number().finite().min(-180).max(180), color, colorOverride: z.boolean().default(false), locked: z.boolean(), zIndex: z.number().int().min(-1000).max(1000),
  tariffId: z.string().uuid().nullable(), price: money.nullable(), deposit: money,
  parentId: z.string().uuid().nullable(), side: z.enum(["top", "right", "bottom", "left"]).nullable(),
  // Relative to the round table; absent on older layouts and automatically arranged seats.
  orbitAngle: z.number().finite().min(-180).max(180).optional(),
  number: z.number().int().min(1).max(1_000_000), attachedOrder: z.number().int().min(0),
  saleMode: z.enum(["whole_table", "per_seat"]), seatOffset: z.number().finite().min(0.225).max(3),
  description: z.string().max(200), capacity: z.number().int().min(0).max(100_000),
  opacity: z.number().min(0.05).max(1), points: z.array(z.object({ x: metre, y: metre }).strict()).max(100),
  curvature: z.number().finite().min(-100).max(100), reverse: z.boolean(), startNumber: z.number().int().min(1).max(999_000),
  entranceType: z.enum(["in", "out", "both"]),
}).strict();
export const hallEditorSchema = z.object({
  version: z.literal(1),
  objects: z.array(hallObjectSchema).max(3000),
  tariffs: z.array(z.object({ id: z.string().uuid(), name: z.string().min(1).max(120), color, price: money }).strict()).max(100),
}).strict().superRefine((editor, ctx) => {
  if (editor.objects.filter((o) => o.type.startsWith("table_")).length > 500 || editor.objects.filter((o) => o.type === "row").length > 100) ctx.addIssue({ code: "custom", message: "Maximum 500 tables and 100 rows" });
  const ids = new Set<string>();
  const tariffs = new Set(editor.tariffs.map((t) => t.id));
  if (tariffs.size !== editor.tariffs.length) ctx.addIssue({ code: "custom", message: "Duplicate tariff IDs" });
  for (const object of editor.objects) {
    if (ids.has(object.id)) ctx.addIssue({ code: "custom", message: "Duplicate object IDs" });
    ids.add(object.id);
    if (object.tariffId && !tariffs.has(object.tariffId)) ctx.addIssue({ code: "custom", message: "Unknown tariff" });
    if (object.type === "seat" && (object.width !== 0.45 || object.height !== 0.45)) ctx.addIssue({ code: "custom", message: "Seat footprint must be 0.45 m square" });
    if (object.type === "table_round" && object.height !== object.width) ctx.addIssue({ code: "custom", message: "Round tables require a uniform diameter" });
    if (object.parentId) {
      const parent = editor.objects.find((p) => p.id === object.parentId);
      if (object.type !== "seat" || !parent || !["table_rect", "table_round", "row"].includes(parent.type)) ctx.addIssue({ code: "custom", message: "Invalid seat parent" });
    }
    if (object.type === "zone" && object.points.length < 3) ctx.addIssue({ code: "custom", message: "A zone requires three vertices" });
  }
  if (editor.objects.filter((o) => o.type === "seat").length > 2000) ctx.addIssue({ code: "custom", message: "Maximum 2,000 seats" });
  for (const parent of editor.objects.filter((o) => ["table_rect", "table_round", "row"].includes(o.type))) {
    const seats = editor.objects.filter((o) => o.parentId === parent.id);
    if (new Set(seats.map((s) => s.number)).size !== seats.length) ctx.addIssue({ code: "custom", message: "Duplicate seat numbers" });
    if (parent.type === "table_round" && seats.length > Math.floor(Math.PI * parent.width / 0.5)) ctx.addIssue({ code: "custom", message: "Round table capacity exceeded" });
    if (parent.type === "row" && seats.length > Math.floor(rowLength(parent) / 0.45)) ctx.addIssue({ code: "custom", message: "Row capacity exceeded" });
    if (parent.type === "table_rect") for (const side of ["top", "right", "bottom", "left"] as const) {
      if (seats.filter((s) => s.side === side).length > Math.floor((side === "top" || side === "bottom" ? parent.width : parent.height) / 0.45)) ctx.addIssue({ code: "custom", message: "Table side capacity exceeded" });
    }
  }
});
export type HallObject = z.infer<typeof hallObjectSchema>;
export type HallEditor = z.infer<typeof hallEditorSchema>;
export const metres = (n: number) => Math.round(n * 100) / 100;
export function newHallObject(id: string, type: HallObject["type"], x: number, y: number): HallObject {
  return { id, type, name: "", x: metres(x), y: metres(y), width: type === "seat" ? 0.45 : type === "row" ? 1.8 : 1.6, height: type === "seat" || type === "row" ? 0.45 : 1, rotation: 0, color: type === "seat" ? "#D1D5DB" : "#5B21B6", colorOverride: false, locked: false, zIndex: type === "zone" ? -10 : 0, tariffId: null, price: null, deposit: 0, parentId: null, side: null, number: 1, attachedOrder: 0, saleMode: "whole_table", seatOffset: 0.35, description: "", capacity: 0, opacity: 0.15, points: [], curvature: 0, reverse: false, startNumber: 1, entranceType: "both" };
}
export function effectivePrice(o: HallObject, editor: HallEditor): number | null {
  return o.price ?? editor.tariffs.find((t) => t.id === o.tariffId)?.price ?? null;
}
export function rotatePoint(x: number, y: number, degrees: number) {
  const angle = degrees * Math.PI / 180;
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}
export function rowLength(row: HallObject): number {
  if (Math.abs(row.curvature) < 0.001) return row.width;
  const radius = row.width * row.width / (8 * Math.abs(row.curvature)) + Math.abs(row.curvature) / 2;
  return radius * 4 * Math.atan(2 * Math.abs(row.curvature) / row.width);
}
export function arrangeSeats(editor: HallEditor, parentId: string): HallEditor {
  const parent = editor.objects.find((o) => o.id === parentId);
  if (!parent) return editor;
  let seats = editor.objects.filter((o) => o.parentId === parentId).sort((a, b) => a.attachedOrder - b.attachedOrder || a.id.localeCompare(b.id));
  const positions = new Map<string, HallObject>();
  const place = (seat: HallObject, x: number, y: number, rotation: number) => {
    const p = rotatePoint(x, y, parent.rotation);
    positions.set(seat.id, { ...seat, x: metres(parent.x + p.x), y: metres(parent.y + p.y), rotation: ((rotation + parent.rotation + 540) % 360) - 180 });
  };
  if (parent.type === "table_round") {
    const r = parent.width / 2 + parent.seatOffset;
    const angles = new Map<string, number>();
    if (seats.some((seat) => seat.orbitAngle !== undefined)) {
      for (const seat of seats) if (seat.orbitAngle !== undefined) angles.set(seat.id, seat.orbitAngle * Math.PI / 180);
      for (const seat of seats) if (!angles.has(seat.id)) {
        const existing = [...angles.values()].sort((a, b) => a - b);
        let angle = -Math.PI / 2;
        if (existing.length) {
          let largest = -1;
          for (let i = 0; i < existing.length; i++) {
            const start = existing[i]!;
            const end = i === existing.length - 1 ? existing[0]! + Math.PI * 2 : existing[i + 1]!;
            if (end - start > largest) { largest = end - start; angle = start + largest / 2; }
          }
        }
        angles.set(seat.id, angle);
      }
    } else seats.forEach((seat, i) => angles.set(seat.id, i / seats.length * Math.PI * 2 - Math.PI / 2));
    for (const seat of seats) {
      const a = angles.get(seat.id)!;
      place({ ...seat, ...(seat.orbitAngle === undefined && angles.size > 0 && seats.some((s) => s.orbitAngle !== undefined) ? { orbitAngle: metres(((a * 180 / Math.PI + 540) % 360) - 180) } : {}) }, Math.cos(a) * r, Math.sin(a) * r, a * 180 / Math.PI + 90);
    }
  }
  else if (parent.type === "row") {
    const length = rowLength(parent);
    const gap = (length - seats.length * 0.45) / (seats.length + 1);
    seats.forEach((seat, i) => {
      const along = gap + 0.225 + i * (0.45 + gap);
      if (Math.abs(parent.curvature) < 0.001) place(seat, along - length / 2, 0, 0);
      else {
        const sag = Math.abs(parent.curvature), r = parent.width ** 2 / (8 * sag) + sag / 2;
        const a = (along - length / 2) / r, sign = Math.sign(parent.curvature);
        place(seat, r * Math.sin(a), sign * (r * Math.cos(a) - (r - sag)), -sign * a * 180 / Math.PI);
      }
    });
  } else {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const group = seats.filter((s) => s.side === side);
      const length = side === "top" || side === "bottom" ? parent.width : parent.height;
      const gap = (length - group.length * 0.45) / (group.length + 1);
      group.forEach((seat, i) => {
        const p = gap + 0.225 + i * (0.45 + gap) - length / 2;
        if (side === "top") place(seat, p, -parent.height / 2 - parent.seatOffset, 0);
        if (side === "right") place(seat, parent.width / 2 + parent.seatOffset, p, 90);
        if (side === "bottom") place(seat, -p, parent.height / 2 + parent.seatOffset, 180);
        if (side === "left") place(seat, -parent.width / 2 - parent.seatOffset, -p, -90);
      });
    }
  }
  if (parent.type !== "row") {
    seats = seats.sort((a, b) => {
      const pa = positions.get(a.id)!, pb = positions.get(b.id)!;
      const angle = (p: HallObject) => (Math.atan2(p.y - parent.y, p.x - parent.x) + Math.PI * 2.5) % (Math.PI * 2);
      return angle(pa) - angle(pb);
    });
    const first = seats.reduce<HallObject | undefined>((a, b) => !a || b.attachedOrder < a.attachedOrder ? b : a, undefined);
    const start = seats.findIndex((s) => s.id === first?.id);
    seats = [...seats.slice(start), ...seats.slice(0, start)];
  }
  seats.forEach((seat, i) => {
    const p = positions.get(seat.id);
    if (p) positions.set(seat.id, { ...p, number: parent.type === "row" ? parent.startNumber + (parent.reverse ? seats.length - i - 1 : i) : i + 1 });
  });
  return { ...editor, objects: editor.objects.map((o) => positions.get(o.id) ?? o) };
}
