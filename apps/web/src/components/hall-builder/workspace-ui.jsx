import React, { useEffect, useId, useRef, useState } from 'react';
import { SiteIcon as Icon } from './site-icons.jsx';
import { TYPES, category, saleInventory, seatPositions } from './model.mjs';
import { selectionPricing, unpricedObjects } from './pricing.mjs';

const unitForms = { seat: ['место','места','мест'], table: ['стол целиком','стола целиком','столов целиком'], entry: ['входной билет','входных билета','входных билетов'] };
const quantityLabel = (n, unit) => { const forms=unitForms[unit], mod=n%100;return `${n} ${forms[mod>=11&&mod<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2]}`; };
export const inventoryLabel = counts => Object.entries(counts).filter(([, n]) => n > 0).map(([unit, n]) => quantityLabel(n,unit)).join(' · ');
const priceUnitLabels = {seat:'за место',table:'за стол',entry:'за вход'};
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

export function PricingPanel({ hall, selection, seatId, rowId, detail, brush, money, onScope, onShowMissing, onEditCategory, onClearSelection }) {
  const report = selectionPricing(hall, selection, { seatId, rowId });
  const selected = hall.objects.find(o => o.id === selection[0]), cat = category(hall, brush);
  const position = selected && seatPositions(selected).find(s => s.id === seatId);
  const scope = seatId ? `${position?.rowNumber ? `Ряд ${position.rowNumber} · ` : ''}Место ${position?.number}` : rowId ? `Ряд ${selected.firstRow + selected.rows.findIndex(r => r.id === rowId)}` : null;
  const total = saleInventory(hall).filter(i => i.available && i.priced).reduce((n, i) => n + i.price * i.quantity, 0);
  const missing = unpricedObjects(hall).reduce((n, i) => n + i.quantity, 0);
  const assigned = hall.categories.flatMap(c => {
    const quantity = report.targets.filter(i => i.categoryId === c.id).reduce((n, i) => n + i.quantity, 0);
    return quantity ? [{ ...c, quantity }] : [];
  });
  const unassigned = report.targets.filter(i => !i.categoryId).reduce((n, i) => n + i.quantity, 0);
  const mixed = Object.values(report.counts).filter(n => n > 0).length > 1;
  return <>
    {selected ? <div className="selected-object"><span><Icon name={selection.length > 1 ? 'layers' : selected.type} size={23}/></span><div><b>{selection.length > 1 ? `Выбрано объектов: ${selection.length}` : selected.name}</b><small>{scope || inventoryLabel(report.counts) || TYPES[selected.type]}</small></div></div> : <div className="pricing-intro"><Icon name="palette" size={25}/><h3>{cat ? cat.name : 'Назначьте цены'}</h3><p>{cat ? `${money(cat.price, hall.currency)} · ${priceUnitLabels[cat.unit]}` : 'Выберите объекты и категорию в любом порядке. Подтвердите назначение рядом с объектом.'}</p>{cat && <><p>Выберите объект на схеме. Цена изменится только после подтверждения.</p><button className="btn full" onClick={onEditCategory}>Изменить категорию</button></>}</div>}
    {scope && <button className="scope-back" onClick={() => onScope('object')}><Icon name="back" size={14}/>Весь объект: {selected.name}</button>}
    {selected && <section className="current-price-summary" aria-label="Назначенные категории"><span className="eyebrow">ТЕКУЩИЕ КАТЕГОРИИ</span>{assigned.map(c => <div key={c.id}><i style={{background:c.color}}/><span><b>{c.name}</b><small>{money(c.price,hall.currency)} · {priceUnitLabels[c.unit]}{c.active===false?' · выключена':''}</small></span><strong>{c.quantity}</strong></div>)}{unassigned>0 && <p className="fineprint">Без категории: {unassigned}</p>}
      <p className={`fineprint ${mixed?'pricing-selection-warning':''}`}>{mixed ? 'Выбраны разные единицы продажи. Оставьте места, столы целиком или входные билеты для одного назначения.' : !report.quantity ? 'Нет доступных единиц продажи. Проверьте вместимость и настройку «Не продавать».' : 'Нажмите категорию слева и подтвердите назначение в небольшом окне у объекта.'}</p>
      <button className="scope-back" onClick={onClearSelection}>Снять выделение</button>
    </section>}
    {selected?.seats && selected.saleMode !== 'whole_table' && selection.length === 1 && <div className="pricing-scope-actions">{selected.type === 'rows' && <button className="btn full" onClick={() => onScope('rows')}>Выбрать ряд</button>}<button className="btn full" onClick={() => onScope('seats')}>Выбрать отдельное место</button></div>}
    {detail==='seats'&&!seatId&&selected?.seats&&selected.saleMode!=='whole_table'&&<details className="disclosure pricing-seat-list" open><summary>Выберите место на схеме или здесь<Icon name="chevron" size={14}/></summary><div className="seat-picker">{seatPositions(selected).map(s=><button key={s.id} aria-label={`${s.rowNumber?`Ряд ${s.rowNumber}, `:''}место ${s.number}`} disabled={s.disabled} onClick={e=>onScope('seat',s.id,e)}>{s.rowNumber?`${s.rowNumber}·`:''}{s.number}</button>)}</div></details>}
    {rowId && <label className="field"><span>Выбрать ряд</span><select value={rowId} onChange={e => onScope('row', e.target.value, e)}>{selected.rows.map((r, i) => <option key={r.id} value={r.id}>Ряд {selected.firstRow + i}</option>)}</select></label>}
    {selection.length > 0 && <div className="selection-subtotal"><span>Сумма выделения<small>По назначенным ценам</small></span><strong>{money(report.subtotal, hall.currency)}</strong>{report.missing > 0 && <small>Без цены в выделении: {report.missing}</small>}</div>}
    <div className="panel-divider"/><span className="eyebrow">ПОТЕНЦИАЛЬНАЯ ВЫРУЧКА</span><div className="revenue">{money(total, hall.currency)}</div><p className="fineprint">По текущим назначенным ценам</p>
    {missing > 0 && <div className="pricing-warning"><Icon name="alert" size={16}/><div><b>Без цены: {missing}</b><p>Они не включены в расчёт выручки.</p><button onClick={onShowMissing}>Найти на схеме <Icon name="arrow" size={13}/></button></div></div>}
  </>;
}

// Native top-layer popover also works inside the event's full-screen editor dialog.
export function PricingConfirmation({ proposal, hall, money, onApply, onChangeSaleMode, onCancel }) {
  const ref = useRef(null), cancel = useRef(null), titleId = useId(), copyId = useId();
  const callbacks = useRef({ onCancel }); callbacks.current = { onCancel };
  const report = selectionPricing(hall, proposal.selection, { ...proposal, categoryId: proposal.categoryId });
  const cat = category(hall, proposal.categoryId), mismatch = proposal.mismatch;
  useEffect(() => {
    const node = ref.current, root = node.closest('.ticket-hall-builder');
    node.showPopover();
    const rootBox = root.getBoundingClientRect(), box = node.getBoundingClientRect();
    const left = Math.max(12, rootBox.left + 8), right = Math.min(window.innerWidth - 12, rootBox.right - 8);
    const top = Math.max(12, rootBox.top + 8), bottom = Math.min(window.innerHeight - 12, rootBox.bottom - 8);
    node.style.left = `${Math.max(left, Math.min(proposal.point.x + 14, right - box.width))}px`;
    node.style.top = `${Math.max(top, Math.min(proposal.point.y + 14 + box.height <= bottom ? proposal.point.y + 14 : proposal.point.y - box.height - 14, bottom - box.height))}px`;
    cancel.current.focus({preventScroll:true});
    const dismiss = e => { if (!node.contains(e.target)) callbacks.current.onCancel(false); };
    const escape = e => { if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();callbacks.current.onCancel(true);} };
    const moved = e => { if(!node.contains(e.target)) callbacks.current.onCancel(false); };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('focusin', dismiss);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', moved);
    document.addEventListener('scroll', moved, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('focusin', dismiss);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', moved);
      document.removeEventListener('scroll', moved, true);
    };
  }, [proposal]);
  if (!cat) return null;
  return <div ref={ref} popover="manual" role="dialog" aria-labelledby={titleId} aria-describedby={copyId} className="pricing-confirmation">
    <h3 id={titleId}>{mismatch ? mismatch.saleMode==='whole_table'?'Стол продаётся целиком':'Стол продаётся по местам' : 'Назначить категорию?'}</h3>
    <div className="pricing-confirmation-category"><i style={{background:cat.color}}/><b>{cat.name}</b><span>{money(cat.price,hall.currency)} {priceUnitLabels[cat.unit]}</span></div>
    {mismatch ? <>
      <p id={copyId} className="pricing-mismatch-copy">Для категории «{cat.name}» нужно продавать {mismatch.targetSaleMode==='whole_table'?'стол целиком':'отдельные места за столом'}.</p>
      <div className="pricing-confirmation-actions pricing-mismatch-actions"><button ref={cancel} className="btn" onClick={()=>onCancel(true)}>Закрыть</button><button className="btn primary" onClick={onChangeSaleMode}>Изменить тип продажи</button></div>
    </> : <>
      <p id={copyId}>{inventoryLabel(report.counts)}{cat.price!=null && <> · {money(report.quantity*cat.price,hall.currency)}</>}</p>
      {report.matching>0 && <small>Уже в этой категории: {report.matching} из {report.quantity}.</small>}
      {!proposal.seatId && <small>Заменит категории {proposal.rowId?'в этом ряду':'в выбранных объектах'}. Недоступные места сохранят свои настройки.</small>}
      {report.inactive>0 && <small>Вернёт в продажу единиц: {report.inactive}.</small>}
      {cat.price==null && <small>Цена категории пока не указана.</small>}
      <div className="pricing-confirmation-actions"><button ref={cancel} className="btn" onClick={()=>onCancel(true)}>Отмена</button><button className="btn primary" disabled={!report.canApply} onClick={onApply}>Применить</button></div>
    </>}

  </div>;
}
