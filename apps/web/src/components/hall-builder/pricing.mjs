import { category, categoryKey, deduplicateCategories, saleInventory, worldBounds } from './model.mjs';

export function selectionPricing(hall, selection, { seatId = null, rowId = null, categoryId = null } = {}) {
  const items = saleInventory(hall).filter(i => selection.includes(i.objectId) &&
    (!seatId || i.seatId === seatId) && (!rowId || i.rowId === rowId));
  const targets = items.filter(i => i.editable && i.quantity > 0);
  const available = items.filter(i => i.available);
  const cat = category(hall, categoryId);
  const quantity = targets.reduce((n, i) => n + i.quantity, 0);
  const matching = targets.filter(i => i.categoryId === categoryId).reduce((n, i) => n + i.quantity, 0);
  const incompatible = targets.some(i => i.unit !== cat?.unit);
  const missing = available.filter(i => !i.priced).reduce((n, i) => n + i.quantity, 0);
  return { items, targets, quantity, matching, incompatible, missing, inactive: targets.filter(i=>!i.available).reduce((n,i)=>n+i.quantity,0),
    counts: Object.fromEntries(['seat', 'table', 'entry'].map(unit => [unit, targets.filter(i => i.unit === unit).reduce((n, i) => n + i.quantity, 0)])),
    subtotal: available.filter(i => i.priced).reduce((n, i) => n + i.quantity * i.price, 0),
    canApply: !!cat && cat.active !== false && targets.length > 0 && !incompatible && matching < quantity };
}

// Only tables can switch between individual seats and a whole-table sale.
// Other unit mismatches still require a compatible category or a narrower selection.
export function tableSaleMismatch(hall, selection, categoryId, scope = {}) {
  if (selection.length !== 1) return null;
  const object = hall.objects.find(o => o.id === selection[0]), cat = category(hall, categoryId);
  if (!object || !['round', 'rect'].includes(object.type) || !cat || cat.active === false || !['seat', 'table'].includes(cat.unit)) return null;
  const report = selectionPricing(hall, selection, { ...scope, categoryId });
  if (!report.quantity || !report.incompatible) return null;
  return { objectId: object.id, saleMode: object.saleMode,
    targetSaleMode: cat.unit === 'table' ? 'whole_table' : 'per_seat' };
}

// Whole-block assignment intentionally replaces child exceptions, without touching inventory or geometry.
// Disabled chairs retain explicit or inherited category references and remain unavailable.
export function assignCategory(hall, selection, categoryId, scope = {}) {
  const report = selectionPricing(hall, selection, { ...scope, categoryId });
  if (!report.canApply) return hall;
  const catFor = id => report.items.find(i => i.id === id)?.categoryId ?? null;
  return { ...hall, objects: hall.objects.map(o => {
    if (!selection.includes(o.id) || o.disabled) return o;
    if (scope.seatId) return { ...o, seats: o.seats?.map(s => s.id === scope.seatId && !s.disabled ? { ...s, categoryId } : s) };
    if (scope.rowId) return { ...o,
      rows: o.rows?.map(r => r.id === scope.rowId ? { ...r, categoryId } : r),
      seats: o.seats?.map(s => s.rowId === scope.rowId ? { ...s, categoryId: s.disabled ? catFor(s.id) : null } : s) };
    if (o.saleMode === 'whole_table' || ['standing', 'seat'].includes(o.type)) return { ...o, categoryId };
    if (!o.seats) return o;
    return { ...o, categoryId, rows: o.rows?.map(r => ({ ...r, categoryId: null })),
      seats: o.seats.map(s => ({ ...s, categoryId: s.disabled ? catFor(s.id) : null })) };
  }) };
}

// Creating and assigning is one explicit command and one undoable change.
// Resolve deduplicated IDs before assigning so references always point at a saved category.
export function savePricingCategory(hall, value, { replaceId = null, selection = [], seatId = null, rowId = null, apply = false } = {}) {
  let next = deduplicateCategories({ ...hall, categories: replaceId
    ? hall.categories.map(c => c.id === replaceId ? value : c)
    : [...hall.categories, value] });
  const categoryId = next.categories.find(c => categoryKey(c) === categoryKey(value))?.id;
  if (apply) {
    const report = selectionPricing(next, selection, { seatId, rowId, categoryId });
    if (!report.quantity || report.incompatible || value.active === false)
      throw new Error('Выберите доступные объекты с одной подходящей единицей продажи.');
    next = assignCategory(next, selection, categoryId, { seatId, rowId });
  }
  return { hall: next, categoryId };
}

export function unpricedInventory(hall) {
  return saleInventory(hall).filter(i => i.available && !i.priced && i.quantity > 0);
}
export function unpricedObjects(hall) {
  const missing = unpricedInventory(hall);
  return hall.objects.flatMap(o => {
    const items = missing.filter(i => i.objectId === o.id);
    return items.length ? [{ object: o, items, quantity: items.reduce((n, i) => n + i.quantity, 0) }] : [];
  });
}
export function frameObjects(objects, aspect = 1.4) {
  if (!objects.length) return null;
  const boxes = objects.map(worldBounds);
  const left = Math.min(...boxes.map(b => b.left)), right = Math.max(...boxes.map(b => b.right));
  const top = Math.min(...boxes.map(b => b.top)), bottom = Math.max(...boxes.map(b => b.bottom));
  const w = Math.max(260, right - left + 130, (bottom - top + 130) * aspect), h = w / aspect;
  return { x: (left + right - w) / 2, y: (top + bottom - h) / 2, w, h };
}

// Open closer to the actual layout, keeping every object visible and limiting empty-hall zoom.
export function hallOverview(hall) {
  if (!hall.objects.length) return { x: -20, y: -20, w: hall.room.w + 40, h: hall.room.h + 40 };
  const content = frameObjects(hall.objects, hall.room.w / hall.room.h);
  const w = Math.max(hall.room.w * .85, content.w), h = w * hall.room.h / hall.room.w;
  return { x: content.x + (content.w - w) / 2, y: content.y + (content.h - h) / 2, w, h };
}
