import { describe, expect, it } from "vitest";
import { arrangeSeats, hallEditorSchema, newHallObject, rowLength, type HallEditor } from "./hall-editor.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function fixture(length: number, count: number): HallEditor {
  const table = { ...newHallObject(id(1), "table_rect", 5, 5), width: length, height: 1 };
  return { version: 1, tariffs: [], objects: [table, ...Array.from({ length: count }, (_,i) => ({ ...newHallObject(id(i+2), "seat", 0, 0), parentId: table.id, side: "top" as const, attachedOrder: i, number: i+1 }))] };
}
describe("Hall geometry", () => {
  it("centres one seat, distributes two equally, rejects a third on 1m", () => {
    expect(arrangeSeats(fixture(1,1),id(1)).objects[1]?.x).toBe(5);
    const editor = arrangeSeats(fixture(1,2),id(1));
    expect(editor.objects.slice(1).map((s) => s.x)).toEqual([4.76,5.24]);
    expect(editor.objects[1]?.y).toBe(4.15);
    expect(hallEditorSchema.safeParse(editor).success).toBe(true);
    expect(hallEditorSchema.safeParse(fixture(1,3)).success).toBe(false);
  });
  it("fits three on 1.5m; rejects unknown tariffs and duplicate identity", () => {
    const e = arrangeSeats(fixture(1.5,3),id(1));
    expect(e.objects.slice(1).map((s) => s.x)).toEqual([4.51,5,5.49]);
    expect(hallEditorSchema.safeParse(e).success).toBe(true);
    expect(hallEditorSchema.safeParse({...e,objects:[...e.objects,e.objects[0]]}).success).toBe(false);
    expect(hallEditorSchema.safeParse({...e,objects:e.objects.map((o)=>({...o,tariffId:id(99)}))}).success).toBe(false);
  });
  it("rotates attached seats and preserves names and numbers", () => {
    let e=arrangeSeats(fixture(1,2),id(1));
    e.objects[0]={...e.objects[0]!,rotation:90}; e.objects[1]={...e.objects[1]!,name:"Окно"};
    e=arrangeSeats(e,id(1));
    expect(e.objects[1]).toMatchObject({x:5.85,y:4.76,name:"Окно",number:1,rotation:90});
  });
  it("uses circular arc length and permits out-of-room coordinates", () => {
    expect(rowLength({...newHallObject(id(1),"row",5,5),width:4,curvature:2})).toBeCloseTo(Math.PI*2);
    const e=fixture(1,1);e.objects[0]!.x=-10;
    expect(hallEditorSchema.safeParse(e).success).toBe(true);
    expect(hallEditorSchema.safeParse({...e,script:"untrusted"}).success).toBe(false);
  });
});
