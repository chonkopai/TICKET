import type { HallEditor, HallObject } from "./hall-editor.js";

export const TARIFF_COLORS = [
  { color: "#5B21B6", name: "Фиолетовый" },
  { color: "#15803D", name: "Зелёный" },
  { color: "#2563EB", name: "Синий" },
  { color: "#EA580C", name: "Оранжевый" },
  { color: "#BE185D", name: "Розовый" },
  { color: "#0F766E", name: "Бирюзовый" },
  { color: "#DC2626", name: "Красный" },
  { color: "#0891B2", name: "Голубой" },
  { color: "#D97706", name: "Янтарный" },
  { color: "#65A30D", name: "Лаймовый" },
] as const;
export const UNAVAILABLE_HALL_COLOR = "#D1D5DB";

/** Older layouts can contain arbitrary colors; keep their nearest palette hue. */
export function tariffColor(color: string, index = 0): string {
  const rgb = (hex: string) => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
  const source = rgb(color);
  if (source.some(value => !Number.isFinite(value)) || Math.max(...source) - Math.min(...source) < 25) return TARIFF_COLORS[index % TARIFF_COLORS.length]!.color;
  return TARIFF_COLORS.reduce((best, item) => {
    const distance = (hex: string) => rgb(hex).reduce((total, value, i) => total + (value - source[i]!) ** 2, 0);
    return distance(item.color) < distance(best.color) ? item : best;
  }).color;
}

export function hallTariff(object: HallObject, editor: HallEditor) {
  const parent = object.type === "seat" ? editor.objects.find(item => item.id === object.parentId) : undefined;
  const wholeTable = parent?.type.startsWith("table_") && parent.saleMode === "whole_table";
  const id = wholeTable ? parent!.tariffId : object.tariffId ?? parent?.tariffId;
  return editor.tariffs.find(item => item.id === id);
}

/** Decorations keep their design colors; saleable geometry is styled only by tariffs. */
export function hallObjectPaint(object: HallObject, editor: HallEditor) {
  const tariff = hallTariff(object, editor);
  const parent = object.type === "seat" ? editor.objects.find(item => item.id === object.parentId) : undefined;
  const neutral = Boolean(object.type.startsWith("table_") && object.saleMode === "per_seat" || parent?.type.startsWith("table_") && parent.saleMode === "whole_table");
  const decoration = object.type === "prop" || object.type === "entrance";
  const color = decoration ? object.color : neutral ? "#FFFFFF" : tariff ? tariffColor(tariff.color, editor.tariffs.indexOf(tariff)) : TARIFF_COLORS[0].color;
  return { color, neutral, tariff };
}

export function hallTextColor(color: string): string {
  const channels = [1, 3, 5].map(start => {
    const value = parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722 > .179 ? "#151C27" : "#FFFFFF";
}
