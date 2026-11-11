import React, { useEffect, useRef, useState } from 'react';
import { SiteIcon as Icon } from './site-icons.jsx';
import { CHAIR, SCALE, bounds, clone, rectSideCounts, rotate, seatPositions, updateObject, worldBounds } from './model.mjs';
import { changeRoundSeats, changeTableSide, newTable, previewFrame, resizePreviewAtPoint, resizePreviewTable, SIDE_NAMES, slideRoundSeat, tableCopies } from './table-editing.mjs';

function PreviewButton({x,y,label,icon='plus',disabled,onClick}) {
  return <g transform={`translate(${x} ${y})`} role="button" tabIndex={disabled?-1:0} aria-label={label} aria-disabled={disabled||undefined} className={`table-preview-button ${disabled?'disabled':''}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(!disabled)onClick();}} onKeyDown={e=>{if(!disabled&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();onClick();}}}><title>{label}</title><rect x="-10" y="-10" width="20" height="20" rx="6"/><Icon name={icon} size={13} x={-6.5} y={-6.5} pointerEvents="none"/></g>;
}

function PreviewDimension({label,value,onChange}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  return <label className="preview-dimension"><span>{label}</span><input aria-label={label} type="number" min="0.1" max="50" step="0.01" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={e=>{const n=Number(e.target.value);setDraft(String(value));if(e.target.value.trim()&&Number.isFinite(n)&&n>=.1&&n<=50&&n!==value)onChange(n);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();e.currentTarget.value=String(value);setDraft(String(value));e.currentTarget.blur();}}}/><small>м</small></label>;
}

export function TableComposer({type,hall,initialObject,availableSpot,onSubmit,renderSettings}) {
  const [object,setObject]=useState(()=>initialObject?clone(initialObject):newTable(type,hall));
  const [quantity,setQuantity]=useState(1),[cols,setCols]=useState(3),[gap,setGap]=useState(40),[message,setMessage]=useState(''),[seatId,setSeatId]=useState(null),[dragging,setDragging]=useState(false);
  const svg=useRef(null),gesture=useRef(null);
  const seats=seatPositions(object),b=bounds(object),frame=previewFrame(object),world=worldBounds({...object,x:0,y:0});
  const extent=Math.max(280,world.right-world.left+150,world.bottom-world.top+150);
  const viewBox=dragging?gesture.current.viewBox:`${-extent/2} ${-extent/2} ${extent} ${extent}`;
  const patch=change=>{try{setObject(updateObject(object,change));setMessage('');}catch(error){setMessage(error.message);}};
  const start=(e,kind,id)=>{e.preventDefault();e.stopPropagation();svg.current.setPointerCapture(e.pointerId);gesture.current={kind,id,before:clone(object),viewBox};setDragging(true);if(kind==='seat')setSeatId(id);};
  const move=e=>{
    const g=gesture.current;if(!g)return;
    const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.current.getScreenCTM().inverse()),before=g.before;
    if(g.kind==='rotate'){const rotation=Math.round((Math.atan2(point.y,point.x)*180/Math.PI+90)/5)*5;setObject({...before,rotation:((rotation+540)%360)-180});return;}
    const local=rotate(point.x,point.y,-before.rotation);
    if(g.kind==='seat'){
      const next=slideRoundSeat(before,g.id,Math.atan2(local.y,local.x));
      if(next){setObject(next);setMessage('');}else setMessage('Оставьте не менее 60 см края стола на гостя.');return;
    }
    const next=resizePreviewAtPoint(before,local,g.id);
    if(next){setObject(next);setMessage('');}else setMessage('Креслам нужно больше места. Увеличьте стол или уберите кресло.');
  };
  const end=e=>{if(!gesture.current)return;gesture.current=null;setDragging(false);if(svg.current.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId);};
  const changeDimension=(key,value)=>{
    const width=key==='w'||type==='round'?value*SCALE:object.w,height=key==='h'||type==='round'?value*SCALE:object.h;
    const next=resizePreviewTable(object,width,height);
    if(next){setObject(next);setMessage('');}else setMessage('Кресла не помещаются. Увеличьте стол или уберите кресло.');
  };
  const roundChange=delta=>{setObject(o=>changeRoundSeats(o,delta,seatId));setSeatId(null);setMessage('');};
  const submit=e=>{
    e.preventDefault();if(!object.name.trim())return;
    const configured={...object,name:object.name.trim()};
    if(initialObject){onSubmit(configured);return;}
    try{onSubmit(tableCopies(configured,{quantity,cols:Math.min(cols,quantity),gap,spot:availableSpot(configured)}));}catch(error){setMessage(error.message);}
  };
  return <form className="table-composer" onSubmit={submit}>
    <div className="table-composer-settings">
      <label className="field"><span>Название стола</span><input aria-label="Название стола" required maxLength={120} value={object.name} onChange={e=>setObject({...object,name:e.target.value})}/></label>
      <label className="field"><span>Что продаём</span><span className="table-sale-select"><select aria-label="Что продаём" value={object.saleMode} onChange={e=>patch({saleMode:e.target.value})}><option value="per_seat">Отдельные места</option><option value="whole_table">Стол целиком</option></select><Icon name="chevron" size={16}/></span></label>
      <p className="table-composer-help">{type==='rect'?'Кресла — кнопками ±.':'Кресла — по направляющей.'} Размер — за углы.</p>
      {!initialObject&&<details className="disclosure table-batch-disclosure"><summary>Несколько столов<Icon name="chevron" size={16}/></summary><div>
        <label className="field"><span>Количество столов</span><input aria-label="Количество столов" type="number" min="1" max="100" value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(100,Math.round(Number(e.target.value)||1))))}/></label>
        <label className="field"><span>Столов в ряду</span><input aria-label="Столов в ряду" type="number" min="1" max="10" value={cols} onChange={e=>setCols(Math.max(1,Math.min(10,Math.round(Number(e.target.value)||1))))}/></label>
        <label className="field"><span>Между столами, м</span><input aria-label="Между столами, м" type="number" min="0.25" max="5" step="0.25" value={gap/SCALE} onChange={e=>setGap(Math.max(10,Math.min(200,Number(e.target.value)*SCALE)))}/></label>
      </div></details>}
      {renderSettings?.(object,patch)}
      <button className="btn primary full table-composer-submit" type="submit"><Icon name={initialObject?'check':'plus'} size={17}/>{initialObject?'Сохранить изменения':quantity>1?`Добавить ${quantity} столов`:'Добавить на схему'}</button>
    </div>
    <div className="table-composer-preview">
      <div className="table-preview-heading"><span className="eyebrow">ВАШ СТОЛ</span><div className="table-preview-dimensions"><span>{object.count} мест</span>{type==='round'?<PreviewDimension label="Диаметр" value={Number((object.w/SCALE).toFixed(2))} onChange={v=>changeDimension('w',v)}/>:<><PreviewDimension label="Ширина" value={Number((object.w/SCALE).toFixed(2))} onChange={v=>changeDimension('w',v)}/><span>×</span><PreviewDimension label="Глубина" value={Number((object.h/SCALE).toFixed(2))} onChange={v=>changeDimension('h',v)}/></>}</div></div>
      <svg ref={svg} className="table-editor-canvas" viewBox={viewBox} aria-label="Редактор стола" onPointerMove={move} onPointerUp={end} onPointerCancel={e=>{if(gesture.current)setObject(gesture.current.before);end(e);}}>
        <g transform={`rotate(${object.rotation})`}>
          {type==='round'&&<circle className="chair-orbit" r={object.w/2+object.chairOffset}/>}
          {type==='round'?<circle r={object.w/2} className="preview-table"/>:<rect x={-object.w/2} y={-object.h/2} width={object.w} height={object.h} rx="6" className="preview-table"/>}
          <text className="preview-table-label" y="3" textAnchor="middle" pointerEvents="none">{object.name.length>22?object.name.slice(0,20)+'…':object.name}</text>
          {seats.map(s=><g key={s.id} transform={`translate(${s.x} ${s.y})`} className={`preview-chair ${seatId===s.id?'selected':''}`} role="button" tabIndex={0} aria-label={`Кресло ${s.number}${type==='round'?' · перетащите по направляющей':''}`} onPointerDown={e=>type==='round'?start(e,'seat',s.id):setSeatId(s.id)} onKeyDown={e=>{if(type!=='round')return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=slideRoundSeat(object,s.id,s.angle+(e.key==='ArrowRight'?1:-1)*Math.PI/90);if(next)setObject(next);}if(e.key==='Enter'||e.key===' '){e.preventDefault();setSeatId(s.id);}}}><g className="chair-facing" transform={`rotate(${s.facing??0})`}><rect x={-CHAIR/2} y={-CHAIR/2} width={CHAIR} height={CHAIR} rx="4"/><path d="M-5-5Q0-8 5-5" fill="none" stroke="var(--ticket-surface)" strokeWidth="1"/></g><text y="3" textAnchor="middle" pointerEvents="none">{s.number}</text></g>)}
          <line x1="0" x2="0" y1={b.y-9} y2={b.y-35} className="preview-handle-line"/>
          <g className="preview-rotate" role="button" tabIndex={0} aria-label="Повернуть стол" transform={`translate(0 ${b.y-45})`} onPointerDown={e=>start(e,'rotate')} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();patch({rotation:object.rotation+(e.key==='ArrowRight'?5:-5)});}}}><title>Перетащите, чтобы повернуть стол</title><circle r="11"/><Icon name="rotate" x={-7} y={-7} size={14} pointerEvents="none"/></g>
          <rect className="preview-selection-frame" x={frame.x} y={frame.y} width={frame.w} height={frame.h} rx="4" pointerEvents="none"/>
          {[-1,1].flatMap(x=>[-1,1].map(y=><rect key={`${x}:${y}`} className="preview-resize" role="button" tabIndex={0} aria-label={`Изменить размер стола ${x}:${y}`} x={(x<0?frame.x:frame.x+frame.w)-4} y={(y<0?frame.y:frame.y+frame.h)-4} width="8" height="8" rx="2" onPointerDown={e=>start(e,'resize',{x,y})} onKeyDown={e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const delta=e.key==='ArrowRight'||e.key==='ArrowUp'?2:-2,next=resizePreviewTable(object,object.w+delta,object.h+delta);if(next)setObject(next);}}/>))}
          {type==='rect'&&rectSideCounts(object).map((count,side)=>{
            const offsets=[[0,b.y-24],[b.x+b.w+26,0],[0,b.y+b.h+26],[b.x-26,0]], [x,y]=offsets[side],vertical=side%2===1;
            return <g key={side}><PreviewButton x={x-(vertical?0:13)} y={y-(vertical?13:0)} icon="minus" label={`Убрать кресло ${SIDE_NAMES[side]}`} disabled={!count||object.count<=1} onClick={()=>setObject(o=>changeTableSide(o,side,-1))}/><PreviewButton x={x+(vertical?0:13)} y={y+(vertical?13:0)} label={`Добавить кресло ${SIDE_NAMES[side]}`} disabled={object.count>=32} onClick={()=>setObject(o=>changeTableSide(o,side,1))}/></g>;
          })}
        </g>
      </svg>
      {type==='round'&&<div className="round-chair-controls" role="group" aria-label="Кресла вокруг стола"><button type="button" className="btn" disabled={object.count<=1} onClick={()=>roundChange(-1)}><Icon name="minus" size={16}/>{seatId?'Убрать выбранное':'Убрать кресло'}</button><button type="button" className="btn" disabled={object.count>=32} onClick={()=>roundChange(1)}><Icon name="plus" size={16}/>Добавить кресло</button><button type="button" className="btn" onClick={()=>setObject(o=>({...o,arrangement:'even',seats:o.seats.map(s=>({...s,angle:undefined,dx:0,dy:0}))}))}>Равномерно</button></div>}
      <p className={`table-preview-feedback ${message?'warning':''}`} role="status">{message||`Поворот ${Math.round(object.rotation)}° · ${object.saleMode==='whole_table'?'Стол продаётся целиком':'Каждое кресло продаётся отдельно'}`}</p>
    </div>
  </form>;
}
