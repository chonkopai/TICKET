import { describe, expect, it } from "../packages/shared-types/node_modules/vitest/dist/index.js";
import { newHallObject } from "../packages/shared-types/src/hall-editor";
import { attachSeat, availableFitArea, changeCommand, fitView, snapDimension, updateObject, zoomView, type HallState } from "../apps/web/src/app/organizer/venue-builder/_components/hall-state";
const table = {...newHallObject("00000000-0000-4000-8000-000000000001","table_rect",5,5),width:1,height:1};
const base: HallState = {room:{widthM:24,heightM:16},editor:{version:1,tariffs:[],objects:[table]}};
describe("Hall viewport and commands",()=>{
  it("fits and centres feasible sizes on multiples of five",()=>{
    for(const [w,h] of [[390,500],[768,700],[1440,900]]) for(const room of [{widthM:24,heightM:16},{widthM:60,heightM:40}]) {
      const v=fitView(w!,h!,room);expect(v.pxPerMetre%5).toBe(0);expect(room.widthM*v.pxPerMetre).toBeLessThanOrEqual(w!);expect(room.heightM*v.pxPerMetre).toBeLessThanOrEqual(h!);expect(v.panX).toBe((w!-room.widthM*v.pxPerMetre)/2);
    }
  });
  it("zooms at cursor without mutating stored geometry",()=>{
    const saved=JSON.stringify(base);let v=fitView(900,600,base.room);const x=(123-v.panX)/v.pxPerMetre;
    for(let i=0;i<100;i++){v=zoomView(v,1,123,234);expect(v.pxPerMetre%5).toBe(0);}
    expect(v.pxPerMetre).toBe(400);expect((123-v.panX)/v.pxPerMetre).toBeCloseTo(x);
    for(let i=0;i<100;i++)v=zoomView(v,-1,123,234);
    expect(v.pxPerMetre).toBe(5);expect(JSON.stringify(base)).toBe(saved);
  });
  it("fits into the largest unobstructed area and expands when the inspector closes",()=>{
    const region={x:16,y:136,width:1408,height:680},panel={x:900,y:72,width:356,height:752};
    const area=availableFitArea(region,panel,base.room);
    expect(area.x+area.width).toBeLessThan(panel.x);
    const withPanel=fitView(1440,900,base.room,area);
    const withoutPanel=fitView(1440,900,base.room,region);
    expect(withoutPanel.pxPerMetre).toBeGreaterThan(withPanel.pxPerMetre);
    expect(withPanel.pxPerMetre%5).toBe(0);
    expect(withPanel.panX).toBeCloseTo(area.x+(area.width-base.room.widthM*withPanel.pxPerMetre)/2);
    expect((withPanel.pxPerMetre+5)*base.room.widthM>area.width*.95 || (withPanel.pxPerMetre+5)*base.room.heightM>area.height*.95).toBe(true);
    expect(base.room).toEqual({widthM:24,heightM:16});
  });
  it("inverts rename, recolour, price and move",()=>{
    const next=updateObject(base,table.id,{name:"VIP",price:50000,color:"#ff0000",x:8});const c=changeCommand(base,next);
    expect(c.apply(base)).toEqual(next);expect(c.invert().apply(next)).toEqual(base);expect(snapDimension(2.05)).toBe(2);
  });
  it("rejects a third seat on 1m while keeping it free",()=>{
    let state=base;
    for(let i=0;i<3;i++){const seat={...newHallObject(`00000000-0000-4000-8000-${String(i+2).padStart(12,"0")}`,"seat",5,4.2),number:i+1};state={...state,editor:{...state.editor,objects:[...state.editor.objects,seat]}};const r=attachSeat(state,seat.id);expect(r.rejected).toBe(i===2);state=r.state;}
    expect(state.editor.objects.filter((o)=>o.parentId===table.id)).toHaveLength(2);expect(state.editor.objects).toHaveLength(4);
  });
});
