"use client";
import { useEffect,useMemo,useState } from "react";
import { useRouter,useSearchParams } from "next/navigation";
import type { EventLocale } from "@event-platform/shared-types";
import { Studio } from "../../../organizer/venue-builder/_components/hall-studio";
import { ThemeToggle } from "../../../../components/theme-toggle";
import { useLocale } from "../../../../components/locale-provider";
import { isLocale } from "../../../../lib/locale";
import { DraftAutosave,openCreationDraft } from "../../../../lib/creation-draft-client";
import { draftHallAdapter,draftHallPresentation } from "../../../../lib/draft-hall-adapter";
export function DraftHallPage(){const params=useSearchParams(),locale=useLocale(),id=params.get("draftId")??undefined,[client,setClient]=useState<DraftAutosave|null>(null),[error,setError]=useState("");const returnContentLocale=isLocale(params.get("contentLocale"))?params.get("contentLocale") as EventLocale:locale;useEffect(()=>{let live=true;if(!id){setError("DRAFT_NOT_FOUND");return;}void openCreationDraft(locale,id).then(value=>{if(live)setClient(value);}).catch(reason=>{if(live)setError(reason.message);});return()=>{live=false;};},[id,locale]);return client?<DraftStudio client={client} locale={locale} returnContentLocale={returnContentLocale}/>:<div className="flex items-center justify-between p-6"><p role={error?"alert":"status"}>{error||"…"}</p><ThemeToggle /></div>;}
function DraftStudio({client,locale,returnContentLocale}:{client:DraftAutosave;locale:EventLocale;returnContentLocale:EventLocale}){
  const router=useRouter(),contentLocale=client.aggregate.sourceLocale;const initial=useMemo(()=>({layout:draftHallPresentation(client,contentLocale),event:{status:"draft" as const,venueName:client.aggregate.content[contentLocale]?.venueName??"",currency:client.aggregate.currency}}),[client,contentLocale]);
  const request=useMemo(()=>draftHallAdapter(client,contentLocale),[client,contentLocale]);
  const backHref=`/events/create?draftId=${client.saved.id}&lang=${locale}&contentLocale=${returnContentLocale}`;
  const options=useMemo(()=>({currency:{code:client.aggregate.currency,exponent:2},locale:contentLocale,backHref,onFinish:async()=>{await client.flush();router.push(backHref);}}),[client,contentLocale,backHref,router]);
  return <Studio eventId={client.saved.id} initial={initial} request={request} draftStudio={options}/>;
}
