import test from 'node:test';
import assert from 'node:assert/strict';
import { makeObject, newHall, worldBounds, updateObject } from './model.mjs';
import { constrainHallToRoom } from './boundaries.mjs';

function fixture(objects){return {...newHall(),room:{w:400,h:200},objects};}
function contained(hall){for(const object of hall.objects){const b=worldBounds(object);assert.ok(b.left>=-1e-7&&b.top>=-1e-7&&b.right<=hall.room.w+1e-7&&b.bottom<=hall.room.h+1e-7,object.type);}}
function translated(hall,dx,dy){return {...hall,objects:hall.objects.map(o=>({...o,x:o.x+dx,y:o.y+dy}))};}

test('every object type stops at all four walls, including the attached chair footprint',()=>{
  for(const type of ['round','rect','rows','standing','stage','obstacle','entrance','seat']){
    const object=makeObject(type,200,100,type==='rows'?{rowCount:2,seatsPerRow:3}:type==='stage'?{w:180}:{}),before=fixture([object]);
    contained(before);
    for(const [dx,dy] of [[-1000,0],[1000,0],[0,-1000],[0,1000],[-1000,-1000],[1000,1000]]){
      const next=translated(before,dx,dy),result=constrainHallToRoom(next,before);
      contained(result);assert.deepEqual(result.objects[0].seats,object.seats);
      assert.equal(next.objects[0].x,object.x+dx);assert.equal(before.objects[0],object);
    }
  }
});
test('rotated tables are contained using the whole rotated envelope',()=>{
  for(const rotation of [5,30,45,90,135,-45]){
    const table=makeObject('rect',200,100,{rotation}),before=fixture([table]);
    for(const [dx,dy] of [[-500,-500],[500,-500],[-500,500],[500,500]])contained(constrainHallToRoom(translated(before,dx,dy),before));
  }
});
test('a selected group stops together and retains relative positions; pinned members do not move',()=>{
  const a=makeObject('round',90,100,{count:5,w:44,h:44}),b=makeObject('seat',250,80),pinned=makeObject('seat',300,150,{pinned:true});
  const before=fixture([a,b,pinned]);
  const next={...before,objects:[{...a,x:a.x-500,y:a.y-500},{...b,x:b.x-500,y:b.y-500},pinned]};
  const result=constrainHallToRoom(next,before,{movingIds:[a.id,b.id,pinned.id]});contained(result);
  assert.equal(result.objects[1].x-result.objects[0].x,b.x-a.x);assert.equal(result.objects[1].y-result.objects[0].y,b.y-a.y);
  assert.equal(result.objects[2],pinned);
});
test('numeric and keyboard translations use the same limit, independent of snapping',()=>{
  const table=makeObject('rect',200,100),before=fixture([table]);
  const atWall=constrainHallToRoom(translated(before,-500,0),before);contained(atWall);
  assert.ok(Math.abs(worldBounds(atWall.objects[0]).left-.4)<1e-7);
  const noFurther=constrainHallToRoom(translated(atWall,-4,0),atWall);assert.deepEqual(noFurther,atWall);
  contained(constrainHallToRoom(translated(atWall,-.17,-.23),atWall));
  contained(constrainHallToRoom(translated(atWall,20,0),atWall));
});
test('geometry and individual chair edits cannot escape by pushing the parent around',()=>{
  const table=makeObject('rect',200,100),before=fixture([table]);
  const wall=constrainHallToRoom(translated(before,0,-500),before),at=wall.objects[0];
  const modified={...at,seats:at.seats.map((s,i)=>i? s:{...s,dy:-200})};
  assert.throws(()=>constrainHallToRoom({...wall,objects:[modified]},wall),/не помещается/);
  assert.throws(()=>constrainHallToRoom({...wall,objects:[{...at,rotation:45}]},wall),/не помещается/);
  assert.throws(()=>constrainHallToRoom({...wall,objects:[{...at,h:at.h+40}]},wall),/не помещается/);
  assert.equal(wall.objects[0],at);
});
test('a new object or copied group is placed inside together, and oversized insertion is rejected atomically',()=>{
  const before=fixture([]),a=makeObject('seat',-50,-50),b=makeObject('seat',10,-20);
  const result=constrainHallToRoom({...before,objects:[a,b]},before);contained(result);
  assert.ok(Math.abs(result.objects[1].x-result.objects[0].x-60)<1e-7);assert.ok(Math.abs(result.objects[1].y-result.objects[0].y-30)<1e-7);
  assert.throws(()=>constrainHallToRoom({...before,objects:[makeObject('stage',200,100,{w:600})]},before),/не помещается/);
  assert.equal(before.objects.length,0);
  contained(constrainHallToRoom({...before,objects:[makeObject('standing',200,100,{w:400,h:200,capacity:200})]},before));
});
test('room shrinking cannot leave any geometry outside, including pinned objects',()=>{
  const before=fixture([makeObject('seat',350,150,{pinned:true})]);
  assert.throws(()=>constrainHallToRoom({...before,room:{w:300,h:200}},before),/Зал нельзя уменьшить/);
  assert.equal(before.room.w,400);
  contained(constrainHallToRoom({...before,room:{w:380,h:200}},before));
});
test('an oversized selection cannot be forced into the room; individual members can still be repaired',()=>{
  const a=makeObject('seat',-100,100),b=makeObject('seat',500,100),before=fixture([a,b]);
  assert.throws(()=>constrainHallToRoom(translated(before,10,0),before),/не помещается/);
  const result=constrainHallToRoom({...before,objects:[{...a,x:-90},b]},before);
  assert.ok(worldBounds(result.objects[0]).left>=0);assert.equal(result.objects[1],b);
});
test('unchanged legacy geometry and price edits remain recoverable; moving an outside object brings it back inside',()=>{
  const table=makeObject('round',-20,100),before=fixture([table]);
  const priced={...before,objects:[{...table,name:'Новое название',categoryId:'category'}]};
  assert.equal(constrainHallToRoom(priced,before),priced);
  const growth={...before,room:{w:500,h:300}};assert.equal(constrainHallToRoom(growth,before),growth);
  contained(constrainHallToRoom(translated(before,-10,0),before));
});
test('row movement and manual chair offsets count toward the boundary even when another chair defines the same envelope',()=>{
  const rows=makeObject('rows',200,100,{rowCount:2,seatsPerRow:3}),before=fixture([rows]);
  const modified=updateObject(rows,{rowPitch:300});
  assert.throws(()=>constrainHallToRoom({...before,objects:[modified]},before),/не помещается/);
  const outside=makeObject('rect',200,0);outside.seats[0].dy=-100;
  const legacy=fixture([outside]),second=outside.seats[1];
  const changed={...outside,seats:outside.seats.map(s=>s.id===second.id?{...s,dy:-1}:s)};
  assert.deepEqual(worldBounds(changed),worldBounds(outside));
  assert.throws(()=>constrainHallToRoom({...legacy,objects:[changed]},legacy),/не помещается/);
});
