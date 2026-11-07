"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizerEvent, VenueLayout, VenueTemplateList } from '@event-platform/shared-types';
import { apiRequest } from '../../app/(auth)/_lib/api';
import { getSession } from '../../app/(auth)/_lib/session';
import { importLayout } from '../../app/organizer/venue-builder/_components/hall-state';
import type { DraftStudioOptions } from '../../app/organizer/venue-builder/_components/hall-studio';
import { useTheme } from '../theme-provider';
import { HallBuilder } from './hall-builder';
import { builderToVenue, venueToBuilder } from './venue-adapter';
import { validateImport,withInitialCategory } from './model.mjs';
import type { BuilderHall, BuilderHost, BuilderLibraryItem } from './types';

type EventHeader=Pick<OrganizerEvent,'status'|'title'|'currency'|'sourceLocale'>;
export interface StudioProps {eventId:string;initial?:{layout:VenueLayout;event:EventHeader};request?:typeof apiRequest;draftStudio?:DraftStudioOptions}

export function ConnectedHallStudio({eventId,initial,request=apiRequest,draftStudio}:StudioProps){
  const router=useRouter(),{theme,toggle}=useTheme();
  const [data,setData]=useState<{layout:VenueLayout;event:EventHeader;hall:BuilderHall}|null>(null),[error,setError]=useState(''),[stale,setStale]=useState(false),[recovery,setRecovery]=useState<{hall:BuilderHall;revision:number}|null>(null),[epoch,setEpoch]=useState(0);
  const [library,setLibrary]=useState<BuilderLibraryItem[]>([]),[libraryError,setLibraryError]=useState('');
  const layoutRef=useRef<VenueLayout|null>(null),latest=useRef<BuilderHall|null>(null),ack=useRef(''),pending=useRef(false),staleRef=useRef(false),queue=useRef<Promise<void>>(Promise.resolve());
  const fragmentStorageKey=`ticket.hall-builder:fragments:${getSession()?.user.id??'anonymous'}`;
  const recoveryKey=`ticket.hall-builder:${eventId}`,exponent=draftStudio?.currency.exponent??2;
  const readHall=useCallback((layout:VenueLayout,currency:string)=>validateImport(withInitialCategory(venueToBuilder(importLayout(layout),{id:layout.id,name:layout.templateName||'Основной зал',currency,revision:layout.revision,exponent}))),[exponent]);
  useEffect(()=>{let live=true;void(async()=>{
    try{
      const event=initial?.event??await request<OrganizerEvent>(`/api/organizer/events/${eventId}`);
      let layout=initial?.layout;
      if(!layout){try{layout=await request<VenueLayout>(`/api/organizer/events/${eventId}/venue-layout`);}catch(reason){if(event.status!=='draft'||!(reason instanceof Error)||!/not found|не найден|табылмады/i.test(reason.message))throw reason;layout=await request<VenueLayout>(`/api/organizer/events/${eventId}/venue-layout`,{method:'POST',body:JSON.stringify({layoutJson:{version:2,room:{widthM:24,heightM:16},tables:[],rows:[]}})});}}
      const hall=readHall(layout,draftStudio?.currency.code??event.currency??'KZT');if(!live)return;
      layoutRef.current=layout;latest.current=hall;ack.current=JSON.stringify(hall);setData({layout,event,hall});
      try{const value=JSON.parse(localStorage.getItem(recoveryKey)??'null') as {hall:unknown;revision:number}|null;if(value){const saved=validateImport(value.hall);if(saved.id===hall.id&&JSON.stringify(saved)!==ack.current)setRecovery({hall:saved,revision:value.revision});}}catch{/* Corrupt recovery never replaces server geometry. */}
    }catch(reason){if(live)setError(reason instanceof Error?reason.message:'Не удалось загрузить зал');}
  })();return()=>{live=false;};},[eventId,initial,request,draftStudio?.currency.code,readHall,recoveryKey]);
  useEffect(()=>{let live=true;const session=getSession();if(!session){setLibraryError('Войдите в аккаунт организатора, чтобы использовать личную библиотеку залов.');return;}
    void(async()=>{try{const items:BuilderLibraryItem[]=[];let page=1,hasNext=true,unsupported=0;while(hasNext){const response=await apiRequest<VenueTemplateList>(`/api/organizer/venue-layout-templates?limit=50&page=${page++}`);for(const layout of response.items){try{items.push({id:layout.id,hall:readHall(layout,layout.currency??layout.tables[0]?.currency??layout.rows[0]?.currency??data?.hall.currency??'KZT'),updatedAt:Date.parse(layout.updatedAt),archived:layout.archived??false});}catch{unsupported++;}}hasNext=response.hasNext;}if(live){setLibrary(items);setLibraryError(unsupported?'Часть старых схем доступна в предыдущем редакторе: откройте «Меню схемы».':'');}}catch(reason){if(live)setLibraryError(reason instanceof Error?reason.message:'Не удалось загрузить библиотеку');}})();return()=>{live=false;};},[readHall,data?.hall.currency]);
  const onChange=useCallback((hall:BuilderHall)=>{latest.current=hall;pending.current=true;try{localStorage.setItem(recoveryKey,JSON.stringify({hall,revision:layoutRef.current?.revision}));}catch{/* Server save and unload protection still work if browser storage is full. */}},[recoveryKey]);
  const save=useCallback((hall:BuilderHall):Promise<void>=>{
    const job=queue.current.catch(()=>{}).then(async()=>{
      if(staleRef.current)throw new Error('Схема изменилась в другом окне. Перезагрузите страницу; ваши правки сохранены для восстановления.');
      if(!layoutRef.current||!data||data.event.status!=='draft')return;
      const fingerprint=JSON.stringify(hall);if(fingerprint===ack.current)return;
      const state=builderToVenue(hall,exponent),layout=layoutRef.current;
      try{const updated=await request<VenueLayout>(`/api/organizer/venue-layouts/${layout.id}`,{method:'PATCH',body:JSON.stringify({revision:layout.revision,templateName:hall.name.trim()||'Основной зал',layoutJson:{version:2,room:state.room,editor:state.editor,tables:[],rows:[]}})});
        layoutRef.current=updated;ack.current=fingerprint;
        if(JSON.stringify(latest.current)===fingerprint){pending.current=false;try{localStorage.removeItem(recoveryKey);}catch{/* A successful server save stays successful if browser storage is blocked. */}}
      }catch(reason){if(reason instanceof Error&&/revision|conflict|перезагруз|reload|layout changed|схем.*измен|сызба.*өзгер/i.test(reason.message)){staleRef.current=true;setStale(true);}throw reason;}
    });queue.current=job;return job;
  },[data,exponent,recoveryKey,request]);
  const backHref=draftStudio?.backHref??`/organizer/events/${eventId}/edit?step=5`;
  const leave=useCallback(async()=>{if(staleRef.current){router.push(backHref);return;}if(latest.current)await save(latest.current);if(draftStudio)await draftStudio.onFinish();else router.push(backHref);},[save,draftStudio,router,backHref]);
  const saveLibrary=useCallback(async(hall:BuilderHall)=>{
    if(!getSession())throw new Error('Войдите в аккаунт организатора, чтобы сохранить зал в личной библиотеке.');
    const state=builderToVenue(hall,exponent);
    const layout=await apiRequest<VenueLayout>('/api/organizer/venue-layout-templates',{method:'POST',body:JSON.stringify({name:hall.name,currency:hall.currency,locale:draftStudio?.locale??data?.event.sourceLocale??'ru',layoutJson:{version:2,room:state.room,editor:state.editor,tables:[],rows:[]}})});
    const item={id:layout.id,hall:readHall(layout,hall.currency),updatedAt:Date.parse(layout.updatedAt),archived:false};
    setLibrary(items=>[item,...items.filter(old=>old.id!==item.id)]);
    return item;
  },[exponent,readHall,draftStudio?.locale,data?.event.sourceLocale]);
  const updateLibrary=useCallback(async(id:string,patch:{name?:string;archived?:boolean})=>{
    const layout=await apiRequest<VenueLayout>(`/api/organizer/venue-layouts/${id}`,{method:'PATCH',body:JSON.stringify({...(patch.name?{templateName:patch.name}:{}),...(patch.archived===undefined?{}:{archived:patch.archived})})});
    setLibrary(items=>items.map(item=>item.id===id?{id:layout.id,hall:readHall(layout,layout.currency??item.hall.currency),updatedAt:Date.parse(layout.updatedAt),archived:layout.archived??false}:item));
  },[readHall]);
  const host=useMemo<BuilderHost|null>(()=>data?{initialHall:data.hall,recoveryKey,fragmentStorageKey,readOnly:data.event.status!=='draft'||stale,theme,toggleTheme:toggle,save,onChange,hasUnsavedChanges:()=>pending.current,onBack:leave,onFinish:leave,library,libraryError,saveLibrary,updateLibrary}:null,[data,recoveryKey,fragmentStorageKey,stale,theme,toggle,save,onChange,leave,library,libraryError,saveLibrary,updateLibrary]);
  if(error)return <div role="alert" className="p-6"><p>{error}</p><button className="mt-4 rounded-xl border border-ticket-border px-4 py-2" onClick={()=>{const url=new URL(window.location.href);url.searchParams.set('editor','classic');window.location.assign(url.href);}}>Открыть предыдущий редактор</button></div>;
  if(!host)return <div role="status" className="p-6">Загружаем схему зала…</div>;
  if(recovery)return <div className="fixed inset-0 z-[70] grid place-items-center bg-ticket-bg p-6"><section className="max-w-lg rounded-2xl border border-ticket-border bg-ticket-surface p-6"><h1 className="text-xl font-bold">Есть несохранённая схема</h1><p className="my-4">{recovery.revision===layoutRef.current?.revision?'Восстановить ваши последние правки?':'Версия на сервере изменилась. Восстановление заменит её вашими локальными правками; сначала проверьте схему.'}</p><button className="mr-4 rounded-xl bg-ticket-primary px-4 py-2 text-white" disabled={host.readOnly} onClick={()=>{onChange(recovery.hall);setData(value=>value?{...value,hall:recovery.hall}:value);setRecovery(null);setEpoch(n=>n+1);}}>Восстановить правки</button><button onClick={()=>{localStorage.removeItem(recoveryKey);setRecovery(null);}}>Открыть серверную версию</button></section></div>;
  return <div className="ticket-hall-builder"><HallBuilder key={`${eventId}:${epoch}`} host={host}/></div>;
}
