"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { hallV3Editor, type EventLocale, type DraftHallV3 } from '@event-platform/shared-types';
import type { DraftAutosave } from '../../lib/creation-draft-client';
import { getSession } from '../../app/(auth)/_lib/session';
import { canonicalEventHall, hallForEvent, loadEventHallLibrary, saveEventHallLibrary, updateEventHallLibrary, usesAccountHallLibrary } from '../../lib/event-hall-library';
import { starterHall, validateImport } from '../hall-builder/model.mjs';
import { venueToBuilder } from '../hall-builder/venue-adapter';
import type { BuilderHall, BuilderHost, BuilderLibraryItem } from '../hall-builder/types';
import { useTheme } from '../theme-provider';
import { CreationIcon } from './creation-ui';
import { HallThumbnail } from './hall-thumbnail';
import './event-hall.css';

const Editor=dynamic(()=>import('../hall-builder/hall-builder').then(module=>module.HallBuilder),{ssr:false,loading:()=> <p role="status" className="event-hall-loading">Загружаем конструктор…</p>});
const text={
  ru:{choose:'Выбрать зал',change:'Другой зал',edit:'Изменить схему',library:'Мои залы',create:'Создать зал',upload:'Загрузить файл',search:'Найти зал',empty:'Сохранённых залов пока нет',emptyHint:'Создайте зал или загрузите экспортированный файл.',device:'Залы сохраняются на этом устройстве. Войдите в аккаунт для личной библиотеки.',close:'Закрыть',back:'Назад к залам',presets:'С чего начнём?',presetHint:'Выберите пример и измените его под своё событие — или начните с пустого зала.',rows:'Ряды мест',rowsHint:'Театр, лекция, концерт',tables:'Столы с местами',tablesHint:'Банкет, ужин, встреча',standing:'Стоячая зона',standingHint:'Клуб, фестиваль, танцпол',emptyHall:'Пустой зал',blankHint:'Своя схема с чистого листа',select:'Выбрать',selected:'Выбран',save:'Сохранить и выбрать',resume:'Продолжить создание',currency:'Валюта отличается. При выборе зала цены будут очищены — назначьте их в валюте события.',unpriced:'Без цены',categories:'Категории цен',guests:'гостей',retry:'Повторить загрузку',seats:'мест',whole:'столов целиком',standingTickets:'входных билетов'},
  en:{choose:'Choose a hall',change:'Change hall',edit:'Edit layout',library:'My halls',create:'Create a hall',upload:'Upload file',search:'Find a hall',empty:'No saved halls yet',emptyHint:'Create a hall or upload an exported file.',device:'Halls are saved on this device. Sign in to use your personal library.',close:'Close',back:'Back to halls',presets:'Where shall we start?',presetHint:'Choose a sample and adapt it to your event, or start with an empty hall.',rows:'Rows of seats',rowsHint:'Theatre, lecture, concert',tables:'Tables with seats',tablesHint:'Banquet, dinner, gathering',standing:'Standing area',standingHint:'Club, festival, dance floor',emptyHall:'Empty hall',blankHint:'Build your own layout',select:'Select',selected:'Selected',save:'Save and select',resume:'Continue creating',currency:'The currency differs. Prices will be cleared when selecting this hall; set them in the event currency.',unpriced:'No price',categories:'Price categories',guests:'guests',retry:'Retry loading',seats:'seats',whole:'whole tables',standingTickets:'admission tickets'},
  kk:{choose:'Залды таңдау',change:'Басқа зал',edit:'Сызбаны өзгерту',library:'Менің залдарым',create:'Зал құру',upload:'Файл жүктеу',search:'Залды табу',empty:'Сақталған залдар әлі жоқ',emptyHint:'Зал құрыңыз немесе экспортталған файлды жүктеңіз.',device:'Залдар осы құрылғыда сақталады. Жеке кітапхана үшін аккаунтқа кіріңіз.',close:'Жабу',back:'Залдарға оралу',presets:'Неден бастаймыз?',presetHint:'Үлгіні таңдап, іс-шараға бейімдеңіз немесе бос залдан бастаңыз.',rows:'Орын қатарлары',rowsHint:'Театр, дәріс, концерт',tables:'Орындары бар үстелдер',tablesHint:'Банкет, кешкі ас, кездесу',standing:'Тұру аймағы',standingHint:'Клуб, фестиваль, би алаңы',emptyHall:'Бос зал',blankHint:'Өз сызбаңызды жасаңыз',select:'Таңдау',selected:'Таңдалды',save:'Сақтау және таңдау',resume:'Құруды жалғастыру',currency:'Валюта басқа. Залды таңдағанда бағалар тазаланады; іс-шара валютасында қайта орнатыңыз.',unpriced:'Баға жоқ',categories:'Баға санаттары',guests:'қонақ',retry:'Қайта жүктеу',seats:'орын',whole:'тұтас үстел',standingTickets:'кіру билеті'},
};
function counts(hall:DraftHallV3){
  const objects=hall.objects,disabled=new Set(objects.filter(o=>o.locked).map(o=>o.id));
  const available=objects.filter(o=>!o.locked&&(!o.parentId||!disabled.has(o.parentId)));
  const tables=new Set(available.filter(o=>(o.type==='table_rect'||o.type==='table_round')&&o.saleMode==='whole_table').map(o=>o.id));
  const chairs=available.filter(o=>o.type==='seat');
  const standing=available.reduce((n,o)=>n+(o.type==='zone'?o.capacity:0),0);
  return {seats:chairs.filter(o=>!o.parentId||!tables.has(o.parentId)).length,tables:tables.size,standing,guests:chairs.length+standing};
}
function HallInfo({hall,locale}:{hall:DraftHallV3;locale:EventLocale}){
  const c=text[locale],s=counts(hall);
  return <div className="event-hall-info"><strong>{hall.name||c.choose}</strong><span>{s.guests} {c.guests} · {hall.room.widthM} × {hall.room.heightM} м</span><small>{s.seats} {c.seats} · {s.tables} {c.whole} · {s.standing} {c.standingTickets}</small></div>;
}
function HallDialog({title,kind,close,children,busy=false}:{title:string;kind:'picker'|'presets'|'editor';close:()=>void;children:ReactNode;busy?:boolean}){
  const dialog=useRef<HTMLDialogElement>(null),closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{const prior=document.activeElement as HTMLElement|null;const before=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.showModal();return()=>{document.body.style.overflow=before;if(prior?.isConnected)prior.focus();};},[]);
  return createPortal(<dialog ref={dialog} aria-label={title} className={`event-hall-dialog event-hall-${kind}`} tabIndex={-1} onCancel={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.preventDefault();e.stopPropagation();closeRef.current();}}} onClick={e=>{if(e.target===dialog.current&&!busy){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeRef.current();}}}>{children}</dialog>,document.body);
}

export function EventHallField({client,locale,contentLocale,locked,exponent}:{client:DraftAutosave;locale:EventLocale;contentLocale:EventLocale;locked:boolean;exponent:number}){
  const c=text[locale],params=useSearchParams(),{theme,toggle}=useTheme();
  const [phase,setPhase]=useState<'picker'|'presets'|'editor'|null>(null),[library,setLibrary]=useState<BuilderLibraryItem[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[working,setWorking]=useState<BuilderHall|null>(null),[resume,setResume]=useState<BuilderHall|null>(null),[selectedId,setSelectedId]=useState<string|null>(null);
  const file=useRef<HTMLInputElement>(null),latest=useRef<BuilderHall|null>(null),savedCopy=useRef<{fingerprint:string;item:BuilderLibraryItem}|null>(null),opening=useRef(false),openedFromLink=useRef(false);
  const selected=client.aggregate.paidSeated,recoveryKey=`ticket.event-hall:working:${client.saved.id}`,selectionKey=`ticket.event-hall:selected:${client.saved.id}`;
  const refresh=useCallback(async()=>{setLoading(true);setError('');try{setLibrary(await loadEventHallLibrary());}catch(reason){setError(reason instanceof Error?reason.message:'Не удалось загрузить залы');}finally{setLoading(false);}},[]);
  const open=useCallback(()=>{if(locked)return;setPhase('picker');setQuery('');void refresh();try{setSelectedId(localStorage.getItem(selectionKey));const saved=localStorage.getItem(recoveryKey);setResume(saved?validateImport(JSON.parse(saved)):null);}catch{setResume(null);}},[locked,refresh,recoveryKey,selectionKey]);
  useEffect(()=>{if(params.get('hall')==='choose'&&!openedFromLink.current){openedFromLink.current=true;open();}},[params,open]);
  const presets=useMemo(()=>['rows','tables','standing','empty'].map(kind=>({kind,hall:starterHall(kind,client.aggregate.currency)})),[client.aggregate.currency]);
  function begin(source:BuilderHall){const next={...source,id:client.saved.id,currency:client.aggregate.currency};latest.current=next;savedCopy.current=null;setWorking(next);setError('');setPhase('editor');}
  function edit(){if(!selected)return;begin(venueToBuilder({room:selected.room,editor:hallV3Editor(selected,client.aggregate.sourceLocale)},{id:client.saved.id,name:selected.name||'Основной зал',currency:client.aggregate.currency,revision:client.saved.revision,exponent}));void refresh();}
  async function attach(hall:BuilderHall,itemId:string){
    client.patch({paidSeated:canonicalEventHall(hall,client.aggregate.sourceLocale,exponent)});await client.flush();
    setSelectedId(itemId);try{localStorage.setItem(selectionKey,itemId);localStorage.removeItem(recoveryKey);}catch{/* Server selection is already durable. */}
    setResume(null);setWorking(null);setPhase(null);
  }
  async function choose(item:BuilderLibraryItem){if(opening.current)return;opening.current=true;setBusy(true);setError('');try{await attach(hallForEvent(item.hall,client.aggregate.currency),item.id);}catch(reason){setError(reason instanceof Error?reason.message:'Не удалось выбрать зал');}finally{opening.current=false;setBusy(false);}}
  const saveWorking=useCallback(async(hall:BuilderHall)=>{localStorage.setItem(recoveryKey,JSON.stringify(hall));latest.current=hall;},[recoveryKey]);
  const saveLibrary=useCallback(async(hall:BuilderHall)=>{const item=await saveEventHallLibrary(hall,client.aggregate.sourceLocale,exponent);savedCopy.current={fingerprint:JSON.stringify(hall),item};setLibrary(items=>[item,...items.filter(old=>old.id!==item.id)]);return item;},[client,exponent]);
  const finish=async()=>{
    if(opening.current||!latest.current)return;opening.current=true;setBusy(true);
    try{const hall=latest.current,fingerprint=JSON.stringify(hall);const item=savedCopy.current?.fingerprint===fingerprint?savedCopy.current.item:await saveLibrary(hall);savedCopy.current={fingerprint,item};await attach(hall,item.id);}finally{opening.current=false;setBusy(false);}
  };
  const back=async()=>{if(latest.current){await saveWorking(latest.current);setResume(latest.current);}setPhase('picker');void refresh();};
  const host:BuilderHost|null=working?{initialHall:working,startInEditor:true,finishLabel:c.save,backLabel:c.back,onOpenClassic:async()=>{await finish();window.location.assign(`/events/create/hall?draftId=${client.saved.id}&lang=${locale}&contentLocale=${contentLocale}&editor=classic`);},savedLabel:locale==='ru'?'Схема сохранена на устройстве':locale==='kk'?'Сызба құрылғыда сақталды':'Layout saved on this device',recoveryKey,fragmentStorageKey:`ticket.hall-builder:fragments:${getSession()?.user.id??'anonymous'}`,readOnly:false,busy,theme,toggleTheme:toggle,save:saveWorking,onChange:hall=>{latest.current=hall;},hasUnsavedChanges:()=>false,onFinish:finish,onBack:back,library,libraryError:error,saveLibrary,updateLibrary:async(id,patch)=>{await updateEventHallLibrary(id,patch);await refresh();}}:null;
  async function upload(input:HTMLInputElement){const value=input.files?.[0];if(!value)return;try{if(value.size>3_000_000)throw new Error('Файл слишком большой (максимум 3 МБ).');const hall=validateImport(JSON.parse(await value.text()));begin(hallForEvent(hall,client.aggregate.currency));}catch(reason){setError(reason instanceof Error?reason.message:'Не удалось открыть файл');}finally{input.value='';}}
  const money=(amount:number|null)=>amount==null?c.unpriced:new Intl.NumberFormat(locale,{style:'currency',currency:client.aggregate.currency,maximumFractionDigits:2}).format(amount/10**exponent);
  return <>
    {selected?<section className="event-hall-selected" aria-label={c.selected}><HallThumbnail hall={selected} locale={locale}/><HallInfo hall={selected} locale={locale}/><div className="event-hall-tariffs" aria-label={c.categories}>{selected.tariffs.map(tariff=><span key={tariff.id}><i style={{background:tariff.color}}/>{tariff.content[contentLocale]?.name||tariff.content[client.aggregate.sourceLocale]?.name} · {money(tariff.amount)}</span>)}</div><div className="event-hall-card-actions"><button className="creation-button" disabled={locked} type="button" onClick={edit}>{c.edit}</button><button className="creation-button" disabled={locked} type="button" onClick={open}>{c.change}</button></div></section>:<button className="creation-button" disabled={locked} type="button" onClick={open}><CreationIcon name="armchair" size={17}/>{c.choose}</button>}
    {phase&&<HallDialog title={phase==='picker'?c.library:phase==='presets'?c.presets:c.edit} kind={phase} busy={busy} close={()=>{if(phase==='editor')void back().catch(reason=>setError(reason.message));else setPhase(null);}}>
      {phase==='editor'&&host?<div className="ticket-hall-builder event-hall-embedded"><Editor key={working!.id} host={host}/></div>:<>
        <header className="event-hall-dialog-heading"><div><h2>{phase==='picker'?c.library:c.presets}</h2>{phase==='presets'&&<p>{c.presetHint}</p>}</div><button type="button" className="event-hall-close" aria-label={c.close} onClick={()=>setPhase(null)}>×</button></header>
        <div className="event-hall-dialog-content">
          {phase==='picker'?<>
            <div className="event-hall-picker-actions"><button type="button" className="creation-button creation-button-primary" disabled={busy} onClick={()=>{setError('');setPhase('presets');}}><svg className="event-hall-create-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><path d="M5 12h14M12 5v14"/></svg>{c.create}</button><button type="button" className="creation-button" disabled={busy} onClick={()=>file.current?.click()}><CreationIcon name="upload" size={17}/>{c.upload}</button></div>
            {!usesAccountHallLibrary()&&<p className="event-hall-device-note">{getSession()?(locale==='ru'?'Залы сохраняются на этом устройстве.':locale==='kk'?'Залдар осы құрылғыда сақталады.':'Halls are saved on this device.'):c.device}</p>}
            {resume&&<button type="button" className="creation-button event-hall-resume" disabled={busy} onClick={()=>begin(hallForEvent(resume,client.aggregate.currency))}>{c.resume} · {resume.name}</button>}
            <input className="creation-input event-hall-search" aria-label={c.search} placeholder={c.search} value={query} onChange={e=>setQuery(e.target.value)}/>
            {loading?<p role="status">…</p>:<div className="event-hall-library">{library.filter(item=>!item.archived&&item.hall.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item=>{const hall=canonicalEventHall(item.hall,locale,exponent),sameCurrency=item.hall.currency===client.aggregate.currency;return <article key={item.id} className="event-hall-library-card" data-selected={selectedId===item.id}><HallThumbnail hall={hall} locale={locale}/><div><HallInfo hall={hall} locale={locale}/>{!sameCurrency&&<p className="event-hall-currency-note">{c.currency}</p>}<button type="button" className="creation-button" disabled={busy} onClick={()=>void choose(item)}>{selectedId===item.id?c.selected:c.select}</button></div></article>;})}</div>}
            {!loading&&!library.length&&!error&&<div className="event-hall-empty"><CreationIcon name="armchair" size={28}/><h3>{c.empty}</h3><p>{c.emptyHint}</p></div>}
          </>:<><button type="button" className="event-hall-back" onClick={()=>setPhase('picker')}>← {c.back}</button><div className="event-hall-presets-grid">{presets.map(({kind,hall})=><button key={kind} type="button" className="event-hall-preset" onClick={()=>begin(hall)}><HallThumbnail hall={canonicalEventHall(hall,locale,exponent)} locale={locale}/><strong>{kind==='empty'?c.emptyHall:c[kind as 'rows'|'tables'|'standing']}</strong><span>{kind==='empty'?c.blankHint:kind==='rows'?c.rowsHint:kind==='tables'?c.tablesHint:c.standingHint}</span>{kind==='empty'&&<b aria-hidden="true" className="event-hall-blank-plus">+</b>}</button>)}</div></>}
          {error&&<div role="alert" className="event-hall-error"><p>{error}</p>{phase==='picker'&&<button type="button" className="creation-button" onClick={()=>void refresh()}>{c.retry}</button>}</div>}
        </div>
      </>}
      <input ref={file} type="file" accept=".json,application/json" hidden aria-label={c.upload} onChange={e=>void upload(e.currentTarget)}/>
    </HallDialog>}
  </>;
}
