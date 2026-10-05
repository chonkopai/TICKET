import { randomBytes,randomUUID } from "node:crypto";
import type { EventCreationDraft,Prisma,PrismaClient } from "@event-platform/database";
import { applyCreationDraftPatch,DRAFT_LIFETIMES,eventCreationDraftSchema,newEventCreationDraft,publishReadyDraftSchema,type CreationDraftResponse,type CreationDraftValidation,type EventCreationDraftV2,type EventLocale,type CurrencyCapability } from "@event-platform/shared-types";
import { ConflictException,GoneException,HttpException,Inject,Injectable,UnprocessableEntityException,type OnModuleInit,type OnModuleDestroy } from "@nestjs/common";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DRAFT_CONFIG,assertCsrf,csrfFor,draftNotFound,equalSecret,sha256,type DraftAccess,type DraftConfig } from "./draft-security.js";

import { trackDraftLocales,type AppliedTranslation } from "./draft-locales.js";

export type DraftTransaction=Prisma.TransactionClient;
export const DRAFT_CURRENCIES=Symbol("DRAFT_CURRENCIES");
export function draftJson(value:EventCreationDraftV2):Prisma.InputJsonValue {return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;}

@Injectable()
export class CreationDraftsService implements OnModuleInit,OnModuleDestroy {
  private cleanupTimer:ReturnType<typeof setInterval>|undefined;
  constructor(@Inject(DATABASE_CLIENT) readonly database:PrismaClient,@Inject(DRAFT_CONFIG) readonly config:DraftConfig,@Inject(DRAFT_CURRENCIES) readonly currencies:readonly CurrencyCapability[]){}
  onModuleInit(){if(process.env.NODE_ENV!=="test"){this.cleanupTimer=setInterval(()=>void this.expire().catch(()=>{}),300000);this.cleanupTimer.unref();}}
  onModuleDestroy(){clearInterval(this.cleanupTimer);}
  async quota(scope:string,limit:number,seconds:number,weight=1):Promise<void>{
    const key=`creation:${sha256(scope)}`;
    const rows=await this.database.$queryRaw<Array<{count:number}>>`INSERT INTO "VerificationRateLimit" ("scopeKey",count,"windowEnd","updatedAt") VALUES (${key},${weight},now()+${seconds}*interval '1 second',now()) ON CONFLICT ("scopeKey") DO UPDATE SET count=CASE WHEN "VerificationRateLimit"."windowEnd"<=now() THEN ${weight} ELSE LEAST(2147483647::bigint,"VerificationRateLimit".count::bigint+${weight})::int END,"windowEnd"=CASE WHEN "VerificationRateLimit"."windowEnd"<=now() THEN now()+${seconds}*interval '1 second' ELSE "VerificationRateLimit"."windowEnd" END,"updatedAt"=now() RETURNING count`;
    if(rows[0]!.count>limit)throw new HttpException({code:"DRAFT_QUOTA_EXCEEDED"},429);
  }
  async create(locale:EventLocale,networkKey:string):Promise<{draft:CreationDraftResponse;capability:string}>{
    await this.quota(`create:${networkKey}`,this.config.creationHourlyLimit,3600);
    const capability=randomBytes(32).toString("base64url"),expiresAt=new Date(Date.now()+this.config.anonymousSeconds*1000);
    const row=await this.database.eventCreationDraft.create({data:{capabilityHash:sha256(capability),capabilityExpiresAt:expiresAt,expiresAt,aggregate:draftJson(newEventCreationDraft(randomUUID(),locale))}});
    return {draft:this.present(row,{capability}),capability};
  }
  async access(tx:Pick<DraftTransaction,"eventCreationDraft">,id:string,access:DraftAccess,mutation=false):Promise<EventCreationDraft>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return draftNotFound();
    const row=await tx.eventCreationDraft.findUnique({where:{id}});if(!row)return draftNotFound();
    if(row.ownerId){if(access.principal?.userId!==row.ownerId)return draftNotFound();}
    else if(!access.capability||!row.capabilityHash||!equalSecret(sha256(access.capability),row.capabilityHash))return draftNotFound();
    if(row.expiresAt.getTime()<=Date.now()||(!row.ownerId&&(!row.capabilityExpiresAt||row.capabilityExpiresAt.getTime()<=Date.now()))||["expired","deleted"].includes(row.state))throw new GoneException({code:"DRAFT_EXPIRED"});
    if(mutation){
      assertCsrf(id,access,this.config.hmacSecret,!row.ownerId);
      if(!["active","claimed"].includes(row.state))throw new ConflictException({code:"DRAFT_STATE_CONFLICT"});
    }
    return row;
  }
  present(row:EventCreationDraft,access:DraftAccess):CreationDraftResponse {
    return {id:row.id,revision:row.revision,state:row.state,aggregate:eventCreationDraftSchema.parse(row.aggregate),expiresAt:row.expiresAt.toISOString(),owned:!!row.ownerId,resultEventId:row.resultEventId,editingEventId:row.editingEventId,csrfToken:csrfFor(row.id,access,this.config.hmacSecret,!row.ownerId)};
  }
  async read(id:string,access:DraftAccess){return this.present(await this.access(this.database,id,access),access);}
  async locked(tx:DraftTransaction,id:string,access:DraftAccess,revision:number){
    // Authorize before locking guessed identifiers, then recheck capability and
    // expiry under the lock (claim/revocation can race the first read).
    await this.access(tx,id,access,true);
    await tx.$queryRaw`SELECT id FROM "EventCreationDraft" WHERE id=${id}::uuid FOR UPDATE`;
    const row=await this.access(tx,id,access,true);
    if(row.revision!==revision)throw new ConflictException({code:"DRAFT_REVISION_CONFLICT",currentRevision:row.revision});return row;
  }
  async checkReferences(tx:DraftTransaction,id:string,draft:EventCreationDraftV2,editingEventId:string|null=null){
    const ids=draft.media.slots.filter(value=>value!==null),assets=await tx.mediaAsset.findMany({where:{id:{in:ids}}});
    if(assets.length!==ids.length||assets.some(asset=>(asset.draftId!==id||asset.eventId!==null)&&(!editingEventId||asset.eventId!==editingEventId)||asset.deletingAt!==null))throw new UnprocessableEntityException({code:"MEDIA_OWNER_MISMATCH"});
    if(assets.some(asset=>asset.id===draft.media.cardAssetId&&asset.kind!=="image"))throw new UnprocessableEntityException({code:"CARD_MUST_BE_IMAGE"});
  }
  async mutate(id:string,access:DraftAccess,revision:number,transform:(draft:EventCreationDraftV2,tx:DraftTransaction,row:EventCreationDraft)=>Promise<EventCreationDraftV2>|EventCreationDraftV2,origin:"manual"|"machine"="manual",translated?:AppliedTranslation){
    return this.database.$transaction(async tx=>{
      const row=await this.locked(tx,id,access,revision),previous=eventCreationDraftSchema.parse(row.aggregate),next=eventCreationDraftSchema.parse(trackDraftLocales(previous,await transform(structuredClone(previous),tx,row),origin,translated));
      await this.checkReferences(tx,id,next,row.editingEventId);
      const updated=await tx.eventCreationDraft.update({where:{id},data:{aggregate:draftJson(next),revision:{increment:1}}});
      return this.present(updated,access);
    },{timeout:10000});
  }
  async update(id:string,access:DraftAccess,revision:number,input:unknown){
    return this.mutate(id,access,revision,draft=>{
      try{return applyCreationDraftPatch(draft,input);}catch(error){throw new UnprocessableEntityException({code:error instanceof Error&&error.message==="CURRENCY_RELABEL_CONFIRMATION_REQUIRED"?error.message:"DRAFT_VALIDATION_FAILED"});}
    });
  }
  async validate(id:string,access:DraftAccess,revision:number):Promise<CreationDraftValidation>{
    return this.database.$transaction(async tx=>{
      const row=await this.locked(tx,id,access,revision),draft=eventCreationDraftSchema.parse(row.aggregate);await this.checkReferences(tx,id,draft,row.editingEventId);const assets=await tx.mediaAsset.findMany({where:{id:{in:draft.media.slots.filter(value=>value!==null)}}});
      const result=publishReadyDraftSchema({draftId:id,currencies:this.currencies,...(this.config.mediaLimits?{limits:this.config.mediaLimits}:{}),assets:assets.filter(asset=>asset.kind!=="unknown"&&asset.state!=="legacy").map(asset=>({id:asset.id,draftId:id,kind:asset.kind as "image"|"video",state:asset.state as "ready"|"uploading"|"processing"|"failed",bytes:Number(asset.bytes??0),width:asset.width,height:asset.height,durationSeconds:asset.durationSeconds}))}).safeParse(row.aggregate);
      return {valid:result.success,revision:row.revision,fields:result.success?[]:result.error.issues.map(issue=>({path:issue.path.join("."),code:issue.message}))};
    });
  }
  async remove(id:string,access:DraftAccess,revision:number){
    return this.database.$transaction(async tx=>{await this.locked(tx,id,access,revision);await tx.eventCreationDraft.update({where:{id},data:{state:"deleted",capabilityHash:null,capabilityExpiresAt:null,revision:{increment:1},expiresAt:new Date()}});return {deleted:true};});
  }
  async claim(id:string,access:DraftAccess,revision:number){
    if(!access.principal)return draftNotFound();
    return this.database.$transaction(async tx=>{
      const row=await this.locked(tx,id,access,revision);
      if(row.ownerId)return this.present(row,access);
      const updated=await tx.eventCreationDraft.update({where:{id},data:{ownerId:access.principal!.userId,state:"claimed",capabilityHash:null,capabilityExpiresAt:null,expiresAt:new Date(Date.now()+this.config.ownedSeconds*1000),revision:{increment:1}}});
      return this.present(updated,access);
    });
  }
  async expire(limit=100){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("Invalid cleanup bound");
    return this.database.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "EventCreationDraft" WHERE state IN ('active','claimed') AND "expiresAt"<=now() ORDER BY "expiresAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
      if(rows.length)await tx.eventCreationDraft.updateMany({where:{id:{in:rows.map(row=>row.id)}},data:{state:"expired",capabilityHash:null,capabilityExpiresAt:null,revision:{increment:1}}});
      return rows.map(row=>row.id);
    });
  }
}

export const defaultDraftLifetimes=DRAFT_LIFETIMES;
