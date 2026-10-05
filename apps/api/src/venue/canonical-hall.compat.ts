import type { Prisma,PrismaClient } from "@event-platform/database";
import { publishedHallV3Schema,draftHallV3Schema,hallV3Editor,type EventLocale,type DraftHallV3 } from "@event-platform/shared-types";
import { projectHallEditor } from "./hall-editor.persistence.js";
export async function readCanonicalHall(database:Pick<PrismaClient,"hallTariff">|Pick<Prisma.TransactionClient,"hallTariff">,layoutId:string,value:unknown):Promise<DraftHallV3>{
  const geometry=publishedHallV3Schema.parse(value),tariffs=await database.hallTariff.findMany({where:{venueLayoutId:layoutId},include:{contents:true}});
  const {tariffStyles:_styles,...shared}=geometry;
  return draftHallV3Schema.parse({...shared,tariffs:tariffs.filter(tariff=>Object.hasOwn(geometry.tariffStyles,tariff.id)).map(tariff=>({id:tariff.id,active:tariff.active,amount:tariff.price,color:geometry.tariffStyles[tariff.id]??"#6320ee",content:Object.fromEntries(tariff.contents.map(content=>[content.locale,{...(content.name===null?{}:{name:content.name}),...(content.description===null?{}:{description:content.description})}]))}))});
}
export function canonicalHallCompatibility(hall:DraftHallV3,locale:EventLocale){const editor=hallV3Editor(hall,locale);editor.tariffs=editor.tariffs.map(tariff=>({...tariff,name:tariff.name||"Tariff"}));return projectHallEditor({version:2,room:hall.room,editor,tables:[],rows:[]},editor);}

export function canonicalHallSource(hall:DraftHallV3):EventLocale{return (["ru","en","kk"] as const).find(locale=>hall.tariffs.every(tariff=>!!tariff.content[locale]?.name))??"ru";}
