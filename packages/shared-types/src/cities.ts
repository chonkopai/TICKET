import type { EventLocale } from "./events.js";

// Curated regional centres and major event destinations, not an exhaustive city directory.
// Sources: gov.kz/article/19305, invest.gov.uz/en/reason/atlas,
// rosstat.gov.ru/storage/mediabank/Rossia_2025.pdf, u.ae/en/about-the-uae/the-seven-emirates.
type City = readonly [ru: string, en: string, kk: string];
// Each country's first three entries are its featured cities, in display order.
const cities: Record<string, readonly City[]> = {
  KZ: [
    ["Алматы", "Almaty", "Алматы"], ["Астана", "Astana", "Астана"], ["Шымкент", "Shymkent", "Шымкент"],
    ["Актау", "Aktau", "Ақтау"], ["Актобе", "Aktobe", "Ақтөбе"], ["Атырау", "Atyrau", "Атырау"],
    ["Жезказган", "Zhezkazgan", "Жезқазған"], ["Караганда", "Karaganda", "Қарағанды"], ["Кокшетау", "Kokshetau", "Көкшетау"],
    ["Конаев", "Konaev", "Қонаев"], ["Костанай", "Kostanay", "Қостанай"], ["Кызылорда", "Kyzylorda", "Қызылорда"],
    ["Павлодар", "Pavlodar", "Павлодар"], ["Петропавловск", "Petropavl", "Петропавл"], ["Семей", "Semey", "Семей"],
    ["Талдыкорган", "Taldykorgan", "Талдықорған"], ["Тараз", "Taraz", "Тараз"], ["Туркестан", "Turkistan", "Түркістан"],
    ["Уральск", "Oral", "Орал"], ["Усть-Каменогорск", "Oskemen", "Өскемен"],
  ],
  UZ: [
    ["Ташкент", "Tashkent", "Ташкент"], ["Самарканд", "Samarkand", "Самарқанд"], ["Бухара", "Bukhara", "Бұхара"],
    ["Андижан", "Andijan", "Әндіжан"], ["Фергана", "Fergana", "Ферғана"], ["Наманган", "Namangan", "Наманган"],
    ["Нукус", "Nukus", "Нөкіс"], ["Карши", "Karshi", "Қаршы"], ["Джизак", "Jizzakh", "Жизақ"],
    ["Навои", "Navoi", "Науаи"], ["Термез", "Termez", "Термез"], ["Гулистан", "Gulistan", "Гүлістан"],
    ["Ургенч", "Urgench", "Үргеніш"], ["Нурафшан", "Nurafshon", "Нұрафшан"], ["Коканд", "Kokand", "Қоқан"], ["Хива", "Khiva", "Хиуа"],
  ],
  RU: [
    ["Москва", "Moscow", "Мәскеу"], ["Санкт-Петербург", "Saint Petersburg", "Санкт-Петербург"], ["Новосибирск", "Novosibirsk", "Новосибирск"],
    ["Екатеринбург", "Yekaterinburg", "Екатеринбург"], ["Казань", "Kazan", "Қазан"], ["Нижний Новгород", "Nizhny Novgorod", "Нижний Новгород"],
    ["Красноярск", "Krasnoyarsk", "Красноярск"], ["Челябинск", "Chelyabinsk", "Челябинск"], ["Самара", "Samara", "Самара"],
    ["Уфа", "Ufa", "Уфа"], ["Ростов-на-Дону", "Rostov-on-Don", "Дондағы Ростов"], ["Омск", "Omsk", "Омбы"],
    ["Краснодар", "Krasnodar", "Краснодар"], ["Воронеж", "Voronezh", "Воронеж"], ["Пермь", "Perm", "Пермь"],
    ["Волгоград", "Volgograd", "Волгоград"], ["Сочи", "Sochi", "Сочи"], ["Тюмень", "Tyumen", "Түмен"],
    ["Калининград", "Kaliningrad", "Калининград"], ["Владивосток", "Vladivostok", "Владивосток"],
  ],
  AE: [
    ["Дубай", "Dubai", "Дубай"], ["Абу-Даби", "Abu Dhabi", "Әбу-Даби"], ["Шарджа", "Sharjah", "Шарджа"],
    ["Аджман", "Ajman", "Аджман"], ["Рас-эль-Хайма", "Ras Al Khaimah", "Рас-әл-Хайма"], ["Фуджейра", "Fujairah", "Фуджейра"],
    ["Умм-эль-Кайвайн", "Umm Al Quwain", "Умм-әл-Қайуайн"], ["Аль-Айн", "Al Ain", "Әл-Айн"],
  ],
};

function compareCityOptions(left: { value: string; label: string }, right: { value: string; label: string }, country: string, locale: EventLocale): number {
  const featured = (cities[country] ?? []).slice(0, 3);
  const rank = (value: string) => {
    const index = featured.findIndex(city => city.includes(value));
    return index < 0 ? featured.length : index;
  };
  return rank(left.value) - rank(right.value) || left.label.localeCompare(right.label, locale);
}

export function majorCityOptions(country: string | null, locale: EventLocale) {
  const index = locale === "ru" ? 0 : locale === "en" ? 1 : 2;
  return (cities[country ?? ""] ?? []).map(city => ({ value: city[index], label: city[index], keywords: city.join(" ") }))
    .sort((left, right) => compareCityOptions(left, right, country ?? "", locale));
}


function cityEntry(value: string, country?: string): City | undefined {
  const normalized = value.trim().toLocaleLowerCase();
  const candidates = country ? cities[country] ?? [] : Object.values(cities).flat();
  return candidates.find(city => city.some(name => name.toLocaleLowerCase() === normalized));
}

export function cityAliases(value: string, country?: string): string[] {
  return [...new Set(cityEntry(value, country) ?? [value.trim()])];
}

export function localizedCityName(value: string, locale: EventLocale, country?: string): string {
  const index = locale === "ru" ? 0 : locale === "en" ? 1 : 2;
  return cityEntry(value, country)?.[index] ?? value;
}

// Stable Russian values match the existing catalog URLs; labels and search support all locales.
export function catalogCityOptions(country: string, locale: EventLocale, additionalCities: readonly string[] = []) {
  const values = new Map<string, string>();
  for (const value of [...majorCityOptions(country, "ru").map(city => city.value), ...additionalCities]) {
    if (!value.trim()) continue;
    const canonical = cityEntry(value, country)?.[0] ?? value;
    const key = canonical.trim().toLocaleLowerCase();
    if (!values.has(key)) values.set(key, canonical);
  }
  return [...values.values()].map(value => ({
    value,
    label: localizedCityName(value, locale, country),
    keywords: cityAliases(value, country).join(" "),
  })).sort((left, right) => compareCityOptions(left, right, country, locale));
}
