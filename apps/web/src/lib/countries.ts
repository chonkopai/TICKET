import { COUNTRY_CODES, localizedCityName } from "@event-platform/shared-types";

export { COUNTRY_CODES };

type Locale = "ru" | "kk" | "en";
const COMMON_COUNTRIES: Record<string, Record<Locale, string>> = {
  KZ: { ru: "Казахстан", kk: "Қазақстан", en: "Kazakhstan" },
  KG: { ru: "Кыргызстан", kk: "Қырғызстан", en: "Kyrgyzstan" },
  RU: { ru: "Россия", kk: "Ресей", en: "Russia" },
  UZ: { ru: "Узбекистан", kk: "Өзбекстан", en: "Uzbekistan" },
  TR: { ru: "Турция", kk: "Түркия", en: "Türkiye" },
  AE: { ru: "ОАЭ", kk: "Біріккен Араб Әмірліктері", en: "United Arab Emirates" },
  GB: { ru: "Великобритания", kk: "Ұлыбритания", en: "United Kingdom" },
  US: { ru: "США", kk: "АҚШ", en: "United States" },
};
const DISPLAY_NAMES: Record<Locale, Intl.DisplayNames> = {
  ru: new Intl.DisplayNames(["ru"], { type: "region" }),
  kk: new Intl.DisplayNames(["kk"], { type: "region" }),
  en: new Intl.DisplayNames(["en"], { type: "region" }),
};

export function countryName(code: string, locale: Locale): string {
  return COMMON_COUNTRIES[code]?.[locale] ?? DISPLAY_NAMES[locale].of(code) ?? code;
}

export function cityName(city: string, locale: Locale): string {
  return localizedCityName(city, locale);
}
