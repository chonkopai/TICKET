import { draftLocaleFields,EVENT_LOCALES,type EventCreationDraftV2,type EventLocale } from "@event-platform/shared-types";
import { sha256 } from "./draft-security.js";
/** Only the server writes metadata. Shared geometry/money edits do not stale text. */
export interface AppliedTranslation { locale:EventLocale;fields:readonly string[] }
export function trackDraftLocales(previous:EventCreationDraftV2,next:EventCreationDraftV2,origin:"manual"|"machine"="manual",translated?:AppliedTranslation){
  next.metadata=structuredClone(previous.metadata);
  const source=next.sourceLocale,beforeSource=new Map(draftLocaleFields(previous,source).map(field=>[field.key,field.text]));
  const currentSource=new Map(draftLocaleFields(next,source).map(field=>[field.key,field.text]));
  for(const locale of EVENT_LOCALES){
    const old=new Map(draftLocaleFields(previous,locale).map(field=>[field.key,field.text])),fields=draftLocaleFields(next,locale);
    next.metadata[locale]??={};
    const keys=new Set(fields.map(field=>field.key));for(const key of Object.keys(next.metadata[locale]!))if(!keys.has(key))delete next.metadata[locale]![key];
    for(const field of fields){
      const changed=(old.get(field.key)??"")!==field.text,sourceText=currentSource.get(field.key)??"",sourceHash=sha256(sourceText),metadata=next.metadata[locale]![field.key];
      // A fresh translation can have identical text (names/addresses or a cache hit).
      if(changed||translated?.locale===locale&&translated.fields.includes(field.key))next.metadata[locale]![field.key]={origin:locale===source?"source":origin,sourceHash,reviewed:locale===source||origin==="manual",stale:false,revision:(metadata?.revision??0)+1};
      else if(locale!==source&&(beforeSource.get(field.key)??"")!==sourceText&&field.text)next.metadata[locale]![field.key]={origin:metadata?.origin??"manual",sourceHash:metadata?.sourceHash??sha256(beforeSource.get(field.key)??""),reviewed:false,stale:true,revision:(metadata?.revision??0)+1};
    }
  }
  return next;
}
