import { randomUUID } from "node:crypto";
import { prisma } from "@event-platform/database";
import { newHallObject, type VenueLayoutJsonV2 } from "@event-platform/shared-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesService } from "../tables/tables.service.js";
import { SeatsService } from "../seats/seats.service.js";
import { VenueService } from "./venue.service.js";
const owner=randomUUID(), other=randomUUID(), eventId=randomUUID();
const domain=new DomainEventsService();
const tablesService=new TablesService(prisma,domain,{holdTtlSeconds:600,cleanupIntervalSeconds:60},{now:()=>new Date()});
const service=new VenueService(prisma,domain,tablesService);
let layoutId="",revision=0;
const table={...newHallObject(randomUUID(),"table_rect",5,5),name:"VIP",price:100000,saleMode:"per_seat" as const};
const seat={...newHallObject(randomUUID(),"seat",5,4.15),name:"У окна",parentId:table.id,side:"top" as const,price:250000};
const free={...newHallObject(randomUUID(),"seat",10,10),name:"Свободное кресло",price:150000};
const zone={...newHallObject(randomUUID(),"zone",15,10),name:"Танцпол",capacity:20,price:100000,points:[{x:0,y:0},{x:2,y:0},{x:2,y:2}]};
const json:VenueLayoutJsonV2={version:2,room:{widthM:24,heightM:16},tables:[],rows:[],editor:{version:1,tariffs:[],objects:[table,seat,free,zone]}};
beforeAll(async()=>{
 const base=BigInt(Date.now())*100000n;
 await prisma.user.createMany({data:[{id:owner,telegramId:base+910n,role:"organizer"},{id:other,telegramId:base+911n,role:"organizer"}]});
 await prisma.event.create({data:{id:eventId,organizerId:owner,title:"Hall integration",date:new Date("2027-07-01"),time:new Date("1970-01-01T20:00:00Z"),timezone:"Asia/Almaty",venueName:"Hall",address:"Address",status:"draft"}});
 const l=await service.createForEvent(owner,eventId,{layoutJson:{version:2,room:json.room,tables:[],rows:[]}});layoutId=l.id;revision=l.revision;
});
afterAll(async()=>{await prisma.event.deleteMany({where:{organizerId:{in:[owner,other]}}});await prisma.venueLayout.deleteMany({where:{organizerId:owner}});await prisma.auditLog.deleteMany({where:{actorId:{in:[owner,other]}}});await prisma.user.deleteMany({where:{id:{in:[owner,other]}}});await prisma.$disconnect();});
describe("Atomic hall editor persistence",()=>{
 it("round trips metadata and materializes canonical prices, free seats and zones",async()=>{
  const l=await writeUpdate(owner,layoutId,{revision,layoutJson:json});revision=l.revision;
  expect((l.layoutJson as VenueLayoutJsonV2).editor).toEqual(json.editor);
  expect((await service.get(owner,layoutId)).layoutJson).toEqual(l.layoutJson);
  expect(await prisma.seat.findUnique({where:{id:free.id}})).toMatchObject({tableId:null,rowId:null,label:free.name});
  expect(await prisma.ticketType.findUnique({where:{venueObjectId:seat.id}})).toMatchObject({price:250000,quantityTotal:1});
  expect(await prisma.ticketType.findUnique({where:{venueObjectId:zone.id}})).toMatchObject({price:100000,quantityTotal:20});
 });
 it("rejects another owner, missing revision and stale writes",async()=>{
  await expect(writeUpdate(other,layoutId,{revision,layoutJson:json})).rejects.toThrow();
  await expect(writeUpdate(owner,layoutId,{layoutJson:json})).rejects.toThrow("revision");
  await expect(writeUpdate(owner,layoutId,{revision:revision-1,layoutJson:json})).rejects.toThrow("Reload");
 });
 it("preserves objects outside a shrunken room and emits audit",async()=>{
  const l=await writeUpdate(owner,layoutId,{revision,layoutJson:{...json,room:{widthM:2,heightM:2}}});revision=l.revision;
  expect((l.layoutJson as VenueLayoutJsonV2).editor).toEqual(json.editor);
  expect(await prisma.auditLog.count({where:{entityId:layoutId,action:"venue_layout.updated"}})).toBeGreaterThan(0);
 });
 it("clones all metadata and remaps object identity without copying inventory identity",async()=>{
  const t=await service.saveTemplate(owner,layoutId,"New hall template");const editor=(t.layoutJson as VenueLayoutJsonV2).editor!;
  expect(editor.objects).toHaveLength(4);expect(editor.objects.some((o)=>o.id===seat.id)).toBe(false);
  expect(editor.objects.find((o)=>o.name===seat.name)?.parentId).toBe(editor.objects.find((o)=>o.name===table.name)?.id);
 });
 it("saves a selected group and includes its attached seats",async()=>{
  const t=await service.saveTemplate(owner,layoutId,"Table group",[table.id]);
  const e=(t.layoutJson as VenueLayoutJsonV2).editor!;
  expect(e.objects).toHaveLength(2);expect(e.objects.filter((o)=>o.type==="seat")).toHaveLength(1);
  await expect(service.saveTemplate(owner,layoutId,"Invalid",[randomUUID()])).rejects.toThrow("Select objects");
 });
 it("prevents old endpoint edits from desynchronizing the editor",async()=>{
  await expect(tablesService.update(owner,table.id,{price:1})).rejects.toThrow("hall editor");
  const seatsService=new SeatsService(prisma,domain,tablesService);
  await expect(seatsService.deleteSeat(owner,seat.id)).rejects.toThrow("hall editor");
 });
 it("round trips a 2,000-seat document within the bounded transaction",async()=>{
  const largeEvent=randomUUID();
  await prisma.event.create({data:{id:largeEvent,organizerId:owner,title:"Large hall",date:new Date("2027-07-01"),time:new Date("1970-01-01T20:00:00Z"),timezone:"Asia/Almaty",venueName:"Hall",address:"Address",status:"draft"}});
  const empty=await service.createForEvent(owner,largeEvent,{layoutJson:{version:2,room:{widthM:30,heightM:30},tables:[],rows:[]}});
  const editor={version:1 as const,tariffs:[],objects:Array.from({length:2000},(_,i)=>({...newHallObject(randomUUID(),"seat",1+(i%50)*.5,1+Math.floor(i/50)*.5),number:i+1,price:100000}))};
  const saved=await writeUpdate(owner,empty.id,{revision:empty.revision,layoutJson:{version:2,room:{widthM:30,heightM:30},tables:[],rows:[],editor}});
  expect((saved.layoutJson as VenueLayoutJsonV2).editor).toEqual(editor);
  expect(await prisma.seat.count({where:{venueLayoutId:empty.id}})).toBe(2000);
  expect((await service.get(owner,empty.id)).layoutJson).toEqual(saved.layoutJson);
 },60000);
 it("rejects published structural edits",async()=>{
  await prisma.event.update({where:{id:eventId},data:{status:"published"}});
  await expect(writeUpdate(owner,layoutId,{revision,layoutJson:json})).rejects.toThrow("draft");
 });
 it("returns canonical free/per-seat prices and redacts hidden full amounts",async()=>{
  const seatsService=new SeatsService(prisma,domain,tablesService);
  const visible=await seatsService.publicForEvent(eventId);
  expect(visible?.seats?.find((s)=>s.id===free.id)).toMatchObject({price:150000,availability:"available"});
  expect(visible?.seats?.find((s)=>s.id===seat.id)).toMatchObject({price:250000,label:"У окна"});
  await prisma.event.update({where:{id:eventId},data:{paymentMode:"deposit",showFullAmountForDeposit:false}});
  const hidden=await seatsService.publicForEvent(eventId);
  expect(hidden?.seats?.every((s)=>s.price===null)).toBe(true);
  expect((hidden!.layoutJson as VenueLayoutJsonV2).editor?.objects.every((o)=>o.price===null)).toBe(true);
 });

});

// Current wire payload excludes legacy read-only deposit properties.
function writeUpdate(...args: Parameters<typeof service.update>) {
 const [owner,id,input]=args; const wire=JSON.parse(JSON.stringify(input, (key,value)=>key==="deposit"?undefined:value)); return service.update(owner,id,wire);
}
