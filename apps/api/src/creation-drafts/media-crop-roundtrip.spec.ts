import { describe, expect, it, vi } from "vitest";
import type { Event, Prisma } from "@event-platform/database";
import { DEFAULT_MEDIA_CROP, mediaRoleCrops, newEventCreationDraft } from "@event-platform/shared-types";
import { DraftPublicationService } from "./draft-publication.service.js";
import type { CreationDraftsService } from "./creation-drafts.service.js";
import type { AuthConfig } from "../auth/auth.constants.js";
import { eventAggregate } from "./event-aggregate.js";
import { normalizedPresentation } from "../public-events/normalized-presentation.js";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const first={focalX:.3,focalY:.4,zoom:2},second={focalX:.6,focalY:.7,zoom:1.5};
function fixture(legacy=false){
  const event={id:id(1),creationVersion:2,v2State:"reconciled",saleMode:"free",sourceLocale:"ru",currency:"KZT",category:"music",countryCode:"KZ",city:"Алматы",ageRestriction:0,latitude:null,longitude:null,refundsAvailable:false,refundPolicyRevision:1,startsAt:new Date("2027-10-20T15:00:00Z"),endsAt:null,timezone:"Asia/Almaty"} as Event;
  const links=[{assetId:id(2),slot:0,isCard:true,isBackground:false,galleryVisible:true,crops:legacy?mediaRoleCrops(first):first},{assetId:id(3),slot:1,isCard:false,isBackground:true,galleryVisible:true,crops:legacy?{...mediaRoleCrops(DEFAULT_MEDIA_CROP),backgroundDesktop:second}:second}].map(link=>({...link,asset:{kind:"image",width:1600,height:900,contents:[]}}));
  const tx={eventCreationDraft:{findUnique:vi.fn(async()=>null)},eventContent:{findMany:vi.fn(async()=>[{locale:"ru",title:"Концерт",description:"Программа",address:"Адрес",refundConditions:null,fieldMetadata:{}}])},ticketType:{findMany:vi.fn(async()=>[{id:id(4),status:"active",price:0,quantityTotal:20,contents:[{locale:"ru",name:"Вход",description:"",fieldMetadata:{}}]}])},eventMedia:{findMany:vi.fn(async()=>links)},ticketTypeContent:{findMany:vi.fn(async()=>[])},tableContent:{findMany:vi.fn(async()=>[])}} as unknown as Prisma.TransactionClient;
  return {event,tx};
}
describe("published per-image crop roundtrip",()=>{
  it("writes only the image's crop and preserves the original asset storage during publication",async()=>{
    const draft=newEventCreationDraft(id(8));draft.media.slots=[id(2),id(3),null,null,null];draft.media.cardAssetId=id(2);draft.media.backgroundAssetId=id(3);draft.media.assetCrops={[id(2)]:first,[id(3)]:second};
    const create=vi.fn(async(_args:unknown)=>({})),update=vi.fn(async(_args:{data:Record<string,unknown>})=>({}));
    const tx={eventContent:{upsert:vi.fn()},ticketType:{findMany:vi.fn(async()=>[])},venueLayout:{findUnique:vi.fn(async()=>null)},eventMedia:{deleteMany:vi.fn(),create},mediaAsset:{update},event:{update:vi.fn()}} as unknown as Prisma.TransactionClient;
    const service=new DraftPublicationService({} as CreationDraftsService,{} as AuthConfig);
    await service.persistPresentation(tx,id(1),draft);
    expect(create.mock.calls.map(call=>call[0])).toEqual([
      {data:{eventId:id(1),assetId:id(2),slot:0,isCard:true,isBackground:false,crops:first}},
      {data:{eventId:id(1),assetId:id(3),slot:1,isCard:false,isBackground:true,crops:second}},
    ]);
    for(const [args] of update.mock.calls)expect(Object.keys(args.data).sort()).toEqual(["eventId","publishedAt"]);
  });
  it.each([false,true])("reconstructs different crops and reuses each across gallery/card/background (legacy=%s)",async legacy=>{
    const {event,tx}=fixture(legacy),draft=await eventAggregate(tx,event);
    expect(draft.media.assetCrops).toEqual({[id(2)]:first,[id(3)]:second});
    const presented=await normalizedPresentation(tx,event,"ru");
    expect(presented?.fields.media[0]?.crops).toEqual(mediaRoleCrops(first));
    expect(presented?.fields.media[1]?.crops).toEqual(mediaRoleCrops(second));
    expect(presented?.fields.media.map(asset=>asset.url)).toEqual([`/media/events/${id(1)}/${id(2)}/display`,`/media/events/${id(1)}/${id(3)}/display`]);
  });
});
