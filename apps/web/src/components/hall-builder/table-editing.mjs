import { DINER_WIDTH, SCALE, bounds, clone, makeObject, rectSideCounts, reconcile, resizeObject, seatPositions, uid, worldBounds } from './model.mjs';

export const SIDE_NAMES = ['сверху', 'справа', 'снизу', 'слева'];
const tau = Math.PI * 2;
const angleDistance = (a,b) => Math.abs(((a-b+Math.PI)%tau+tau)%tau-Math.PI);

// Keep the same chair records on every unaffected side, including prices and IDs.
export function changeTableSide(object, side, delta) {
  const counts=rectSideCounts(object),count=counts[side]+delta;
  if(count<0||object.count+delta<1||object.count+delta>32)return object;
  const groups=[0,1,2,3].map(i=>seatPositions(object).filter(s=>s.side===i).map(s=>object.seats.find(v=>v.id===s.id)));
  if(delta>0)groups[side].push({id:uid(),dx:0,dy:0,disabled:false,categoryId:null});else groups[side].pop();
  counts[side]=count;
  return reconcile({...object,arrangement:'custom',sides:counts,count:object.count+delta,seats:groups.flat(),w:Math.max(object.w,Math.max(counts[0],counts[2])*DINER_WIDTH),h:Math.max(object.h,Math.max(counts[1],counts[3])*DINER_WIDTH)});
}

export function changeRoundSeats(object, delta, seatId) {
  if(object.count+delta<1||object.count+delta>32)return object;
  if(delta<0){const seats=object.seats.filter(s=>s.id!==(seatId??object.seats.at(-1).id));return {...object,count:seats.length,seats};}
  // Each new chair reserves 60 cm of table edge. Redistribute on addition only;
  // dragging a chair afterwards leaves all its neighbours where they are.
  const count=object.count+1,w=Math.max(object.w,Math.ceil(count*DINER_WIDTH/Math.PI));
  return reconcile({...object,count,w,h:w,arrangement:'even',seats:object.seats.map(s=>({...s,angle:undefined,dx:0,dy:0}))});
}

export function slideRoundSeat(object, seatId, angle) {
  const gap=DINER_WIDTH/(object.w/2);
  const positions=seatPositions(object);
  if(positions.some(s=>s.id!==seatId&&angleDistance(s.angle,angle)<gap-1e-7))return null;
  return {...object,seats:object.seats.map(s=>s.id===seatId?{...s,angle,dx:0,dy:0}:s)};
}

export function resizePreviewTable(object,width,height) {
  const resized=resizeObject(object,width,height);
  if(!resized||object.type!=='round')return resized;
  const seats=seatPositions(resized),gap=DINER_WIDTH/(resized.w/2);
  return seats.some((s,i)=>seats.some((other,j)=>j>i&&angleDistance(s.angle,other.angle)<gap-1e-7))?null:resized;
}

export function previewFrame(object) {
  const b=bounds(object),padding=14;
  return {x:b.x-padding,y:b.y-padding,w:b.w+padding*2,h:b.h+padding*2};
}

export function resizePreviewAtPoint(object,point,corner) {
  const frame=previewFrame(object),edgeX=corner.x<0?frame.x:frame.x+frame.w,edgeY=corner.y<0?frame.y:frame.y+frame.h;
  const width=Math.max(36,Math.round(2*(Math.abs(point.x)-(Math.abs(edgeX)-object.w/2))));
  const height=Math.max(30,Math.round(2*(Math.abs(point.y)-(Math.abs(edgeY)-object.h/2))));
  return resizePreviewTable(object,width,height);
}

export function tableCopies(object, {quantity=1,cols=1,gap=40,spot}) {
  const envelope=worldBounds({...object,x:0,y:0}),w=envelope.right-envelope.left,h=envelope.bottom-envelope.top;
  return Array.from({length:quantity},(_,i)=>{
    const copy=clone(object);
    return {...copy,id:uid(),name:quantity===1?object.name:`${object.name} · ${i+1}`,x:spot.x+(i%cols)*(w+gap),y:spot.y+Math.floor(i/cols)*(h+gap),seats:copy.seats.map(s=>({...s,id:uid()}))};
  });
}

export function newTable(type,hall) {
  const number=Math.max(0,...hall.objects.filter(o=>['round','rect'].includes(o.type)).map(o=>Number(o.name.match(/\d+/)?.[0])||0))+1;
  return makeObject(type,0,0,{name:`Стол ${number}`,count:type==='rect'?6:8,...(type==='rect'?{arrangement:'custom',sides:[3,0,3,0],w:3*DINER_WIDTH,h:.9*SCALE}:{})});
}
