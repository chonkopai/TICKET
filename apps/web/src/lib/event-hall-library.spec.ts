import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCreationDraftPatch, canonicalHallGeometry, draftHallV3Schema, hallV3Editor, newEventCreationDraft } from '@event-platform/shared-types';
import { starterHall } from '../components/hall-builder/model.mjs';
import { builderToVenue } from '../components/hall-builder/venue-adapter';
import { canonicalEventHall, hallForEvent, loadEventHallLibrary, saveEventHallLibrary, updateEventHallLibrary } from './event-hall-library';

test('choosing a saved hall creates independent inventory; currency changes clear prices without altering the library',()=>{
  const source=starterHall('tables','RUB');source.categories[0]!.price=400;
  const before=JSON.stringify(source),copy=hallForEvent(source,'RUB'),converted=hallForEvent(source,'KZT');
  assert.equal(JSON.stringify(source),before);assert.equal(copy.categories[0]!.price,400);assert.equal(converted.currency,'KZT');assert.equal(converted.categories[0]!.price,null);
  assert.ok(copy.objects.every(object=>!source.objects.some(original=>object.id===original.id)));
  assert.ok(copy.objects.flatMap(object=>object.seats??[]).every(seat=>!source.objects.some(original=>original.seats?.some(old=>seat.id===old.id))));
  assert.doesNotThrow(()=>draftHallV3Schema.parse(canonicalEventHall(copy,'ru')));
});
test('each preset becomes the event hall consumed by publication and buyers, with correct sale units and minor amounts',()=>{
  for(const kind of ['rows','tables','standing','empty']){
    const hall=starterHall(kind,'RUB');hall.name='Мой зал';hall.categories.forEach(category=>{category.price=kind==='tables'?400:50;});
    const canonical=canonicalEventHall(hall,'ru'),editor=builderToVenue(hall).editor,publicHall=canonicalHallGeometry(canonical);
    assert.equal(canonical.name,'Мой зал');assert.equal(canonical.objects.length,editor.objects.length);
    assert.deepEqual(publicHall.objects.map(object=>object.id),editor.objects.map(object=>object.id));
    assert.deepEqual(hallV3Editor(canonical,'ru').tariffs.map(tariff=>tariff.price),hall.categories.map(category=>category.price!*100));
    assert.deepEqual(Object.values(publicHall.tariffUnits??{}),canonical.tariffs.map(tariff=>tariff.unit));
    const draft=newEventCreationDraft(crypto.randomUUID(),'ru');
    const next=applyCreationDraftPatch(draft,{selectedMode:'paid_seated',paidSeated:canonical});
    assert.deepEqual(next.paidSeated,canonical);assert.equal(draft.paidSeated,null);
  }
});
test('device library save, reload, rename and archive remain durable; copies do not share inventory identities',async()=>{
  const priorWindow=globalThis.window,priorStorage=globalThis.localStorage,values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)} as unknown as Storage;
  Object.assign(globalThis,{localStorage:storage,window:{localStorage:storage,sessionStorage:{getItem:()=>null,removeItem:()=>{}}}});
  try{
    const hall=starterHall('mixed','RUB'),item=await saveEventHallLibrary(hall,'ru');
    assert.notEqual(item.id,hall.id);assert.equal((await loadEventHallLibrary()).length,1);
    assert.notEqual(item.hall.objects[0]!.id,hall.objects[0]!.id);
    await updateEventHallLibrary(item.id,{name:'Банкетный зал'});
    assert.equal((await loadEventHallLibrary())[0]!.hall.name,'Банкетный зал');
    await updateEventHallLibrary(item.id,{archived:true});
    assert.equal((await loadEventHallLibrary()).length,0);
    await updateEventHallLibrary(item.id,{archived:false});
    assert.equal((await loadEventHallLibrary())[0]!.hall.name,'Банкетный зал');
    values.set('event-platform:session',JSON.stringify({user:{id:'account-a',role:'user'},tokens:{accessToken:'test-only',refreshToken:'test-only'}}));
    assert.equal((await loadEventHallLibrary()).length,0);
    await saveEventHallLibrary(hall,'ru');
    assert.equal((await loadEventHallLibrary()).length,1);
    values.set('event-platform:session',JSON.stringify({user:{id:'account-b',role:'user'},tokens:{accessToken:'test-only',refreshToken:'test-only'}}));
    assert.equal((await loadEventHallLibrary()).length,0);
    values.set('event-platform:session','null');
    assert.equal((await loadEventHallLibrary()).length,1);
    const before=JSON.stringify(hall);values.set('ticket.hall-builder:guest-library:v1','broken');
    await assert.rejects(()=>saveEventHallLibrary(hall,'ru'));assert.equal(JSON.stringify(hall),before);
  }finally{Object.assign(globalThis,{window:priorWindow,localStorage:priorStorage});}
});
