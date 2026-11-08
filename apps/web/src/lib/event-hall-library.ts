import { editorHallV3, type DraftHallV3, type EventLocale, type VenueLayout, type VenueTemplateList } from '@event-platform/shared-types';
import { apiRequest } from '../app/(auth)/_lib/api';
import { getSession } from '../app/(auth)/_lib/session';
import { importLayout } from '../app/organizer/venue-builder/_components/hall-state';
import { builderToLayoutInput, builderToVenue, venueToBuilder } from '../components/hall-builder/venue-adapter';
import { copyHall, validateImport } from '../components/hall-builder/model.mjs';
import type { BuilderHall, BuilderLibraryItem } from '../components/hall-builder/types';

const DEVICE_LIBRARY='ticket.hall-builder:guest-library:v1';
export function usesAccountHallLibrary(){const role=getSession()?.user.role;return role==='organizer'||role==='admin';}
function deviceKey(){const id=getSession()?.user.id;return id?`ticket.hall-builder:user-library:${id}:v1`:DEVICE_LIBRARY;}
export function hallForEvent(source:BuilderHall,currency:string):BuilderHall {
  const hall=copyHall(validateImport(source));
  if(hall.currency!==currency){hall.currency=currency;hall.categories=hall.categories.map(category=>({...category,price:null}));}
  return hall;
}
export function canonicalEventHall(hall:BuilderHall,locale:EventLocale,exponent=2):DraftHallV3 {
  const state=builderToVenue(validateImport(hall),exponent);
  return {...editorHallV3(state.room,state.editor,null,locale),name:hall.name.trim()||'Основной зал'};
}
function fromLayout(layout:VenueLayout):BuilderLibraryItem {
  return {id:layout.id,hall:validateImport(venueToBuilder(importLayout(layout),{id:layout.id,name:layout.templateName||'Основной зал',currency:layout.currency??layout.tables[0]?.currency??layout.rows[0]?.currency??'KZT',revision:layout.revision})),updatedAt:Date.parse(layout.updatedAt),archived:layout.archived??false};
}
function deviceLibrary():BuilderLibraryItem[] {
  const raw:unknown=JSON.parse(localStorage.getItem(deviceKey())??'[]');
  if(!Array.isArray(raw))throw new Error('Не удалось прочитать сохранённые залы на этом устройстве.');
  return raw.map(item=>({...item,hall:validateImport(item.hall)}));
}
export async function loadEventHallLibrary():Promise<BuilderLibraryItem[]> {
  if(!usesAccountHallLibrary())return deviceLibrary().filter(item=>!item.archived).sort((a,b)=>b.updatedAt-a.updatedAt);
  const items:BuilderLibraryItem[]=[];
  let page=1,hasNext=true;
  while(hasNext){
    const response=await apiRequest<VenueTemplateList>(`/api/organizer/venue-layout-templates?limit=50&page=${page++}`);
    items.push(...response.items.map(fromLayout));hasNext=response.hasNext;
  }
  return items.filter(item=>!item.archived).sort((a,b)=>b.updatedAt-a.updatedAt);
}
export async function saveEventHallLibrary(hall:BuilderHall,locale:EventLocale,exponent=2):Promise<BuilderLibraryItem> {
  if(!usesAccountHallLibrary()){
    const copy=copyHall(validateImport(hall)),item={id:copy.id,hall:copy,updatedAt:Date.now(),archived:false};
    // Write before reporting success; a full/blocked device store must not look saved.
    localStorage.setItem(deviceKey(),JSON.stringify([item,...deviceLibrary()]));
    return item;
  }
  const layoutJson=builderToLayoutInput(hall,exponent);
  return fromLayout(await apiRequest<VenueLayout>('/api/organizer/venue-layout-templates',{method:'POST',body:JSON.stringify({name:hall.name,currency:hall.currency,locale,layoutJson})}));
}
export async function updateEventHallLibrary(id:string,patch:{name?:string;archived?:boolean}):Promise<void> {
  if(usesAccountHallLibrary()){await apiRequest(`/api/organizer/venue-layouts/${id}`,{method:'PATCH',body:JSON.stringify({...(patch.name?{templateName:patch.name}:{}),...(patch.archived===undefined?{}:{archived:patch.archived})})});return;}
  localStorage.setItem(deviceKey(),JSON.stringify(deviceLibrary().map(item=>item.id===id?{...item,archived:patch.archived??item.archived,hall:{...item.hall,name:patch.name??item.hall.name}}:item)));
}
