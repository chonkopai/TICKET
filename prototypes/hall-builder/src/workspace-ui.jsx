import React, { useEffect, useRef, useState } from 'react';
import { SiteIcon as Icon } from './site-icons.jsx';
import { TYPES, category, saleInventory, seatPositions } from './model.mjs';
import { selectionPricing, unpricedObjects } from './pricing.mjs';

const unitForms = { seat: ['место','места','мест'], table: ['стол целиком','стола целиком','столов целиком'], entry: ['входной билет','входных билета','входных билетов'] };
const quantityLabel = (n, unit) => { const forms=unitForms[unit], mod=n%100;return `${n} ${forms[mod>=11&&mod<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2]}`; };
export const inventoryLabel = counts => Object.entries(counts).filter(([, n]) => n > 0).map(([unit, n]) => quantityLabel(n,unit)).join(' · ');
const tableType = o => ['round', 'rect'].includes(o.type);

export function ObjectList({ hall, selection, onSelect, searchable = false }) {
  const [query, setQuery] = useState('');
  const group = useRef(null);
  const missing = unpricedObjects(hall);
  const missingIds = new Set(missing.map(m => m.object.id));
  const objects = hall.objects.filter(o => o.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const tables = objects.filter(o => tableType(o) && !missingIds.has(o.id));
  const grouped = !query && tables.length > 2;
  useEffect(() => { if (group.current && tables.some(o => selection.includes(o.id))) group.current.open = true; }, [selection.join(','), grouped, tables.map(o=>o.id).join(',')]);
  const item = o => {
    const unpriced = missing.find(m => m.object.id === o.id)?.quantity;
    const units = saleInventory({ ...hall, objects: [o] });
    const inactive = units.length > 0 && units.every(i => !i.available);
    return <button key={o.id} data-list-object={o.id} className={selection.includes(o.id) ? 'active' : ''} aria-pressed={selection.includes(o.id)} onClick={() => onSelect(o.id)}>
      <Icon name={o.type} size={17}/><span><b>{o.name}</b><small>{o.type === 'rows' ? `${o.rows.length} рядов · ${o.seats.length} мест` : tableType(o) ? `${o.seats.length} мест · ${o.saleMode === 'whole_table' ? 'целиком' : 'по местам'}` : o.type === 'standing' ? o.capacity == null ? 'Вместимость не задана' : `${o.capacity} билетов` : TYPES[o.type]}</small>
      {unpriced > 0 && <small className="object-warning">Без цены: {unpriced}</small>}{inactive && <small>Не продаётся</small>}</span>
      {o.pinned && <Icon name="pin" size={13}/>}<i style={{ background: category(hall, o.categoryId)?.color ?? 'var(--ticket-dim)' }}/>
    </button>;
  };
  return <>{searchable && <label className="object-search"><Icon name="search" size={17}/><input aria-label="Найти объект" placeholder="Найти объект…" value={query} onChange={e => setQuery(e.target.value)}/></label>}
    <div className="objects-list">{objects.filter(o => !grouped || !tables.includes(o)).map(item)}
      {grouped && <details ref={group} className="object-group"><summary><Icon name="chevron" size={14}/><Icon name="round" size={17}/>Столы <span>{tables.length}</span></summary><div className="objects-list">{tables.map(item)}</div></details>}
      {!objects.length && <p className="fineprint">{query ? 'Объекты не найдены' : 'Добавьте первый объект на схему'}</p>}
    </div></>;
}

export function UnpricedFinder({ hall, active, onShow, onJump }) {
  const missing = unpricedObjects(hall), count = missing.reduce((n, m) => n + m.quantity, 0);
  return <section className={`unpriced-finder ${active ? 'active' : ''}`} aria-label="Поиск объектов без цены">
    <div><b>Без цены</b><span>{count}</span></div>
    <p>{count ? 'Назначьте цены перед проверкой.' : 'Цена назначена всей доступной вместимости.'}</p>
    <button className="btn full" disabled={!count} onClick={onShow}><Icon name="eye" size={17}/>{active ? 'Показать все без цены' : 'Показать на схеме'}</button>
    {active && <div className="missing-objects">{missing.map((m, index) => <button key={m.object.id} onClick={() => onJump(index)}><span>{m.object.name}<small>{quantityLabel(m.quantity,m.items[0].unit)} без цены</small></span><Icon name="arrow" size={14}/></button>)}</div>}
  </section>;
}

export function PricingPanel({ hall, selection, seatId, rowId, detail, brush, money, onApply, onScope, onShowMissing, onEditCategory, onChooseCategory }) {
  const report = selectionPricing(hall, selection, { seatId, rowId, categoryId: brush });
  const selected = hall.objects.find(o => o.id === selection[0]), cat = category(hall, brush);
  const position = selected && seatPositions(selected).find(s => s.id === seatId);
  const scope = seatId ? `${position?.rowNumber ? `Ряд ${position.rowNumber} · ` : ''}Место ${position?.number}` : rowId ? `Ряд ${selected.firstRow + selected.rows.findIndex(r => r.id === rowId)}` : null;
  const total = saleInventory(hall).filter(i => i.available && i.priced).reduce((n, i) => n + i.price * i.quantity, 0);
  const missing = unpricedObjects(hall).reduce((n, i) => n + i.quantity, 0);
  const requiredUnits=Object.keys(report.counts).filter(unit=>report.counts[unit]>0);
  const neededUnit=requiredUnits.length===1?`Выберите категорию «${{seat:'За место',table:'За стол',entry:'За вход'}[requiredUnits[0]]}».`:'Выберите объекты с одной единицей продажи.';
  let feedback = !selection.length ? 'Выберите объекты на схеме или в списке.' : !report.quantity ? 'В выбранном нет доступных единиц продажи. Проверьте вместимость и настройку «Не продавать».' : !cat ? 'Выберите категорию слева.' : cat.active === false ? 'Категория выключена. Включите её или выберите другую.' : report.incompatible ? `Категория подходит только ${cat.unit === 'seat' ? 'для отдельных мест' : cat.unit === 'table' ? 'для столов целиком' : 'для входных билетов'}. Цвет и цена не изменены. ${neededUnit}` : report.matching === report.quantity ? `Уже в категории «${cat.name}»: ${inventoryLabel(report.counts)}.` : report.matching ? `${report.matching} из ${report.quantity} уже в категории «${cat.name}».` : `Категория будет назначена: ${inventoryLabel(report.counts)}.`;
  const compatibleCategories=hall.categories.filter(c=>c.active!==false&&report.quantity>0&&Object.keys(report.counts).every(unit=>!report.counts[unit]||unit===c.unit));
  const already = !!cat && !report.incompatible && report.quantity > 0 && report.matching === report.quantity;
  return <>
    {selected ? <div className="selected-object"><span><Icon name={selection.length > 1 ? 'layers' : selected.type} size={23}/></span><div><b>{selection.length > 1 ? `Выбрано объектов: ${selection.length}` : selected.name}</b><small>{scope || inventoryLabel(report.counts) || TYPES[selected.type]}</small></div></div> : <div className="pricing-intro"><Icon name="palette" size={25}/><h3>Назначьте цены</h3><p>Выберите категорию, затем блок, стол, зону или отдельное место.</p></div>}
    {scope && <button className="scope-back" onClick={() => onScope('object')}><Icon name="back" size={14}/>Весь объект: {selected.name}</button>}
    {cat && <div className="assignment-category"><span className="eyebrow">КАТЕГОРИЯ ДЛЯ НАЗНАЧЕНИЯ</span><div><i style={{ background: cat.color }}/><b>{cat.name}</b><strong>{money(cat.price, hall.currency)}</strong></div><small>{cat.unit === 'seat' ? 'За одно место' : cat.unit === 'table' ? 'За весь стол' : 'За один входной билет'}</small></div>}
    {cat?.price==null&&cat&&<div className="pricing-missing-amount"><p className="fineprint">В категории пока не указана цена.</p><button className="btn soft full" onClick={onEditCategory}>Указать цену категории</button></div>}
    <p className={`assignment-feedback ${already ? 'complete' : report.incompatible || cat?.active === false ? 'warning' : ''}`} role="status"><Icon name={already ? 'check' : 'help'} size={16}/>{feedback}</p>
    {report.incompatible&&compatibleCategories.length>0&&<div className="compatible-price-choices"><span>Подходящие категории:</span>{compatibleCategories.map(c=><button className="btn full" key={c.id} onClick={()=>onChooseCategory(c.id)}><i style={{background:c.color}}/>{c.name}</button>)}</div>}
    {report.canApply&&<p className="fineprint price-apply-explanation">Цвет и цена на схеме изменятся после нажатия «Применить».</p>}
    <button className="btn primary full" disabled={!report.canApply} onClick={onApply}><Icon name="palette" size={17}/>{already ? 'Категория уже назначена' : 'Применить к выбранному'}</button>
    {report.canApply && report.inactive>0 && <p className="fineprint">Активная категория вернёт в продажу {report.inactive} единиц из выключенных категорий.</p>}
    {report.canApply && !seatId && <p className="fineprint assignment-hint">Заменит цены {rowId ? 'мест в этом ряду' : 'внутри выбранных объектов'}. Недоступные места останутся недоступными. Действие можно отменить.</p>}
    {selected?.seats && selected.saleMode !== 'whole_table' && selection.length === 1 && <div className="pricing-scope-actions">{selected.type === 'rows' && <button className="btn full" onClick={() => onScope('rows')}>Выбрать ряд</button>}<button className="btn full" onClick={() => onScope('seats')}>Выбрать отдельное место</button></div>}
    {detail==='seats'&&!seatId&&selected?.saleMode!=='whole_table'&&<details className="disclosure pricing-seat-list" open><summary>Выберите место на схеме или здесь<Icon name="chevron" size={14}/></summary><div className="seat-picker">{seatPositions(selected).map(s=><button key={s.id} aria-label={`${s.rowNumber?`Ряд ${s.rowNumber}, `:''}место ${s.number}`} disabled={s.disabled} onClick={()=>onScope('seat',s.id)}>{s.rowNumber?`${s.rowNumber}·`:''}{s.number}</button>)}</div></details>}
    {rowId && <label className="field"><span>Выбрать ряд</span><select value={rowId} onChange={e => onScope('row', e.target.value)}>{selected.rows.map((r, i) => <option key={r.id} value={r.id}>Ряд {selected.firstRow + i}</option>)}</select></label>}
    {selection.length > 0 && <div className="selection-subtotal"><span>Сумма выделения<small>По назначенным ценам</small></span><strong>{money(report.subtotal, hall.currency)}</strong>{report.missing > 0 && <small>Без цены в выделении: {report.missing}</small>}</div>}
    <div className="panel-divider"/><span className="eyebrow">ПОТЕНЦИАЛЬНАЯ ВЫРУЧКА</span><div className="revenue">{money(total, hall.currency)}</div><p className="fineprint">По текущим назначенным ценам</p>
    {missing > 0 && <div className="pricing-warning"><Icon name="alert" size={16}/><div><b>Без цены: {missing}</b><p>Они не включены в расчёт выручки.</p><button onClick={onShowMissing}>Найти на схеме <Icon name="arrow" size={13}/></button></div></div>}
  </>;
}
