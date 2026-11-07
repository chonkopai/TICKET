import { worldBounds, seatPositions, SCALE } from './model.mjs';

const EPS=1e-7;
const equal=(a,b)=>Math.abs(a-b)<=EPS;
// Persisted geometry is rounded to centimetres. Keep a 1 cm tolerance so
// rounding a parent/attached chair cannot put it across the wall on reopening.
const inset=(b,room)=>({x:Math.min(.01*SCALE,Math.max(0,(room.w-(b.right-b.left))/2)),y:Math.min(.01*SCALE,Math.max(0,(room.h-(b.bottom-b.top))/2))});
const inside=(b,room)=>{const pad=inset(b,room);return b.left>=pad.x-EPS&&b.top>=pad.y-EPS&&b.right<=room.w-pad.x+EPS&&b.bottom<=room.h-pad.y+EPS;};
function sameShape(a,b){
  if(a===b)return true;
  if(a.type!==b.type||!['w','h','rotation'].every(key=>equal(a[key],b[key])))return false;
  if(JSON.stringify(a.points??null)!==JSON.stringify(b.points??null))return false;
  const first=seatPositions(a),second=seatPositions(b);
  return first.length===second.length&&first.every((seat,i)=>seat.id===second[i].id&&equal(seat.x,second[i].x)&&equal(seat.y,second[i].y));
}
const union=boxes=>({left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))});
const message='Объект вместе с креслами не помещается в зале. Уменьшите его или увеличьте зал.';

/** Keep translations and newly inserted groups inside the room. Spatial edits
 * (rotation, sizing, individual chairs/rows) are rejected at the boundary rather
 * than moving the parent unexpectedly. Existing untouched geometry is preserved. */
export function constrainHallToRoom(next,before,{movingIds}={}) {
  const old=new Map(before.objects.map(o=>[o.id,o]));
  const changed=next.objects.filter(o=>{const previous=old.get(o.id);return !previous||!equal(o.x,previous.x)||!equal(o.y,previous.y)||!sameShape(o,previous);});
  const movable=movingIds?next.objects.filter(o=>movingIds.includes(o.id)&&!o.pinned):changed.filter(o=>{
    const previous=old.get(o.id);
    if(!previous)return true;
    return sameShape(o,previous);
  });
  let result=next;
  if(movable.length){
    const box=union(movable.map(worldBounds));
    if(box.right-box.left>next.room.w+EPS||box.bottom-box.top>next.room.h+EPS)throw new Error(message);
    const pad=inset(box,next.room);
    const dx=Math.max(pad.x-box.left,Math.min(0,next.room.w-pad.x-box.right));
    const dy=Math.max(pad.y-box.top,Math.min(0,next.room.h-pad.y-box.bottom));
    if(Math.abs(dx)>EPS||Math.abs(dy)>EPS){
      const ids=new Set(movable.map(o=>o.id));
      result={...next,objects:next.objects.map(o=>{
        if(!ids.has(o.id))return o;
        const previous=old.get(o.id),x=o.x+dx,y=o.y+dy;
        return {...o,x:previous&&equal(x,previous.x)?previous.x:x,y:previous&&equal(y,previous.y)?previous.y:y};
      })};
    }
  }
  const changedIds=new Set(changed.map(o=>o.id));
  if(result.objects.some(o=>changedIds.has(o.id)&&!inside(worldBounds(o),result.room)))throw new Error(message);
  const shrinking=next.room.w<before.room.w-EPS||next.room.h<before.room.h-EPS;
  if(shrinking&&result.objects.some(o=>!inside(worldBounds(o),result.room)))throw new Error('Зал нельзя уменьшить: часть схемы окажется за его границами. Сначала переместите объекты внутрь.');
  return result;
}
