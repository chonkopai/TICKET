import { randomUUID } from "node:crypto";
import type { Prisma } from "@event-platform/database";
import { DRAFT_LIFETIMES,EVENT_LOCALES,assetMediaCrop,eventCreationDraftSchema,publishReadyDraftSchema,resolveSchedule,type CreationPublishIntent,type CreationPublication,type EventCreationDraftV2 } from "@event-platform/shared-types";
import { ConflictException,Inject,Injectable,UnauthorizedException,UnprocessableEntityException } from "@nestjs/common";
import { AUTH_CONFIG,type AuthConfig } from "../auth/auth.constants.js";
import { ensureOrganizer } from "../auth/organizer-policy.js";
import { presentUser } from "../auth/auth.presenter.js";
import { CreationDraftsService,draftJson,type DraftTransaction } from "./creation-drafts.service.js";
import { assertCsrf,draftNotFound,sha256,type DraftAccess } from "./draft-security.js";
import { persistSelectedSale } from "./creation-sale.persistence.js";
import { eventAggregate } from "./event-aggregate.js";

function hash(draft:EventCreationDraftV2){return sha256(JSON.stringify(eventCreationDraftSchema.parse(draft)));}
function browser(access:DraftAccess){if(!access.quotaScope?.startsWith("browser:"))throw new ConflictException({code:"PUBLISH_BROWSER_REQUIRED"});return sha256(access.quotaScope);}
function intentResponse(intent:{id:string;revision:number;expiresAt:Date;resultEventId:string|null}):CreationPublishIntent{return {...intent,expiresAt:intent.expiresAt.toISOString()};}
function json(value:unknown):Prisma.InputJsonValue{return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;}
function saleStructure(draft:EventCreationDraftV2){return JSON.stringify({mode:draft.selectedMode,currency:draft.currency,free:{...draft.free,content:null},general:draft.paidGeneral.map(row=>({...row,content:null})),hall:draft.paidSeated?{...draft.paidSeated,tariffs:draft.paidSeated.tariffs.map(row=>({...row,content:null}))}:null});}
function eventData(draft:EventCreationDraftV2){const source=draft.content[draft.sourceLocale]!,schedule=resolveSchedule(draft.schedule),local=draft.schedule.startLocal!;return {sourceLocale:draft.sourceLocale,title:source.title!,announcement:source.summary!,description:source.description!,venueName:source.venueName!,address:source.address!,category:draft.classification.category!,countryCode:draft.classification.countryCode!,city:draft.classification.city,ageRestriction:draft.classification.ageRestriction!,date:new Date(`${local.slice(0,10)}T00:00:00Z`),time:new Date(`1970-01-01T${local.slice(11)}:00Z`),timezone:schedule.timezone,startsAt:new Date(schedule.startsAt),endsAt:new Date(schedule.endsAt),latitude:draft.coordinates?.latitude??null,longitude:draft.coordinates?.longitude??null,refundsAvailable:draft.selectedMode==="free"?false:draft.refundsAvailable!,cancellationTerms:draft.selectedMode!=="free"&&draft.refundsAvailable?source.refundConditions??null:null,program:null,rules:null,visitTerms:null,extraConditions:null,depositTerms:null,paymentMode:"full_payment" as const,showFullAmountForDeposit:false};}
@Injectable()
export class DraftPublicationService {
 constructor(@Inject(CreationDraftsService) readonly drafts:CreationDraftsService,@Inject(AUTH_CONFIG) readonly authConfig:AuthConfig){}
 async ready(tx:DraftTransaction,id:string,draft:EventCreationDraftV2,editingEventId:string|null=null){
  await this.drafts.checkReferences(tx,id,draft,editingEventId);
  const ids=draft.media.slots.filter(value=>value!==null);await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE id=ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
  const assets=await tx.mediaAsset.findMany({where:{id:{in:ids},deletingAt:null}});
  const result=publishReadyDraftSchema({draftId:id,currencies:this.drafts.currencies,...(this.drafts.config.mediaLimits?{limits:this.drafts.config.mediaLimits}:{}),assets:assets.map(asset=>({id:asset.id,draftId:id,kind:asset.kind as "image"|"video",state:asset.state as "ready",bytes:Number(asset.bytes??0),width:asset.width,height:asset.height,durationSeconds:asset.durationSeconds}))}).safeParse(draft);
  if(!result.success)throw new UnprocessableEntityException({code:"DRAFT_VALIDATION_FAILED",fields:result.error.issues.map(issue=>({path:issue.path.join("."),code:issue.message}))});return result.data;
 }
 async intent(id:string,access:DraftAccess,revision:number){
  return this.drafts.database.$transaction(async tx=>{
   const row=await this.drafts.locked(tx,id,access,revision);if(row.editingEventId)throw new ConflictException({code:"OWNED_EDITOR_SAVE_REQUIRED"});
   const draft=eventCreationDraftSchema.parse(row.aggregate);await this.ready(tx,id,draft);
   const expiresAt=new Date(Date.now()+DRAFT_LIFETIMES.intentSeconds*1000),browserHash=browser(access);
   const intent=await tx.eventPublishIntent.upsert({where:{draftId_revision:{draftId:id,revision}},create:{draftId:id,revision,aggregateHash:hash(draft),browserHash,expiresAt},update:{aggregateHash:hash(draft),browserHash,expiresAt}});return intentResponse(intent);
  },{timeout:15000});
 }
 async intentStatus(id:string,intentId:string,access:DraftAccess){
  await this.drafts.access(this.drafts.database,id,access);const intent=await this.drafts.database.eventPublishIntent.findFirst({where:{id:intentId,draftId:id,browserHash:browser(access)}});if(!intent)return draftNotFound();return intentResponse(intent);
 }
 async publish(id:string,intentId:string,access:DraftAccess):Promise<CreationPublication>{
  if(!access.principal)throw new UnauthorizedException({code:"SESSION_REQUIRED"});
  return this.drafts.database.$transaction(async tx=>{
   await this.drafts.access(tx,id,access);await tx.$queryRaw`SELECT id FROM "EventCreationDraft" WHERE id=${id}::uuid FOR UPDATE`;
   const row=await this.drafts.access(tx,id,access);assertCsrf(id,access,this.drafts.config.hmacSecret,!row.ownerId);
   await tx.$queryRaw`SELECT id FROM "EventPublishIntent" WHERE id=${intentId}::uuid FOR UPDATE`;
   const intent=await tx.eventPublishIntent.findUnique({where:{id:intentId}});if(!intent||intent.draftId!==id||intent.browserHash!==browser(access))return draftNotFound();
   if(intent.resultEventId&&row.resultEventId===intent.resultEventId){if(row.ownerId!==access.principal!.userId)return draftNotFound();return {eventId:intent.resultEventId,draft:this.drafts.present(row,access),user:presentUser(await tx.user.findUniqueOrThrow({where:{id:row.ownerId}}))};}
   if(intent.expiresAt.getTime()<=Date.now())throw new ConflictException({code:"PUBLISH_INTENT_EXPIRED"});
   const draft=eventCreationDraftSchema.parse(row.aggregate);
   if(row.editingEventId||!["active","claimed"].includes(row.state)||intent.revision!==row.revision||intent.aggregateHash!==hash(draft))throw new ConflictException({code:"PUBLISH_INTENT_STALE"});
   await this.ready(tx,id,draft);
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${access.principal!.userId}::uuid FOR UPDATE`;
   const user=await ensureOrganizer(tx,access.principal!.userId,this.authConfig.organizerRequiresApproval),eventId=randomUUID();
   await tx.eventCreationDraft.update({where:{id},data:{ownerId:user.id,capabilityHash:null,capabilityExpiresAt:null,state:"publishing"}});
   await tx.event.create({data:{id:eventId,organizerId:user.id,...eventData(draft),creationVersion:2,saleMode:draft.selectedMode,currency:draft.currency,refundPolicyRevision:1}});
   await persistSelectedSale(tx,eventId,user.id,draft,this.drafts.currencies);
   await this.persistPresentation(tx,eventId,draft);
   await tx.event.update({where:{id:eventId},data:{status:"published",publishedAt:new Date(),v2State:"reconciled",revision:1}});
   const completed=await tx.eventCreationDraft.update({where:{id},data:{state:"published",resultEventId:eventId,revision:{increment:1},expiresAt:new Date(Date.now()+this.drafts.config.ownedSeconds*1000)}});
   await tx.eventPublishIntent.update({where:{id:intentId},data:{consumedAt:new Date(),resultEventId:eventId}});
   await this.record(tx,eventId,user.id,"event.published",{draftId:id,intentId});
   return {eventId,draft:this.drafts.present(completed,access),user:presentUser(user)};
  },{timeout:30000});
 }
 async persistPresentation(tx:DraftTransaction,eventId:string,draft:EventCreationDraftV2){
  for(const locale of EVENT_LOCALES){const content=draft.content[locale];if(content)await tx.eventContent.upsert({where:{eventId_locale:{eventId,locale}},create:{eventId,locale,title:content.title??null,summary:content.summary??null,description:content.description??null,venueName:content.venueName??null,address:content.address??null,refundConditions:content.refundConditions??null,fieldMetadata:json(draft.metadata[locale]??{}),managedBy:"editor"},update:{title:content.title??null,summary:content.summary??null,description:content.description??null,venueName:content.venueName??null,address:content.address??null,refundConditions:content.refundConditions??null,fieldMetadata:json(draft.metadata[locale]??{}),revision:{increment:1},managedBy:"editor"}});}
  const types=await tx.ticketType.findMany({where:{eventId},include:{tariff:true}});
  for(const type of types){const row=type.tariffId?draft.paidSeated?.tariffs.find(row=>row.id===type.tariffId):[draft.free,...draft.paidGeneral].find(row=>row.id===type.id);if(row)await this.persistSaleText(tx,"ticketTypeContent",type.id,row,draft);}
  const layout=await tx.venueLayout.findUnique({where:{eventId},include:{tables:true,rows:true,tariffs:true}});
  if(layout){for(const tariff of layout.tariffs){const row=draft.paidSeated?.tariffs.find(row=>row.id===tariff.id);if(row)await this.persistSaleText(tx,"hallTariffContent",tariff.id,row,draft);}for(const table of layout.tables){const row=draft.paidSeated?.tariffs.find(row=>row.id===table.tariffId);if(row)await this.persistSaleText(tx,"tableContent",table.id,row,draft);}for(const item of layout.rows){const row=draft.paidSeated?.tariffs.find(row=>row.id===item.tariffId);if(row)await this.persistSaleText(tx,"venueRowContent",item.id,row,draft);}}
  await tx.eventMedia.deleteMany({where:{eventId}});
  for(const [slot,assetId] of draft.media.slots.entries()){if(!assetId)continue;await tx.mediaAsset.update({where:{id:assetId},data:{eventId,publishedAt:new Date()}});await tx.eventMedia.create({data:{eventId,assetId,slot,isCard:assetId===draft.media.cardAssetId,isBackground:assetId===draft.media.backgroundAssetId,crops:json(assetMediaCrop(draft.media,assetId))}});for(const locale of EVENT_LOCALES){const caption=draft.media.captions[assetId]?.[locale];if(caption!==undefined)await tx.mediaAssetContent.upsert({where:{assetId_locale:{assetId,locale}},create:{assetId,locale,caption,fieldMetadata:json(draft.metadata[locale]?.[`media.${assetId}.caption`]??{})},update:{caption,fieldMetadata:json(draft.metadata[locale]?.[`media.${assetId}.caption`]??{})}});}}
  const card=draft.media.cardAssetId,urls=draft.media.slots.filter(id=>id!==null).map(id=>`/media/events/${eventId}/${id}/display`);
  await tx.event.update({where:{id:eventId},data:{posterUrl:card?`/media/events/${eventId}/${card}/display`:null,galleryUrls:urls}});
 }
 private async persistSaleText(tx:DraftTransaction,model:"ticketTypeContent"|"hallTariffContent"|"tableContent"|"venueRowContent",id:string,row:{id:string;content:EventCreationDraftV2["free"]["content"]},draft:EventCreationDraftV2){
  for(const locale of EVENT_LOCALES){const content=row.content[locale];if(!content)continue;const data={name:content.name??null,description:content.description??null,fieldMetadata:json(Object.fromEntries(["name","description"].flatMap(field=>draft.metadata[locale]?.[`sale.${row.id}.${field}`]?[[field,draft.metadata[locale]![`sale.${row.id}.${field}`]]]:[]))),managedBy:"editor"};
   if(model==="ticketTypeContent")await tx.ticketTypeContent.upsert({where:{ticketTypeId_locale:{ticketTypeId:id,locale}},create:{ticketTypeId:id,locale,...data},update:data});
   if(model==="hallTariffContent")await tx.hallTariffContent.upsert({where:{tariffId_locale:{tariffId:id,locale}},create:{tariffId:id,locale,...data},update:data});
   if(model==="tableContent")await tx.tableContent.upsert({where:{tableId_locale:{tableId:id,locale}},create:{tableId:id,locale,...data},update:data});
   if(model==="venueRowContent")await tx.venueRowContent.upsert({where:{rowId_locale:{rowId:id,locale}},create:{rowId:id,locale,...data},update:data});
  }
 }
 async openOwned(eventId:string,access:DraftAccess){
  if(!access.principal)throw new UnauthorizedException({code:"SESSION_REQUIRED"});
  return this.drafts.database.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${eventId}::uuid FOR UPDATE`;
   const event=await tx.event.findFirst({where:{id:eventId,organizerId:access.principal!.userId}});if(!event)return draftNotFound();
   const existing=await tx.eventCreationDraft.findFirst({where:{editingEventId:eventId,ownerId:access.principal!.userId,state:"claimed",expiresAt:{gt:new Date()}},orderBy:{updatedAt:"desc"}});if(existing)return this.drafts.present(existing,access);
   const aggregate=await eventAggregate(tx,event),row=await tx.eventCreationDraft.create({data:{ownerId:access.principal!.userId,state:"claimed",editingEventId:eventId,baseEventRevision:event.revision,aggregate:draftJson(aggregate),expiresAt:new Date(Date.now()+this.drafts.config.ownedSeconds*1000)}});return this.drafts.present(row,access);
  },{timeout:15000});
 }
 async saveOwned(id:string,access:DraftAccess,revision:number){
  if(!access.principal)throw new UnauthorizedException({code:"SESSION_REQUIRED"});
  return this.drafts.database.$transaction(async tx=>{
   const row=await this.drafts.locked(tx,id,access,revision);if(!row.editingEventId)return draftNotFound();
   await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${row.editingEventId}::uuid FOR UPDATE`;
   const event=await tx.event.findUniqueOrThrow({where:{id:row.editingEventId}});if(event.organizerId!==access.principal!.userId)return draftNotFound();if(row.baseEventRevision!==event.revision)throw new ConflictException({code:"EVENT_REVISION_CONFLICT"});
   const previous=await eventAggregate(tx,event),draft=eventCreationDraftSchema.parse(row.aggregate);await this.ready(tx,id,draft,event.id);
   if(saleStructure(previous)!==saleStructure(draft))throw new ConflictException({code:"SALE_STRUCTURE_LOCKED"});
   const policyChanged=previous.refundsAvailable!==draft.refundsAvailable||EVENT_LOCALES.some(locale=>previous.content[locale]?.refundConditions!==draft.content[locale]?.refundConditions);
   await tx.event.update({where:{id:event.id},data:{...eventData(draft),refundPolicyRevision:event.refundPolicyRevision+(policyChanged?1:0)}});
   await this.persistPresentation(tx,event.id,draft);
   const eventUpdated=await tx.event.update({where:{id:event.id},data:{v2State:"reconciled",revision:event.revision+1}});
   const updated=await tx.eventCreationDraft.update({where:{id},data:{baseEventRevision:event.revision+1}});
   const changedFields=[...(JSON.stringify(previous.schedule)!==JSON.stringify(draft.schedule)?["date","time","timezone"]:[]),...(["venueName","address","description"] as const).filter(field=>previous.content[draft.sourceLocale]?.[field]!==draft.content[draft.sourceLocale]?.[field]),...(policyChanged?["cancellationTerms"]:[])];
   await this.record(tx,event.id,access.principal!.userId,"event.updated",{changedFields,eventUpdatedAt:eventUpdated.updatedAt.toISOString()});return this.drafts.present(updated,access);
  },{timeout:30000});
 }
 private async record(tx:DraftTransaction,id:string,userId:string,action:string,payload:Record<string,unknown>){await tx.auditLog.create({data:{actorId:userId,action,entityType:"event",entityId:id,meta:json(payload)}});await tx.outboxEvent.create({data:{eventType:action,aggregateType:"event",aggregateId:id,payload:json(payload)}});}
}
