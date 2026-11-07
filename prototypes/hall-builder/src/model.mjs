/* Standalone prototype model. Rotation and table/curved-row placement adapt
 * packages/shared-types/src/hall-editor.ts; parent/seat IDs remain stable.
 * Units are schematic pixels, 40 per metre; this is not a venue-capacity estimator. */
export const SCALE = 40;
export const CHAIR = 18;
export const COLORS = ['#7845ed', '#ed9c4b', '#3f9d85', '#d96c97', '#5289d7', '#bd9546', '#dc4c64', '#d65c35', '#a86f27', '#638c35', '#167d67', '#198ca3', '#3561b8', '#5148a8', '#a349b0', '#a53e75', '#68748a', '#354052'];
export const TYPES = { rows: 'Блок рядов', round: 'Круглый стол', rect: 'Прямоугольный стол', standing: 'Стоячая зона', stage: 'Сцена', obstacle: 'Препятствие', entrance: 'Вход / выход', seat: 'Отдельное место' };
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function rotate(x, y, degrees) { const r = degrees * Math.PI / 180; return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) }; }
export function newHall(name = 'Мой новый зал') { return { version: 1, id: uid(), name, currency: 'KZT', room: { w: 1200, h: 800 }, objects: [], categories: [], revision: 0 }; }
export function category(hall, id) { return hall.categories.find(c => c.id === id); }
export function resolvedCategory(hall, object, seat, row) { return category(hall, seat?.categoryId ?? row?.categoryId ?? object.categoryId); }
export function sellable(hall, object, seat) { const cat = resolvedCategory(hall, object, seat, object.rows?.find(r => r.id === seat?.rowId)); return !object.disabled && !seat?.disabled && (!cat || cat.active !== false); }
export function rowSize(object) {
  const count = Math.max(1, ...object.rows.map(r => r.count));
  return { w: Math.max(80, (count - 1) * object.seatPitch + CHAIR + 36 + (object.aisle !== 'none' ? object.aisleWidth : 0)), h: Math.max(60, (object.rows.length - 1) * object.rowPitch + CHAIR + 36 + Math.abs(object.curvature || 0)) };
}
export function reconcile(object) {
  const o = clone(object);
  if (o.type === 'rows') {
    const previousRows = o.rows ?? [];
    o.rows = Array.from({ length: clamp(Math.round(o.rowCount), 1, 100) }, (_, index) => previousRows[index] ?? { id: uid(), count: o.seatsPerRow, dx: 0, dy: 0, categoryId: null });
    const previous = o.seats ?? [];
    o.seats = o.rows.flatMap(row => Array.from({ length: row.count }, (_, index) => previous.filter(s => s.rowId === row.id)[index] ?? { id: uid(), rowId: row.id, dx: 0, dy: 0, disabled: false, categoryId: null }));
    const size = rowSize(o); o.w = size.w; o.h = size.h;
  } else if (o.type === 'round' || o.type === 'rect') {
    o.seats = Array.from({ length: clamp(Math.round(o.count), 1, 32) }, (_, index) => o.seats?.[index] ?? { id: uid(), dx: 0, dy: 0, disabled: false, categoryId: null });
  }
  return o;
}
export function makeObject(type, x = 600, y = 420, options = {}) {
  const base = { id: uid(), type, name: TYPES[type], x, y, w: 180, h: 100, rotation: 0, pinned: false, disabled: false, categoryId: null, opacity: .18, color: '#746b8b' };
  if (type === 'rows') Object.assign(base, { name: 'Партер', rowCount: 5, seatsPerRow: 12, seatPitch: 30, rowPitch: 44, aisle: 'center', aisleWidth: 44, firstRow: 1, firstSeat: 1, reverse: false, curvature: 0, rows: [], seats: [] });
  if (type === 'round' || type === 'rect') Object.assign(base, { name: 'Стол 1', count: 8, saleMode: 'per_seat', arrangement: type === 'round' ? 'even' : 'two', w: type === 'round' ? 88 : 128, h: type === 'round' ? 88 : 66, chairOffset: 28, sides: [4, 0, 4, 0], seats: [] });
  if (type === 'standing') Object.assign(base, { name: 'Танцпол', capacity: null, w: 280, h: 180, points: null });
  if (type === 'stage') Object.assign(base, { name: 'СЦЕНА', w: 390, h: 70, color: '#ddd7eb' });
  if (type === 'entrance') Object.assign(base, { name: 'Вход', w: 90, h: 22, entranceType: 'in' });
  if (type === 'seat') Object.assign(base, { name: 'Место 1', w: CHAIR, h: CHAIR, number: 1 });
  const configured={...base,...options};
  if(type==='rect'&&configured.arrangement==='custom')configured.count=configured.sides.reduce((a,b)=>a+b,0);
  const object=reconcile(configured);
  if(type==='rect'&&!rectCapacityValid(object))throw new Error(rectCapacityError(object));
  return object;
}
// Same side-capacity rule as the current hall editor: floor(length / 0.45m).
export function rectSideLimit(o, side) { return Math.max(0, Math.floor(((side % 2 ? o.h : o.w) + 1e-7) / CHAIR)); }
export function rectSideCounts(o) {
  if (o.arrangement === 'custom') return [...o.sides];
  const n=o.count;
  const sides=o.arrangement==='two'?[Math.ceil(n/2),0,Math.floor(n/2),0]:o.arrangement==='three'?[0,Math.floor(n/3),n-2*Math.floor(n/3),Math.floor(n/3)]:[Math.ceil(n/4),Math.floor(n/4),Math.floor(n/4),n-Math.ceil(n/4)-2*Math.floor(n/4)];
  const active=o.arrangement==='two'?[0,2]:o.arrangement==='three'?[1,2,3]:[0,1,2,3];
  const capped=sides.map((count,i)=>Math.min(count,rectSideLimit(o,i)));
  let remaining=n-capped.reduce((a,b)=>a+b,0);
  while(remaining>0){const available=active.filter(i=>capped[i]<rectSideLimit(o,i)).sort((a,b)=>capped[a]-capped[b]||a-b);if(!available.length)break;capped[available[0]]++;remaining--;}
  // Imported older layouts can exceed the cap; keep every existing chair visible until repaired.
  if(remaining>0)capped[active[0]]+=remaining;
  return capped;
}
export function rectSeatLimit(o) {
  const active=o.arrangement==='two'?[0,2]:o.arrangement==='three'?[1,2,3]:[0,1,2,3];
  return Math.min(32,active.reduce((n,i)=>n+rectSideLimit(o,i),0));
}
export function rectCapacityValid(o) {
  const counts=rectSideCounts(o);
  return o.count>=1&&o.count<=32&&counts.reduce((a,b)=>a+b,0)===o.count&&counts.every((n,i)=>n<=rectSideLimit(o,i));
}
function rectCapacityError(o) {
  if(o.arrangement!=='custom')return `В этой расстановке помещается максимум ${rectSeatLimit(o)} мест. Увеличьте стол или измените расстановку.`;
  const labels=['сверху','справа','снизу','слева'];
  const counts=rectSideCounts(o),side=counts.findIndex((n,i)=>n>rectSideLimit(o,i));
  return side>=0?`Максимум ${rectSideLimit(o,side)} мест ${labels[side]} при этой длине стороны. Увеличьте стол.`:`В этой расстановке помещается максимум ${rectSeatLimit(o)} мест. Увеличьте стол или измените расстановку.`;
}

export function seatPositions(o) {
  if (o.type === 'rows') return o.rows.flatMap((row, rowIndex) => {
    const seats = o.seats.filter(s => s.rowId === row.id), n = seats.length;
    return seats.map((seat, i) => {
      const pitch = row.pitch ?? o.seatPitch;
      let x = (i - (n - 1) / 2) * pitch;
      if (o.aisle === 'center' && n > 1) x += i < Math.ceil(n / 2) ? -o.aisleWidth / 2 : o.aisleWidth / 2;
      if (o.aisle === 'left') x += o.aisleWidth / 2;
      if (o.aisle === 'right') x -= o.aisleWidth / 2;
      let y = (rowIndex - (o.rows.length - 1) / 2) * o.rowPitch;
      // Same sagitta/radius construction as the production curved-row renderer.
      const sag = o.curvature || 0, width = Math.max(pitch, (n - 1) * pitch);
      if (Math.abs(sag) > .1) { const radius = width * width / (8 * Math.abs(sag)) + Math.abs(sag) / 2; const a = x / radius; x = radius * Math.sin(a); y += Math.sign(sag) * (radius * Math.cos(a) - (radius - Math.abs(sag))); }
      return { ...seat, x: x + (row.dx || 0) + (seat.dx || 0), y: y + (row.dy || 0) + (seat.dy || 0), number: o.firstSeat + (o.reverse ? n - i - 1 : i), rowNumber: o.firstRow + rowIndex, row };
    });
  });
  if (o.type === 'round') return o.seats.map((seat, i) => {
    const radius = o.w / 2 + o.chairOffset;
    const a = seat.angle ?? (o.arrangement === 'open' ? -Math.PI / 4 + i / Math.max(1, o.seats.length - 1) * Math.PI * 1.5 : i / o.seats.length * Math.PI * 2 - Math.PI / 2);
    return { ...seat, x: Math.cos(a) * radius + (seat.dx || 0), y: Math.sin(a) * radius + (seat.dy || 0), number: i + 1, angle: a };
  });
  if (o.type === 'rect') {
    const sides = rectSideCounts(o);
    let index = 0;
    return sides.flatMap((count, side) => Array.from({ length: count }, (_, i) => {
      const seat = o.seats[index]; const number = ++index; if (!seat) return null;
      const length = side % 2 ? o.h : o.w;
      // Production rectangular-table interpolation, scaled to schematic units.
      const gap = (length - count * CHAIR) / (count + 1), along = gap + CHAIR / 2 + i * (CHAIR + gap) - length / 2;
      const p = side === 0 ? { x: along, y: -o.h / 2 - o.chairOffset } : side === 1 ? { x: o.w / 2 + o.chairOffset, y: along } : side === 2 ? { x: -along, y: o.h / 2 + o.chairOffset } : { x: -o.w / 2 - o.chairOffset, y: -along };
      return { ...seat, x: p.x + (seat.dx || 0), y: p.y + (seat.dy || 0), number, side };
    })).filter(Boolean);
  }
  return [];
}
export function bounds(o) {
  const pts = [{ x: -o.w / 2, y: -o.h / 2 }, { x: o.w / 2, y: o.h / 2 }, ...seatPositions(o).flatMap(s => [{ x: s.x - CHAIR / 2, y: s.y - CHAIR / 2 }, { x: s.x + CHAIR / 2, y: s.y + CHAIR / 2 }])];
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
export function worldBounds(o) {
  const b = bounds(o), pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => rotate(x, y, o.rotation)).map(p => ({ x: p.x + o.x, y: p.y + o.y }));
  return { left: Math.min(...pts.map(p => p.x)), right: Math.max(...pts.map(p => p.x)), top: Math.min(...pts.map(p => p.y)), bottom: Math.max(...pts.map(p => p.y)) };
}
export function updateObject(object, patch) {
  let o = clone(object);
  if ('seatsPerRow' in patch) o.rows = o.rows.map(r => ({ ...r, count: patch.seatsPerRow }));
  Object.assign(o, patch);
  if (o.type === 'round') o.h = o.w;
  if (o.type === 'rect' && o.arrangement === 'custom') o.count = o.sides.reduce((a, b) => a + b, 0);
  if(o.type==='rect'&&['count','sides','arrangement','w','h'].some(key=>key in patch)&&!rectCapacityValid(o)) {
    // Existing oversized layouts remain editable. Permit only repairs that do not add violations.
    const violations=item=>[...rectSideCounts(item).map((n,i)=>Math.max(0,n-rectSideLimit(item,i))),Math.max(0,item.count-rectSeatLimit(item))];
    const before=violations(object),after=violations(o);
    if(rectCapacityValid(object)||after.some((n,i)=>n>before[i]))throw new Error(rectCapacityError(o));
  }
  return reconcile(o);
}
export function fitBlock(x, y, w, h, defaults = {}) {
  const seatPitch = defaults.seatPitch ?? 30, rowPitch = defaults.rowPitch ?? 44, aisleWidth = defaults.aisle === 'none' ? 0 : (defaults.aisleWidth ?? 44);
  return makeObject('rows', x, y, { ...defaults, rowCount: clamp(Math.floor((h - 36 - CHAIR) / rowPitch) + 1, 1, 100), seatsPerRow: clamp(Math.floor((w - 36 - CHAIR - aisleWidth) / seatPitch) + 1, 1, 40) });
}
export function resizeObject(o, width, height) {
  if (o.type === 'rows') {
    const n = Math.max(...o.rows.map(r => r.count));
    const seatPitch = (width - 36 - CHAIR - (o.aisle !== 'none' ? o.aisleWidth : 0)) / Math.max(1, n - 1);
    const rowPitch = (height - 36 - CHAIR - Math.abs(o.curvature || 0)) / Math.max(1, o.rows.length - 1);
    if (seatPitch < CHAIR + 4 || rowPitch < CHAIR + 8) return null;
    return updateObject(o, { seatPitch, rowPitch });
  }
  if (o.type === 'round') { width = Math.max(width, height); const positions = seatPositions({ ...o, w: width, h: width }); if (width < 36 || positions.some((p, i) => positions.some((q, j) => j > i && Math.hypot(q.x - p.x, q.y - p.y) < CHAIR + 3))) return null; height = width; }
  if (o.type === 'rect') { if(!rectCapacityValid({...o,w:width,h:height}))return null; if (width < 40 || height < 30) return null; const positions = seatPositions({ ...o, w: width, h: height }); if (positions.some((p, i) => positions.some((q, j) => j > i && Math.hypot(q.x - p.x, q.y - p.y) < CHAIR - 1e-7))) return null; }
  return { ...o, w: Math.max(20, width), h: Math.max(20, height) };
}
export function copyObjects(objects, hall, offset = 36) {
  let tableN = Math.max(0, ...hall.objects.filter(o => ['round', 'rect'].includes(o.type)).map(o => Number(o.name.match(/\d+/)?.[0]) || 0));
  return objects.map(o => {
    const c = clone(o); c.id = uid(); c.x += offset; c.y += offset;
    const rowIds = new Map((c.rows ?? []).map(r => [r.id, uid()]));
    c.rows = c.rows?.map(r => ({ ...r, id: rowIds.get(r.id) }));
    c.seats = c.seats?.map(s => ({ ...s, id: uid(), ...(s.rowId ? { rowId: rowIds.get(s.rowId) } : {}) }));
    c.name = ['round', 'rect'].includes(c.type) ? `Стол ${++tableN}` : `${c.name} · копия`;
    return c;
  });
}
export function copyHall(hall) {
  const h = clone(hall); h.id = uid(); h.revision = 0;
  const categoryIds = new Map(h.categories.map(c => [c.id, uid()]));
  h.categories = h.categories.map(c => ({ ...c, id: categoryIds.get(c.id) }));
  h.objects = copyObjects(h.objects, h, 0).map((o, i) => ({ ...o, name: hall.objects[i].name, categoryId: categoryIds.get(o.categoryId) ?? null, rows: o.rows?.map(r => ({ ...r, categoryId: categoryIds.get(r.categoryId) ?? null })), seats: o.seats?.map(s => ({ ...s, categoryId: categoryIds.get(s.categoryId) ?? null })) }));
  return h;
}
// One record per sale resource; standing capacity is a quantity, a whole table is one unit.
export function saleInventory(hall) {
  const inventory = [];
  const add = (o, seat, row, unit, quantity, guests) => {
    const cat = resolvedCategory(hall, o, seat, row);
    inventory.push({ id: seat?.id ?? o.id, objectId: o.id, seatId: seat?.id ?? null,
      rowId: row?.id ?? null, unit, quantity, guests, categoryId: cat?.id ?? null,
      available: !o.disabled && !seat?.disabled && cat?.active !== false,
      editable: !o.disabled && !seat?.disabled,
      priced: cat?.unit === unit && Number.isFinite(cat.price) && cat.price >= 0,
      price: cat?.price ?? null });
  };
  for (const o of hall.objects) {
    if (['rows', 'round', 'rect'].includes(o.type)) {
      if (o.saleMode === 'whole_table') add(o, null, null, 'table', 1, o.seats.filter(s => !s.disabled).length);
      else for (const seat of o.seats) add(o, seat, o.rows?.find(r => r.id === seat.rowId), 'seat', 1, 1);
    } else if (o.type === 'seat') add(o, null, null, 'seat', 1, 1);
    else if (o.type === 'standing') add(o, null, null, 'entry', o.capacity || 0, o.capacity || 0);
  }
  return inventory;
}
export function summary(hall) {
  let individual = 0, wholeTables = 0, included = 0, standing = 0, revenue = 0, unpriced = 0;
  for (const item of saleInventory(hall).filter(i => i.available)) {
    if (item.unit === 'seat') individual += item.quantity;
    if (item.unit === 'table') { wholeTables++; included += item.guests; }
    if (item.unit === 'entry') standing += item.quantity;
    if (item.priced) revenue += item.price * item.quantity;
    else unpriced += item.quantity;
  }
  return { individual, wholeTables, included, standing, guests: individual + included + standing, revenue, unpriced };
}
export function issues(hall) {
  const result = [], add = (id, text) => result.push({ id, text });
  if (!hall.objects.some(o => ['rows', 'round', 'rect', 'standing', 'seat'].includes(o.type))) add(null, 'Добавьте места, столы или стоячую зону');
  if (summary(hall).guests === 0) add(null, 'В схеме нет доступной вместимости');
  for (const o of hall.objects) {
    const b = worldBounds(o);
    const chairs=seatPositions(o);
    if(chairs.some((p,i)=>chairs.some((q,j)=>j>i&&Math.hypot(p.x-q.x,p.y-q.y)<(o.type==='rect'?CHAIR:CHAIR+2)-1e-7))) add(o.id, `${o.name}: кресла расположены слишком близко`);
    if (b.left < 0 || b.top < 0 || b.right > hall.room.w || b.bottom > hall.room.h) add(o.id, `${o.name}: за границами зала`);
    if(o.type==='rect'&&!rectCapacityValid(o))add(o.id, `${o.name}: ${rectCapacityError(o)}`);
    if (o.disabled) continue;
    if (o.type === 'standing' && !(o.capacity > 0)) add(o.id, `${o.name}: укажите вместимость`);
    if (['round', 'rect'].includes(o.type) && !o.seats.length) add(o.id, `${o.name}: нет мест`);
    const cats = o.type === 'rows' || (['round', 'rect'].includes(o.type) && o.saleMode === 'per_seat') ? o.seats.filter(s => !s.disabled).map(s => resolvedCategory(hall, o, s, o.rows?.find(r => r.id === s.rowId))) : ['standing', 'round', 'rect', 'seat'].includes(o.type) ? [category(hall, o.categoryId)] : [];
    if (cats.some(c => c == null || c.price == null)) add(o.id, `${o.name}: назначьте цену`);
    if (cats.some(c => c?.active === false)) add(o.id, `${o.name}: категория выключена`);
    const unit = o.type === 'standing' ? 'entry' : o.saleMode === 'whole_table' ? 'table' : 'seat';
    if (cats.some(c => c && c.unit !== unit)) add(o.id, `${o.name}: неверная единица цены`);
  }
  const obstacles = hall.objects.filter(o => !o.disabled && o.type !== 'entrance');
  for (let i = 0; i < obstacles.length; i++) for (let j = i + 1; j < obstacles.length; j++) {
    const a = worldBounds(obstacles[i]), b = worldBounds(obstacles[j]);
    if (a.left < b.right - 4 && a.right > b.left + 4 && a.top < b.bottom - 4 && a.bottom > b.top + 4) add(obstacles[j].id, `${obstacles[i].name} и ${obstacles[j].name}: проверьте пересечение`);
  }
  const labels = new Set();
  for (const o of hall.objects.filter(o => ['round', 'rect'].includes(o.type))) { if (labels.has(o.name)) add(o.id, `${o.name}: повторяющийся номер стола`); labels.add(o.name); }
  if (hall.objects.reduce((n, o) => n + 1 + (o.seats?.length ?? 0) + (o.rows?.length ?? 0), 0) > 3000 || hall.objects.reduce((n, o) => n + (o.seats?.length ?? 0), 0) > 2000) add(null, 'Достигнут предел: 2 000 кресел / 3 000 объектов');
  return result;
}
export function batchTables(hall, config) {
  const objects = [], { count, cols, gapX, gapY, type, x, y, ...options } = config;
  const tableOptions = { ...options, count: options.seatCount ?? 8 }; delete tableOptions.seatCount;
  const sample = makeObject(type, 0, 0, tableOptions), b = bounds(sample);
  let number = Math.max(0, ...hall.objects.filter(o => ['round', 'rect'].includes(o.type)).map(o => Number(o.name.match(/\d+/)?.[0]) || 0));
  for (let i = 0; i < count; i++) objects.push(makeObject(type, x + (i % cols) * (b.w + gapX), y + Math.floor(i / cols) * (b.h + gapY), { ...tableOptions, name: `Стол ${++number}` }));
  return objects;
}
export function sampleHall(kind = 'mixed') {
  const h = newHall(kind === 'rows' ? 'Театральный зал' : kind === 'tables' ? 'Банкетный зал' : kind === 'standing' ? 'Клубная площадка' : 'Основной зал');
  h.categories = [ { id: uid(), name: 'Стандарт', price: 5000, unit: 'seat', color: COLORS[0], active: true }, { id: uid(), name: 'Стол целиком', price: 40000, unit: 'table', color: COLORS[1], active: true }, { id: uid(), name: 'Входной билет', price: 3000, unit: 'entry', color: COLORS[2], active: true } ];
  const [standard, table, entry] = h.categories;
  if (kind !== 'empty') h.objects.push(makeObject('stage', 600, 100));
  if (kind === 'rows') h.objects.push(makeObject('rows', 600, 420, { rowCount: 8, seatsPerRow: 18, categoryId: standard.id }));
  else if (kind === 'tables') h.objects.push(...batchTables(h, { type: 'round', count: 8, cols: 4, gapX: 56, gapY: 70, x: 240, y: 320, categoryId: table.id, saleMode: 'whole_table' }));
  else if (kind === 'standing') h.objects.push(makeObject('standing', 600, 430, { w: 700, h: 440, capacity: 200, categoryId: entry.id }));
  else if (kind !== 'empty') {
    h.objects.push(makeObject('rows', 390, 360, { rowCount: 6, seatsPerRow: 12, firstRow: 1, categoryId: standard.id }));
    h.objects.push(makeObject('standing', 890, 355, { w: 260, h: 250, capacity: 120, categoryId: entry.id }));
    h.objects.push(makeObject('round', 220, 650, { name: 'Стол 1', categoryId: table.id, saleMode: 'whole_table' }));
    h.objects.push(makeObject('round', 440, 650, { name: 'Стол 2', categoryId: table.id, saleMode: 'whole_table' }));
    h.objects.push(makeObject('rect', 700, 650, { name: 'Стол 3', categoryId: standard.id, count: 6 }));
    h.objects.push(makeObject('rect', 950, 650, { name: 'Стол 4', categoryId: standard.id, count: 6 }));
  }
  return h;
}
export function readStored(storage, key, fallback) { try { const v = JSON.parse(storage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; } }
export function validateImport(data) {
  const fail = text => { throw new Error(text); };
  const finite = (value, lo = -100000, hi = 100000) => Number.isFinite(value) && value >= lo && value <= hi;
  const integer = (value, lo, hi) => Number.isInteger(value) && value >= lo && value <= hi;
  if (!data || data.version !== 1 || typeof data.id !== 'string' || typeof data.name !== 'string' || !data.room || !finite(data.room.w,80,8000) || !finite(data.room.h,80,8000) || !Array.isArray(data.objects) || data.objects.length > 3000 || !Array.isArray(data.categories) || data.categories.length > 100 || !['KZT','RUB','USD'].includes(data.currency)) fail('Неверный формат файла прототипа');
  const ids = new Set(), categoryIds = new Set();
  const unique = id => { if (typeof id !== 'string' || !id || ids.has(id)) fail('Повторяющийся или неверный идентификатор'); ids.add(id); };
  for (const c of data.categories) {
    if (!c || typeof c.name !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.color) || !['seat','table','entry'].includes(c.unit) || (c.price !== null && !finite(c.price,0,20000000)) || typeof c.active !== 'boolean') fail('Неверная категория цены');
    unique(c.id); categoryIds.add(c.id);
  }
  const ref = id => { if (id != null && !categoryIds.has(id)) fail('Категория цены не найдена'); };
  let seats = 0, rows = 0;
  for (const o of data.objects) {
    if (!o || !Object.hasOwn(TYPES,o.type) || typeof o.name !== 'string' || !['x','y','w','h','rotation'].every(k=>finite(o[k])) || o.w <= 0 || o.h <= 0) fail('Неверные объекты зала');
    unique(o.id); ref(o.categoryId);
    if (['rows','round','rect'].includes(o.type) && !Array.isArray(o.seats)) fail('Не найдены места объекта');
    if (o.seats && (!Array.isArray(o.seats) || o.seats.length > 2000)) fail('Неверный список мест');
    const rowIds = new Set();
    if (o.type === 'rows') {
      if (!Array.isArray(o.rows) || !integer(o.rowCount,1,100) || o.rowCount !== o.rows.length || !integer(o.seatsPerRow,1,40) || !finite(o.seatPitch,22,400) || !finite(o.rowPitch,26,400) || !finite(o.aisleWidth,0,400) || !finite(o.curvature,-1000,1000) || !integer(o.firstRow,0,10000) || !integer(o.firstSeat,0,10000) || !['none','center','left','right'].includes(o.aisle)) fail('Неверные параметры рядов');
      for (const r of o.rows) { if (!r || !integer(r.count,1,40) || !finite(r.dx) || !finite(r.dy) || (r.pitch != null && !finite(r.pitch,22,400))) fail('Неверный ряд'); unique(r.id); rowIds.add(r.id); ref(r.categoryId); }
      rows += o.rows.length;
    }
    if (['round','rect'].includes(o.type)) {
      if (!integer(o.count,1,32) || o.seats.length !== o.count || !['per_seat','whole_table'].includes(o.saleMode) || !finite(o.chairOffset,0,400) || !(o.type === 'round' ? ['even','open'] : ['two','three','all','custom']).includes(o.arrangement)) fail('Неверные параметры стола');
      if (o.arrangement === 'custom' && (!Array.isArray(o.sides) || o.sides.length !== 4 || !o.sides.every(n=>integer(n,0,32)) || o.sides.reduce((a,b)=>a+b,0) !== o.count)) fail('Неверные стороны стола');
    }
    if (o.type === 'standing' && o.capacity != null && !integer(o.capacity,1,100000)) fail('Неверная вместимость зоны');
    if (o.points != null && (!Array.isArray(o.points) || o.points.length < 3 || o.points.length > 100 || !o.points.every(p=>p && finite(p.x,-.5,.5) && finite(p.y,-.5,.5)))) fail('Неверная форма зоны');
    for (const seat of o.seats ?? []) { if (!seat || !finite(seat.dx) || !finite(seat.dy) || (seat.angle != null && !finite(seat.angle)) || (o.type==='rows' && !rowIds.has(seat.rowId))) fail('Неверное место'); unique(seat.id); ref(seat.categoryId); }
    if (o.type==='rows' && o.rows.some(r=>o.seats.filter(s=>s.rowId===r.id).length!==r.count)) fail('Количество мест не совпадает с рядом');
    seats += (o.seats?.length ?? 0) + (o.type === 'seat' ? 1 : 0);
  }
  if (data.objects.filter(o=>['round','rect'].includes(o.type)).length > 500 || seats > 2000 || rows > 100 || seats + rows + data.objects.length > 3000) fail('Превышен лимит объектов прототипа');
  return clone(data);
}

export function moveSeat(object, id, point) {
  const o = clone(object), positions = seatPositions(o), seat = positions.find(s => s.id === id);
  if (!seat || o.pinned) return object;
  if (o.type === 'round') {
    const radius = o.w / 2 + o.chairOffset, minimum = (CHAIR + 4) / radius;
    const signed = a => Math.atan2(Math.sin(a), Math.cos(a));
    const current = Math.atan2(seat.y, seat.x), desired = Math.atan2(point.y, point.x);
    let cw = Math.PI * 2, ccw = Math.PI * 2;
    for (const other of positions.filter(s => s.id !== id)) { const a = Math.atan2(other.y, other.x); cw = Math.min(cw, (a - current + Math.PI * 2) % (Math.PI * 2)); ccw = Math.min(ccw, (current - a + Math.PI * 2) % (Math.PI * 2)); }
    const delta = clamp(signed(desired - current), -Math.max(0, ccw - minimum), Math.max(0, cw - minimum));
    // Freeze every chair angle before moving one, as in production orbit editing.
    o.seats = o.seats.map(s => ({ ...s, angle: s.id === id ? signed(current + delta) : positions.find(p => p.id === s.id).angle }));
  } else o.seats = o.seats.map(s => s.id === id ? { ...s, dx: (s.dx || 0) + point.x - seat.x, dy: (s.dy || 0) + point.y - seat.y } : s);
  return o;
}
export function splitStanding(o) {
  if (o.type !== 'standing' || !(o.capacity >= 2)) throw new Error('Для разделения нужна вместимость от 2 билетов');
  if (o.points) throw new Error('Сначала верните зону к прямоугольной форме');
  const shift = rotate(o.w / 4, 0, o.rotation);
  const first = { ...clone(o), name: `${o.name} · A`, w: o.w / 2 - 5, x: o.x - shift.x, y: o.y - shift.y, capacity: Math.ceil(o.capacity / 2) };
  const second = { ...clone(o), id: uid(), name: `${o.name} · B`, w: o.w / 2 - 5, x: o.x + shift.x, y: o.y + shift.y, capacity: Math.floor(o.capacity / 2) };
  return [first, second];
}

// Compare the complete category definition, excluding only its instance identity.
const stableValue=value=>Array.isArray(value)?value.map(stableValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])])):value;
export function categoryKey(c) { const {id,...definition}=c;return JSON.stringify(stableValue(definition)); }
function remapCategories(objects,ids) {
  const ref=id=>id==null?id:(ids.has(id)?ids.get(id):id);
  return objects.map(o=>({...o,categoryId:ref(o.categoryId),...(o.rows?{rows:o.rows.map(r=>({...r,categoryId:ref(r.categoryId)}))}:{}),...(o.seats?{seats:o.seats.map(s=>({...s,categoryId:ref(s.categoryId)}))}:{})}));
}
export function deduplicateCategories(hall) {
  const byDefinition=new Map(),ids=new Map(),categories=[];
  for(const c of hall.categories){const key=categoryKey(c);if(byDefinition.has(key)){ids.set(c.id,byDefinition.get(key));}else{byDefinition.set(key,c.id);categories.push(c);}}
  return ids.size?{...hall,categories,objects:remapCategories(hall.objects,ids)}:hall;
}
export function fragmentCategories(objects,categories) {
  const used=new Set(objects.flatMap(o=>[o.categoryId,...(o.rows??[]).map(r=>r.categoryId),...(o.seats??[]).map(s=>s.categoryId)]).filter(Boolean));
  return categories.filter(c=>used.has(c.id));
}
export function insertFragment(hall,fragment,offset=40) {
  const clean=deduplicateCategories(hall),categories=[...clean.categories],byDefinition=new Map(categories.map(c=>[categoryKey(c),c.id])),ids=new Map();
  for(const source of fragmentCategories(fragment.objects,fragment.categories)) {
    const candidate={...source,price:fragment.currency===hall.currency?source.price:null},key=categoryKey(candidate);
    let id=byDefinition.get(key);
    if(!id){id=uid();categories.push({...candidate,id});byDefinition.set(key,id);}
    ids.set(source.id,id);
  }
  for(const o of fragment.objects)for(const id of [o.categoryId,...(o.rows??[]).map(r=>r.categoryId),...(o.seats??[]).map(s=>s.categoryId)])if(id!=null&&!ids.has(id))ids.set(id,null);
  const objects=remapCategories(copyObjects(fragment.objects,clean,offset),ids);
  return {hall:{...clean,categories,objects:[...clean.objects,...objects]},objects};
}
