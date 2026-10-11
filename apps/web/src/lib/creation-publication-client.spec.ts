import assert from "node:assert/strict";
import {test} from "node:test";
import {newEventCreationDraft,type CreationDraftResponse} from "@event-platform/shared-types";
import {DraftAutosave,DraftRequestError,finishPublishedDraft,openCreationDraft} from "./creation-draft-client";
import {safeReturnPath} from "../app/(auth)/_lib/public-auth";
import {preparePublication,resumePublication,creationContinuation,publicationDestination} from "./creation-publication-client";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const saved=(n=1):CreationDraftResponse=>({id:id(n),revision:2,state:"active",aggregate:newEventCreationDraft(id(20),"en"),expiresAt:"2030-01-01T00:00:00Z",owned:false,resultEventId:null,csrfToken:"private-memory-token"});
function browser(){const local=new Map<string,string>(),session=new Map<string,string>();const storage=(map:Map<string,string>)=>({getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>map.set(key,value),removeItem:(key:string)=>map.delete(key)});return {local,session,window:{location:{origin:"https://ticket.example",search:""},localStorage:storage(local),sessionStorage:storage(session),dispatchEvent:()=>true}};}
async function isolated(run:(state:ReturnType<typeof browser>)=>Promise<void>){const originalFetch=globalThis.fetch,originalWindow=globalThis.window,state=browser();globalThis.window=state.window as unknown as Window&typeof globalThis;try{await run(state);}finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;finishPublishedDraft(id(1));}}
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
test("a verified continuation shares one POST across repeated renders and clears the consumed creation pointer",()=>isolated(async state=>{
 const draft=saved(),user={id:id(50),role:"guest"},result={eventId:id(60),draft:{...draft,state:"published",resultEventId:id(60)},user:{...user,role:"organizer"}};state.session.set("event-platform:session",JSON.stringify({user,tokens:{accessToken:"test-only"}}));state.local.set("ticket.creation.v2.id",draft.id);let writes=0;
 globalThis.fetch=async(path,options)=>{if(String(path).endsWith("/publish")){writes++;assert.equal(new Headers(options?.headers).get("x-draft-csrf"),draft.csrfToken);return json(result);}return json(String(path).includes("publish-intents")?{id:id(70),revision:2,expiresAt:"2030-01-01T00:00:00Z",resultEventId:null}:draft);};
 const responses=await Promise.all([resumePublication(draft.id,id(70)),resumePublication(draft.id,id(70))]);assert.equal(writes,1);assert.equal(responses[0]?.eventId,id(60));assert.equal(JSON.parse(state.session.get("event-platform:session")!).user.role,"organizer");assert.equal(state.local.has("ticket.creation.v2.id"),false);assert.ok(!creationContinuation(draft.id,id(70),"en","kk").includes(draft.csrfToken));
}));
test("a lost publication response retries with freshly read owned CSRF and resolves the committed event",()=>isolated(async state=>{
 const draft=saved(2),user={id:id(51),role:"organizer"};state.session.set("event-platform:session",JSON.stringify({user,tokens:{accessToken:"test-only"}}));let writes=0,reads=0;
 globalThis.fetch=async(path,options)=>{if(String(path).endsWith("/publish")){writes++;if(writes===1)throw new DraftRequestError("RESPONSE_LOST",500);assert.equal(new Headers(options?.headers).get("x-draft-csrf"),"fresh-owned-csrf");return json({eventId:id(61),draft:{...draft,resultEventId:id(61),state:"published"},user});}if(String(path).includes("publish-intents"))return json({id:id(71),revision:2,expiresAt:"2030-01-01T00:00:00Z",resultEventId:writes?id(61):null});reads++;return json(writes?{...draft,state:"published",resultEventId:id(61),csrfToken:"fresh-owned-csrf"}:draft);};
 await assert.rejects(resumePublication(draft.id,id(71)),/RESPONSE_LOST/);assert.equal((await resumePublication(draft.id,id(71))).eventId,id(61));assert.equal(reads,2);assert.equal(writes,2);
}));
test("Publish detects edits made while the intent request runs and Create starts fresh after success",()=>isolated(async state=>{
 let release!:(response:Response)=>void;globalThis.fetch=async()=>new Promise<Response>(resolve=>release=resolve);const client=new DraftAutosave(saved()),pending=preparePublication(client);await new Promise(resolve=>setImmediate(resolve));client.patch({content:{en:{title:"Typed while waiting"}}});release(json({id:id(72),revision:2,expiresAt:"2030-01-01T00:00:00Z",resultEventId:null}));await assert.rejects(pending,/PUBLISH_INTENT_STALE/);client.dispose();
 state.local.set("ticket.creation.v2.id",id(1));globalThis.fetch=async()=>json(saved());const first=await openCreationDraft("en");finishPublishedDraft(first.saved.id);let creates=0;globalThis.fetch=async(_path,options)=>{assert.equal(options?.method,"POST");creates++;return json(saved(3));};const next=await openCreationDraft("kk");assert.equal(next.saved.id,id(3));assert.equal(creates,1);first.dispose();next.dispose();finishPublishedDraft(next.saved.id);
}));

test("publication continuation survives the shared auth return allowlist in every interface locale",()=>isolated(async state=>{
 for(const locale of ["ru","en","kk"] as const){const continuation=creationContinuation(id(4),id(73),locale,"en");state.window.location.search=`?lang=${locale}&returnTo=${encodeURIComponent(continuation)}`;assert.equal(safeReturnPath(),continuation);}
 for(const candidate of ["//foreign.example/events/create/continue","https://foreign.example/events/create/continue","/\\foreign.example/events/create/continue"]){state.window.location.search=`?lang=en&returnTo=${encodeURIComponent(candidate)}`;assert.equal(safeReturnPath(),"/?lang=en");}
}));

test("successful publication goes to the organizer event list in every locale", () => {
 for (const locale of ["ru", "en", "kk"] as const) assert.equal(publicationDestination(locale), `/organizer/events?published=1&lang=${locale}`);
});
