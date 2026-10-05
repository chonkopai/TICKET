import { Inject,Injectable,ConflictException,BadRequestException,ServiceUnavailableException } from "@nestjs/common";
import { draftLocaleFields,graphemeLength,setDraftLocaleField,type EventLocale,type DraftTranslationResult } from "@event-platform/shared-types";
import { CreationDraftsService } from "./creation-drafts.service.js";
import { sha256,type DraftAccess } from "./draft-security.js";
import type { TranslationProvider } from "../events/translation-provider.js";
export const DRAFT_TRANSLATOR=Symbol("DRAFT_TRANSLATOR");
@Injectable()
export class DraftTranslationsService {
  constructor(@Inject(CreationDraftsService) readonly drafts:CreationDraftsService,@Inject(DRAFT_TRANSLATOR) readonly provider:TranslationProvider){}
  async translate(id:string,access:DraftAccess,revision:number,target:EventLocale):Promise<DraftTranslationResult>{
    const snapshot=await this.drafts.database.$transaction(async tx=>this.drafts.present(await this.drafts.locked(tx,id,access,revision),access));
    const source=snapshot.aggregate.sourceLocale;if(source===target)throw new BadRequestException({code:"TRANSLATION_SAME_LOCALE"});
    if(!this.provider.configured)throw new ServiceUnavailableException({code:"TRANSLATION_NOT_CONFIGURED"});
    const targets=new Map(draftLocaleFields(snapshot.aggregate,target).map(field=>[field.key,field]));
    const fields=draftLocaleFields(snapshot.aggregate,source).filter(field=>field.text.trim());
    if(!fields.length)return {draft:snapshot,translated:0,cached:0};
    await this.drafts.quota(`translate-requests:${access.principal?.userId??access.quotaScope??id}`,this.provider.config.TRANSLATION_HOURLY_REQUESTS,3600);
    const keys=fields.map(field=>sha256(`${this.provider.cacheNamespace}:${source}:${target}:${sha256(field.text)}`));
    const cached=await this.drafts.database.draftTranslationCache.findMany({where:{key:{in:keys},expiresAt:{gt:new Date()}}}),cache=new Map(cached.map(row=>[row.key,row.text]));
    const missing=[...new Map(fields.filter((_,i)=>!cache.has(keys[i]!)).map((field)=>[sha256(field.text),field])).values()];
    if(missing.length){
      await this.drafts.quota(`translate-characters:${access.principal?.userId??access.quotaScope??id}`,this.provider.config.TRANSLATION_DAILY_CHARACTERS,86400,missing.reduce((sum,field)=>sum+Array.from(field.text).length,0));
      // External calls deliberately run outside row locks and transactions.
      const texts=await this.provider.translate(missing.map(field=>field.text),source,target);
      for(let i=0;i<missing.length;i++){
        const field=missing[i]!,key=sha256(`${this.provider.cacheNamespace}:${source}:${target}:${sha256(field.text)}`),text=texts[i]!;cache.set(key,text);
        await this.drafts.database.draftTranslationCache.upsert({where:{key},create:{key,sourceLocale:source,targetLocale:target,sourceHash:sha256(field.text),text,expiresAt:new Date(Date.now()+this.provider.config.TRANSLATION_CACHE_SECONDS*1000)},update:{text,expiresAt:new Date(Date.now()+this.provider.config.TRANSLATION_CACHE_SECONDS*1000)}});
      }
    }
    const accepted=fields.map((field,index)=>({key:field.key,text:cache.get(keys[index]!)!}));
    const tooLong=accepted.filter((field,index)=>graphemeLength(field.text)>fields[index]!.maximum||field.text.length>fields[index]!.maximum*64);
    // Keep field limits without truncating translations or partially replacing target text.
    if(tooLong.length)throw new BadRequestException({code:"TRANSLATION_TOO_LONG",fields:tooLong.map(field=>({path:`content.${target}.${field.key}`,code:"TEXT_TOO_LONG"}))});
    const draft=await this.drafts.mutate(id,access,revision,current=>{
      const currentSource=new Map(draftLocaleFields(current,source).map(field=>[field.key,field.text])),currentTarget=new Map(draftLocaleFields(current,target).map(field=>[field.key,field.text]));
      for(const field of fields){
        if(current.sourceLocale!==source||currentSource.get(field.key)!==field.text||currentTarget.get(field.key)!==targets.get(field.key)?.text||(current.metadata[source]?.[field.key]?.revision??0)!==(snapshot.aggregate.metadata[source]?.[field.key]?.revision??0)||(current.metadata[target]?.[field.key]?.revision??0)!==(snapshot.aggregate.metadata[target]?.[field.key]?.revision??0))throw new ConflictException({code:"TRANSLATION_REVISION_CONFLICT"});
      }
      for(const field of accepted)setDraftLocaleField(current,target,field.key,field.text);
      return current;
    },"machine",{locale:target,fields:accepted.map(field=>field.key)});
    // Bounded cache cleanup never scans or deletes draft assets/content.
    const expired=await this.drafts.database.draftTranslationCache.findMany({where:{expiresAt:{lte:new Date()}},select:{key:true},take:100});
    if(expired.length)await this.drafts.database.draftTranslationCache.deleteMany({where:{key:{in:expired.map(row=>row.key)},expiresAt:{lte:new Date()}}});
    return {draft,translated:accepted.length,cached:fields.filter((_,index)=>cached.some(row=>row.key===keys[index])).length};
  }
}
