import assert from "node:assert/strict";
import { test } from "node:test";
import { creationCurrencyForLocale,newEventCreationDraft,type CreationDraftResponse,applyCreationDraftPatch } from "@event-platform/shared-types";
import { DraftAutosave,DraftRequestError,saveContentLanguageCurrency,resetCreationDraft,resetDraftBootstrap,openCreationDraft,type DraftTransport } from "./creation-draft-client";

const saved=():CreationDraftResponse=>({id:"00000000-0000-4000-8000-000000000001",revision:1,state:"active",aggregate:newEventCreationDraft("00000000-0000-4000-8000-000000000002"),expiresAt:"2026-12-01T00:00:00Z",owned:false,resultEventId:null,csrfToken:"csrf-in-memory"});
test("autosave retains edits entered during a save and serializes revisions",async()=>{
  const requests:Array<{revision:number;patch:unknown}>=[];let release:(value:CreationDraftResponse)=>void=()=>{};
  const request:DraftTransport=async<T>(_path:string,options?:RequestInit)=>{
    const body=JSON.parse(String(options?.body));requests.push(body);
    if(requests.length===1)return await new Promise<CreationDraftResponse>(resolve=>{release=resolve;}) as T;
    return {...saved(),revision:3,aggregate:applyCreationDraftPatch(applyCreationDraftPatch(saved().aggregate,requests[0]!.patch),body.patch)} as T;
  };
  const autosave=new DraftAutosave(saved(),request);autosave.patch({content:{ru:{title:"First"}}});const flush=autosave.flush();
  assert.equal(autosave.aggregate.content.ru?.title,"First");autosave.patch({content:{ru:{address:"While saving"}}});
  release({...saved(),revision:2,aggregate:applyCreationDraftPatch(saved().aggregate,requests[0]!.patch)});await flush;
  assert.deepEqual(requests.map(value=>value.revision),[1,2]);assert.equal(autosave.saved.aggregate.content.ru?.address,"While saving");assert.equal(autosave.dirty,false);autosave.dispose();
});
test("a conflict preserves local text and never rebases automatically",async()=>{
  let calls=0;const request:DraftTransport=async()=>{calls++;throw new DraftRequestError("DRAFT_REVISION_CONFLICT",409,2);};
  const autosave=new DraftAutosave(saved(),request);autosave.patch({content:{ru:{title:"Unsent text"}}});await assert.rejects(()=>autosave.flush());await assert.rejects(()=>autosave.flush());assert.equal(calls,1);assert.equal(autosave.aggregate.content.ru?.title,"Unsent text");autosave.dispose();
});
test("currency changes require acknowledgement without converting minor amounts",()=>{
  const autosave=new DraftAutosave(saved());assert.throws(()=>autosave.patch({currency:"USD"}),/CONFIRMATION/);autosave.patch({currency:"USD",acknowledgeCurrencyRelabel:true});assert.equal(autosave.aggregate.currency,"USD");assert.equal(autosave.aggregate.free.amount,0);autosave.dispose();
});
test("language currency changes save with pending prices and manual overrides survive reopening",async()=>{
  let stored=saved();
  const autosave=new DraftAutosave(stored,async<T>(_path:string,options?:RequestInit)=>{
    const body=JSON.parse(String(options?.body));
    assert.equal(body.revision,stored.revision);
    stored={...stored,revision:stored.revision+1,aggregate:applyCreationDraftPatch(stored.aggregate,body.patch)};
    return stored as T;
  });
  autosave.patch({paidGeneral:[{id:"00000000-0000-4000-8000-000000000003",active:true,amount:12345,capacity:2,content:{ru:{name:"Entry"}}}]});
  for(const locale of ["en","kk","ru"] as const){
    await saveContentLanguageCurrency(autosave,locale);
    assert.equal(stored.aggregate.currency,creationCurrencyForLocale(locale));
    assert.equal(stored.aggregate.paidGeneral[0]?.amount,12345);
  }
  autosave.patch({currency:"KZT",acknowledgeCurrencyRelabel:true});await autosave.flush();autosave.dispose();
  const reopened=new DraftAutosave(stored);
  assert.equal(reopened.aggregate.currency,"KZT");assert.equal(reopened.aggregate.sourceLocale,"ru");assert.equal(reopened.dirty,false);
  await saveContentLanguageCurrency(reopened,"en",true);assert.equal(reopened.aggregate.currency,"KZT");reopened.dispose();
});
test("translation preserves edits made while waiting, including whole-row patches and changed-back text",async()=>{
  const original=saved(),id="00000000-0000-4000-8000-000000000003";original.aggregate.paidGeneral=[{id,active:true,amount:100,capacity:1,content:{ru:{name:"Source",description:"Source description"},en:{name:"Manual"}}}];
  const autosave=new DraftAutosave(original,async<T>(_path:string,options?:RequestInit)=>{const body=JSON.parse(String(options?.body));return {...autosave.saved,revision:autosave.saved.revision+1,aggregate:applyCreationDraftPatch(autosave.saved.aggregate,body.patch)} as T;});
  let release!:(value:{draft:CreationDraftResponse})=>void,started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);
  const translation=autosave.translationMutation(async()=>{started();return new Promise<{draft:CreationDraftResponse}>(resolve=>release=resolve);});await ready;
  const change=(name:string)=>autosave.patch({paidGeneral:autosave.aggregate.paidGeneral.map(row=>({...row,content:{...row.content,en:{...row.content.en,name}}}))});change("Typed");change("Manual");
  const translated=structuredClone(original);translated.revision=2;translated.aggregate.paidGeneral[0]!.content.en={name:"Machine name",description:"Machine description"};release({draft:translated});await translation;
  assert.deepEqual(autosave.aggregate.paidGeneral[0]!.content.en,{name:"Manual",description:"Machine description"});await autosave.flush();assert.equal(autosave.saved.aggregate.paidGeneral[0]!.content.en?.description,"Machine description");autosave.dispose();
});
test("refresh offers recovery without applying it silently",()=>{
  const original=saved(),client=new DraftAutosave(original,undefined,{id:original.id,baseRevision:1,patch:{content:{ru:{title:"Unsent before refresh"}}}});
  assert.equal(client.aggregate.content.ru?.title,undefined);assert.ok(client.recoveryCandidate);client.restoreRecovery();assert.equal(client.aggregate.content.ru?.title,"Unsent before refresh");assert.equal(client.recoveryCandidate,null);client.dispose();
});
test("recovery from another revision requires explicit review and preserves unrelated saved text",()=>{
  const original=saved();original.revision=2;original.aggregate.content.ru={address:"Saved in another tab"};const client=new DraftAutosave(original,undefined,{id:original.id,baseRevision:1,patch:{content:{ru:{title:"Backup title"}}}});
  assert.throws(()=>client.restoreRecovery(),/Review/);assert.equal(client.dirty,false);client.restoreRecovery(true);assert.equal(client.aggregate.content.ru?.title,"Backup title");assert.equal(client.aggregate.content.ru?.address,"Saved in another tab");client.dispose();
});
test("malformed and obsolete recovery records do not prevent opening the saved draft",()=>{
  for(const recovery of [{id:saved().id,baseRevision:1},{id:saved().id,baseRevision:0,patch:{content:{ru:{title:"Bad revision"}}}},{id:saved().id,baseRevision:1,patch:{sourceLocale:"en"}},{id:saved().id,baseRevision:1,patch:{currency:"USD"}}]){
    const client=new DraftAutosave(saved(),undefined,recovery as never);assert.equal(client.recoveryCandidate,null);assert.deepEqual(client.aggregate,saved().aggregate);client.dispose();
  }
});
test("crop edits on different images merge while autosave is in flight",async()=>{
  const initial=saved(),first="00000000-0000-4000-8000-000000000011",second="00000000-0000-4000-8000-000000000012";
  initial.aggregate.media.slots=[first,second,null,null,null];
  let release!:(value:CreationDraftResponse)=>void;
  const patches:Array<{revision:number;patch:unknown}>=[];
  const client=new DraftAutosave(initial,async<T>(_path:string,options?:RequestInit)=>{
    const body=JSON.parse(String(options?.body));patches.push(body);
    if(patches.length===1)return await new Promise<CreationDraftResponse>(resolve=>release=resolve) as T;
    return {...client.saved,revision:client.saved.revision+1,aggregate:applyCreationDraftPatch(client.saved.aggregate,body.patch)} as T;
  });
  client.patch({media:{assetCrops:{[first]:{focalX:.5,focalY:.5,zoom:2}}}});const saving=client.flush();
  client.patch({media:{assetCrops:{[first]:{focalX:.3,focalY:.4,zoom:2}}}});
  client.patch({media:{assetCrops:{[second]:{focalX:.6,focalY:.7,zoom:1.5}}}});
  release({...initial,revision:2,aggregate:applyCreationDraftPatch(initial.aggregate,patches[0]!.patch)});await saving;
  assert.deepEqual(client.saved.aggregate.media.assetCrops,{[first]:{focalX:.3,focalY:.4,zoom:2},[second]:{focalX:.6,focalY:.7,zoom:1.5}});
  assert.deepEqual(patches.map(patch=>patch.revision),[1,2]);client.dispose();
});

test("reset saves pending changes, starts an empty draft, and reuses its new identity",async()=>{
  const initial=saved();initial.aggregate.sourceLocale="en";initial.aggregate.content={en:{title:"Old event"},ru:{address:"Перевод"}};
  const previous=new DraftAutosave(initial,async<T>(_path:string,options?:RequestInit)=>{const body=JSON.parse(String(options?.body));return {...initial,revision:2,aggregate:applyCreationDraftPatch(initial.aggregate,body.patch)} as T;});
  previous.patch({content:{en:{title:"Latest typed title"}}});
  const newId="00000000-0000-4000-8000-000000000004",blank={...saved(),id:newId,aggregate:newEventCreationDraft("00000000-0000-4000-8000-000000000005","en")};
  let requested=false;
  const next=await resetCreationDraft(previous,async<T>(path:string,options?:RequestInit)=>{
    assert.equal(previous.dirty,false);assert.equal(previous.saved.aggregate.content.en?.title,"Latest typed title");
    assert.equal(path,"/api/creation-drafts");assert.equal(options?.method,"POST");assert.deepEqual(JSON.parse(String(options?.body)),{sourceLocale:"en"});requested=true;return blank as T;
  });
  assert.equal(requested,true);assert.equal(next.saved.id,newId);assert.deepEqual(next.aggregate,blank.aggregate);assert.equal(next.recoveryCandidate,null);
  assert.equal(previous.saved.aggregate.content.ru?.address,"Перевод");assert.equal(previous.saved.aggregate.content.en?.title,"Latest typed title");
  assert.equal(await openCreationDraft("ru",newId),next);
  previous.dispose();next.dispose();resetDraftBootstrap();
});
test("failed reset leaves the previous draft active and prevents creation after save failure",async()=>{
  const previous=new DraftAutosave(saved(),async()=>{throw new Error("SAVE_FAILED");});previous.patch({content:{ru:{title:"Keep this text"}}});
  let creates=0;
  await assert.rejects(()=>resetCreationDraft(previous,async()=>{creates++;throw new Error("CREATE_FAILED");}),/SAVE_FAILED/);
  assert.equal(creates,0);assert.equal(previous.aggregate.content.ru?.title,"Keep this text");previous.dispose();
  const clean=new DraftAutosave(saved());
  await assert.rejects(()=>resetCreationDraft(clean,async()=>{throw new Error("CREATE_FAILED");}),/CREATE_FAILED/);
  assert.deepEqual(clean.aggregate,saved().aggregate);clean.dispose();resetDraftBootstrap();
});

test("retired fields do not discard unrelated unsaved text during migration",()=>{
  const original=saved();original.revision=2;
  const oldRecovery={id:original.id,baseRevision:1,patch:{content:{ru:{title:"Recovered title",summary:"Retired summary",venueName:"Retired venue",address:"Recovered address"}}}};
  const client=new DraftAutosave(original,undefined,oldRecovery as never);
  assert.ok(client.recoveryCandidate);client.restoreRecovery(true);
  assert.deepEqual(client.aggregate.content.ru,{title:"Recovered title",address:"Recovered address"});
  client.dispose();
});
