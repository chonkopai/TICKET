import { describe, it, expect, vi } from 'vitest';
import { newHallObject, type HallEditor } from '@event-platform/shared-types';
import { persistHallEditor } from './hall-editor.persistence.js';
import { readCanonicalHall } from './canonical-hall.compat.js';
import { canonicalHallGeometry, editorHallV3, hallV3Editor } from '@event-platform/shared-types';
import type { Prisma } from '@event-platform/database';

const id=()=>crypto.randomUUID();
function fixture(){
  const layoutId=id(),tariffId=id();
  const table={...newHallObject(id(),'table_round',5,5),width:2,height:2,tariffId,builder:{version:1 as const,kind:'round' as const,pinned:false,disabled:false,tariffId}};
  const children=Array.from({length:4},(_,i)=>({...newHallObject(id(),'seat',5+i*.5,5),parentId:table.id,number:i+1,attachedOrder:i,tariffId}));
  const editor:HallEditor={version:1,objects:[table,...children],tariffs:[{id:tariffId,name:'Whole table',color:'#123abc',price:123400,unit:'table',active:true,localized:{en:{name:'Whole table'},kk:{name:'Үстел'}}}]};
  const tableUpsert=vi.fn(async(_input:unknown)=>({})),seatUpsert=vi.fn(async(_input:unknown)=>({}));
  const model=()=>({findMany:vi.fn(async()=>[]),count:vi.fn(async()=>0),updateMany:vi.fn(async()=>({count:0})),deleteMany:vi.fn(async()=>({count:0})),upsert:vi.fn(async()=>({}))});
  const tx={seat:{...model(),upsert:seatUpsert},table:{...model(),upsert:tableUpsert},venueRow:model(),ticketType:model(),seatAllocation:model(),tableHold:model(),booking:model(),ticket:model(),ticketReservation:model()};
  return{layoutId,table,children,editor,tableUpsert,seatUpsert,tx:tx as unknown as Prisma.TransactionClient};
}
describe('connected hall inventory persistence',()=>{
  it('keeps pinned tables on sale, excludes disabled chairs and blocks explicitly disabled tables',async()=>{
    const f=fixture();f.table.builder.pinned=true;f.children[0]!.locked=true;
    await persistHallEditor(f.tx,f.layoutId,null,{version:2,room:{widthM:24,heightM:16},editor:f.editor,tables:[],rows:[]},'KZT');
    expect(f.tableUpsert.mock.calls[0]?.[0]).toMatchObject({where:{id:f.table.id},update:{seats:3,status:'available',saleMode:'whole_table',price:123400}});
    expect(f.seatUpsert.mock.calls[0]?.[0]).toMatchObject({where:{id:f.children[0]!.id},update:{status:'disabled'}});
    f.table.locked=true;
    await persistHallEditor(f.tx,f.layoutId,null,{version:2,room:{widthM:24,heightM:16},editor:f.editor,tables:[],rows:[]},'KZT');
    expect(f.tableUpsert.mock.calls[1]?.[0]).toMatchObject({update:{status:'unavailable'}});
  });
  it('reconstructs price units, translations, category activity and builder settings from canonical storage',async()=>{
    const f=fixture(),hall=editorHallV3({widthM:24,heightM:16},f.editor,null,'en');hall.tariffs[0]!.active=false;
    const geometry={...canonicalHallGeometry(hall),libraryArchived:true};
    const database={hallTariff:{findMany:async()=>hall.tariffs.map(t=>({id:t.id,active:t.active,price:t.amount,contents:Object.entries(t.content).map(([locale,text])=>({locale,...text}))}))}};
    const restored=await readCanonicalHall(database as never,f.layoutId,geometry),projected=hallV3Editor(restored,'en');
    expect(projected.tariffs[0]).toMatchObject({price:123400,unit:'table',active:false,color:'#123abc',localized:{kk:{name:'Үстел'}}});
    expect(projected.objects[0]!.builder).toEqual(f.table.builder);
  });
});
