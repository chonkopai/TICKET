import test from 'node:test';
import assert from 'node:assert/strict';
import {makeObject,updateObject,resizeObject,fitBlock,seatPositions,moveSeat,copyObjects,copyHall,sampleHall,summary,issues,splitStanding,validateImport,clone,bounds} from '../src/model.mjs';

test('spacing, curvature and resizing retain seats and overrides without detaching inventory',()=>{
  let block=makeObject('rows',500,400,{rowCount:3,seatsPerRow:8});
  block.seats[2].disabled=true;block.seats[2].dx=13;
  const ids=block.seats.map(s=>s.id),rowIds=block.rows.map(r=>r.id);
  block=updateObject(block,{seatPitch:38,rowPitch:55,curvature:30});
  const resized=resizeObject(block,600,230);
  assert.deepEqual(resized.seats.map(s=>s.id),ids);assert.deepEqual(resized.rows.map(r=>r.id),rowIds);
  assert.equal(resized.seats[2].dx,13);assert.equal(resized.seats[2].disabled,true);
  assert.equal(resizeObject(block,80,40),null);
});
test('count changes retain surviving row and seat identities',()=>{
  const a=makeObject('rows',0,0,{rowCount:3,seatsPerRow:8});
  const b=updateObject(a,{rowCount:4,seatsPerRow:10});
  for(const r of a.rows)assert.deepEqual(b.seats.filter(s=>s.rowId===r.id).slice(0,8).map(s=>s.id),a.seats.filter(s=>s.rowId===r.id).map(s=>s.id));
  assert.equal(new Set(b.seats.map(s=>s.id)).size,40);
  const c=updateObject(b,{rowCount:2,seatsPerRow:6});assert.equal(c.seats.length,12);assert.equal(c.seats[0].id,a.seats[0].id);
});
test('drawn block fits maximum rows and seats at the chosen spacing',()=>{
  const block=fitBlock(0,0,600,300);assert.ok(block.w<=600);assert.ok(block.h<=300);
  assert.ok(updateObject(block,{seatsPerRow:block.seatsPerRow+1}).w>600);
  assert.ok(updateObject(block,{rowCount:block.rowCount+1}).h>300);
});
test('mixed inventory counts whole tables once and admission by capacity',()=>{
  const h=sampleHall('mixed'),s=summary(h);assert.deepEqual(s,{individual:84,wholeTables:2,included:16,standing:120,guests:220,revenue:860000,unpriced:0});
  assert.equal(issues(h).length,0);h.objects[1].pinned=true;assert.equal(summary(h).guests,220);
  h.objects[1].disabled=true;assert.equal(summary(h).guests,148);
});
test('seat-level active category overrides an inactive parent category',()=>{
  const h=sampleHall('rows'),o=h.objects[1];h.categories[0].active=false;
  const vip={...h.categories[0],id:'vip',active:true,price:100};h.categories.push(vip);o.seats[0].categoryId=vip.id;
  assert.equal(summary(h).individual,1);assert.equal(summary(h).revenue,100);
});
test('standing resize never changes capacity and splitting conserves it',()=>{
  const o=makeObject('standing',500,400,{capacity:101,rotation:30});
  assert.equal(resizeObject(o,600,400).capacity,101);
  const split=splitStanding(o);assert.equal(split[0].capacity+split[1].capacity,101);assert.notEqual(split[0].id,split[1].id);
  assert.throws(()=>splitStanding({...o,capacity:null}));assert.throws(()=>splitStanding({...o,points:[]}));
});
test('whole-table price is independent of chair count',()=>{
  const h=sampleHall('tables');const a=summary(h);h.objects[1]=updateObject(h.objects[1],{count:10});
  assert.equal(summary(h).revenue,a.revenue);assert.equal(summary(h).included,a.included+2);
});
test('copying a hall remaps all identities and category references independently',()=>{
  const h=sampleHall('mixed');h.objects[1].seats[0].categoryId=h.categories[0].id;
  const c=copyHall(h);assert.notEqual(c.id,h.id);assert.equal(summary(c).guests,summary(h).guests);
  const old=new Set(h.objects.flatMap(o=>[o.id,...(o.rows??[]).map(r=>r.id),...(o.seats??[]).map(s=>s.id)]));
  assert.ok(c.objects.every(o=>!old.has(o.id)&&(o.seats??[]).every(s=>!old.has(s.id))));
  assert.equal(c.objects[1].seats[0].categoryId,c.categories[0].id);c.objects[1].seats[0].disabled=true;assert.equal(h.objects[1].seats[0].disabled,false);
  assert.equal(validateImport(c).objects.length,c.objects.length);
});
test('duplicated tables receive new names, seat identities and positions',()=>{
  const h=sampleHall('tables'),o=h.objects[1],c=copyObjects([o],h)[0];assert.notEqual(c.name,o.name);assert.equal(c.x,o.x+36);assert.notEqual(c.seats[0].id,o.seats[0].id);
});
test('round chair movement follows orbit and cannot pass a neighboring chair',()=>{
  const o=makeObject('round'),p=seatPositions(o),m=moveSeat(o,p[0].id,p[1]);const q=seatPositions(m);
  assert.ok(Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y)>=21);assert.ok(Math.abs(Math.hypot(q[0].x,q[0].y)-(o.w/2+o.chairOffset))<.001);
  assert.deepEqual(q.slice(1).map(s=>[s.x,s.y]),p.slice(1).map(s=>[s.x,s.y]));assert.deepEqual(m.seats.map(s=>s.id),o.seats.map(s=>s.id));
});
test('manual row-seat spacing persists after reflow and JSON round-trip',()=>{
  const o=makeObject('rows'),p=seatPositions(o)[0],m=moveSeat(o,p.id,{x:p.x+12,y:p.y+8});
  const r=updateObject(JSON.parse(JSON.stringify(m)),{rowPitch:60});assert.equal(r.seats[0].dx,12);assert.equal(r.seats[0].dy,8);
});
test('rectangular side controls create the correct attached chairs',()=>{
  const o=updateObject(makeObject('rect'),{arrangement:'custom',sides:[3,1,2,0]});assert.equal(o.count,6);assert.equal(o.seats.length,6);
  assert.deepEqual([0,1,2,3].map(side=>seatPositions(o).filter(s=>s.side===side).length),[3,1,2,0]);assert.ok(bounds(o).w>o.w);
});
test('unpriced and wrong-unit inventory is blocked at review',()=>{
  const h=sampleHall('standing');h.objects[1].categoryId=h.categories[0].id;assert.ok(issues(h).some(i=>i.text.includes('единица')));
  h.objects[1].categoryId=null;assert.ok(issues(h).some(i=>i.text.includes('цену')));
});
test('all starter types round-trip and empty really is empty',()=>{
  for(const kind of ['rows','tables','standing','mixed','empty'])assert.doesNotThrow(()=>validateImport(sampleHall(kind)));
  assert.equal(sampleHall('empty').objects.length,0);
});
test('import rejects broken children, duplicate identities, invalid geometry and capacity',()=>{
  const source=sampleHall('mixed');
  const cases=[h=>delete h.objects[1].seats,h=>h.objects[1].seats[0].rowId='missing',h=>h.objects[1].seats[0].id=h.objects[1].seats[1].id,h=>h.categories[0].unit='invalid',h=>h.objects[1].rows[0].count=200000,h=>h.objects[2].points=[{}],h=>h.objects[2].capacity=-1,h=>h.objects[3].arrangement='custom',h=>h.objects[3].count=31];
  for(const mutate of cases){const h=clone(source);mutate(h);assert.throws(()=>validateImport(h));}
});

test('batch table spacing uses actual chair count and preserves unique table labels',async()=>{
  const {batchTables,worldBounds}=await import('../src/model.mjs');const h=sampleHall('mixed');
  const tables=batchTables(h,{count:12,cols:4,type:'rect',x:100,y:100,gapX:40,gapY:30,seatCount:6});
  assert.equal(tables.length,12);assert.ok(tables.every(t=>t.seats.length===6));assert.equal(new Set(tables.map(t=>t.name)).size,12);assert.equal(tables[0].name,'Стол 5');
  assert.ok(Math.abs(worldBounds(tables[1]).left-worldBounds(tables[0]).right-40)<.001);
});
test('review detects overlapping child chairs before completion',()=>{
  const h=sampleHall('rows'),o=h.objects[1],p=seatPositions(o);
  h.objects[1]=moveSeat(o,p[0].id,p[1]);assert.ok(issues(h).some(i=>i.text.includes('кресла')));
});

test('rectangular side limits follow side length and reject another chair at the cap',async()=>{
  const {rectSideLimit}=await import('../src/model.mjs');
  let o=updateObject(makeObject('rect'),{arrangement:'custom',sides:[3,3,3,0]});
  assert.equal(rectSideLimit(o,0),7);assert.equal(rectSideLimit(o,1),3);
  const ids=o.seats.map(s=>s.id);
  assert.throws(()=>updateObject(o,{sides:[3,4,3,0]}),/Максимум 3/);
  assert.deepEqual(o.seats.map(s=>s.id),ids);
  o=updateObject(o,{h:72});assert.equal(rectSideLimit(o,1),4);
  assert.equal(updateObject(o,{sides:[3,4,3,0]}).seats.length,10);
});
test('rectangular presets redistribute by side capacity and cap the total',async()=>{
  const {rectSeatLimit,rectSideCounts}=await import('../src/model.mjs');
  const o=makeObject('rect',0,0,{arrangement:'all',count:20});
  assert.equal(rectSeatLimit(o),20);assert.deepEqual(rectSideCounts(o),[7,3,7,3]);
  assert.throws(()=>updateObject(o,{count:21}),/максимум 20/);
  assert.throws(()=>updateObject(o,{arrangement:'two'}),/максимум 14/);
  assert.throws(()=>makeObject('rect',0,0,{count:15}),/максимум 14/);
  const positions=seatPositions(o);
  assert.ok(positions.every((p,i)=>positions.every((q,j)=>i===j||Math.hypot(p.x-q.x,p.y-q.y)>=18)));
});
test('shrinking a rectangular side never removes chairs to satisfy capacity',()=>{
  const o=makeObject('rect',0,0,{count:14});const ids=o.seats.map(s=>s.id);
  assert.equal(resizeObject(o,120,66),null);assert.deepEqual(o.seats.map(s=>s.id),ids);
  assert.notEqual(resizeObject(o,126,66),null);
});
test('older overfilled tables stay visible, are flagged and can be repaired',async()=>{
  const {rectSideCounts}=await import('../src/model.mjs');
  const h=sampleHall('mixed');const o=makeObject('rect',600,100,{arrangement:'custom',sides:[3,4,3,0],h:72});
  o.h=66;h.objects=[o];assert.equal(seatPositions(o).length,10);
  assert.ok(issues(h).some(i=>i.text.includes('Максимум 3')));
  assert.throws(()=>updateObject(o,{sides:[3,5,3,0]}));
  assert.equal(updateObject(o,{sides:[3,3,3,0]}).count,9);
  const old=makeObject('rect');old.count=16;old.seats=Array.from({length:16},(_,i)=>({id:`old-${i}`,dx:0,dy:0}));
  assert.equal(rectSideCounts(old).reduce((a,b)=>a+b,0),16);assert.equal(seatPositions(old).length,16);
});
test('duplicate categories are repaired across objects, rows and chairs without changing totals',async()=>{
  const {deduplicateCategories}=await import('../src/model.mjs');
  const h=sampleHall('mixed'),original=h.categories[0],copy={...original,id:'duplicate'};
  h.categories.push(copy);h.objects[1].categoryId=copy.id;h.objects[1].rows[0].categoryId=copy.id;h.objects[1].seats[0].categoryId=copy.id;
  const before=summary(h),ids=h.objects[1].seats.map(s=>s.id),clean=deduplicateCategories(h);
  assert.equal(clean.categories.length,3);assert.equal(clean.objects[1].categoryId,original.id);
  assert.equal(clean.objects[1].rows[0].categoryId,original.id);assert.equal(clean.objects[1].seats[0].categoryId,original.id);
  assert.deepEqual(summary(clean),before);assert.deepEqual(clean.objects[1].seats.map(s=>s.id),ids);
  assert.equal(deduplicateCategories(clean),clean);assert.equal(h.categories.length,4);
});
test('categories with different units, prices, colours, activity or metadata remain distinct',async()=>{
  const {deduplicateCategories}=await import('../src/model.mjs');const h=sampleHall('rows'),c=h.categories[0];
  for(const [i,patch] of [{unit:'table'},{price:6000},{color:'#112233'},{active:false},{description:'Different terms'}].entries())h.categories.push({...c,...patch,id:`different-${i}`});
  assert.equal(deduplicateCategories(h).categories.length,8);
});
test('inserting the same fragment reuses matching categories and ignores unused ones',async()=>{
  const {insertFragment,fragmentCategories}=await import('../src/model.mjs');const h=sampleHall('mixed');
  const objects=[h.objects[1]],f={objects,categories:clone(h.categories),currency:h.currency};
  assert.equal(fragmentCategories(objects,h.categories).length,1);
  const first=insertFragment(h,f),second=insertFragment(first.hall,f);
  assert.equal(first.hall.categories.length,3);assert.equal(second.hall.categories.length,3);
  assert.equal(second.objects[0].categoryId,h.categories[0].id);
  assert.notEqual(first.objects[0].id,second.objects[0].id);assert.notEqual(first.objects[0].seats[0].id,second.objects[0].seats[0].id);
  assert.equal(h.objects.length,7);assert.equal(validateImport(second.hall).objects.length,9);
});
test('fragment insertion imports a missing child override and remaps its reference',async()=>{
  const {insertFragment}=await import('../src/model.mjs');const h=sampleHall('rows'),objects=[clone(h.objects[1])];
  const vip={...h.categories[0],id:'vip',name:'VIP',price:10000};objects[0].seats[0].categoryId=vip.id;
  const result=insertFragment(h,{objects,categories:[...h.categories,vip],currency:h.currency});
  assert.equal(result.hall.categories.length,4);assert.notEqual(result.objects[0].seats[0].categoryId,vip.id);
  assert.equal(result.hall.categories.find(c=>c.id===result.objects[0].seats[0].categoryId).name,'VIP');
});
test('cross-currency fragments clear prices without relabeling or changing existing amounts',async()=>{
  const {insertFragment}=await import('../src/model.mjs');const h=sampleHall('rows'),f={objects:[h.objects[1]],categories:h.categories,currency:'USD'};
  const result=insertFragment(h,f),c=result.hall.categories.find(c=>c.id===result.objects[0].categoryId);
  assert.equal(c.price,null);assert.equal(result.hall.categories[0].price,5000);assert.equal(h.categories.length,3);
  assert.equal(result.hall.categories.length,4);
});
