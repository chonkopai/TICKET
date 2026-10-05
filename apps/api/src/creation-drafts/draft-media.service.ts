import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { MediaAsset } from "@event-platform/database";
import { DEFAULT_MEDIA_CROP,eventCreationDraftSchema,type DraftMediaResponse,type EventCreationDraftV2 } from "@event-platform/shared-types";
import { ConflictException,Inject,Injectable,UnprocessableEntityException,type OnModuleInit,type OnModuleDestroy } from "@nestjs/common";
import { CreationDraftsService,type DraftTransaction } from "./creation-drafts.service.js";
import { draftNotFound,type DraftAccess } from "./draft-security.js";
import { DraftMediaStorage,type DraftMediaMime } from "./draft-media-storage.js";
import { DraftMediaProcessor } from "./draft-media-processor.js";

export function presentMedia(asset:MediaAsset):DraftMediaResponse{return {id:asset.id,kind:asset.kind as "image"|"video",state:asset.state as DraftMediaResponse["state"],contentType:asset.contentType!,bytes:Number(asset.bytes??0),width:asset.width,height:asset.height,durationSeconds:asset.durationSeconds,errorCode:asset.errorCode};}
function replacementRoles(draft:EventCreationDraftV2,removed:string,images:string[]){
  if(draft.media.cardAssetId===removed)draft.media.cardAssetId=images[0]??null;
  if(draft.media.backgroundAssetId===removed)draft.media.backgroundAssetId=draft.media.slots.find(id=>id!==null)??null;
  delete draft.media.captions[removed];delete draft.media.assetCrops[removed];return draft;
}
@Injectable()
export class DraftMediaService implements OnModuleInit,OnModuleDestroy {
  private timer:ReturnType<typeof setInterval>|undefined;
  private maintenance=false;
  constructor(@Inject(CreationDraftsService) readonly drafts:CreationDraftsService,@Inject(DraftMediaStorage) readonly storage:DraftMediaStorage,@Inject(DraftMediaProcessor) readonly processor:DraftMediaProcessor){}
  onModuleInit(){if(process.env.NODE_ENV!=="test"){this.timer=setInterval(()=>void this.maintain().catch(()=>{}),300000);this.timer.unref();}}
  onModuleDestroy(){clearInterval(this.timer);}
  async list(id:string,access:DraftAccess){const row=await this.drafts.access(this.drafts.database,id,access);const draft=eventCreationDraftSchema.parse(row.aggregate);return(await this.drafts.database.mediaAsset.findMany({where:{id:{in:draft.media.slots.filter(value=>value!==null)},deletingAt:null}})).map(presentMedia);}
  async scoped(tx:Pick<DraftTransaction,"mediaAsset"|"eventCreationDraft">,id:string,assetId:string,draft:EventCreationDraftV2){
    if(!/^[0-9a-f-]{36}$/i.test(assetId))return draftNotFound();const asset=await tx.mediaAsset.findUnique({where:{id:assetId}}),row=await tx.eventCreationDraft.findUnique({where:{id}}),eventId=row?.editingEventId??row?.resultEventId;
    if(!asset||asset.deletingAt||!draft.media.slots.includes(assetId)||((asset.draftId!==id||asset.eventId!==null)&&(!eventId||asset.eventId!==eventId)))return draftNotFound();return asset;
  }

  async reserve(id:string,access:DraftAccess,input:{revision:number;slot:number;bytes:number;contentType:DraftMediaMime;replaceAssetId?:string|undefined}){
    if(!Number.isInteger(input.slot)||input.slot<0||input.slot>4||!Number.isSafeInteger(input.bytes)||input.bytes<1)throw new UnprocessableEntityException({code:"MEDIA_SLOT_INVALID"});
    const limit=input.contentType.startsWith("image/")?this.storage.config.imageBytes:this.storage.config.videoBytes;
    if(input.bytes>limit)throw new UnprocessableEntityException({code:"MEDIA_SIZE_INVALID"});
    await this.drafts.access(this.drafts.database,id,access,true);await this.drafts.quota(`upload:${id}`,60,3600);
    const assetId=randomUUID();let removed:string|null=null;
    const draft=await this.drafts.mutate(id,access,input.revision,async(draft,tx)=>{
      const current=draft.media.slots[input.slot];if(current!==null&&current!==input.replaceAssetId||current===null&&input.replaceAssetId)throw new ConflictException({code:"MEDIA_SLOT_OCCUPIED"});
      if(current){const replacing=await this.scoped(tx,id,current,draft);if(replacing.state==="processing")throw new ConflictException({code:"MEDIA_PROCESSING"});}
      const assets=await tx.mediaAsset.findMany({where:{OR:[{draftId:id},{id:{in:draft.media.slots.filter(value=>value!==null)}}],id:{not:current??"00000000-0000-0000-0000-000000000000"},deletingAt:null}});
      if(assets.reduce((sum,asset)=>sum+Number(asset.bytes??0),input.bytes)>this.storage.config.draftBytes)throw new UnprocessableEntityException({code:"MEDIA_DRAFT_QUOTA_EXCEEDED"});
      const image=input.contentType.startsWith("image/");
      await tx.mediaAsset.create({data:{id:assetId,draftId:id,kind:image?"image":"video",contentType:input.contentType,bytes:BigInt(input.bytes),uploadExpiresAt:new Date(Date.now()+15*60000)}});
      draft.media.slots[input.slot]=assetId;removed=current??null;
      draft.media.assetCrops[assetId]={...DEFAULT_MEDIA_CROP};
      if(removed)replacementRoles(draft,removed,assets.filter(asset=>asset.kind==="image"&&draft.media.slots.includes(asset.id)).map(asset=>asset.id));
      if(image&&!draft.media.cardAssetId)draft.media.cardAssetId=assetId;
      if(image&&!draft.media.backgroundAssetId)draft.media.backgroundAssetId=assetId;
      return draft;
    });
    if(removed)await this.collect(removed);
    return{draft,asset:presentMedia((await this.drafts.database.mediaAsset.findUniqueOrThrow({where:{id:assetId}})))};
  }
  async upload(id:string,assetId:string,access:DraftAccess,stream:Readable,mime:string,contentLength?:string){
    const asset=await this.drafts.database.$transaction(async tx=>{
      await this.drafts.access(tx,id,access,true);await tx.$queryRaw`SELECT id FROM "EventCreationDraft" WHERE id=${id}::uuid FOR UPDATE`;
      const row=await this.drafts.access(tx,id,access,true),draft=eventCreationDraftSchema.parse(row.aggregate),asset=await this.scoped(tx,id,assetId,draft);
      if(asset.state!=="uploading"||!asset.uploadExpiresAt||asset.uploadExpiresAt.getTime()<=Date.now())throw new ConflictException({code:"MEDIA_UPLOAD_EXPIRED"});
      if(mime!==asset.contentType||(contentLength!==undefined&&(!/^\d+$/.test(contentLength)||BigInt(contentLength)!==asset.bytes)))throw new UnprocessableEntityException({code:"MEDIA_UPLOAD_MISMATCH"});
      await tx.mediaAsset.update({where:{id:assetId},data:{state:"processing",errorCode:"MEDIA_RECEIVING"}});return asset;
    });
    try{
      const received=await this.storage.receive(assetId,stream,Number(asset.bytes),asset.contentType as DraftMediaMime);
      await this.drafts.database.mediaAsset.update({where:{id:assetId},data:{storageKey:`${assetId}/original`,checksum:received.checksum,errorCode:null}});
      await this.process(assetId);
    }catch(error){
      const code=error&&typeof error==="object"&&"getResponse" in error?(error as {getResponse():{code?:string}}).getResponse().code:undefined;
      await this.drafts.database.mediaAsset.updateMany({where:{id:assetId,state:"processing"},data:{state:"failed",errorCode:code??"MEDIA_UPLOAD_FAILED"}});throw error;
    }
    return{draft:await this.drafts.read(id,access),asset:presentMedia(await this.drafts.database.mediaAsset.findUniqueOrThrow({where:{id:assetId}}))};
  }
  async process(assetId:string){
    // Atomic claim spans external decoding without holding a database
    // transaction. The timestamp lease also survives worker restarts.
    const lease=randomUUID();const now=new Date();
    const claimed=await this.drafts.database.mediaAsset.updateMany({where:{id:assetId,state:"processing",deletingAt:null,errorCode:null},data:{errorCode:`PROCESSING:${lease}`,updatedAt:now}});
    if(!claimed.count)return;
    const asset=await this.drafts.database.mediaAsset.findUniqueOrThrow({where:{id:assetId}});
    try{const result=await this.processor.process(assetId,asset.contentType as DraftMediaMime);await this.drafts.database.mediaAsset.updateMany({where:{id:assetId,errorCode:`PROCESSING:${lease}`},data:{state:"ready",...result,errorCode:null,uploadExpiresAt:null}});}
    catch(error){const response=error&&typeof error==="object"&&"getResponse" in error?(error as {getResponse():{code?:string}}).getResponse():{};await this.drafts.database.mediaAsset.updateMany({where:{id:assetId,errorCode:`PROCESSING:${lease}`},data:{state:"failed",errorCode:response.code??"MEDIA_DECODE_INVALID"}});throw error;}
  }
  async retry(id:string,assetId:string,access:DraftAccess,revision:number){const draft=await this.drafts.mutate(id,access,revision,async(draft,tx)=>{const asset=await this.scoped(tx,id,assetId,draft);if(asset.state!=="failed")throw new ConflictException({code:"MEDIA_STATE_CONFLICT"});await tx.mediaAsset.update({where:{id:assetId},data:{state:"uploading",errorCode:null,uploadExpiresAt:new Date(Date.now()+15*60000)}});return draft;});return{draft,asset:presentMedia(await this.drafts.database.mediaAsset.findUniqueOrThrow({where:{id:assetId}}))};}
  async remove(id:string,assetId:string,access:DraftAccess,revision:number){const draft=await this.drafts.mutate(id,access,revision,async(draft,tx)=>{const asset=await this.scoped(tx,id,assetId,draft);if(asset.state==="processing")throw new ConflictException({code:"MEDIA_PROCESSING"});draft.media.slots=draft.media.slots.map(value=>value===assetId?null:value);const images=await tx.mediaAsset.findMany({where:{id:{in:draft.media.slots.filter(value=>value!==null)},kind:"image"}});return replacementRoles(draft,assetId,images.map(asset=>asset.id));});await this.collect(assetId);return draft;}
  async collect(assetId:string){
    const claimed=await this.drafts.database.$transaction(async tx=>{
      const initial=await tx.mediaAsset.findUnique({where:{id:assetId}});if(!initial?.draftId)return false;
      await tx.$queryRaw`SELECT id FROM "EventCreationDraft" WHERE id=${initial.draftId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE id=${assetId}::uuid FOR UPDATE`;
      const asset=await tx.mediaAsset.findUnique({where:{id:assetId}}),row=await tx.eventCreationDraft.findUnique({where:{id:initial.draftId}});
      if(!asset||!row||asset.eventId||asset.publishedAt||asset.legacyReference||asset.state==="processing"||["publishing","published"].includes(row.state)||await tx.eventMedia.count({where:{assetId}}))return false;
      const attached=eventCreationDraftSchema.parse(row.aggregate).media.slots.includes(assetId);
      if(attached&&(!["expired","deleted"].includes(row.state)||Date.now()-row.expiresAt.getTime()<this.drafts.config.cleanupGraceSeconds*1000))return false;
      const history=await tx.$queryRaw<Array<{present:boolean}>>`SELECT EXISTS(SELECT 1 FROM "Order" WHERE "checkoutSnapshot"::text LIKE ${`%${assetId}%`}) OR EXISTS(SELECT 1 FROM "LegacyEventSnapshot" WHERE original::text LIKE ${`%${assetId}%`}) AS present`;
      if(history[0]?.present)return false;
      await tx.mediaAsset.update({where:{id:assetId},data:{deletingAt:new Date(),state:"failed",errorCode:"MEDIA_COLLECTING"}});return true;
    });
    if(!claimed)return false;
    // Files are removed only after the claim committed; drafts reject deleting
    // assets, so a new reference cannot appear between this step and deletion.
    await this.storage.delete(assetId);
    await this.drafts.database.mediaAsset.deleteMany({where:{id:assetId,deletingAt:{not:null},eventId:null,publishedAt:null}});return true;
  }
  async maintain(){if(this.maintenance)return;this.maintenance=true;try{
    const database=this.drafts.database,stale=new Date(Date.now()-30*60000);
    await database.mediaAsset.updateMany({where:{state:"uploading",uploadExpiresAt:{lt:new Date()}},data:{state:"failed",errorCode:"MEDIA_UPLOAD_EXPIRED"}});
    await database.mediaAsset.updateMany({where:{state:"processing",updatedAt:{lt:stale}},data:{state:"failed",errorCode:"MEDIA_PROCESSING_INTERRUPTED"}});
    const resume=await database.mediaAsset.findMany({where:{state:"processing",errorCode:null,storageKey:{not:null}},take:5,orderBy:{createdAt:"asc"}});for(const asset of resume)await this.process(asset.id).catch(()=>{});
    const candidates=await database.$queryRaw<Array<{id:string}>>`SELECT a.id FROM "MediaAsset" a JOIN "EventCreationDraft" d ON d.id=a."draftId" WHERE a."eventId" IS NULL AND a."publishedAt" IS NULL AND a.state<>'processing' AND (NOT (d.aggregate->'media'->'slots' ? a.id::text) OR (d.state IN ('expired','deleted') AND d."expiresAt" < now()-${this.drafts.config.cleanupGraceSeconds}*interval '1 second')) ORDER BY a."updatedAt" LIMIT 100`;
    for(const asset of candidates)await this.collect(asset.id);
  }finally{this.maintenance=false;}}
}
