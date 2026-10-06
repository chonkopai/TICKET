import type { Event,Prisma } from "@event-platform/database";
import { EVENT_LOCALES,readMediaCrop,eventCreationDraftSchema,newEventCreationDraft,isoToZonedInput,type EventCreationDraftV2,type EventLocale,type PublishedHallV3 } from "@event-platform/shared-types";
import { randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
export function normalizedEvent(event:Pick<Event,"creationVersion"|"v2State">){return event.creationVersion===2||process.env.EVENT_CONTENT_V2_ENABLED==="true"&&event.v2State==="reconciled";}
/** Published reads reconstruct the selected resources from normalized records. */
export async function eventAggregate(tx:Prisma.TransactionClient,event:Event):Promise<EventCreationDraftV2>{
 if(!normalizedEvent(event)||event.v2State!=="reconciled")throw new ConflictException({code:"EVENT_RECONCILIATION_REQUIRED"});
 const original=await tx.eventCreationDraft.findUnique({where:{resultEventId:event.id}});
 const draft=original?eventCreationDraftSchema.parse(original.aggregate):newEventCreationDraft(randomUUID(),event.sourceLocale as EventLocale);
 draft.selectedMode=event.saleMode;draft.currency=event.currency!.trim();draft.sourceLocale=event.sourceLocale as EventLocale;draft.content={};draft.metadata={};
 draft.classification={category:event.category,countryCode:event.countryCode as EventCreationDraftV2["classification"]["countryCode"],city:event.city,ageRestriction:event.ageRestriction as EventCreationDraftV2["classification"]["ageRestriction"]};
 draft.coordinates=event.latitude!==null&&event.longitude!==null?{latitude:event.latitude,longitude:event.longitude}:null;
 draft.refundsAvailable=event.refundsAvailable;draft.schedule={startLocal:isoToZonedInput(event.startsAt!.toISOString(),event.timezone),endLocal:event.endsAt?isoToZonedInput(event.endsAt.toISOString(),event.timezone):null,timezone:event.timezone,startChoice:null,endChoice:null};
 // Retain the exact occurrence at a repeated DST time.
 const {localTimeCandidates}=await import("@event-platform/shared-types");for(const side of ["start","end"] as const){const value=draft.schedule[`${side}Local`],instant=side==="start"?event.startsAt:event.endsAt;if(value&&instant&&localTimeCandidates(value,event.timezone).length>1)draft.schedule[`${side}Choice`]=localTimeCandidates(value,event.timezone)[0]===instant.toISOString()?"earlier":"later";}
 const contents=await tx.eventContent.findMany({where:{eventId:event.id}});
 for(const row of contents){const locale=row.locale as EventLocale;draft.content[locale]={title:row.title??"",description:row.description??"",address:row.address??"",refundConditions:row.refundConditions??""};draft.metadata[locale]=row.fieldMetadata as EventCreationDraftV2["metadata"][EventLocale];}
 const types=await tx.ticketType.findMany({where:{eventId:event.id,isInternal:false,venueObjectId:null},include:{contents:true}});
 const sales=types.map(type=>({id:type.id,active:type.status==="active",amount:type.price,capacity:type.quantityTotal,content:Object.fromEntries(type.contents.map(row=>[row.locale,{name:row.name??"",description:row.description??""}]))}));
 const addMetadata=(id:string,rows:Array<{locale:string;fieldMetadata:Prisma.JsonValue}>)=>{for(const row of rows){const locale=row.locale as EventLocale,metadata=row.fieldMetadata as Record<string,unknown>;draft.metadata[locale]??={};for(const field of ["name","description"])if(metadata?.[field])draft.metadata[locale]![`sale.${id}.${field}`]=metadata[field] as NonNullable<EventCreationDraftV2["metadata"][EventLocale]>[string];}};
 for(const type of types)addMetadata(type.id,type.contents);
 if(event.saleMode==="free"&&sales[0])draft.free=sales[0];if(event.saleMode==="paid_general")draft.paidGeneral=sales;
 if(event.saleMode==="paid_seated"){
  const layout=await tx.venueLayout.findUnique({where:{eventId:event.id},include:{tariffs:{include:{contents:true}}}});if(!layout)throw new ConflictException({code:"HALL_REQUIRED"});
  const geometry=layout.layoutJson as unknown as PublishedHallV3;
  draft.paidSeated={version:3,room:geometry.room,objects:geometry.objects,tariffs:layout.tariffs.map(tariff=>({id:tariff.id,active:tariff.active,amount:tariff.price,color:geometry.tariffStyles[tariff.id],content:Object.fromEntries(tariff.contents.map(row=>[row.locale,{name:row.name??"",description:row.description??""}]))}))} as unknown as EventCreationDraftV2["paidSeated"];
  for(const tariff of layout.tariffs)addMetadata(tariff.id,tariff.contents);
 }
 const links=await tx.eventMedia.findMany({where:{eventId:event.id},include:{asset:{include:{contents:true}}},orderBy:{slot:"asc"}});
 draft.media.slots=[null,null,null,null,null];draft.media.captions={};draft.media.assetCrops={};draft.media.cardAssetId=null;draft.media.backgroundAssetId=null;
 for(const link of links){draft.media.slots[link.slot]=link.assetId;if(link.isCard)draft.media.cardAssetId=link.assetId;if(link.isBackground)draft.media.backgroundAssetId=link.assetId;draft.media.assetCrops[link.assetId]=readMediaCrop(link.crops,link.isBackground&&!link.isCard?"backgroundDesktop":"card");for(const content of link.asset.contents){const locale=content.locale as EventLocale;draft.media.captions[link.assetId]??={};draft.media.captions[link.assetId]![locale]=content.caption??"";const meta=content.fieldMetadata as unknown as NonNullable<EventCreationDraftV2["metadata"][EventLocale]>[string];if(meta&&"origin" in meta){draft.metadata[locale]??={};draft.metadata[locale]![`media.${link.assetId}.caption`]=meta;}}}
 return eventCreationDraftSchema.parse(draft);
}
export const localeCodes=EVENT_LOCALES;
