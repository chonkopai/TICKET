import { z } from "zod";
import { EVENT_TEXT_LIMITS,eventLocaleSchema,type EventCreationDraftV2 } from "./event-creation-v2.js";
import type { EventLocale } from "./events.js";
/** Stable field keys are shared by locale metadata, translation and editor controls. */
export interface DraftLocaleField { key:string; maximum:number; text:string }
const eventFields=["title","summary","description","venueName","address","refundConditions"] as const;
export function draftLocaleFields(draft:EventCreationDraftV2,locale:EventLocale):DraftLocaleField[]{
  const fields:DraftLocaleField[]=eventFields.map(key=>({key,maximum:EVENT_TEXT_LIMITS[key],text:draft.content[locale]?.[key]??""}));
  for(const row of [draft.free,...draft.paidGeneral,...(draft.paidSeated?.tariffs??[])])for(const field of ["name","description"] as const)fields.push({key:`sale.${row.id}.${field}`,maximum:field==="name"?60:300,text:row.content[locale]?.[field]??""});
  for(const id of draft.media.slots)if(id)fields.push({key:`media.${id}.caption`,maximum:160,text:draft.media.captions[id]?.[locale]??""});
  return fields;
}
export function setDraftLocaleField(draft:EventCreationDraftV2,locale:EventLocale,key:string,text:string):void{
  if(eventFields.includes(key as typeof eventFields[number])){draft.content[locale]={...draft.content[locale],[key]:text};return;}
  const field=draftLocaleFields(draft,locale).find(field=>field.key===key);if(!field)throw new Error("TRANSLATION_FIELD_REMOVED");
  const [,id,part]=key.split(".");
  if(key.startsWith("sale.")){const row=[draft.free,...draft.paidGeneral,...(draft.paidSeated?.tariffs??[])].find(row=>row.id===id)!;row.content[locale]={...row.content[locale],[part!]:text};}
  else draft.media.captions[id!]={...draft.media.captions[id!],[locale]:text};
}
export const translateDraftSchema=z.object({revision:z.number().int().positive(),targetLocale:eventLocaleSchema}).strict();
export interface DraftTranslationResult { draft:import("./creation-drafts.js").CreationDraftResponse;translated:number;cached:number }
