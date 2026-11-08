import { hallEditorSchema, metres, newHallObject, type HallEditor, type HallObject } from '@event-platform/shared-types';
import { makeObject, newHall, reconcile, rotate, seatPositions, SCALE } from './model.mjs';
import type { BuilderCategory, BuilderHall, BuilderObject, BuilderSeat, SaleUnit } from './types';
import type { HallState } from '../../app/organizer/venue-builder/_components/hall-state';
const sides = ['top','right','bottom','left'] as const;
const unitFor = (o:HallObject, objects:HallObject[]):SaleUnit => {
  const parent=objects.find(p=>p.id===o.parentId);
  return o.type==='zone'?'entry':o.type.startsWith('table_')&&o.saleMode==='whole_table'||parent?.type.startsWith('table_')&&parent.saleMode==='whole_table'?'table':'seat';
};
const mm=(value:number)=>metres(value/SCALE);

/** Deposit remains a legacy in-memory default, but current HTTP writes reject
 * that key even when it is zero. Serialize at the request boundary. */
export function builderToLayoutInput(hall:BuilderHall, exponent=2) {
  const state=builderToVenue(hall,exponent);
  return {version:2 as const,room:state.room,
    editor:{...state.editor,objects:state.editor.objects.map(({deposit:_legacy,...object})=>object)},
    tables:[],rows:[]};
}

/** Flatten the builder into stable staging inventory. Monetary values cross this boundary in minor units. */
export function builderToVenue(hall:BuilderHall, exponent=2):HallState {
  const objects:HallObject[]=[],factor=10**exponent;
  const cat=(id:string|null|undefined)=>hall.categories.find(c=>c.id===id);
  const available=(o:BuilderObject,s?:BuilderSeat,rowCategory?:string|null)=>!o.disabled&&!s?.disabled&&cat(s?.categoryId??rowCategory??o.categoryId)?.active!==false;
  const base=(o:BuilderObject,type:HallObject['type'],id=o.id):HallObject=>({
    ...(o.source??newHallObject(id,type,mm(o.x),mm(o.y))),id,type,name:o.name.slice(0,120),x:mm(o.x),y:mm(o.y),width:mm(o.w),height:mm(o.h),rotation:metres(o.rotation),color:o.color,colorOverride:false,
    tariffId:o.categoryId,price:null,deposit:0,locked:!available(o),parentId:null,
    builder:{version:1,kind:o.type,pinned:o.pinned,disabled:o.disabled,tariffId:o.categoryId,...(o.arrangement?{arrangement:o.arrangement}:{})},
  });
  const child=(o:BuilderObject,s:ReturnType<typeof seatPositions>[number],parentId:string,rowCategory?:string|null):HallObject=>{
    const pos=rotate(s.x,s.y,o.rotation), source=s.source??newHallObject(s.id,'seat',0,0);
    return {...source,id:s.id,type:'seat',parentId,x:mm(o.x+pos.x),y:mm(o.y+pos.y),width:.45,height:.45,rotation:metres(o.rotation),name:source.name,number:s.number,attachedOrder:o.seats!.findIndex(item=>item.id===s.id),side:s.side==null?null:sides[s.side]!,tariffId:o.saleMode==='whole_table'?o.categoryId:s.categoryId??rowCategory??o.categoryId,price:null,deposit:0,locked:o.saleMode==='whole_table'?o.disabled||s.disabled||cat(o.categoryId)?.active===false:!available(o,s,rowCategory),builder:{version:1,kind:'seat',pinned:false,disabled:s.disabled,tariffId:s.categoryId,seat:{dx:s.dx/SCALE,dy:s.dy/SCALE,...(o.seats!.find(item=>item.id===s.id)?.angle===undefined?{}:{angle:s.angle!}),...(s.number===o.seats!.find(item=>item.id===s.id)?.number?{number:s.number}:{})}},...(s.angle===undefined?{}:{orbitAngle:metres(((s.angle*180/Math.PI+540)%360)-180)})};
  };
  for(const o of hall.objects){
    if(o.type==='rows'){
      const rows=o.rows!,positions=seatPositions(o);
      for(const [index,row] of rows.entries()){
        const rowY=(index-(rows.length-1)/2)*o.rowPitch!+(row.dy||0),p=rotate(row.dx||0,rowY,o.rotation);
        const item=base(o,'row',row.id),rowSeats=positions.filter(s=>s.rowId===row.id);
        item.x=mm(o.x+p.x);item.y=mm(o.y+p.y);item.height=.45;
        item.width=metres(Math.max(.45, row.count*.45, (row.count-1)*(row.pitch??o.seatPitch!)/SCALE+.45+(o.aisle==='none'?0:o.aisleWidth!/SCALE)));
        item.name=`${o.name} · ${o.firstRow!+index}`.slice(0,120);item.number=o.firstRow!+index;item.curvature=0;item.reverse=o.reverse!;item.startNumber=o.firstSeat!;item.tariffId=row.categoryId??o.categoryId;item.price=null;
        item.builder={...item.builder!,tariffId:row.categoryId,group:{id:o.id,tariffId:o.categoryId,name:o.name,x:mm(o.x),y:mm(o.y),rotation:metres(o.rotation),seatPitch:o.seatPitch!/SCALE,rowPitch:o.rowPitch!/SCALE,aisle:o.aisle!,aisleWidth:mm(o.aisleWidth!),firstRow:o.firstRow!,firstSeat:o.firstSeat!,reverse:o.reverse!,curvature:o.curvature!/SCALE},row:{index,dx:mm(row.dx||0),dy:mm(row.dy||0),...(row.pitch===undefined?{}:{pitch:mm(row.pitch)})}};
        objects.push(item,...rowSeats.map(s=>child(o,s,row.id,row.categoryId)));
      }
    }else{
      const type=({round:'table_round',rect:'table_rect',standing:'zone',stage:'prop',obstacle:'prop',entrance:'entrance',seat:'seat'} as const)[o.type];
      const item=base(o,type);
      if(o.type==='round'||o.type==='rect'){item.saleMode=o.saleMode!;item.seatOffset=mm(o.chairOffset!);item.height=o.type==='round'?item.width:item.height;objects.push(item,...seatPositions(o).map(s=>child(o,s,o.id)));}
      else if(o.type==='standing'){item.capacity=o.capacity??0;item.opacity=o.opacity;item.builder={...item.builder!,shape:o.points??null};item.points=(o.points??[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}]).map(p=>({x:metres(p.x*item.width),y:metres(p.y*item.height)}));objects.push(item);}
      else{if(o.type==='entrance')item.entranceType=o.entranceType!;if(o.type==='seat'){item.width=.45;item.height=.45;item.number=o.number??1;}objects.push(item);}
    }
  }
  const tariffs=hall.categories.map(c=>({...c.source,id:c.id,name:c.name||'Категория',color:c.color,price:c.price===null?0:Math.round(c.price*factor),draftAmount:c.price===null?null:Math.round(c.price*factor),unit:c.unit,active:c.active}));
  return {room:{widthM:mm(hall.room.w),heightM:mm(hall.room.h)},editor:hallEditorSchema.parse({version:1,objects,tariffs})};
}

/** Existing individual rows become single-row blocks; new grouped blocks reconstruct without changing IDs. */
export function venueToBuilder(state:HallState, options:{id:string;name:string;currency:string;revision:number;exponent?:number}):BuilderHall {
  const h=newHall(options.name),factor=10**(options.exponent??2);Object.assign(h,{id:options.id,currency:options.currency,revision:options.revision,room:{w:state.room.widthM*SCALE,h:state.room.heightM*SCALE}});
  const input=state.editor.objects, categoryIds=new Map<string,string>();
  const categoryFor=(object:HallObject,unit:SaleUnit):string|null=>{
    const tariff=state.editor.tariffs.find(t=>t.id===object.tariffId);
    if(!tariff&&object.price===null)return null;
    const amount=object.price??(tariff?.draftAmount===undefined?tariff?.price:tariff.draftAmount)??null;
    const key=`${object.price===null&&tariff?tariff.id:`direct:${object.color}`}:${unit}:${amount}`;
    const old=categoryIds.get(key);if(old)return old;
    const id=tariff&&!h.categories.some(c=>c.id===tariff.id)?tariff.id:crypto.randomUUID();categoryIds.set(key,id);
    const c:BuilderCategory={id,name:tariff?.name||object.name||'Стандарт',price:amount===null?null:amount/factor,unit,color:tariff?.color??object.color,active:tariff?.active!==false,...(tariff?{source:tariff}:{})};h.categories.push(c);return id;
  };
  const assignedCategory=(o:HallObject,unit:SaleUnit)=>o.builder?.tariffId===null?null:categoryFor(o.builder?.tariffId===undefined?o:{...o,tariffId:o.builder.tariffId,price:null},unit);
  const configure=(o:HallObject,type:BuilderObject['type']):BuilderObject=>({...makeObject(type,o.x*SCALE,o.y*SCALE),id:o.id,name:o.name||({rows:'Ряд',round:'Стол',rect:'Стол',standing:'Стоячая зона',stage:'Сцена',obstacle:'Препятствие',entrance:'Вход',seat:'Место'} as const)[type],x:o.x*SCALE,y:o.y*SCALE,w:o.width*SCALE,h:o.height*SCALE,rotation:o.rotation,pinned:o.builder?.pinned??false,disabled:o.builder?.disabled??o.locked,color:o.color,opacity:o.opacity,categoryId:assignedCategory(o,unitFor(o,input)),source:o});
  const groups=new Map<string,HallObject[]>();
  for(const o of input.filter(o=>o.type==='row')){const key=o.builder?.group?.id??o.id;groups.set(key,[...(groups.get(key)??[]),o]);}
  for(const [id,unordered] of groups){
    const rows=unordered.sort((a,b)=>(a.builder?.row?.index??0)-(b.builder?.row?.index??0)),first=rows[0]!,g=first.builder?.group;
    let o=configure(first,'rows');o.id=g?id:crypto.randomUUID();o.name=g?.name??(first.name||'Ряд');if(g)o.categoryId=categoryFor({...first,tariffId:g.tariffId??null,price:null},'seat');
    Object.assign(o,{x:(g?.x??first.x)*SCALE,y:(g?.y??first.y)*SCALE,rotation:g?.rotation??first.rotation,rowCount:rows.length,seatsPerRow:Math.max(1,input.filter(s=>s.parentId===first.id).length),seatPitch:(g?.seatPitch??Math.max(.55,first.width/Math.max(1,input.filter(s=>s.parentId===first.id).length)))*SCALE,rowPitch:(g?.rowPitch??1.1)*SCALE,aisle:g?.aisle??'none',aisleWidth:(g?.aisleWidth??1.1)*SCALE,firstRow:g?.firstRow??first.number,firstSeat:g?.firstSeat??first.startNumber,reverse:g?.reverse??first.reverse,curvature:(g?.curvature??0)*SCALE});
    o.rows=rows.map(r=>({id:r.id,count:input.filter(s=>s.parentId===r.id).length,dx:(r.builder?.row?.dx??0)*SCALE,dy:(r.builder?.row?.dy??0)*SCALE,categoryId:assignedCategory(r,'seat'),...(r.builder?.row?.pitch===undefined?{}:{pitch:r.builder.row.pitch*SCALE}),source:r}));
    o.seats=rows.flatMap(r=>input.filter(s=>s.parentId===r.id).sort((a,b)=>a.attachedOrder-b.attachedOrder||a.number-b.number).map(s=>({id:s.id,rowId:r.id,dx:0,dy:0,disabled:s.builder?.disabled??s.locked,categoryId:assignedCategory(s,'seat'),source:s})));
    if(o.seats.length)o=reconcile(o);
    const generated=seatPositions(o);o.seats=o.seats!.map(s=>{const original=s.source!,local=rotate((original.x*SCALE-o.x),(original.y*SCALE-o.y),-o.rotation),at=generated.find(v=>v.id===s.id)!;return{...s,...(original.builder?.seat?{dx:original.builder.seat.dx*SCALE,dy:original.builder.seat.dy*SCALE,...(original.builder.seat.number===undefined?{}:{number:original.builder.seat.number})}:{dx:local.x-at.x,dy:local.y-at.y,...(original.number===at.number?{}:{number:original.number})})};});h.objects.push(o);
  }
  for(const source of input.filter(o=>o.type!=='row'&&!o.parentId)){
    const type=({table_round:'round',table_rect:'rect',zone:'standing',prop:source.builder?.kind==='obstacle'?'obstacle':'stage',entrance:'entrance',seat:'seat'} as const)[source.type as Exclude<HallObject['type'],'row'>];
    let o=configure(source,type);
    if(type==='round'||type==='rect'){
      const children=input.filter(s=>s.parentId===source.id).sort((a,b)=>a.attachedOrder-b.attachedOrder||a.number-b.number);
      Object.assign(o,{saleMode:source.saleMode,count:children.length,chairOffset:source.seatOffset*SCALE,arrangement:source.builder?.arrangement??(type==='round'?'even':'custom'),sides:sides.map(side=>children.filter(s=>s.side===side).length)});
      o.seats=children.map(s=>({id:s.id,dx:0,dy:0,disabled:s.builder?.disabled??s.locked,categoryId:assignedCategory(s,source.saleMode==='whole_table'?'table':'seat'),source:s,...(type==='round'&&!s.builder?.seat?{angle:s.orbitAngle===undefined?Math.atan2(rotate((s.x-source.x)*SCALE,(s.y-source.y)*SCALE,-source.rotation).y,rotate((s.x-source.x)*SCALE,(s.y-source.y)*SCALE,-source.rotation).x):s.orbitAngle*Math.PI/180}:{})}));
      const generated=seatPositions(o);o.seats=o.seats.map(s=>{const original=s.source!,p=rotate(original.x*SCALE-o.x,original.y*SCALE-o.y,-o.rotation),at=generated.find(v=>v.id===s.id)!;return{...s,...(original.builder?.seat?{dx:original.builder.seat.dx*SCALE,dy:original.builder.seat.dy*SCALE,...(original.builder.seat.angle===undefined?{}:{angle:original.builder.seat.angle}),...(original.builder.seat.number===undefined?{}:{number:original.builder.seat.number})}:{dx:p.x-at.x,dy:p.y-at.y,...(original.number===at.number?{}:{number:original.number})})};});
    }else if(type==='standing'){
      o.capacity=source.capacity||null;
      if(source.builder?.shape!==undefined)o.points=source.builder.shape;
      else{
        // Older polygons can extend half a centimetre past their declared box
        // after metre quantization. Expand only the editing box, keeping all
        // polygon coordinates and the ticket quota unchanged.
        const width=Math.max(source.width,...source.points.map(p=>Math.abs(p.x)*2)),height=Math.max(source.height,...source.points.map(p=>Math.abs(p.y)*2));
        o.w=width*SCALE;o.h=height*SCALE;o.points=source.points.map(p=>({x:p.x/width,y:p.y/height}));
      }
    }
    else if(type==='entrance')o.entranceType=source.entranceType;
    else if(type==='seat')o.number=source.number;
    h.objects.push(o);
  }
  // Keep unused categories editable too; infer a safe unit only when historical data lacks one.
  for(const t of state.editor.tariffs)if(!h.categories.some(c=>c.id===t.id))categoryFor({...newHallObject(crypto.randomUUID(),'seat',0,0),tariffId:t.id},t.unit??'seat');
  if(h.categories.length>100)throw new Error('В этой исторической схеме больше 100 разных категорий. Используйте предыдущий редактор для проверки цен.');
  const order=new Map(state.editor.tariffs.map((t,i)=>[t.id,i]));
  h.categories.sort((a,b)=>(order.get(a.source?.id??a.id)??Number.MAX_SAFE_INTEGER)-(order.get(b.source?.id??b.id)??Number.MAX_SAFE_INTEGER));
  return h;
}
