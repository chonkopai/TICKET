import { applyCreationDraftPatch,creationDraftPatchSchema,mergeDraftValues,draftLocaleFields,setDraftLocaleField,EVENT_LOCALES,type CreationDraftPatch,type CreationDraftResponse,type EventCreationDraftV2,type EventLocale } from "@event-platform/shared-types";
import { refreshSession } from "../app/(auth)/_lib/api";
import { getSession } from "../app/(auth)/_lib/session";

const POINTER="ticket.creation.v2.id",RECOVERY="ticket.creation.v2.recovery";
export interface DraftRecovery {id:string;baseRevision:number;patch:CreationDraftPatch}
export class DraftRequestError extends Error {
  constructor(readonly code:string,readonly status:number,readonly currentRevision?:number,readonly fields:Array<{path:string;code:string}>=[]){super(code);}
}
export async function creationDraftRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  if(!path.startsWith("/api/creation-drafts")||path.includes("//"))throw new Error("Invalid draft path");
  const headers=new Headers(init.headers),session=getSession();if(session)headers.set("Authorization",`Bearer ${session.tokens.accessToken}`);
  let response=await fetch(path,{...init,headers,credentials:"same-origin",cache:"no-store"});
  if(response.status===401&&session){
    try{const tokens=await refreshSession(session);headers.set("Authorization",`Bearer ${tokens.accessToken}`);}catch{headers.delete("Authorization");}
    response=await fetch(path,{...init,headers,credentials:"same-origin",cache:"no-store"});
  }
  if(!response.ok){const error=await response.json().catch(()=>({})) as {code?:string;currentRevision?:number;fields?:Array<{path:string;code:string}>};throw new DraftRequestError(error.code??"DRAFT_REQUEST_FAILED",response.status,error.currentRevision,error.fields);}
  return await response.json() as T;
}
export type DraftTransport=typeof creationDraftRequest;
export class DraftAutosave {
  private pending:CreationDraftPatch={};
  private inflight:CreationDraftPatch={};
  private saving:Promise<CreationDraftResponse>|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private translationEdits:Set<string>|null=null;
  private listeners=new Set<()=>void>();
  error:Error|null=null;
  recoveryCandidate:DraftRecovery|null;
  constructor(public saved:CreationDraftResponse,private readonly request:DraftTransport=creationDraftRequest,recovery:DraftRecovery|null=draftRecovery()){
    this.recoveryCandidate=compatibleRecovery(saved,recovery);
  }
  restoreRecovery(reviewed=false){
    const recovery=this.recoveryCandidate;if(!recovery)return;
    if(this.busy||this.dirty)throw new Error("Save current edits before restoring a backup");
    if(recovery.baseRevision!==this.saved.revision&&!reviewed)throw new Error("Review the backup against the current saved version first");
    this.patch(recovery.patch);this.recoveryCandidate=null;this.notify();
  }
  dismissRecovery(){this.recoveryCandidate=null;if(typeof window!=="undefined")window.localStorage.removeItem(RECOVERY);this.notify();}
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private notify(){for(const listener of this.listeners)listener();}
  get aggregate():EventCreationDraftV2{return applyCreationDraftPatch(this.saved.aggregate,mergeDraftValues(this.inflight,this.pending));}
  get dirty(){return Object.keys(this.pending).length>0;}
  get busy(){return this.saving!==null;}
  patch(patch:CreationDraftPatch){
    const before=this.aggregate,next=mergeDraftValues(this.pending,patch),after=applyCreationDraftPatch(this.saved.aggregate,mergeDraftValues(this.inflight,next));
    if(this.translationEdits)for(const locale of EVENT_LOCALES){const prior=new Map(draftLocaleFields(before,locale).map(field=>[field.key,field.text]));for(const field of draftLocaleFields(after,locale))if(prior.get(field.key)!==field.text)this.translationEdits.add(`${locale}:${field.key}`);}
    this.pending=next;this.error=null;this.recover();this.notify();clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush().catch(()=>{}),600);
  }
  private recover(){if(typeof window!=="undefined")window.localStorage.setItem(RECOVERY,JSON.stringify({id:this.saved.id,baseRevision:this.saved.revision,patch:mergeDraftValues(this.inflight,this.pending)}));}
  async flush():Promise<CreationDraftResponse>{
    clearTimeout(this.timer);if(this.saving){await this.saving;return this.flush();}if(!this.dirty)return this.saved;
    if(this.error instanceof DraftRequestError&&this.error.status===409)throw this.error;
    const patch=this.pending;this.pending={};this.inflight=patch;
    this.saving=this.request<CreationDraftResponse>(`/api/creation-drafts/${this.saved.id}`,{method:"PATCH",headers:{"content-type":"application/json","x-draft-csrf":this.saved.csrfToken},body:JSON.stringify({revision:this.saved.revision,patch})});this.notify();
    try{this.saved=await this.saving;this.error=null;}
    catch(error){this.pending=mergeDraftValues(patch,this.pending);this.error=error instanceof Error?error:new Error("DRAFT_REQUEST_FAILED");throw this.error;}
    finally{this.saving=null;this.inflight={};this.recover();this.notify();}
    return this.dirty?this.flush():this.saved;
  }
  /** Explicit reload keeps unsubmitted text recoverable; it never rebases it automatically. */
  async reload(){const recovery=draftRecovery();this.saved=await this.request<CreationDraftResponse>(`/api/creation-drafts/${this.saved.id}`);this.pending={};this.recoveryCandidate=compatibleRecovery(this.saved,recovery);this.error=null;this.notify();return this.saved;}
  adopt(response:CreationDraftResponse){if(this.dirty||this.busy)throw new Error("Flush text changes first");this.saved=response;this.error=null;this.notify();}
  async mutation<T extends {draft:CreationDraftResponse}>(action:(saved:CreationDraftResponse)=>Promise<T>,translation=false):Promise<T>{
    await this.flush();if(this.busy||this.dirty)return this.mutation(action,translation);
    const base=this.saved.aggregate;if(translation)this.translationEdits=new Set();
    let result:T;this.saving=action(this.saved).then(response=>{result=response;return response.draft;});this.notify();
    try{const response=await this.saving;
      if(translation&&this.dirty){
        const local=applyCreationDraftPatch(base,this.pending),combined=reconcileKnownTranslation(base,response.aggregate,local) as EventCreationDraftV2;
        for(const touched of this.translationEdits??[]){const [locale,...parts]=touched.split(":"),key=parts.join(":"),field=draftLocaleFields(local,locale as EventLocale).find(field=>field.key===key);if(field&&draftLocaleFields(combined,locale as EventLocale).some(field=>field.key===key))setDraftLocaleField(combined,locale as EventLocale,key,field.text);}
        this.pending=Object.fromEntries(Object.keys(this.pending).map(key=>[key,key==="acknowledgeCurrencyRelabel"?true:combined[key as keyof EventCreationDraftV2]])) as CreationDraftPatch;
      }
      this.saved=response;this.error=null;return result!;}catch(error){this.error=error instanceof Error?error:new Error("DRAFT_REQUEST_FAILED");throw error;}
    finally{this.translationEdits=null;this.saving=null;this.recover();this.notify();if(this.dirty)this.timer=setTimeout(()=>void this.flush().catch(()=>{}),600);}
  }
  translationMutation<T extends {draft:CreationDraftResponse}>(action:(saved:CreationDraftResponse)=>Promise<T>){return this.mutation(action,true);}
  dispose(){clearTimeout(this.timer);this.listeners.clear();}
}
let bootstrap:Promise<DraftAutosave>|null=null;
let bootstrapId:string|undefined;
export function openCreationDraft(locale:EventLocale,id?:string):Promise<DraftAutosave>{
  if(bootstrap&&(!id||id===bootstrapId))return bootstrap;
  bootstrapId=id;
  bootstrap=(async()=>{
    const existing=id??window.localStorage.getItem(POINTER);
    const response=existing?await creationDraftRequest<CreationDraftResponse>(`/api/creation-drafts/${existing}`):await creationDraftRequest<CreationDraftResponse>("/api/creation-drafts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceLocale:locale})});
    bootstrapId=response.id;window.localStorage.setItem(POINTER,response.id);return new DraftAutosave(response);
  })();
  bootstrap.catch(()=>{bootstrap=null;});return bootstrap;
}
export function finishPublishedDraft(id:string){if(typeof window!=="undefined"){if(window.localStorage.getItem(POINTER)===id)window.localStorage.removeItem(POINTER);if(draftRecovery()?.id===id)window.localStorage.removeItem(RECOVERY);}resetDraftBootstrap();}
export function resetDraftBootstrap(){bootstrap=null;bootstrapId=undefined;}
/** Save pending edits, then switch to a new empty draft. */
export async function resetCreationDraft(client:DraftAutosave,request:DraftTransport=creationDraftRequest):Promise<DraftAutosave>{
  await client.flush();
  const response=await request<CreationDraftResponse>("/api/creation-drafts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceLocale:client.saved.aggregate.sourceLocale})});
  const next=new DraftAutosave(response,request,null);
  bootstrapId=response.id;bootstrap=Promise.resolve(next);
  if(typeof window!=="undefined")window.localStorage.setItem(POINTER,response.id);
  return next;
}
export function draftRecovery(){if(typeof window==="undefined")return null;try{return parseRecovery(JSON.parse(window.localStorage.getItem(RECOVERY)??"null"));}catch{return null;}}

function parseRecovery(value:unknown):DraftRecovery|null{
  if(!value||typeof value!=="object")return null;
  const record=value as Record<string,unknown>,patch=creationDraftPatchSchema.safeParse(record.patch);
  if(typeof record.id!=="string"||!Number.isSafeInteger(record.baseRevision)||(record.baseRevision as number)<1||!patch.success||!Object.keys(patch.data).length)return null;
  return {id:record.id,baseRevision:record.baseRevision as number,patch:patch.data};
}
function compatibleRecovery(saved:CreationDraftResponse,value:unknown):DraftRecovery|null{
  const recovery=parseRecovery(value);if(recovery?.id!==saved.id)return null;
  try{applyCreationDraftPatch(saved.aggregate,recovery.patch);return recovery;}catch{return null;}
}

/** Reconcile a successful mutation made by this client, never a 409 from another tab. */
function reconcileKnownTranslation(base:unknown,translated:unknown,local:unknown):unknown{
  if(JSON.stringify(base)===JSON.stringify(local))return translated;
  if(Array.isArray(local)){
    if(!Array.isArray(base)||!Array.isArray(translated)||!local.every(row=>row&&typeof row==="object"&&"id" in row))return local;
    return local.map(row=>{const previous=base.find(value=>value?.id===row.id),next=translated.find(value=>value?.id===row.id);return previous&&next?reconcileKnownTranslation(previous,next,row):row;});
  }
  if(local&&typeof local==="object"&&!Array.isArray(local)&&translated&&typeof translated==="object"&&!Array.isArray(translated)){
    const previous=(base??{}) as Record<string,unknown>,next=translated as Record<string,unknown>,current=local as Record<string,unknown>,result:Record<string,unknown>={};
    for(const key of new Set([...Object.keys(next),...Object.keys(current)]))result[key]=reconcileKnownTranslation(previous[key],next[key],current[key]);return result;
  }
  return local;
}
