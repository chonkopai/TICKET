import { describe, expect, it } from "vitest";
import { hallObjectPaint, hallTariff, hallTextColor, tariffColor, TARIFF_COLORS } from "./hall-colors.js";
import { newHallObject, type HallEditor } from "./hall-editor.js";

const parent = { ...newHallObject("table", "table_rect", 5, 5), tariffId: "vip", saleMode: "per_seat" as const };
const seat = { ...newHallObject("seat", "seat", 5, 4), parentId: parent.id, color: "#000000", colorOverride: true };
const editor: HallEditor = { version: 1, objects: [parent, seat], tariffs: [{ id: "vip", name: "VIP", price: 5000, color: "#15803D" }, { id: "standard", name: "Standard", price: 2000, color: "#2563EB" }] };

describe("tariff-driven hall appearance", () => {
  it("inherits parent tariffs, ignoring saved object color overrides", () => {
    expect(hallObjectPaint(seat, editor)).toMatchObject({ color: "#15803D", neutral: false });
    expect(hallObjectPaint(parent, editor)).toMatchObject({ color: "#FFFFFF", neutral: true });
    expect(hallObjectPaint({ ...seat, tariffId: "standard" }, editor).color).toBe("#2563EB");
  });
  it("colors whole tables and makes their chairs neutral, even with an old seat tariff", () => {
    const whole = { ...parent, saleMode: "whole_table" as const };
    const hall = { ...editor, objects: [whole, { ...seat, tariffId: "standard" }] };
    expect(hallObjectPaint(whole, hall)).toMatchObject({ color: "#15803D", neutral: false });
    expect(hallObjectPaint(hall.objects[1]!, hall)).toMatchObject({ color: "#FFFFFF", neutral: true });
    expect(hallTariff(hall.objects[1]!, hall)?.id).toBe("vip");
  });
  it("uses row tariffs unless a seat explicitly has another tariff", () => {
    const row = { ...parent, type: "row" as const, saleMode: "whole_table" as const };
    const hall = { ...editor, objects: [row, seat] };
    expect(hallObjectPaint(row, hall).color).toBe("#15803D");
    expect(hallObjectPaint(seat, hall).color).toBe("#15803D");
    expect(hallObjectPaint({ ...seat, tariffId: "standard" }, hall).color).toBe("#2563EB");
  });
  it("preserves decoration colors and maps old gray tariffs into the fixed palette", () => {
    expect(TARIFF_COLORS).toHaveLength(10);
    expect(new Set(TARIFF_COLORS.map(item => item.color)).size).toBe(10);
    for (const color of ["#FFFFFF", "#000000", "#D1D5DB", "#6320ee", "#ff0066"]) expect(TARIFF_COLORS.some(item => item.color === tariffColor(color))).toBe(true);
    expect(hallObjectPaint({ ...parent, type: "prop", color: "#112233" }, editor).color).toBe("#112233");
  });
  it("provides readable number labels on every palette color", () => {
    expect(hallTextColor("#FFFFFF")).toBe("#151C27");
    expect(hallTextColor("#5B21B6")).toBe("#FFFFFF");
    const luminance = (color: string) => [1, 3, 5].map(start => {
      const channel = parseInt(color.slice(start, start + 2), 16) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index]!, 0);
    for (const { color } of TARIFF_COLORS) {
      const values = [luminance(color), luminance(hallTextColor(color))].sort((a, b) => b - a);
      expect((values[0]! + .05) / (values[1]! + .05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
