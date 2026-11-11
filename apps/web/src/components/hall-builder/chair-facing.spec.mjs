import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAIR, bounds, makeObject, newHall, rotate, seatPositions } from './model.mjs';
import { builderToVenue, venueToBuilder } from './venue-adapter.ts';
import { slideRoundSeat } from './table-editing.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);

test('round chairs always face the centre, including moved rail positions and legacy offsets',()=>{
  let object=makeObject('round',400,300,{w:120,h:120,rotation:35});
  object=slideRoundSeat(object,object.seats[0].id,-1.4);
  object.seats[2]={...object.seats[2],dx:5,dy:-3,facing:17};
  for(const seat of seatPositions(object)){
    const front=rotate(0,1,seat.facing),distance=Math.hypot(seat.x,seat.y);
    near(front.x,-seat.x/distance);near(front.y,-seat.y/distance);
  }
});

test('rectangular chairs face inward from their assigned side, ignoring individual facing overrides',()=>{
  const object=makeObject('rect',400,300,{w:100,h:80,arrangement:'custom',sides:[3,1,2,2]});
  object.seats.forEach(s=>{s.facing=42;});
  for(const seat of seatPositions(object)){
    const front=rotate(0,1,seat.facing),expected=[{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:0}][seat.side];
    near(front.x,expected.x);near(front.y,expected.y);
  }
});

test('saved chair directions include table rotation and survive reopening without changing inventory',()=>{
  for(const type of ['round','rect'])for(const rotation of [-170,0,53,180]){
    const hall=newHall(),object=makeObject(type,400,300,{rotation});hall.objects=[object];
    const categoryId=crypto.randomUUID();object.seats[0].categoryId=categoryId;
    hall.categories=[{id:categoryId,name:'VIP',unit:'seat',price:20,color:'#7845ed',active:true}];
    const saved=builderToVenue(hall),reopened=venueToBuilder(saved,hall),again=builderToVenue(reopened);
    assert.deepEqual(reopened.objects[0].seats.map(s=>[s.id,s.categoryId]),object.seats.map(s=>[s.id,s.categoryId]));
    for(const seat of seatPositions(object)){
      const exported=saved.editor.objects.find(s=>s.id===seat.id),restored=again.editor.objects.find(s=>s.id===seat.id);
      const expected=rotate(0,1,rotation+seat.facing),actual=rotate(0,1,exported.rotation);
      near(actual.x,expected.x);near(actual.y,expected.y);near(restored.rotation,exported.rotation);
    }
  }
});

test('selection bounds contain every rotated chair corner',()=>{
  const object=makeObject('round'),box=bounds(object);
  for(const seat of seatPositions(object))for(const x of [-CHAIR/2,CHAIR/2])for(const y of [-CHAIR/2,CHAIR/2]){
    const p=rotate(x,y,seat.facing);
    assert.ok(seat.x+p.x>=box.x-1e-7&&seat.x+p.x<=box.x+box.w+1e-7);
    assert.ok(seat.y+p.y>=box.y-1e-7&&seat.y+p.y<=box.y+box.h+1e-7);
  }
});
