import type { Prisma } from "@event-platform/database";
import { canonicalHallGeometry,eventCreationDraftSchema,hallV3Editor,selectedSaleRows,EVENT_LOCALES,type CurrencyCapability,type EventCreationDraftV2,type EventLocale,type DraftHallV3 } from "@event-platform/shared-types";
import { ConflictException,UnprocessableEntityException } from "@nestjs/common";
import { persistHallEditor } from "../venue/hall-editor.persistence.js";

function normalizedSaleContent(content:{name?:string|undefined;description?:string|undefined}){return {name:content.name??null,description:content.description??null};}
function invalid(code:string):never{throw new UnprocessableEntityException({code});}
export function validateSelectedSale(draft:EventCreationDraftV2,currencies:readonly CurrencyCapability[]){
  eventCreationDraftSchema.parse(draft);if(!draft.selectedMode)invalid("SALE_MODE_REQUIRED");if(!currencies.some(currency=>currency.code===draft.currency))invalid("CURRENCY_UNSUPPORTED");
  const rows=selectedSaleRows(draft);if(!rows.length)invalid("SALE_RESOURCE_REQUIRED");
  for(const row of rows){if(!row.content[draft.sourceLocale]?.name?.trim())invalid("SOURCE_SALE_NAME_REQUIRED");if(row.amount===null)invalid("PRICE_REQUIRED");if("capacity" in row&&row.capacity===null)invalid("CAPACITY_REQUIRED");}
  if(draft.selectedMode==="free"){if(!draft.free.active)invalid("FREE_RESOURCE_INACTIVE");if(draft.free.amount!==0)invalid("FREE_PRICE_MUST_BE_ZERO");return;}
  if(draft.selectedMode==="paid_general"){if(!rows.some(row=>row.amount!>0))invalid("POSITIVE_PRICE_REQUIRED");return;}
  const hall=draft.paidSeated!;let capacity=0,positive=false;
  for(const object of hall.objects){
    if(object.locked||!(object.type==="seat"||object.type==="zone"))continue;
    const parent=hall.objects.find(item=>item.id===object.parentId),whole=parent?.type.startsWith("table_")&&parent.saleMode==="whole_table";
    const tariff=rows.find(row=>row.id===(whole?parent?.tariffId:object.tariffId??parent?.tariffId));
    if(!tariff)invalid("HALL_TARIFF_REQUIRED");if(object.type==="zone"&&!object.capacity)invalid("CAPACITY_REQUIRED");capacity+=object.type==="seat"?1:object.capacity;positive||=tariff.amount!>0;
  }
  if(!capacity)invalid("HALL_CAPACITY_REQUIRED");if(!positive)invalid("POSITIVE_PRICE_REQUIRED");
}
async function assertNoSaleHistory(tx:Prisma.TransactionClient,eventId:string){
  const counts=await Promise.all([tx.ticket.count({where:{ticketType:{eventId}}}),tx.ticketReservation.count({where:{ticketType:{eventId}}}),tx.tableHold.count({where:{table:{venueLayout:{eventId}}}}),tx.booking.count({where:{table:{venueLayout:{eventId}}}}),tx.seatAllocation.count({where:{seat:{venueLayout:{eventId}}}})]);
  if(counts.some(Boolean))throw new ConflictException({code:"SALE_INVENTORY_HAS_HISTORY"});
}
export async function persistCanonicalHall(tx:Prisma.TransactionClient,eventId:string|null,layoutId:string,hall:DraftHallV3,sourceLocale:EventLocale,currency:string){
  const editor=hallV3Editor(hall,sourceLocale);
  // Localized tariff labels are projected only in memory for the existing
  // geometry/inventory writer. Canonical layout JSON contains no prices/deposits.
  editor.objects=editor.objects.map(object=>({...object,name:"",description:""}));
  editor.tariffs=editor.tariffs.map(tariff=>({id:tariff.id,name:"Tariff",color:tariff.color,price:tariff.price}));
  const foreign=await tx.hallTariff.count({where:{id:{in:hall.tariffs.map(tariff=>tariff.id)},venueLayoutId:{not:layoutId}}});if(foreign)throw new ConflictException({code:"HALL_TARIFF_OWNER_MISMATCH"});
  if(eventId)await tx.event.update({where:{id:eventId},data:{currency}});
  for(const tariff of hall.tariffs){await tx.hallTariff.upsert({where:{id:tariff.id},create:{id:tariff.id,venueLayoutId:layoutId,price:tariff.amount,currency,active:tariff.active},update:{price:tariff.amount,currency,active:tariff.active}});for(const locale of EVENT_LOCALES){const content=tariff.content[locale];if(content)await tx.hallTariffContent.upsert({where:{tariffId_locale:{tariffId:tariff.id,locale}},create:{tariffId:tariff.id,locale,...normalizedSaleContent(content)},update:{...normalizedSaleContent(content),revision:{increment:1},managedBy:"editor"}});}}
  await persistHallEditor(tx,layoutId,eventId,{version:2,room:hall.room,editor,tables:[],rows:[]},currency);
  const types=eventId?await tx.ticketType.findMany({where:{eventId,venueObjectId:{not:null}}}):[];
  for(const object of hall.objects){
    const parent=hall.objects.find(item=>item.id===object.parentId),tariff=hall.tariffs.find(item=>item.id===(object.tariffId??parent?.tariffId));
    if(!tariff)continue;
    const type=types.find(item=>item.venueObjectId===object.id);if(type){await tx.ticketType.update({where:{id:type.id},data:{tariffId:tariff.id,price:tariff.amount??0,currency,deposit:0,status:tariff.active&&!object.locked?"active":"draft"}});for(const locale of EVENT_LOCALES){const content=tariff.content[locale];if(content)await tx.ticketTypeContent.upsert({where:{ticketTypeId_locale:{ticketTypeId:type.id,locale}},create:{ticketTypeId:type.id,locale,...normalizedSaleContent(content)},update:{...normalizedSaleContent(content),revision:{increment:1},managedBy:"editor"}});}}
    if(object.type.startsWith("table_")){await tx.table.update({where:{id:object.id},data:{tariffId:tariff.id,name:tariff.content[sourceLocale]?.name??"",price:tariff.amount??0,currency,deposit:0,...(!tariff.active?{status:"unavailable"}: {})}});for(const locale of EVENT_LOCALES){const content=tariff.content[locale];if(content)await tx.tableContent.upsert({where:{tableId_locale:{tableId:object.id,locale}},create:{tableId:object.id,locale,...normalizedSaleContent(content)},update:{...normalizedSaleContent(content),revision:{increment:1},managedBy:"editor"}});}}
    if(object.type==="row"){await tx.venueRow.update({where:{id:object.id},data:{tariffId:tariff.id,name:tariff.content[sourceLocale]?.name??"",price:tariff.amount??0,currency,deposit:0}});for(const locale of EVENT_LOCALES){const content=tariff.content[locale];if(content)await tx.venueRowContent.upsert({where:{rowId_locale:{rowId:object.id,locale}},create:{rowId:object.id,locale,...normalizedSaleContent(content)},update:{...normalizedSaleContent(content),revision:{increment:1},managedBy:"editor"}});}}
  }
  const geometry=canonicalHallGeometry(hall);
  await tx.venueLayout.update({where:{id:layoutId},data:{layoutJson:JSON.parse(JSON.stringify(geometry)) as Prisma.InputJsonValue}});return geometry;
}
/** Called by the later atomic publisher; never creates anonymous Event records. */
export async function persistSelectedSale(tx:Prisma.TransactionClient,eventId:string,organizerId:string,input:EventCreationDraftV2,currencies:readonly CurrencyCapability[]){
  const draft=eventCreationDraftSchema.parse(input);validateSelectedSale(draft,currencies);
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${eventId}::uuid FOR UPDATE`;
  const event=await tx.event.findUniqueOrThrow({where:{id:eventId}});if(event.organizerId!==organizerId)throw new ConflictException({code:"EVENT_OWNER_MISMATCH"});if(event.status!=="draft")throw new ConflictException({code:"SALE_INVENTORY_DRAFT_ONLY"});
  await assertNoSaleHistory(tx,eventId);
  await tx.event.update({where:{id:eventId},data:{saleMode:draft.selectedMode,currency:draft.currency,paymentMode:"full_payment",showFullAmountForDeposit:false,depositTerms:null,...(draft.selectedMode==="free"?{refundsAvailable:false}:{})}});
  await tx.ticketType.updateMany({where:{eventId},data:{status:"draft"}});
  await tx.table.updateMany({where:{venueLayout:{eventId}},data:{status:"unavailable"}});
  if(draft.selectedMode==="paid_seated"){
    const layout=await tx.venueLayout.upsert({where:{eventId},create:{eventId,templateName:draft.content[draft.sourceLocale]?.venueName??"Hall",layoutJson:{version:1,canvas:{width:1000,height:700},tables:[]}},update:{}});
    await tx.$queryRaw`SELECT id FROM "VenueLayout" WHERE id=${layout.id}::uuid FOR UPDATE`;
    await persistCanonicalHall(tx,eventId,layout.id,draft.paidSeated!,draft.sourceLocale,draft.currency);return{mode:draft.selectedMode,layoutId:layout.id};
  }
  const rows=selectedSaleRows(draft).filter((row):row is EventCreationDraftV2["free"]=>"capacity" in row);
  if(await tx.ticketType.count({where:{id:{in:rows.map(row=>row.id)},eventId:{not:eventId}}}))throw new ConflictException({code:"SALE_RESOURCE_OWNER_MISMATCH"});
  for(const [index,row] of rows.entries()){
    const name=`${row.content[draft.sourceLocale]!.name} · ${index+1}`;
    const data={name,price:row.amount!,deposit:0,currency:draft.currency,quantityTotal:row.capacity!,status:"active" as const};
    await tx.ticketType.upsert({where:{id:row.id},create:{id:row.id,eventId,...data},update:data});
    for(const locale of EVENT_LOCALES){const content=row.content[locale];if(content)await tx.ticketTypeContent.upsert({where:{ticketTypeId_locale:{ticketTypeId:row.id,locale}},create:{ticketTypeId:row.id,locale,...normalizedSaleContent(content)},update:{...normalizedSaleContent(content),revision:{increment:1},managedBy:"editor"}});}
  }
  return {mode:draft.selectedMode,ticketTypeIds:rows.map(row=>row.id)};
}
