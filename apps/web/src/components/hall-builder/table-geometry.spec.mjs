import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALE, CHAIR, DINER_WIDTH, TABLE_CHAIR_OFFSET, makeObject, newHall, updateObject, resizeObject, seatPositions, roundSeatLimit, rectSideLimit, rectSeatLimit, issues, validateImport, rulerTicks, withNaturalTableSpacing } from './model.mjs';

test('table and chair defaults have dining-scale dimensions and a natural front clearance',()=>{
  const round=makeObject('round'),rect=makeObject('rect');
  assert.equal(CHAIR/SCALE,.45);assert.equal(round.w/SCALE,1.6);
  assert.equal(rect.w/SCALE,2.4);assert.equal(rect.h/SCALE,.9);
  for(const table of [round,rect]){
    assert.ok(Math.abs((table.chairOffset-CHAIR/2)/SCALE-.125)<1e-9);
    assert.equal(table.seats.length,8);
  }
  const at=seatPositions(round)[0];
  assert.equal(Math.hypot(at.x,at.y),round.w/2+TABLE_CHAIR_OFFSET);
  const top=seatPositions(rect).filter(s=>s.side===0);
  for(let i=1;i<top.length;i++)assert.ok(top[i].x-top[i-1].x>=DINER_WIDTH-1e-9);
});
test('round capacity follows table edge and the occupied arc, without increasing when chairs are pushed out',()=>{
  for(const [diameter,max] of [[1,5],[1.1,5],[1.2,6],[1.6,8],[1.8,9],[2,10]]){
    const table=makeObject('round',0,0,{w:diameter*SCALE,h:diameter*SCALE,count:max});
    assert.equal(roundSeatLimit(table),max);
    assert.equal(roundSeatLimit({...table,chairOffset:3*SCALE}),max);
    assert.throws(()=>updateObject(table,{count:max+1}),/максимум/);
    assert.throws(()=>makeObject('round',0,0,{w:diameter*SCALE,count:max+1}),/максимум/);
  }
  const table=makeObject('round');assert.equal(roundSeatLimit({...table,arrangement:'open'}),6);
  assert.throws(()=>updateObject(table,{arrangement:'open'}),/максимум 6/);
  const fewer=updateObject(table,{count:6});assert.equal(updateObject(fewer,{arrangement:'open'}).seats.length,6);
});
test('resizing a round table cannot silently overfill it or delete existing seat inventory',()=>{
  const table=makeObject('round'),ids=table.seats.map(s=>s.id);
  assert.equal(resizeObject(table,1.1*SCALE,1.1*SCALE),null);
  assert.deepEqual(table.seats.map(s=>s.id),ids);
  const fewer=updateObject(table,{count:5}),smaller=resizeObject(fewer,1.1*SCALE,1.1*SCALE);
  assert.ok(smaller);assert.equal(smaller.w,44);assert.equal(smaller.h,44);
  assert.deepEqual(smaller.seats.map(s=>s.id),ids.slice(0,5));
});
test('rectangular sides use diner frontage, redistribute correctly, and reject overcrowded or too-small sides',()=>{
  const table=makeObject('rect');assert.equal(rectSideLimit(table,0),4);assert.equal(rectSideLimit(table,1),1);
  assert.equal(rectSeatLimit(table),8);
  const all=updateObject(table,{arrangement:'all',count:10});assert.equal(all.seats.length,10);
  assert.throws(()=>updateObject(all,{count:11}),/максимум 10/);
  assert.throws(()=>updateObject(all,{arrangement:'two'}),/максимум 8/);
  assert.throws(()=>updateObject(table,{arrangement:'custom',sides:[3,2,3,0]}),/Максимум 1/);
  assert.equal(resizeObject(table,2.3*SCALE,.9*SCALE),null);
  const custom=updateObject(table,{arrangement:'custom',sides:[3,1,3,1]});
  assert.deepEqual([0,1,2,3].map(side=>seatPositions(custom).filter(s=>s.side===side).length),[3,1,3,1]);
});
test('older overfilled layouts remain recoverable and can be repaired without silently dropping chairs',()=>{
  for(const type of ['round','rect']){
    const hall=newHall(),table=makeObject(type);table.w=SCALE;table.h=type==='round'?SCALE:.9*SCALE;hall.objects=[table];
    assert.doesNotThrow(()=>validateImport(hall));assert.equal(table.seats.length,8);
    assert.ok(issues(hall).some(issue=>/максимум|Максимум/.test(issue.text)));
    assert.throws(()=>updateObject(table,{count:9}));
    const repaired=updateObject(table,{count:type==='round'?5:2});
    assert.deepEqual(repaired.seats.map(s=>s.id),table.seats.slice(0,repaired.count).map(s=>s.id));
  }
});
test('the former automatic offset is compacted without changing identifiers, pricing, dimensions or custom chair positions',()=>{
  const hall=newHall(),table=makeObject('round',200,100,{chairOffset:28});hall.objects=[table];
  const adjusted=withNaturalTableSpacing(hall);
  assert.equal(hall.objects[0].chairOffset,28);assert.equal(adjusted.objects[0].chairOffset,14);
  assert.deepEqual({...adjusted.objects[0],chairOffset:28},table);
  assert.equal(withNaturalTableSpacing(adjusted),adjusted);
  for(const patch of [{pinned:true},{disabled:true},{chairOffset:20},{seats:table.seats.map((s,i)=>({...s,dx:i===0?2:0}))},{seats:table.seats.map((s,i)=>({...s,...(i===0?{angle:.1}:{} )}))}]){
    const custom={...hall,objects:[{...table,...patch}]};assert.equal(withNaturalTableSpacing(custom),custom);
  }
});
test('rulers use 2 m marks for a 10 m side, 1 m for a 5 m side, and coarser marks for large halls',()=>{
  assert.deepEqual(rulerTicks(10*SCALE),[0,2,4,6,8,10]);
  assert.deepEqual(rulerTicks(5*SCALE),[0,1,2,3,4,5]);
  assert.deepEqual(rulerTicks(30*SCALE),[0,5,10,15,20,25,30]);
  assert.deepEqual(rulerTicks(100*SCALE),[0,20,40,60,80,100]);
  for(const metres of [.5,1,3,7,11,24,99]){
    const ticks=rulerTicks(metres*SCALE);assert.ok(ticks.length<=8);assert.equal(ticks[0],0);assert.ok(ticks.every(tick=>tick<=metres));
  }
});
