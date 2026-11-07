import test from 'node:test';
import assert from 'node:assert/strict';
import { builderToVenue, venueToBuilder } from './venue-adapter.ts';
import { constrainHallToRoom } from './boundaries.mjs';
import { worldBounds } from './model.mjs';
import { sampleHall, makeObject, copyHall, summary, seatPositions, updateObject, deduplicateCategories, resolvedCategory, validateImport, splitStanding, starterHall, withInitialCategory } from './model.mjs';
import { newHallObject, editorHallV3, hallV3Editor, canonicalHallGeometry, cloneHallEditor, draftHallV3Schema } from '@event-platform/shared-types';
const options=h=>({id:h.id,name:h.name,currency:h.currency,revision:h.revision});
const coords=state=>new Map(state.editor.objects.map(o=>[o.id,{x:o.x,y:o.y,number:o.number,parentId:o.parentId}]));

test('wall limits survive centimetre rounding and reopening for rotated furniture with attached chairs',()=>{
  for(const type of ['round','rect'])for(const rotation of [0,30,90])for(const direction of [-1,1]){
    const h=sampleHall('empty');h.room={w:400,h:200};h.objects=[makeObject(type,200,100,{rotation})];
    const next=constrainHallToRoom({...h,objects:h.objects.map(o=>({...o,x:o.x+direction*1000,y:o.y+direction*1000}))},h);
    const saved=builderToVenue(next),restored=venueToBuilder(saved,options(h));
    const b=worldBounds(restored.objects[0]);assert.ok(b.left>=-1e-7&&b.top>=-1e-7&&b.right<=400+1e-7&&b.bottom<=200+1e-7);
    for(const seat of saved.editor.objects.filter(o=>o.type==='seat'))assert.ok(seat.x-.225>=-1e-7&&seat.y-.225>=-1e-7&&seat.x+.225<=10+1e-7&&seat.y+.225<=5+1e-7);
  }
});

test('all builder starters save to staging geometry and retain every inventory ID, unit and capacity on reopening',()=>{
  for(const kind of ['empty','rows','tables','standing','mixed']){
    const h=sampleHall(kind),encoded=builderToVenue(h),restored=venueToBuilder(encoded,options(h)),again=builderToVenue(restored);
    assert.doesNotThrow(()=>validateImport(restored),`${kind} recovery`);
    assert.deepEqual(summary(restored),summary(h),kind);
    assert.deepEqual(coords(again),coords(encoded),kind);
    assert.deepEqual(again.editor.objects.map(o=>o.id).sort(),encoded.editor.objects.map(o=>o.id).sort());
  }
});
test('major display amounts convert exactly once and nullable/inactive/zero tariffs survive canonical conversion',()=>{
  const h=sampleHall('mixed');h.categories[0].price=12.34;h.categories[1].price=0;h.categories[2].price=null;h.categories[2].active=false;
  const s=builderToVenue(h);assert.equal(s.editor.tariffs[0].price,1234);assert.equal(s.editor.tariffs[2].draftAmount,null);
  const canonical=editorHallV3(s.room,s.editor,null,'ru');draftHallV3Schema.parse(canonical);
  assert.equal(canonical.tariffs[0].amount,1234);assert.equal(canonical.tariffs[2].active,false);
  assert.equal(canonical.tariffs[1].unit,'table');assert.equal(canonicalHallGeometry(canonical).tariffUnits[h.categories[2].id],'entry');
  const reopened=venueToBuilder({room:s.room,editor:hallV3Editor(canonical,'ru')},options(h));
  assert.deepEqual(reopened.categories.map(c=>[c.id,c.price,c.active,c.unit,c.color]),h.categories.map(c=>[c.id,c.price,c.active,c.unit,c.color]));
});
test('block row spacing, aisle, curvature and manual chair offsets survive save and reload',()=>{
  const h=sampleHall('rows'),block=h.objects.find(o=>o.type==='rows');block.rotation=17;block.rowPitch=51;block.seatPitch=32;block.curvature=25;block.seats[4].dx=11;block.seats[4].dy=-7;
  const s=builderToVenue(h),reopened=venueToBuilder(s,options(h)),b=reopened.objects.find(o=>o.type==='rows');
  assert.equal(b.id,block.id);assert.equal(b.rows.length,8);assert.equal(b.seatPitch,32);assert.equal(b.rowPitch,51);assert.equal(b.aisle,'center');assert.equal(b.curvature,25);
  const after=coords(builderToVenue(reopened));for(const [id,p] of coords(s)){assert.ok(Math.abs(after.get(id).x-p.x)<=.01);assert.ok(Math.abs(after.get(id).y-p.y)<=.01);}
});
test('legacy world positions and unusual seat numbers remain stable, including attached table chairs',()=>{
  const row={...newHallObject(crypto.randomUUID(),'row',4,5),name:'Балкон',width:4,number:9,rotation:20,startNumber:4};
  const seats=[{...newHallObject(crypto.randomUUID(),'seat',3.37,5.28),parentId:row.id,number:4,attachedOrder:0},{...newHallObject(crypto.randomUUID(),'seat',5.12,5.93),parentId:row.id,number:8,attachedOrder:1}];
  const state={room:{widthM:24,heightM:16},editor:{version:1,objects:[row,...seats],tariffs:[]}};
  const loaded=venueToBuilder(state,{id:crypto.randomUUID(),name:'Legacy',currency:'KZT',revision:1});const after=builderToVenue(loaded);
  for(const seat of seats){const record=after.editor.objects.find(o=>o.id===seat.id);assert.equal(record.number,seat.number);assert.equal(record.parentId,row.id);assert.ok(Math.abs(record.x-seat.x)<=.01);assert.ok(Math.abs(record.y-seat.y)<=.01);}
});
test('pinning remains available; disabling a block propagates without losing explicit child states',()=>{
  const h=sampleHall('rows'),b=h.objects.find(o=>o.type==='rows');b.pinned=true;b.seats[2].disabled=true;
  let s=builderToVenue(h);assert.equal(s.editor.objects.find(o=>o.id===b.rows[0].id).locked,false);assert.equal(s.editor.objects.find(o=>o.id===b.seats[2].id).locked,true);
  b.disabled=true;s=builderToVenue(h);assert.ok(s.editor.objects.filter(o=>o.type==='seat').every(o=>o.locked));
  const loaded=venueToBuilder(s,options(h)),block=loaded.objects.find(o=>o.type==='rows');assert.equal(block.disabled,true);assert.equal(block.pinned,true);assert.equal(block.seats.filter(o=>o.disabled).length,1);
});
test('independent saved hall copies remap hidden seating groups, tariffs and every parent reference',()=>{
  const h=sampleHall('mixed'),s=builderToVenue(h),copied=cloneHallEditor(s.editor,()=>crypto.randomUUID());
  assert.ok(copied.objects.every(o=>!s.editor.objects.some(old=>old.id===o.id)));
  const groups=copied.objects.filter(o=>o.builder?.group).map(o=>o.builder.group);assert.equal(new Set(groups.map(g=>g.id)).size,1);assert.notEqual(groups[0].id,h.objects.find(o=>o.type==='rows').id);
  assert.ok(copied.objects.every(o=>!o.parentId||copied.objects.some(p=>p.id===o.parentId)));
  assert.ok(groups.every(g=>!g.tariffId||copied.tariffs.some(t=>t.id===g.tariffId)));
  assert.deepEqual(summary(venueToBuilder({room:s.room,editor:copied},options(h))),summary(h));
});
test('a reused multi-row block receives new canonical row/seat identifiers even when source records exist',()=>{
  const h=sampleHall('rows'),s=builderToVenue(h),loaded=venueToBuilder(s,options(h)),copied=copyHall(loaded),again=builderToVenue(copied);
  assert.ok(again.editor.objects.every(o=>!s.editor.objects.some(old=>old.id===o.id)));
});
test('tariff translations and descriptions survive geometry-only saves',()=>{
  const h=sampleHall('rows'),s=builderToVenue(h);s.editor.tariffs[0].localized={ru:{name:'Стандарт'},en:{name:'Standard',description:'Front rows'}};s.editor.tariffs[0].description='Описание';
  const loaded=venueToBuilder(s,options(h));loaded.objects.find(o=>o.type==='rows').x+=40;
  const after=builderToVenue(loaded);assert.deepEqual(after.editor.tariffs[0].localized,s.editor.tariffs[0].localized);assert.equal(after.editor.tariffs[0].description,'Описание');
});


test('reopening preserves category inheritance so a block assignment updates every inherited seat',()=>{
  const h=sampleHall('rows'),b=h.objects.find(o=>o.type==='rows');
  const vip={...h.categories[0],id:crypto.randomUUID(),name:'VIP',color:'#123abc',price:25};h.categories.push(vip);
  b.rows[1].categoryId=vip.id;b.seats[0].categoryId=vip.id;
  const reopened=venueToBuilder(builderToVenue(h),options(h)),block=reopened.objects.find(o=>o.type==='rows');
  assert.equal(block.rows[0].categoryId,null);assert.equal(block.seats[1].categoryId,null);
  block.categoryId=vip.id;
  assert.ok(seatPositions(block).every(s=>resolvedCategory(reopened,block,s,s.row).id===vip.id));
  const after=builderToVenue(reopened);assert.ok(after.editor.objects.filter(o=>o.type==='seat').every(s=>s.tariffId===vip.id));
});
test('reopened table arrangements and seat identities still respond to count, size and sale-mode changes',()=>{
  const h=sampleHall('mixed'),loaded=venueToBuilder(builderToVenue(h),options(h)),table=loaded.objects.find(o=>o.type==='round');
  const changed=updateObject(table,{count:6});const expected=makeObject('round',changed.x,changed.y,{count:6});
  assert.deepEqual(seatPositions(changed).map(s=>[s.x,s.y]),seatPositions(expected).map(s=>[s.x,s.y]));
  const perSeat=updateObject(table,{saleMode:'per_seat'});assert.equal(perSeat.categoryId,null);assert.ok(perSeat.seats.every(s=>s.categoryId===null));
  loaded.objects=loaded.objects.map(o=>o.id===table.id?perSeat:o);const saved=builderToVenue(loaded);assert.doesNotThrow(()=>editorHallV3(saved.room,saved.editor,null,'ru'));
});
test('manual table chair positions and unusual rectangular chair numbers remain editable on reopening',()=>{
  const h=sampleHall('mixed'),table=h.objects.find(o=>o.type==='rect');table.seats[0].number=99;table.seats[0].dx=13;table.seats[0].dy=-4;
  const loaded=venueToBuilder(builderToVenue(h),options(h)),after=loaded.objects.find(o=>o.id===table.id);
  assert.equal(seatPositions(after)[0].number,99);assert.equal(after.seats[0].dx,13);assert.equal(after.seats[0].dy,-4);
  const round=h.objects.find(o=>o.type==='round');round.seats[0].angle=.1;round.seats[0].dx=8;
  const reloaded=venueToBuilder(builderToVenue(h),options(h)).objects.find(o=>o.id===round.id);
  assert.equal(reloaded.seats[0].angle,.1);assert.equal(reloaded.seats[0].dx,8);
});
test('category deduplication ignores source identity while preserving distinct translations',()=>{
  const h=sampleHall('rows'),s=builderToVenue(h),loaded=venueToBuilder(s,options(h)),first=loaded.categories[0];
  loaded.categories.push({...first,id:crypto.randomUUID(),source:{...first.source,id:crypto.randomUUID()}});
  assert.equal(deduplicateCategories(loaded).categories.length,loaded.categories.length-1);
  loaded.categories.at(-1).source.localized={en:{name:'A distinct label'}};
  assert.equal(deduplicateCategories(loaded).categories.length,loaded.categories.length);
});

test('standing shapes survive recovery and rectangular zones stay splittable after reload',()=>{
  const h=sampleHall('mixed'),s=builderToVenue(h),restored=venueToBuilder(s,options(h)),zone=restored.objects.find(o=>o.type==='standing');
  assert.equal(zone.points,null);assert.equal(splitStanding(zone).reduce((n,o)=>n+o.capacity,0),zone.capacity);
  const original=h.objects.find(o=>o.type==='standing');original.w=221.2;original.h=181.2;original.points=[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}];
  const encoded=builderToVenue(h),again=venueToBuilder(encoded,options(h));assert.doesNotThrow(()=>validateImport(again));assert.deepEqual(again.objects.find(o=>o.id===original.id).points,original.points);
  const legacy={room:encoded.room,editor:{...encoded.editor,objects:encoded.editor.objects.map(({builder,...o})=>o)}};
  const imported=venueToBuilder(legacy,options(h));assert.doesNotThrow(()=>validateImport(imported));
  const geometry=builderToVenue(imported).editor.objects.find(o=>o.id===original.id);assert.deepEqual(geometry.points,encoded.editor.objects.find(o=>o.id===original.id).points);assert.equal(geometry.capacity,original.capacity);
});

test('fresh layouts start with one relevant unpriced category; existing categories are preserved',()=>{
  for(const [kind,unit] of [['empty','seat'],['rows','seat'],['tables','table'],['standing','entry']]){
    const hall=starterHall(kind,'RUB');assert.equal(hall.categories.length,1,kind);assert.equal(hall.categories[0].unit,unit);assert.equal(hall.categories[0].price,null);assert.equal(hall.currency,'RUB');
    const saved=builderToVenue(hall);assert.doesNotThrow(()=>editorHallV3(saved.room,saved.editor,null,'ru'));
  }
  const mixed=starterHall('mixed');assert.equal(mixed.categories.length,3);assert.ok(mixed.categories.every(c=>c.price===null));
  const existing=sampleHall('mixed');assert.equal(withInitialCategory(existing),existing);assert.equal(existing.categories[1].price,40000);
});
