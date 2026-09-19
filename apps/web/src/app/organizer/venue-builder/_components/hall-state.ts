import { arrangeSeats, metres, newHallObject, rotatePoint, rowLength, type HallEditor, type HallObject, type VenueLayout } from "@event-platform/shared-types";
export type HallState = { room: { widthM: number; heightM: number }; editor: HallEditor };
export type View = { pxPerMetre: number; panX: number; panY: number };
export const titles: Record<HallObject["type"], string> = { table_rect: "Прямоугольный стол", table_round: "Круглый стол", seat: "Кресло", row: "Ряд кресел", zone: "Зона", prop: "Сцена", entrance: "Вход / выход" };
export type FitArea = { x: number; y: number; width: number; height: number };
export function availableFitArea(base: FitArea, panel: FitArea | null, room: HallState["room"]): FitArea {
  if (!panel) return base;
  const gap = 16, right = base.x + base.width, bottom = base.y + base.height;
  const candidates: FitArea[] = [
    { x: base.x, y: base.y, width: panel.x - gap - base.x, height: base.height },
    { x: panel.x + panel.width + gap, y: base.y, width: right - panel.x - panel.width - gap, height: base.height },
    { x: base.x, y: base.y, width: base.width, height: panel.y - gap - base.y },
    { x: base.x, y: panel.y + panel.height + gap, width: base.width, height: bottom - panel.y - panel.height - gap },
  ].filter((a) => a.width > 0 && a.height > 0);
  return candidates.sort((a, b) => Math.min(b.width / room.widthM, b.height / room.heightM) - Math.min(a.width / room.widthM, a.height / room.heightM))[0] ?? base;
}
export function fitView(w: number, h: number, room: HallState["room"], area: FitArea = { x: 0, y: 0, width: w, height: h }): View {
  // ASSUMPTION: 95% means the hall occupies at most 95% of each available axis.
  const raw = Math.min(area.width * .95 / room.widthM, area.height * .95 / room.heightM);
  const pxPerMetre = Math.max(5, Math.min(400, Math.floor(raw / 5) * 5));
  return { pxPerMetre, panX: area.x + (area.width - room.widthM * pxPerMetre) / 2, panY: area.y + (area.height - room.heightM * pxPerMetre) / 2 };
}
export function zoomView(view: View, direction: number, x: number, y: number): View {
  const step = Math.max(5, Math.round(view.pxPerMetre * 0.1 / 5) * 5);
  const pxPerMetre = Math.max(5, Math.min(400, view.pxPerMetre + Math.sign(direction) * step));
  return { pxPerMetre, panX: x - (x - view.panX) * pxPerMetre / view.pxPerMetre, panY: y - (y - view.panY) * pxPerMetre / view.pxPerMetre };
}
export type Command = { apply: (state: HallState) => HallState; invert: () => Command };
// Commands store only changed records, never rendered DOM or complete history snapshots.
export function changeCommand(before: HallState, after: HallState): Command {
  const oldMap = new Map(before.editor.objects.map((o) => [o.id, o]));
  const newMap = new Map(after.editor.objects.map((o) => [o.id, o]));
  const ids = new Set([...oldMap.keys(), ...newMap.keys()].filter((id) => JSON.stringify(oldMap.get(id)) !== JSON.stringify(newMap.get(id))));
  const oldRecords=before.editor.objects.filter((o)=>ids.has(o.id)),newRecords=after.editor.objects.filter((o)=>ids.has(o.id));
  const roomChanged=JSON.stringify(before.room)!==JSON.stringify(after.room),tariffsChanged=JSON.stringify(before.editor.tariffs)!==JSON.stringify(after.editor.tariffs);
  const build=(from:HallObject[],to:HallObject[],oldRoom:HallState["room"]|null,newRoom:HallState["room"]|null,oldTariffs:HallEditor["tariffs"]|null,newTariffs:HallEditor["tariffs"]|null):Command=>({
    apply:(state)=>({room:newRoom??state.room,editor:{version:1,tariffs:newTariffs??state.editor.tariffs,objects:[...state.editor.objects.filter((o)=>!ids.has(o.id)),...to].sort((a,b)=>a.id.localeCompare(b.id))}}),
    invert:()=>build(to,from,newRoom,oldRoom,newTariffs,oldTariffs),
  });
  return build(oldRecords,newRecords,roomChanged?before.room:null,roomChanged?after.room:null,tariffsChanged?before.editor.tariffs:null,tariffsChanged?after.editor.tariffs:null);
}
export function importLayout(layout: VenueLayout): HallState {
  const json = layout.layoutJson;
  if (json.version === 2 && json.editor) return { room: json.room, editor: json.editor };
  let editor: HallEditor = { version: 1, objects: [], tariffs: [] };
  const room = json.version === 2 ? json.room : { widthM: metres(json.canvas.width / 34), heightM: metres(json.canvas.height / 34) };
  for (const t of json.tables) {
    const record = layout.tables.find((r) => r.id === t.tableId);
    const divisor = json.version === 1 ? 34 : 1;
    const shape = "shape" in t && t.shape === "round" ? "table_round" : "table_rect";
    const object = { ...newHallObject(t.tableId, shape, (t.x + t.width / 2) / divisor, (t.y + t.height / 2) / divisor), width: metres(t.width / divisor), height: metres(t.height / divisor), name: record?.name || `Стол ${record?.number ?? 1}`, price: record?.price ?? 0, deposit: record?.deposit ?? 0, saleMode: record?.saleMode ?? "whole_table", rotation: t.rotation ?? 0 };
    editor.objects.push(object);
    const seatRecords = record?.seatRecords?.length ? record.seatRecords : Array.from({length:record?.seats??0},(_,i)=>({id:crypto.randomUUID(),number:i+1,label:String(i+1),status:"available" as const}));
    for (const [i, seat] of seatRecords.entries()) {
      const arrangement = "seats" in t ? t.seats.find((s) => s.number === seat.number) : undefined;
      editor.objects.push({ ...newHallObject(seat.id, "seat", object.x, object.y), name: seat.label === String(seat.number) ? "" : seat.label, number: seat.number, parentId: object.id, attachedOrder: i, side: arrangement?.side ?? (["top", "right", "bottom", "left"] as const)[i % 4]!, price: record?.saleMode === "per_seat" ? record.price : null, locked: seat.status === "disabled" });
    }
    editor = arrangeSeats(editor, object.id);
  }
  if (json.version === 2) {
    for (const row of json.rows) {
      const record = layout.rows.find((r) => r.id === row.rowId);
      const object = { ...newHallObject(row.rowId, "row", row.x + row.width / 2, row.y + row.height / 2), width: row.width, height: row.height, rotation: row.rotation ?? 0, name: record?.name || `Ряд ${record?.number ?? 1}`, price: record?.price ?? 0, deposit: record?.deposit ?? 0, startNumber: record?.seats[0]?.number ?? 1 };
      editor.objects.push(object);
      for (const [i, seat] of (record?.seats ?? []).entries()) editor.objects.push({ ...newHallObject(seat.id, "seat", object.x, object.y), parentId: object.id, attachedOrder: i, number: seat.number, name: seat.label === String(seat.number) ? "" : seat.label });
      editor = arrangeSeats(editor, object.id);
    }
    if (json.stage) editor.objects.push({ ...newHallObject(crypto.randomUUID(), "prop", json.stage.x + json.stage.width / 2, json.stage.y + json.stage.height / 2), width: json.stage.width, height: json.stage.height, rotation: json.stage.rotation ?? 0, name: json.stage.label });
  }
  return { room, editor };
}
export function updateObject(state: HallState, id: string, patch: Partial<HallObject>): HallState {
  let editor = { ...state.editor, objects: state.editor.objects.map((o) => o.id === id ? { ...o, ...patch } : o) };
  let object = editor.objects.find((o) => o.id === id);
  if(object?.type === "entrance") { object=wallSnap(object,state.room); editor.objects=editor.objects.map((o)=>o.id===id?object!:o); }
  if (object && ["table_rect", "table_round", "row"].includes(object.type)) {
    const counts = new Map<string, number>();
    editor.objects = editor.objects.map((seat) => {
      if (seat.parentId !== id) return seat;
      let side = seat.side;
      if (object.type === "table_rect" && !side) side = (["top", "right", "bottom", "left"] as const).find((s) => (counts.get(s) ?? 0) < capacity(object,s)) ?? "top";
      const key = object.type === "table_rect" ? side! : "all";
      const count = counts.get(key) ?? 0;
      // ASSUMPTION: resizing never destroys seats; excess seats detach and retain their world coordinates.
      if (count >= capacity(object,side)) return { ...seat, parentId: null, side: null };
      counts.set(key,count+1); return { ...seat, side };
    });
    editor = arrangeSeats(editor, id);
  }
  if (object?.type === "zone" && (patch.width !== undefined || patch.height !== undefined)) {
    const old=state.editor.objects.find((o)=>o.id===id)!;
    editor.objects=editor.objects.map((o)=>o.id===id?{...o,points:o.points.map((p)=>({x:metres(p.x*o.width/old.width),y:metres(p.y*o.height/old.height)}))}:o);
  }
  if(object?.type==="zone" && patch.points?.length) {
    const points=patch.points,minX=Math.min(...points.map((p)=>p.x)),maxX=Math.max(...points.map((p)=>p.x)),minY=Math.min(...points.map((p)=>p.y)),maxY=Math.max(...points.map((p)=>p.y));
    const cx=metres((minX+maxX)/2),cy=metres((minY+maxY)/2),offset=rotatePoint(cx,cy,object.rotation);
    editor.objects=editor.objects.map((o)=>o.id===id?{...o,x:metres(o.x+offset.x),y:metres(o.y+offset.y),width:metres(Math.max(.1,maxX-minX)),height:metres(Math.max(.1,maxY-minY)),points:points.map((p)=>({x:metres(p.x-cx),y:metres(p.y-cy)}))}:o);
  }
  return { ...state, editor };
}
export function capacity(parent: HallObject, side: HallObject["side"] = null): number {
  if (parent.type === "table_round") return Math.floor(Math.PI * parent.width / 0.5);
  return Math.floor((parent.type === "row" ? rowLength(parent) : side === "top" || side === "bottom" ? parent.width : parent.height) / 0.45);
}
export function attachSeat(state: HallState, seatId: string): { state: HallState; target: string | null; rejected: boolean } {
  const seat = state.editor.objects.find((o) => o.id === seatId)!;
  let best: { parent: HallObject; side: HallObject["side"]; distance: number } | undefined;
  for (const parent of state.editor.objects.filter((o) => o.type.startsWith("table_"))) {
    const p = rotatePoint(seat.x - parent.x, seat.y - parent.y, -parent.rotation);
    if (parent.type === "table_round") {
      const distance = Math.abs(Math.hypot(p.x, p.y) - parent.width / 2);
      if (distance <= 0.4 && (!best || distance < best.distance)) best = { parent, side: null, distance };
    } else {
      const sides = [{ side: "top" as const, distance: Math.abs(p.y + parent.height / 2), along: Math.abs(p.x), length: parent.width }, { side: "right" as const, distance: Math.abs(p.x - parent.width / 2), along: Math.abs(p.y), length: parent.height }, { side: "bottom" as const, distance: Math.abs(p.y - parent.height / 2), along: Math.abs(p.x), length: parent.width }, { side: "left" as const, distance: Math.abs(p.x + parent.width / 2), along: Math.abs(p.y), length: parent.height }];
      for (const s of sides) if (s.along <= s.length / 2 && s.distance <= 0.4 && (!best || s.distance < best.distance)) best = { parent, side: s.side, distance: s.distance };
    }
  }
  let editor = { ...state.editor, objects: state.editor.objects.map((o) => o.id === seatId ? { ...o, parentId: null, side: null } : o) };
  if (seat.parentId) editor = arrangeSeats(editor, seat.parentId);
  if (!best) return { state: { ...state, editor }, target: null, rejected: false };
  const target = best.parent.id;
  const count = editor.objects.filter((s) => s.parentId === target && (best!.parent.type === "table_round" || s.side === best!.side)).length;
  if (count >= capacity(best.parent, best.side)) return { state: { ...state, editor }, target, rejected: true };
  const order = Math.max(0, ...editor.objects.map((s) => s.attachedOrder)) + 1;
  editor.objects = editor.objects.map((o) => o.id === seatId ? { ...o, parentId: target, side: best!.side, attachedOrder: o.parentId === target ? o.attachedOrder : order } : o);
  return { state: { ...state, editor: arrangeSeats(editor, target) }, target, rejected: false };
}
export function removeObjects(state: HallState, ids: string[]): HallState {
  const removed = new Set(ids);
  let editor = { ...state.editor, objects: state.editor.objects.filter((o) => !removed.has(o.id) && !(o.parentId && removed.has(o.parentId))) };
  for (const o of state.editor.objects.filter((o) => removed.has(o.id) && o.parentId)) editor = arrangeSeats(editor, o.parentId!);
  return { ...state, editor };
}
export function warnings(state: HallState): { id: string; text: string }[] {
  const result: { id: string; text: string }[] = [];
  for (const o of state.editor.objects) {
    const r = Math.abs(o.rotation) * Math.PI / 180;
    const w = Math.abs(o.width * Math.cos(r)) + Math.abs(o.height * Math.sin(r));
    const h = Math.abs(o.width * Math.sin(r)) + Math.abs(o.height * Math.cos(r));
    if (o.x - w / 2 < 0 || o.y - h / 2 < 0 || o.x + w / 2 > state.room.widthM || o.y + h / 2 > state.room.heightM) result.push({ id: o.id, text: `${o.name || titles[o.type]}: за границами зала` });
    if ((o.type === "seat" || o.type === "zone") && o.price === null && !o.tariffId && !state.editor.objects.some((p) => p.id === o.parentId && (p.price !== null || p.tariffId))) result.push({ id: o.id, text: `${o.name || titles[o.type]}: цена не задана` });
    if (o.type === "zone" && o.capacity === 0) result.push({ id: o.id, text: `${o.name || "Зона"}: нулевая вместимость` });
    if (o.type === "seat" && o.parentId && o.name && state.editor.objects.some((s) => s.id !== o.id && s.type === "seat" && s.parentId === o.parentId && s.name === o.name)) result.push({ id: o.id, text: `${o.name}: повторяющееся имя` });
  }
  const obstacles = state.editor.objects.filter((o)=>["table_rect","table_round","seat","zone"].includes(o.type)).map((o)=>({o,points:footprint(o)}));
  const boxes=obstacles.map(({o,points})=>({o,points,minX:Math.min(...points.map((p)=>p.x)),maxX:Math.max(...points.map((p)=>p.x)),minY:Math.min(...points.map((p)=>p.y)),maxY:Math.max(...points.map((p)=>p.y))})).sort((a,b)=>a.minX-b.minX);
  const reported=new Set<string>();
  for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length && boxes[j]!.minX<boxes[i]!.maxX-0.000001;j++) {
    const a=boxes[i]!,b=boxes[j]!;
    if ((a.o.type==="zone") !== (b.o.type==="zone") || a.maxY<=b.minY+0.000001 || b.maxY<=a.minY+0.000001) continue;
    if(polygonsOverlap(a.points,b.points)) for(const item of [a,b]) if(!reported.has(item.o.id)) {reported.add(item.o.id);result.push({id:item.o.id,text:`${item.o.name || titles[item.o.type]}: пересечение объектов`});}
  }
  return result;
}
function footprint(o: HallObject): {x:number;y:number}[] {
  const points=o.type==="zone"?o.points:o.type==="table_round"?Array.from({length:20},(_,i)=>({x:Math.cos(i*Math.PI/10)*o.width/2,y:Math.sin(i*Math.PI/10)*o.width/2})):[{x:-o.width/2,y:-o.height/2},{x:o.width/2,y:-o.height/2},{x:o.width/2,y:o.height/2},{x:-o.width/2,y:o.height/2}];
  return points.map((p)=>{const r=rotatePoint(p.x,p.y,o.rotation);return{x:o.x+r.x,y:o.y+r.y};});
}
function polygonsOverlap(a:{x:number;y:number}[],b:{x:number;y:number}[]):boolean {
  const inside=(p:{x:number;y:number},poly:{x:number;y:number}[])=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const u=poly[i]!,v=poly[j]!;if((u.y>p.y)!==(v.y>p.y)&&p.x<(v.x-u.x)*(p.y-u.y)/(v.y-u.y)+u.x)hit=!hit;}return hit;};
  if(a.some((p)=>inside(p,b))||b.some((p)=>inside(p,a)))return true;
  const cross=(p:{x:number;y:number},q:{x:number;y:number},r:{x:number;y:number})=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i]!,q=a[(i+1)%a.length]!,r=b[j]!,s=b[(j+1)%b.length]!;if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)return true;}return false;
}
export function snapDimension(value: number): number {
  const preset = [1, 1.2, 1.4, 1.5, 1.7, 1.8, 2, 2.1, 2.3, 2.4, 2.6, 2.7].find((n) => Math.abs(n - value) <= 0.050001);
  return metres(Math.max(0.1, Math.min(200, preset ?? value)));
}

export function wallSnap(o: HallObject, room: HallState["room"]): HallObject {
  const x=metres(Math.max(0,Math.min(room.widthM,o.x))), y=metres(Math.max(0,Math.min(room.heightM,o.y)));
  const walls=[{x:0,y,rotation:-90,d:Math.abs(o.x)},{x:room.widthM,y,rotation:90,d:Math.abs(o.x-room.widthM)},{x,y:0,rotation:0,d:Math.abs(o.y)},{x,y:room.heightM,rotation:180,d:Math.abs(o.y-room.heightM)}].sort((a,b)=>a.d-b.d);
  return {...o,x:walls[0]!.x,y:walls[0]!.y,rotation:walls[0]!.rotation};
}
