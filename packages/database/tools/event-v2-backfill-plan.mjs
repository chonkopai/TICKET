import { createHash } from 'node:crypto';
import { EVENT_TEXT_LIMITS, graphemeLength, resolveLocalTime } from '@event-platform/shared-types';

export const BACKFILL_VERSION = 1;
export const LOCALES = ['ru','en','kk'];
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key=>key!=='updatedAt').map(key=>[key,canonical(value[key])]));
  return value;
}
export const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const labels = {
  ru:{program:'Программа',rules:'Правила',visitTerms:'Условия посещения',extraConditions:'Дополнительные условия',depositTerms:'Исторические условия депозита',shortDescription:'Краткое описание'},
  en:{program:'Program',rules:'Rules',visitTerms:'Attendance terms',extraConditions:'Additional conditions',depositTerms:'Historical deposit terms',shortDescription:'Short description'},
  kk:{program:'Бағдарлама',rules:'Ережелер',visitTerms:'Қатысу шарттары',extraConditions:'Қосымша шарттар',depositTerms:'Депозиттің тарихи шарттары',shortDescription:'Қысқаша сипаттама'},
};
export function mergeDescription(row,locale) {
  const parts=[];
  if(typeof row.description==='string'&&row.description.length)parts.push(row.description);
  for(const field of ['program','rules','visitTerms','extraConditions','depositTerms']) if(typeof row[field]==='string'&&row[field].length)parts.push(`${labels[locale][field]}:\n${row[field]}`);
  return parts.length?parts.join('\n\n'):null;
}
export function legacyContent(row,locale) {
  return {title:row.title??null,summary:row.announcement??null,description:mergeDescription(row,locale),venueName:row.venueName??null,address:row.address??null,refundConditions:row.cancellationTerms??null};
}
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function trustedMediaReference(value) {
  // The existing application-owned poster namespace; extension is a candidate
  // kind only. Decoding/storage existence must still happen before ready state.
  return typeof value==='string'&&/^\/media\/posters\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(value)&&uuid(value.split('/').at(-1).split('.')[0]);
}
export function planLegacyEvent(graph) {
  const event=graph.event,source=event.sourceLocale,reasons=new Set(['unknown_end','refund_choice_unknown']);
  const contents=[],resources=[],tariffs=[],media=[];
  const sourceValues=LOCALES.includes(source)?legacyContent(event,source):null;
  const check=(values,limits,key,required=[])=>{
    for(const [field,limit] of Object.entries(limits)) if(typeof values[field]==='string'&&graphemeLength(values[field])>limit)reasons.add(`overlength:${key}:${field}`);
    for(const field of required)if(!values[field]?.trim())reasons.add(`missing_text:${key}:${field}`);
  };
  const metadata=(values,isSource,original)=>Object.fromEntries(Object.entries(values).map(([field,value])=>[field,{
    origin:isSource?'source':original?.origin==='manual'?'manual':'legacy',sourceHash:isSource?hash(value):null,
    reviewed:isSource,stale:!isSource,revision:1,
  }]));
  const addContent=(locale,values,isSource,original)=>{
    check(values,{title:100,summary:240,description:10000,venueName:120,address:250,refundConditions:2000},locale,isSource?['title','summary','description','venueName','address']:[]);
    const fieldMetadata=metadata(values,isSource,original);
    contents.push({table:'EventContent',idField:'eventId',id:event.id,locale,values,fieldMetadata,legacyHash:hash({values,fieldMetadata})});
  };
  if(sourceValues)addContent(source,sourceValues,true,event);else reasons.add('invalid_source_locale');
  for(const translation of graph.translations){
    if(!LOCALES.includes(translation.locale)){reasons.add(`invalid_target_locale:${translation.locale}`);continue;}
    if(translation.locale===source){reasons.add('duplicate_source_translation');continue;}
    addContent(translation.locale,legacyContent(translation,translation.locale),false,translation);
    reasons.add(`translation_currentness_review:${translation.locale}`);
  }
  if(graphemeLength(event.city??'')>EVENT_TEXT_LIMITS.city)reasons.add('overlength:city');
  const general=graph.ticketTypes.filter(type=>!type.isInternal&&!type.venueObjectId&&!graph.seats.some(seat=>seat.ticketTypeId===type.id));
  const hasHall=graph.tables.length>0||graph.seats.length>0||graph.rows.length>0;
  const charges=[...graph.ticketTypes,...graph.tables,...graph.rows];
  const currencies=[...new Set(charges.map(row=>row.currency?.trim()).filter(Boolean))];
  let currency=currencies.length===1&&/^[A-Z]{3}$/.test(currencies[0])?currencies[0]:null;
  if(currencies.length>1)reasons.add('mixed_currencies');else if(!currency)reasons.add('currency_unknown');
  let saleMode=null;
  if(general.length&&hasHall)reasons.add('hybrid_sale_modes');
  if(event.paymentMode==='deposit'){reasons.add(event.status==='published'?'active_deposit':'legacy_deposit');}
  else if(general.length&&hasHall)reasons.add('hybrid_sale_modes');
  else if(general.length&&!hasHall){
    if(general.every(row=>row.price===0)){
      if(general.length===1&&general[0].quantityTotal>0)saleMode='free';else reasons.add('ambiguous_free_inventory');
    }else saleMode='paid_general';
  }else if(hasHall&&charges.some(row=>row.price>0))saleMode='paid_seated';else reasons.add('sale_mode_unknown');
  if(charges.some(row=>row.deposit>0))reasons.add('historical_deposit_prices');
  if(graph.ticketTypes.some(row=>row.quantityTotal<=0||row.quantitySold>row.quantityTotal)||graph.tables.some(row=>row.seats<=0))reasons.add('missing_or_inconsistent_capacity');
  if(graph.history.pendingOrders.length)reasons.add('pending_purchases_original_terms');
  if(graph.history.moneyMismatches.length)reasons.add('payment_order_money_mismatch');
  if(graph.history.liveReservations||graph.history.liveHolds||graph.history.paidAllocations)reasons.add('protected_inventory_locks');
  let startsAt=null;
  try {
    if(event.time?.slice(6,8)!=='00')reasons.add('legacy_start_seconds_review');
    else startsAt=resolveLocalTime(`${event.date}T${event.time.slice(0,5)}`,event.timezone);
  }catch(error){reasons.add(error.message);}
  if(LOCALES.includes(source))for(const [table,idField,rows] of [['TicketTypeContent','ticketTypeId',graph.ticketTypes],['TableContent','tableId',graph.tables],['VenueRowContent','rowId',graph.rows]])for(const row of rows){
    let description=row.description??null;
    if(row.shortDescription&&row.shortDescription!==description)description=[description,`${labels[source].shortDescription}:\n${row.shortDescription}`].filter(Boolean).join('\n\n');
    const values={name:row.name??null,description},fieldMetadata=metadata(values,true,row);
    check(values,{name:60,description:300},`${table}:${row.id}`,['name']);
    resources.push({table,idField,id:row.id,locale:source,values,fieldMetadata,legacyHash:hash({values,fieldMetadata})});
  }
  for(const layout of graph.layouts){
    const raw=layout.layoutJson?.editor?.tariffs;
    if(raw!==undefined&&!Array.isArray(raw)){reasons.add(`invalid_hall_tariffs:${layout.id}`);continue;}
    const seen=new Set();
    for(const tariff of raw??[]){
      if(!uuid(tariff?.id)||seen.has(tariff.id)){reasons.add(`ambiguous_tariff_id:${layout.id}`);continue;}
      seen.add(tariff.id);
      const price=Number.isInteger(tariff.price)&&tariff.price>=0&&tariff.price<=2147483647?tariff.price:null;
      if(price===null)reasons.add(`invalid_tariff_price:${tariff.id}`);
      const values={name:typeof tariff.name==='string'?tariff.name:null,description:typeof tariff.description==='string'?tariff.description:null};
      if(LOCALES.includes(source)){
        const fieldMetadata=metadata(values,true,tariff);
        check(values,{name:60,description:300},`tariff:${tariff.id}`,['name']);
        resources.push({table:'HallTariffContent',idField:'tariffId',id:tariff.id,locale:source,values,fieldMetadata,legacyHash:hash({values,fieldMetadata})});
      }
      tariffs.push({id:tariff.id,venueLayoutId:layout.id,price,currency,legacyHash:hash({venueLayoutId:layout.id,price,currency})});
    }
    // Geometry remains unchanged; unresolved per-object tariff text/overrides
    // are archived for the revision-aware hall adapter in Batch 6.
    const objects=layout.layoutJson?.editor?.objects;
    if(objects!==undefined&&!Array.isArray(objects))reasons.add(`invalid_hall_objects:${layout.id}`);
    for(const object of Array.isArray(objects)?objects:[])if(object?.name||object?.description)reasons.add(`hall_object_text_review:${object.id??layout.id}`);
  }
  const hasPoster=!!event.posterUrl;
  const references=hasPoster?[event.posterUrl,...(event.galleryUrls??[])]:event.galleryUrls??[],seenMedia=new Set();
  for(let slot=0;slot<references.length;slot++){
    const reference=references[slot];if(!reference)continue;
    if(seenMedia.has(reference)){reasons.add('duplicate_media_reference');continue;}seenMedia.add(reference);
    if(slot>=5){reasons.add('over_five_legacy_media');continue;}
    if(!trustedMediaReference(reference)){reasons.add(`unknown_media:${slot}`);continue;}
    media.push({reference,slot,isCard:hasPoster&&slot===0,isBackground:hasPoster&&slot===0});reasons.add(`media_decode_review:${slot}`);
  }
  if(!media.some(item=>item.isCard))reasons.add('missing_trusted_card');
  return {version:BACKFILL_VERSION,eventId:event.id,fingerprint:hash({event,translations:graph.translations,ticketTypes:graph.ticketTypes,layouts:graph.layouts,tables:graph.tables,rows:graph.rows,seats:graph.seats}),contents,resources,tariffs,media,currency,saleMode,startsAt,reasons:[...reasons].sort()};
}
