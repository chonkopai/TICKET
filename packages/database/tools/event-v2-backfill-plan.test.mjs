import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hash, mergeDescription, planLegacyEvent, trustedMediaReference } from './event-v2-backfill-plan.mjs';

const ids={event:'00000000-0000-4000-8000-000000000001',ticket:'00000000-0000-4000-8000-000000000002',layout:'00000000-0000-4000-8000-000000000003',tariff:'00000000-0000-4000-8000-000000000004'};
const media='/media/posters/00000000-0000-4000-8000-000000000005.webp';
function fixture(){return {event:{id:ids.event,sourceLocale:'ru',title:'Title',announcement:'Summary',description:'Description',venueName:'Venue',address:'Address',city:'Almaty',date:'2026-11-01',time:'18:00:00',timezone:'Asia/Almaty',paymentMode:'full_payment',status:'published',posterUrl:media,galleryUrls:[]},translations:[],ticketTypes:[{id:ids.ticket,name:'Ticket',description:'Details',price:1200,deposit:0,currency:'KZT',quantityTotal:10,quantitySold:0,isInternal:false,venueObjectId:null}],layouts:[],tables:[],rows:[],seats:[],history:{pendingOrders:[],moneyMismatches:[],liveReservations:0,liveHolds:0,paidAllocations:0}};}
test('source/targets retain every section with labels in all locales',()=>{
  for(const locale of ['ru','en','kk']){
    const row={description:'  original\n',program:'program text',rules:'rules text',visitTerms:'visit text',extraConditions:'extra text',depositTerms:'deposit text'};
    const merged=mergeDescription(row,locale);for(const text of Object.values(row))assert.ok(merged.includes(text));
  }
  const graph=fixture();graph.translations=[{locale:'en',title:'EN',announcement:'Summary EN',description:'Description EN',program:'Program EN',venueName:'Venue EN',address:'Address EN',sourceHash:'old',origin:'machine'}];
  const plan=planLegacyEvent(graph);assert.equal(plan.contents[0].values.summary,'Summary');assert.ok(plan.contents[1].values.description.includes('Program:\nProgram EN'));assert.equal(plan.contents[1].fieldMetadata.title.stale,true);assert.equal(plan.contents[1].fieldMetadata.title.sourceHash,null);
});
test('overlength grapheme text is flagged and retained exactly',()=>{
  const graph=fixture();graph.event.title='👩🏽‍💻'.repeat(101);graph.event.description='a'.repeat(10001);graph.ticketTypes[0].name='T'.repeat(61);
  const plan=planLegacyEvent(graph);assert.equal(plan.contents[0].values.title,graph.event.title);assert.equal(plan.contents[0].values.description.length,10001);assert.ok(plan.reasons.includes('overlength:ru:title'));assert.ok(plan.reasons.some(reason=>reason.includes('TicketTypeContent')&&reason.endsWith(':name')));
});
test('unknown ends/refund choices are never invented',()=>{
  const plan=planLegacyEvent(fixture());assert.equal(plan.startsAt,'2026-11-01T13:00:00.000Z');assert.equal(plan.endsAt,undefined);assert.ok(plan.reasons.includes('unknown_end'));assert.ok(plan.reasons.includes('refund_choice_unknown'));
});
test('DST repeated/nonexistent times are review cases without automatic choices',()=>{
  for(const [date,time,reason] of [['2026-11-01','01:30:00','SCHEDULE_TIME_AMBIGUOUS'],['2026-03-08','02:30:00','SCHEDULE_TIME_NONEXISTENT']]){
    const graph=fixture();Object.assign(graph.event,{date,time,timezone:'America/New_York'});const plan=planLegacyEvent(graph);assert.equal(plan.startsAt,null);assert.ok(plan.reasons.includes(reason));
  }
});
test('deposit, hybrid, mixed currency and pending original terms stay unresolved together',()=>{
  const graph=fixture();graph.event.paymentMode='deposit';graph.ticketTypes[0].deposit=100;graph.tables=[{id:ids.layout,name:'Table',price:1200,deposit:100,currency:'USD',seats:4}];graph.history.pendingOrders=[ids.ticket];graph.history.moneyMismatches=[ids.layout];
  const plan=planLegacyEvent(graph);assert.equal(plan.saleMode,null);assert.equal(plan.currency,null);for(const reason of ['active_deposit','hybrid_sale_modes','mixed_currencies','pending_purchases_original_terms','payment_order_money_mismatch'])assert.ok(plan.reasons.includes(reason));assert.equal(graph.ticketTypes[0].deposit,100);
});
test('free mapping requires exactly one finite configured registration resource',()=>{
  const graph=fixture();graph.ticketTypes[0].price=0;assert.equal(planLegacyEvent(graph).saleMode,'free');graph.ticketTypes[0].quantityTotal=0;assert.equal(planLegacyEvent(graph).saleMode,null);assert.ok(planLegacyEvent(graph).reasons.includes('missing_or_inconsistent_capacity'));
});
test('trusted references exclude traversal, arbitrary URLs, SVG and non-UUID names',()=>{
  assert.equal(trustedMediaReference(media),true);for(const reference of ['https://example.com/image.jpg','/media/posters/../secret.jpg','/media/posters/a.svg','/media/posters/file.jpg','/media/posters/'+ids.event+'.jpg?token=x'])assert.equal(trustedMediaReference(reference),false);
});
test('media retains order/holes, deduplicates and assigns roles only to trusted poster',()=>{
  const graph=fixture();graph.event.galleryUrls=['https://example.com/a',media,media.replace('000005','000006')];
  const plan=planLegacyEvent(graph);assert.deepEqual(plan.media.map(item=>item.slot),[0,3]);assert.equal(plan.media[0].isCard,true);assert.equal(plan.media[1].isBackground,false);assert.ok(plan.reasons.includes('duplicate_media_reference'));
  graph.event.posterUrl=null;graph.event.galleryUrls=[media];assert.equal(planLegacyEvent(graph).media[0].isCard,false);
});
test('a sixth legacy asset is archived for review rather than hidden by truncating source',()=>{
  const graph=fixture();graph.event.galleryUrls=Array.from({length:5},(_,i)=>media.replace('000005',String(i+6).padStart(6,'0')));const before=JSON.stringify(graph);const plan=planLegacyEvent(graph);assert.equal(plan.media.length,5);assert.ok(plan.reasons.includes('over_five_legacy_media'));assert.equal(JSON.stringify(graph),before);
});
test('tariff IDs and currency are retained without altering geometry or inventory',()=>{
  const graph=fixture();graph.layouts=[{id:ids.layout,layoutJson:{editor:{tariffs:[{id:ids.tariff,name:'Standard',price:1200}],objects:[{id:ids.ticket,name:'Original geometry label'}]}}}];const before=JSON.stringify(graph);const plan=planLegacyEvent(graph);assert.equal(plan.tariffs[0].id,ids.tariff);assert.equal(plan.tariffs[0].currency,'KZT');assert.equal(plan.resources.find(row=>row.table==='HallTariffContent').values.name,'Standard');assert.equal(JSON.stringify(graph),before);
});
test('invalid tariffs/source locales are reported while originals remain untouched',()=>{
  const graph=fixture();graph.event.sourceLocale='fr';graph.layouts=[{id:ids.layout,layoutJson:{editor:{tariffs:[{id:'old-human-id',name:'Unknown',price:-2}],objects:{bad:true}}}}];const plan=planLegacyEvent(graph);assert.equal(plan.contents.length,0);assert.ok(plan.reasons.includes('invalid_source_locale'));assert.ok(plan.reasons.includes(`ambiguous_tariff_id:${ids.layout}`));assert.ok(plan.reasons.includes(`invalid_hall_objects:${ids.layout}`));
});
test('fingerprints are key-order independent and ignore timestamps changed by ORM writes',()=>{
  assert.equal(hash({b:1,a:2,updatedAt:'old'}),hash({updatedAt:'new',a:2,b:1}));const graph=fixture();const original=planLegacyEvent(graph).fingerprint;graph.event.title='New';assert.notEqual(planLegacyEvent(graph).fingerprint,original);
});
