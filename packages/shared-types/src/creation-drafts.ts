import { z } from "zod";
import { eventCreationDraftSchema, eventLocaleSchema, type EventCreationDraftV2 } from "./event-creation-v2.js";

const shape=eventCreationDraftSchema.shape;
export const creationDraftPatchSchema=z.object({
  selectedMode:shape.selectedMode.optional(),currency:shape.currency.optional(),acknowledgeCurrencyRelabel:z.literal(true).optional(),step:shape.step.optional(),
  content:shape.content.optional(),classification:shape.classification.partial().optional(),coordinates:shape.coordinates.optional(),schedule:shape.schedule.partial().optional(),
  refundsAvailable:shape.refundsAvailable.optional(),free:shape.free.partial().optional(),paidGeneral:shape.paidGeneral.optional(),paidSeated:shape.paidSeated.optional(),media:shape.media.partial().extend({crops:shape.media.shape.crops.partial().optional()}).optional(),
}).strict();
export type CreationDraftPatch=z.infer<typeof creationDraftPatchSchema>;
export const createCreationDraftSchema=z.object({sourceLocale:eventLocaleSchema.default("ru")}).strict();
export const updateCreationDraftSchema=z.object({revision:z.number().int().positive(),patch:creationDraftPatchSchema}).strict();
export const creationDraftRevisionSchema=z.object({revision:z.number().int().positive()}).strict();
export function mergeDraftValues<T>(current:T,patch:unknown):T {
  if(!patch||typeof patch!=="object"||Array.isArray(patch))return patch as T;
  const result={...(current as Record<string,unknown>)};
  for(const [key,value] of Object.entries(patch)){
    if(["__proto__","prototype","constructor"].includes(key))throw new Error("Invalid field");
    if(value!==undefined)result[key]=value&&typeof value==="object"&&!Array.isArray(value)?mergeDraftValues(result[key],value):value;
  }
  return result as T;
}
export function applyCreationDraftPatch(draft:EventCreationDraftV2,input:unknown):EventCreationDraftV2 {
  const {acknowledgeCurrencyRelabel,...patch}=creationDraftPatchSchema.parse(input);
  if(patch.currency&&patch.currency!==draft.currency&&!acknowledgeCurrencyRelabel)throw new Error("CURRENCY_RELABEL_CONFIRMATION_REQUIRED");
  const next=mergeDraftValues(draft,patch);
  if(patch.media?.slots)next.media.assetCrops=Object.fromEntries(Object.entries(next.media.assetCrops??{}).filter(([id])=>next.media.slots.includes(id)));
  if(patch.refundsAvailable===false)for(const locale of ["ru","en","kk"] as const)if(next.content[locale])next.content[locale]!.refundConditions="";
  return eventCreationDraftSchema.parse(next);
}
export interface CreationDraftResponse {
  id:string;revision:number;state:"active"|"claimed"|"publishing"|"published"|"deleted"|"expired";
  editingEventId?:string|null;aggregate:EventCreationDraftV2;expiresAt:string;owned:boolean;resultEventId:string|null;csrfToken:string;
}
export interface CreationDraftValidation { valid:boolean;revision:number;fields:Array<{path:string;code:string}> }
export const reserveDraftMediaSchema=z.object({revision:z.number().int().positive(),slot:z.number().int().min(0).max(4),contentType:z.enum(["image/jpeg","image/png","image/webp","video/mp4","video/webm"]),bytes:z.number().int().positive(),replaceAssetId:z.string().uuid().optional()}).strict();
export interface DraftMediaResponse {id:string;kind:"image"|"video";state:"uploading"|"processing"|"ready"|"failed";contentType:string;bytes:number;width:number|null;height:number|null;durationSeconds:number|null;errorCode:string|null}
export interface DraftMediaMutation {draft:CreationDraftResponse;asset:DraftMediaResponse}

export const publishCreationDraftSchema=z.object({intentId:z.string().uuid()}).strict();
export interface CreationPublishIntent {id:string;revision:number;expiresAt:string;resultEventId:string|null}
export interface CreationPublication {eventId:string;draft:CreationDraftResponse;user:import("./auth.js").AuthUser}
