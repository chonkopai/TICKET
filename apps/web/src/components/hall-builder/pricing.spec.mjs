import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleHall, issues, makeObject, saleInventory, summary, validateImport, clone } from './model.mjs';
import { selectionPricing, tableSaleMismatch, assignCategory, savePricingCategory, unpricedInventory, unpricedObjects, frameObjects } from './pricing.mjs';

const fixture = () => {
  const hall = sampleHall('empty'), [seat, table, entry] = hall.categories;
  hall.objects = [makeObject('rows', 300, 300, { rowCount: 2, seatsPerRow: 3, categoryId: seat.id }),
    makeObject('round', 700, 500, { count: 8, saleMode: 'whole_table', categoryId: table.id }),
    makeObject('standing', 900, 300, { capacity: 60, categoryId: entry.id })];
  return hall;
};
test('selection totals count chairs, a whole table once, and standing capacity', () => {
  const h = fixture(), report = selectionPricing(h, h.objects.map(o => o.id));
  assert.deepEqual(report.counts, { seat: 6, table: 1, entry: 60 });
  assert.equal(report.subtotal, 6 * 5000 + 40000 + 60 * 3000);
  assert.equal(report.subtotal, summary(h).revenue);
  assert.equal(saleInventory(h).length, 8);
});
test('inherited assignment is detected as a no-op; mixed units are blocked atomically', () => {
  const h = fixture(), block = h.objects[0];
  const report = selectionPricing(h, [block.id], { categoryId: h.categories[0].id });
  assert.equal(report.matching, 6);assert.equal(report.canApply, false);
  assert.equal(assignCategory(h, [block.id], h.categories[0].id), h);
  assert.equal(assignCategory(h, h.objects.map(o => o.id), h.categories[0].id), h);
  assert.equal(selectionPricing(h, [h.objects[1].id], { categoryId: h.categories[0].id }).incompatible, true);
});
test('block application clears row/chair price exceptions but preserves identities and disabled exceptions', () => {
  const h = fixture(), block = h.objects[0], alternate = { ...h.categories[0], id: 'alternate', price: 7000 };
  h.categories.push(alternate);block.rows[0].categoryId = alternate.id;
  block.seats[3].categoryId = alternate.id;block.seats[4].disabled = true;block.seats[4].categoryId = alternate.id;
  const before = clone(h), report = selectionPricing(h, [block.id], { categoryId: h.categories[0].id });
  assert.equal(report.quantity, 5);assert.equal(report.matching, 1);assert.equal(report.canApply, true);
  const next = assignCategory(h, [block.id], h.categories[0].id);
  assert.deepEqual(h, before);assert.deepEqual(next.objects[0].seats.map(s => s.id), block.seats.map(s => s.id));
  assert.ok(next.objects[0].rows.every(r => r.categoryId === null));
  assert.equal(next.objects[0].seats[3].categoryId, null);
  assert.equal(next.objects[0].seats[4].categoryId, alternate.id);assert.equal(next.objects[0].seats[4].disabled, true);
  assert.equal(selectionPricing(next, [block.id], { categoryId: h.categories[0].id }).matching, 5);
  validateImport(next);
});
test('row and seat application stay inside their scope and clear only row child overrides', () => {
  const h = fixture(), block = h.objects[0], alt = { ...h.categories[0], id: 'alt', price: 6000 };h.categories.push(alt);
  block.seats[1].categoryId = alt.id;
  const rowId = block.rows[0].id;
  const next = assignCategory(h, [block.id], h.categories[0].id, { rowId });
  assert.equal(next.objects[0].seats[1].categoryId, null);
  assert.deepEqual(next.objects[0].seats.slice(3), block.seats.slice(3));
  const one = assignCategory(next, [block.id], alt.id, { seatId: block.seats[5].id });
  assert.equal(one.objects[0].seats[5].categoryId, alt.id);
  assert.equal(selectionPricing(one, [block.id], { seatId: block.seats[5].id }).subtotal, 6000);
  assert.deepEqual(one.objects[0].seats.slice(0, 5), next.objects[0].seats.slice(0, 5));
});
test('finder respects zero prices, disabled and inactive inventory, child inheritance, whole-table and admission units', () => {
  const h = fixture(), block = h.objects[0];
  h.categories.push({ ...h.categories[0], id: 'inactive', active: false }, { ...h.categories[0], id: 'free', price: 0 });
  block.categoryId = null;block.seats[0].disabled = true;block.seats[1].categoryId = 'inactive';block.seats[2].categoryId = 'free';
  h.objects[1].categoryId = null;h.objects[2].categoryId = null;
  const missing = unpricedInventory(h);
  assert.equal(missing.reduce((n, i) => n + i.quantity, 0), 64);
  assert.equal(unpricedObjects(h).length, 3);
  assert.equal(missing.filter(i => i.unit === 'table').length, 1);
  assert.equal(summary(h).unpriced, 64);
});
test('wrong-unit prices are incomplete and excluded from subtotal and total', () => {
  const h = fixture();h.objects[1].categoryId = h.categories[0].id;
  const report = selectionPricing(h, [h.objects[1].id]);
  assert.equal(report.subtotal, 0);assert.equal(report.missing, 1);
  assert.equal(summary(h).revenue, 210000);
});
test('inactive categories can be replaced, but unavailable objects and decor are not assignment targets', () => {
  const h = fixture(), block = h.objects[0];h.categories[0].active = false;
  h.categories.push({ ...h.categories[0], id: 'active', active: true });
  assert.equal(selectionPricing(h, [block.id], { categoryId: 'active' }).canApply, true);
  const next = assignCategory(h, [block.id], 'active');assert.equal(summary(next).individual, 6);
  h.objects[0].disabled = true;
  assert.equal(assignCategory(h, [block.id], 'active'), h);
  h.objects.push(makeObject('stage', 400, 100));
  assert.equal(selectionPricing(h, [h.objects.at(-1).id], { categoryId: 'active' }).quantity, 0);
  assert.equal(assignCategory(h, [h.objects[1].id], 'active', { seatId: h.objects[1].seats[0].id }), h);
});
test('framing contains rotated chair envelopes and returns no frame for an empty list', () => {
  const h = fixture();h.objects[0].rotation = 35;
  const frame = frameObjects(h.objects, 1.7);
  assert.ok(frame.w > 0 && frame.h > 0);assert.equal(frame.w / frame.h, 1.7);
  assert.ok(frame.x < 300 && frame.y < 300);assert.equal(frameObjects([]), null);
});

test('default overview opens closer while preserving the entire layout, including rotated chairs', async () => {
  const { hallOverview } = await import('./pricing.mjs');
  const { worldBounds } = await import('./model.mjs');
  const h = fixture();h.objects[0].rotation = 32;
  const view = hallOverview(h);
  for (const o of h.objects) {
    const box = worldBounds(o);
    assert.ok(box.left >= view.x && box.right <= view.x + view.w);
    assert.ok(box.top >= view.y && box.bottom <= view.y + view.h);
  }
  const compact = sampleHall('rows');
  assert.ok(hallOverview(compact).w < compact.room.w + 120);
  const empty = sampleHall('empty'), blank = hallOverview(empty);
  assert.ok(blank.x < 0 && blank.y < 0 && blank.w > empty.room.w && blank.h > empty.room.h);
});

test('creating without Apply preserves every inventory assignment and price', () => {
  const h=fixture(), before=clone(h), c={...h.categories[0],id:'vip',name:'VIP',price:7500};
  const result=savePricingCategory(h,c,{selection:[h.objects[0].id]});
  assert.equal(result.categoryId,c.id);
  assert.equal(result.hall.categories.length,h.categories.length+1);
  assert.deepEqual(result.hall.objects,before.objects);
  assert.equal(summary(result.hall).revenue,summary(before).revenue);
  assert.deepEqual(h,before);
});
test('create and apply uses the captured seat scope without changing siblings or geometry', () => {
  const h=fixture(), block=h.objects[0], c={...h.categories[0],id:'vip',name:'VIP',price:7500}, before=clone(h);
  const result=savePricingCategory(h,c,{selection:[block.id],seatId:block.seats[2].id,apply:true});
  assert.equal(result.hall.objects[0].seats[2].categoryId,'vip');
  assert.deepEqual(result.hall.objects[0].seats.filter((_,i)=>i!==2),block.seats.filter((_,i)=>i!==2));
  assert.deepEqual(result.hall.objects.slice(1),h.objects.slice(1));
  assert.equal(summary(result.hall).revenue,summary(h).revenue+2500);
  assert.deepEqual(h,before);
});
test('create and apply deduplicates before assigning and retains disabled seat overrides', () => {
  const h=fixture(), block=h.objects[0];block.categoryId=null;
  block.seats[0].disabled=true;block.seats[0].categoryId=h.categories[0].id;
  const duplicate={...h.categories[0],id:'duplicate'};
  const result=savePricingCategory(h,duplicate,{selection:[block.id],apply:true});
  assert.equal(result.categoryId,h.categories[0].id);
  assert.equal(result.hall.categories.length,h.categories.length);
  assert.equal(result.hall.objects[0].categoryId,h.categories[0].id);
  assert.equal(result.hall.objects[0].seats[0].disabled,true);
  assert.equal(result.hall.objects[0].seats[0].categoryId,h.categories[0].id);
  assert.ok(saleInventory(result.hall).every(i=>i.categoryId!=='duplicate'));
});
test('create and apply rejects mixed units atomically, including category creation', () => {
  const h=fixture(), before=clone(h), c={...h.categories[0],id:'vip',name:'VIP'};
  assert.throws(()=>savePricingCategory(h,c,{selection:h.objects.map(o=>o.id),apply:true}),/единицей продажи/);
  assert.throws(()=>savePricingCategory(h,c,{selection:[],apply:true}),/единицей продажи/);
  assert.throws(()=>savePricingCategory(h,{...c,active:false},{selection:[h.objects[0].id],apply:true}),/единицей продажи/);
  assert.deepEqual(h,before);
});
test('whole tables and standing zones use one table and the full admission quantity respectively', () => {
  for(const [index,unit,quantity] of [[1,'table',1],[2,'entry',60]]){
    const h=fixture(), c={...h.categories[index],id:`new-${unit}`,name:'New',price:100};
    const result=savePricingCategory(h,c,{selection:[h.objects[index].id],apply:true});
    const report=selectionPricing(result.hall,[h.objects[index].id],{categoryId:c.id});
    assert.equal(report.matching,quantity);assert.equal(report.subtotal,100*quantity);
    assert.deepEqual(result.hall.objects.filter((_,i)=>i!==index),h.objects.filter((_,i)=>i!==index));
  }
});
test('editing a category updates all inherited totals while preserving assignment references', () => {
  const h=fixture(), block=h.objects[0], value={...h.categories[0],price:100,color:'#198ca3'}, before=clone(h.objects);
  const result=savePricingCategory(h,value,{replaceId:value.id,selection:[h.objects[1].id]});
  assert.deepEqual(result.hall.objects,before);
  assert.equal(selectionPricing(result.hall,[block.id]).subtotal,600);
  assert.equal(summary(result.hall).revenue,600+40000+60*3000);
});
test('create and apply across several compatible objects replaces child exceptions only on selected objects', () => {
  const h=fixture(), another=makeObject('round',300,600,{count:6,categoryId:h.categories[0].id});h.objects.push(another);
  const c={...h.categories[0],id:'vip',name:'VIP',price:7000};
  const result=savePricingCategory(h,c,{selection:[h.objects[0].id,another.id],apply:true});
  assert.equal(selectionPricing(result.hall,[h.objects[0].id,another.id],{categoryId:c.id}).matching,12);
  assert.deepEqual(result.hall.objects.slice(1,3),h.objects.slice(1,3));
  assert.equal(result.hall.objects[3].seats.length,another.seats.length);
});

test('review sends missing amounts, inactive categories and wrong units back to pricing', () => {
  const h=fixture();h.objects[0].categoryId=null;h.categories[1].active=false;h.objects[2].categoryId=h.categories[0].id;
  const found=issues(h);
  for(const ending of ['назначьте цену','категория выключена','неверная единица цены']){
    assert.equal(found.find(i=>i.text.endsWith(ending))?.stage,'pricing');
  }
  h.objects[0].x=-100;
  assert.equal(issues(h).find(i=>i.text.endsWith('за границами зала'))?.stage,'layout');
});

test('table sale-mode guidance recognizes both directions without changing any inventory', () => {
  const h=fixture(), table=h.objects[1], before=clone(h);
  assert.deepEqual(tableSaleMismatch(h,[table.id],h.categories[0].id),{objectId:table.id,saleMode:'whole_table',targetSaleMode:'per_seat'});
  table.saleMode='per_seat';table.categoryId=h.categories[0].id;
  const current=clone(h);
  assert.deepEqual(tableSaleMismatch(h,[table.id],h.categories[1].id),{objectId:table.id,saleMode:'per_seat',targetSaleMode:'whole_table'});
  assert.deepEqual(tableSaleMismatch(h,[table.id],h.categories[1].id,{seatId:table.seats[0].id}),{objectId:table.id,saleMode:'per_seat',targetSaleMode:'whole_table'});
  assert.deepEqual(h,current);
  assert.equal(before.objects[1].saleMode,'whole_table');
  assert.equal(assignCategory(h,[table.id],h.categories[1].id),h);
});
test('sale-mode guidance excludes compatible prices, admission, blocks, groups, disabled inventory and invalid scopes', () => {
  const h=fixture(), block=h.objects[0], table=h.objects[1];
  assert.equal(tableSaleMismatch(h,[table.id],h.categories[1].id),null);
  assert.equal(tableSaleMismatch(h,[table.id],h.categories[2].id),null);
  assert.equal(tableSaleMismatch(h,[block.id],h.categories[1].id),null);
  assert.equal(tableSaleMismatch(h,[block.id,table.id],h.categories[0].id),null);
  assert.equal(tableSaleMismatch(h,[],h.categories[0].id),null);
  assert.equal(tableSaleMismatch(h,[table.id],'missing'),null);
  assert.equal(tableSaleMismatch(h,[table.id],h.categories[0].id,{seatId:'missing'}),null);
  h.categories[0].active=false;
  assert.equal(tableSaleMismatch(h,[table.id],h.categories[0].id),null);
  h.categories[0].active=true;table.disabled=true;
  assert.equal(tableSaleMismatch(h,[table.id],h.categories[0].id),null);
});
