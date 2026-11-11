import test from 'node:test';
import assert from 'node:assert/strict';
import { DINER_WIDTH, newHall, makeObject, rectSideCounts, rectCapacityValid, resizeObject, saleInventory, seatPositions, worldBounds } from './model.mjs';
import { changeRoundSeats, changeTableSide, newTable, previewFrame, resizePreviewAtPoint, resizePreviewTable, slideRoundSeat, tableCopies } from './table-editing.mjs';
import { builderToVenue, venueToBuilder } from './venue-adapter.ts';

test('editing one rectangular side preserves all other chair identities, side assignments and tariffs',()=>{
  let object=newTable('rect',newHall());
  object.seats[4].categoryId='vip';
  const oldSides=new Map(seatPositions(object).map(s=>[s.id,s.side]));
  object=changeTableSide(object,1,1);
  object=changeTableSide(object,1,1);
  object=changeTableSide(object,0,-1);
  assert.deepEqual(rectSideCounts(object),[2,2,3,0]);
  assert.equal(object.count,7);
  assert.equal(object.h,2*DINER_WIDTH);
  assert.ok(rectCapacityValid(object));
  for(const seat of seatPositions(object))if(oldSides.has(seat.id))assert.equal(seat.side,oldSides.get(seat.id));
  assert.equal(object.seats.find(s=>s.categoryId==='vip').id,[...oldSides.keys()][4]);
});

test('side controls reserve frontage, stop at 32 seats and retain at least one chair',()=>{
  let object=newTable('rect',newHall());
  for(let i=0;i<40;i++)object=changeTableSide(object,3,1);
  assert.equal(object.count,32);assert.ok(rectCapacityValid(object));
  assert.equal(object.h,26*DINER_WIDTH);
  for(let side=0;side<4;side++)for(let i=0;i<40;i++)object=changeTableSide(object,side,-1);
  assert.equal(object.count,1);assert.equal(object.seats.length,1);
  assert.equal(resizeObject(object,30,30),null);
});

test('round rail movement preserves neighbours and prevents seats from crossing or overlapping',()=>{
  const object=makeObject('round',0,0,{w:120,h:120,count:8}),id=object.seats[0].id,positions=seatPositions(object);
  const moved=slideRoundSeat(object,id,positions[0].angle+.2);
  assert.ok(moved);assert.equal(moved.seats[0].angle,positions[0].angle+.2);
  assert.deepEqual(moved.seats.slice(1),object.seats.slice(1));
  assert.equal(slideRoundSeat(object,id,positions[1].angle),null);
  const added=changeRoundSeats(moved,1);
  assert.equal(added.count,9);assert.deepEqual(added.seats.slice(0,8).map(s=>s.id),object.seats.map(s=>s.id));
  const removed=changeRoundSeats(added,-1,id);assert.equal(removed.count,8);assert.ok(!removed.seats.some(s=>s.id===id));
});

test('round additions enlarge the circumference to keep 60 cm per guest',()=>{
  let object=newTable('round',newHall());
  for(let i=0;i<40;i++)object=changeRoundSeats(object,1);
  assert.equal(object.count,32);assert.ok(Math.PI*object.w>=32*DINER_WIDTH);assert.equal(object.h,object.w);
});

test('batched tables preserve configuration with independent IDs and rotation-aware spacing',()=>{
  const object={...changeTableSide(newTable('rect',newHall()),1,1),name:'VIP',rotation:45};
  const copies=tableCopies(object,{quantity:4,cols:2,gap:40,spot:{x:250,y:250}});
  const ids=copies.flatMap(o=>[o.id,...o.seats.map(s=>s.id)]);
  assert.equal(new Set(ids).size,ids.length);
  for(const copy of copies){assert.deepEqual(copy.sides,object.sides);assert.equal(copy.rotation,45);assert.equal(copy.count,7);}
  assert.deepEqual(copies.map(o=>o.name),['VIP · 1','VIP · 2','VIP · 3','VIP · 4']);
  assert.ok(worldBounds(copies[0]).right+39.99<=worldBounds(copies[1]).left);
  assert.ok(worldBounds(copies[0]).bottom+39.99<=worldBounds(copies[2]).top);
});

test('preview edits and non-ticket venue features survive canonical save and reopen',()=>{
  const hall=newHall();
  let round=makeObject('round',400,400,{w:120,h:120,count:6,name:'VIP круг',rotation:25});
  round=slideRoundSeat(round,round.seats[1].id,seatPositions(round)[1].angle+.2);
  const rect={...changeTableSide(newTable('rect',hall),3,1),x:700,y:400,name:'Семья',rotation:35};
  const features=['Барная стойка','Танцпол','Гардероб'].map((name,i)=>makeObject('obstacle',200+i*200,100,{name}));
  hall.objects=[round,rect,...features];
  assert.equal(saleInventory({...hall,objects:features}).length,0);
  const restored=venueToBuilder(builderToVenue(hall),hall);
  for(const object of [round,rect]){
    const copy=restored.objects.find(o=>o.id===object.id);
    assert.equal(copy.name,object.name);assert.equal(copy.rotation,object.rotation);
    assert.deepEqual(copy.seats.map(s=>s.id),object.seats.map(s=>s.id));
    for(const s of seatPositions(object)){const p=seatPositions(copy).find(v=>v.id===s.id);assert.ok(Math.abs(p.x-s.x)<.05&&Math.abs(p.y-s.y)<.05);}
  }
  assert.equal(saleInventory({...restored,objects:restored.objects.filter(o=>o.type==='obstacle')}).length,0);
});

test('shrinking a table with custom round positions preserves frontage between every pair',()=>{
  let object=makeObject('round',0,0,{w:120,h:120,count:6});
  object=slideRoundSeat(object,object.seats[0].id,seatPositions(object)[1].angle-.5);
  assert.ok(object);
  // The total circumference allows six diners at 1.6 m, but the manually
  // positioned pair would have only 40 cm of edge between them.
  assert.equal(resizePreviewTable(object,64,64),null);
  assert.ok(resizePreviewTable(object,120,120));
});

test('preview resize handles sit beyond the table and every chair footprint',()=>{
  for(const type of ['round','rect']){
    let object=newTable(type,newHall());
    if(type==='rect')object=changeTableSide(object,1,1);
    // Include deliberately shifted legacy chairs in the outer resize frame.
    object.seats[0].dx=25;
    const frame=previewFrame(object);
    assert.ok(frame.x<-object.w/2&&frame.y<-object.h/2);
    assert.ok(frame.x+frame.w>object.w/2&&frame.y+frame.h>object.h/2);
    for(const seat of seatPositions(object)){
      assert.ok(seat.x-9>=frame.x+10&&seat.x+9<=frame.x+frame.w-10);
      assert.ok(seat.y-9>=frame.y+10&&seat.y+9<=frame.y+frame.h-10);
    }
  }
});

test('outer handles resize from their own edge without jumping with asymmetric chair bounds',()=>{
  const object=newTable('rect',newHall());object.seats[0].dx=100;
  const frame=previewFrame(object);
  for(const x of [-1,1])for(const y of [-1,1]){
    const at={x:x<0?frame.x:frame.x+frame.w,y:y<0?frame.y:frame.y+frame.h};
    const unchanged=resizePreviewAtPoint(object,at,{x,y});
    assert.ok(unchanged);assert.equal(unchanged.w,object.w);assert.equal(unchanged.h,object.h);
    const resized=resizePreviewAtPoint(object,{x:at.x+x*10,y:at.y+y*10},{x,y});
    assert.equal(resized.w,object.w+20);assert.equal(resized.h,object.h+20);
  }
});
