import { editorHallV3,hallV3Editor,type CreationDraftResponse,type EventLocale,type VenueLayout,type VenueLayoutJsonV2 } from "@event-platform/shared-types";
import { DraftAutosave,creationDraftRequest,DraftRequestError } from "./creation-draft-client";
import type { apiRequest } from "../app/(auth)/_lib/api";
export function draftHallPresentation(client:DraftAutosave,locale:EventLocale):VenueLayout{
  const hall=client.aggregate.paidSeated??{version:3 as const,room:{widthM:24,heightM:16},objects:[],tariffs:[]};
  return {id:client.saved.id,eventId:null,organizerId:null,templateName:client.aggregate.content[client.aggregate.sourceLocale]?.title??"",layoutJson:{version:2,room:hall.room,editor:hallV3Editor(hall,locale),tables:[],rows:[]},revision:client.saved.revision,tables:[],rows:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
}
/** Reuses the studio's geometry/undo/revision flow, with capability-scoped I/O. */
export function draftHallAdapter(client:DraftAutosave,locale:EventLocale):typeof apiRequest{
  return async<T>(path:string,init:RequestInit={}):Promise<T>=>{
    const id=client.saved.id;
    if(path===`/api/organizer/venue-layouts/${id}`&&init.method==="PATCH"){
      const body=JSON.parse(String(init.body)) as {revision:number;layoutJson:VenueLayoutJsonV2};
      await client.mutation(async saved=>{
        if(saved.revision!==body.revision)throw new DraftRequestError("DRAFT_REVISION_CONFLICT",409,saved.revision);
        const paidSeated=editorHallV3(body.layoutJson.room,body.layoutJson.editor!,saved.aggregate.paidSeated,locale);
        const draft=await creationDraftRequest<CreationDraftResponse>(`/api/creation-drafts/${id}`,{method:"PATCH",headers:{"content-type":"application/json","x-draft-csrf":saved.csrfToken},body:JSON.stringify({revision:saved.revision,patch:{paidSeated}})});return{draft};
      });return draftHallPresentation(client,locale) as T;
    }
    if(path===`/api/organizer/events/${id}`){await client.reload();return{status:["active","claimed"].includes(client.saved.state)?"draft":"published",title:client.aggregate.content[locale]?.title??"",currency:client.aggregate.currency} as T;}
    if(path===`/api/organizer/events/${id}/venue-layout`)return draftHallPresentation(client,locale) as T;
    if(path==="/api/organizer/venue-layout-templates?limit=50")return{items:[]} as T;
    throw new Error("DRAFT_HALL_OPERATION_UNAVAILABLE");
  };
}
