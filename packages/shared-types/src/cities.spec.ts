import { describe, expect, it } from "vitest";
import { catalogCityOptions, cityAliases, localizedCityName, majorCityOptions } from "./cities.js";

describe("catalog cities", () => {
  it.each([
    ["KZ", "Алматы", "Астана", 20],
    ["UZ", "Ташкент", "Самарканд", 16],
    ["RU", "Москва", "Санкт-Петербург", 20],
    ["AE", "Дубай", "Абу-Даби", 8],
  ])("offers major cities in %s without any published events", (country, first, second, count) => {
    const options = catalogCityOptions(country as string, "ru");
    expect(options).toHaveLength(count as number);
    expect(options.map(option => option.label)).toEqual(expect.arrayContaining([first, second]));
  });

  it("merges published and saved cities without duplicating translated names", () => {
    const options = catalogCityOptions("KZ", "en", ["Шымкент", "Shymkent", "Қарағанды", "Караганда", "Кентау", ""]);
    expect(options.filter(option => option.label === "Shymkent")).toEqual([
      { value: "Шымкент", label: "Shymkent", keywords: "Шымкент Shymkent" },
    ]);
    expect(options.filter(option => option.label === "Karaganda")).toHaveLength(1);
    expect(options).toContainEqual({ value: "Кентау", label: "Кентау", keywords: "Кентау" });
  });

  it("searches all spellings while keeping catalog values stable across languages", () => {
    for (const locale of ["ru", "en", "kk"] as const) {
      const option = catalogCityOptions("RU", locale).find(option => option.value === "Москва")!;
      expect(option.keywords).toContain("Moscow");
      expect(option.keywords).toContain("Мәскеу");
    }
    expect(localizedCityName("Abu Dhabi", "ru")).toBe("Абу-Даби");
    expect(majorCityOptions("KZ", "kk").find(option => option.label === "Ақтау")?.value).toBe("Ақтау");
  });

  it("keeps countries separate and preserves cities outside the directory", () => {
    expect(cityAliases("Almaty", "KZ")).toEqual(["Алматы", "Almaty"]);
    expect(cityAliases("Almaty", "RU")).toEqual(["Almaty"]);
    expect(catalogCityOptions("GB", "en", ["London"])).toEqual([
      { value: "London", label: "London", keywords: "London" },
    ]);
  });
});
