import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorHallV3,applyCreationDraftPatch,newEventCreationDraft,newHallObject,type CreationDraftResponse,type VenueLayout } from '@event-platform/shared-types';
import { DraftAutosave,DraftRequestError,type DraftTransport } from './creation-draft-client';
import { draftHallAdapter,draftHallPresentation } from './draft-hall-adapter';

function fixture(){
  const saved:CreationDraftResponse={id:crypto.randomUUID(),revision:1,state:'active',aggregate:newEventCreationDraft(crypto.randomUUID(),'en'),expiresAt:'2030-12-01T00:00:00Z',owned:false,resultEventId:null,csrfToken:'test-csrf'};
  const tariff=crypto.randomUUID(),seat={...newHallObject(crypto.randomUUID(),'seat',4,5),tariffId:tariff};
  saved.aggregate.selectedMode='paid_seated';saved.aggregate.content.en={title:'Event title'};
  saved.aggregate.paidSeated={...editorHallV3({widthM:24,heightM:16},{version:1,objects:[seat],tariffs:[{id:tariff,name:'Seat',price:0,draftAmount:null,unit:'seat',active:false,color:'#123abc',localized:{en:{name:'Seat'},kk:{name:'Орын'}}}]},null,'en'),name:'Room name'};
  return saved;
}
test('the connected hall adapter uses revisioned draft transport and preserves null prices, translations and room names',async()=>{
  let stored=fixture();const calls:Array<{path:string;init:RequestInit}>=[];
  const transport:DraftTransport=async<T>(path:string,init:RequestInit={})=>{calls.push({path,init});const body=JSON.parse(String(init.body));assert.equal(body.revision,stored.revision);stored={...stored,revision:stored.revision+1,aggregate:applyCreationDraftPatch(stored.aggregate,body.patch)};return stored as T;};
  const client=new DraftAutosave(stored,transport,null),adapter=draftHallAdapter(client,'en',transport),initial=draftHallPresentation(client,'en');
  assert.equal(initial.templateName,'Room name');
  const response=await adapter<VenueLayout>(`/api/organizer/venue-layouts/${stored.id}`,{method:'PATCH',body:JSON.stringify({revision:1,templateName:'Renamed room',layoutJson:initial.layoutJson})});
  assert.equal(response.revision,2);assert.equal(response.templateName,'Renamed room');assert.equal(stored.aggregate.content.en?.title,'Event title');
  assert.equal(stored.aggregate.paidSeated?.tariffs[0]?.amount,null);assert.equal(stored.aggregate.paidSeated?.tariffs[0]?.active,false);assert.equal(stored.aggregate.paidSeated?.tariffs[0]?.unit,'seat');assert.equal(stored.aggregate.paidSeated?.tariffs[0]?.content.kk?.name,'Орын');
  assert.equal(new Headers(calls[0]?.init.headers).get('x-draft-csrf'),'test-csrf');assert.equal(calls[0]?.path,`/api/creation-drafts/${stored.id}`);client.dispose();
});
test('a stale hall revision cannot overwrite the saved draft',async()=>{
  const saved=fixture();saved.revision=4;let writes=0;
  const transport:DraftTransport=async()=>{writes++;throw new Error('Unexpected write');};
  const client=new DraftAutosave(saved,transport,null),adapter=draftHallAdapter(client,'en',transport);
  await assert.rejects(()=>adapter(`/api/organizer/venue-layouts/${saved.id}`,{method:'PATCH',body:JSON.stringify({revision:3,layoutJson:draftHallPresentation(client,'en').layoutJson})}),reason=>reason instanceof DraftRequestError&&reason.status===409);
  assert.equal(writes,0);assert.equal(client.saved.revision,4);client.dispose();
});
