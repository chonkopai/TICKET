"use client";
import { useEffect } from "react";
import { useLocale } from "../../components/locale-provider";
import { localeUrl } from "../../lib/locale";
import { QUICK_EXTRA } from "../../lib/quick-copy";

// Old purchase links retain their selection and continue in the event's booking panel.
export default function QuickCheckoutPage() {
 const locale=useLocale();
 useEffect(()=>{
  const search=new URLSearchParams(window.location.search),eventId=search.get("event");
  if(!eventId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)){window.location.replace(localeUrl("/",locale));return;}
  const next=new URLSearchParams();
  if(search.has("cart"))next.set("cart",search.get("cart")!);
  else if(search.has("seats"))next.set("seats",search.get("seats")!);
  else {
   const [kind,id]=search.get("choice")?.split(":")??[];
   if(id&&kind==="ticket")next.set("cart",JSON.stringify({tickets:[{ticketTypeId:id,quantity:Number(search.get("quantity"))||1}],seatIds:[]}));
   if(id&&kind==="table")next.set("cart",JSON.stringify({tickets:[],tableId:id,seatIds:[]}));
  }
  window.location.replace(localeUrl(`/events/${eventId}${next.size?`?${next}`:""}#tickets`,locale));
 },[locale]);
 return <main className="mx-auto max-w-3xl px-5 py-24"><p role="status">{QUICK_EXTRA[locale].loading}</p></main>;
}
