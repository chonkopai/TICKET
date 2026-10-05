import { z } from "zod";
import { draftHallV3Schema,hallGeometryObjectV3Schema,type EventCreationDraftV2 } from "./event-creation-v2.js";
import type { EventLocale } from "./events.js";
import type { HallEditor } from "./hall-editor.js";
export const publishedHallV3Schema=z.object({version:z.literal(3),room:draftHallV3Schema.shape.room,objects:z.array(hallGeometryObjectV3Schema).max(3000),tariffStyles:z.record(z.string().uuid(),z.string().regex(/^#[0-9a-fA-F]{6}$/))}).strict();
export type PublishedHallV3=z.infer<typeof publishedHallV3Schema>;
export type DraftHallV3=NonNullable<EventCreationDraftV2["paidSeated"]>;
export function hallV3Editor(hall:DraftHallV3,locale:EventLocale):HallEditor{
  return {version:1,objects:hall.objects.map(({annotation,...object})=>({...object,name:annotation??"",description:"",deposit:0,price:null})),tariffs:hall.tariffs.map(tariff=>({id:tariff.id,name:tariff.content[locale]?.name??"",description:tariff.content[locale]?.description??"",localized:tariff.content,color:tariff.color??"#6320ee",price:tariff.amount??0,draftAmount:tariff.amount}))};
}
export function editorHallV3(room:DraftHallV3["room"],editor:HallEditor,previous:DraftHallV3|null,locale:EventLocale):DraftHallV3{
  return draftHallV3Schema.parse({version:3,room,objects:editor.objects.map(({name,description:_description,price:_price,deposit:_deposit,...geometry})=>({...geometry,...(name?{annotation:name}:{})})),tariffs:editor.tariffs.map(tariff=>({id:tariff.id,active:previous?.tariffs.find(item=>item.id===tariff.id)?.active??true,amount:tariff.draftAmount!==undefined&&tariff.price===(tariff.draftAmount??0)?tariff.draftAmount:tariff.price,color:tariff.color,content:{...(tariff.localized??previous?.tariffs.find(item=>item.id===tariff.id)?.content),[locale]:{name:tariff.name,description:tariff.description??""}}}))});
}
export function canonicalHallGeometry(hall:DraftHallV3):PublishedHallV3{return publishedHallV3Schema.parse({version:3,room:hall.room,objects:hall.objects,tariffStyles:Object.fromEntries(hall.tariffs.map(tariff=>[tariff.id,tariff.color??"#6320ee"]))});}
