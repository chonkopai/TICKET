import type { EventLocale } from "@event-platform/shared-types";
import type { CreationOption } from "./creation-select";

// City-name presentation follows Microsoft/Zoom scheduling menus. Offsets come from
// Intl's IANA timezone rules for the event instant, never a static Windows offset table.
// https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/default-time-zones
// https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063717
const places: Record<string, readonly [en: string, ru: string, kk: string]> = {
  "Etc/GMT+12": ["International Date Line West", "Линия перемены дат, запад", "Күн ауысу сызығы, батыс"],
  UTC: ["Coordinated Universal Time", "Всемирное координированное время", "Дүниежүзілік үйлестірілген уақыт"],
  "Pacific/Midway": ["Midway, American Samoa", "Мидуэй, Американское Самоа", "Мидуэй, Америкалық Самоа"],
  "Pacific/Honolulu": ["Honolulu, Hawaii", "Гонолулу, Гавайи", "Гонолулу, Гавайи"],
  "America/Anchorage": ["Anchorage, Alaska", "Анкоридж, Аляска", "Анкоридж, Аляска"],
  "America/Los_Angeles": ["Los Angeles, Pacific Time", "Лос-Анджелес, тихоокеанское время", "Лос-Анджелес, Тынық мұхиты уақыты"],
  "America/Vancouver": ["Vancouver", "Ванкувер", "Ванкувер"],
  "America/Phoenix": ["Phoenix, Arizona", "Финикс, Аризона", "Финикс, Аризона"],
  "America/Denver": ["Denver, Mountain Time", "Денвер, горное время", "Денвер, таулы уақыт"],
  "America/Chicago": ["Chicago, Central Time", "Чикаго, центральное время", "Чикаго, орталық уақыт"],
  "America/Mexico_City": ["Mexico City", "Мехико", "Мехико"],
  "America/New_York": ["New York, Eastern Time", "Нью-Йорк, восточное время", "Нью-Йорк, шығыс уақыты"],
  "America/Toronto": ["Toronto", "Торонто", "Торонто"],
  "America/Bogota": ["Bogota, Colombia", "Богота, Колумбия", "Богота, Колумбия"],
  "America/Lima": ["Lima, Peru", "Лима, Перу", "Лима, Перу"],
  "America/Caracas": ["Caracas, Venezuela", "Каракас, Венесуэла", "Каракас, Венесуэла"],
  "America/Halifax": ["Halifax, Atlantic Time", "Галифакс, атлантическое время", "Галифакс, Атлант уақыты"],
  "America/St_Johns": ["St. John's, Newfoundland", "Сент-Джонс, Ньюфаундленд", "Сент-Джонс, Ньюфаундленд"],
  "America/Sao_Paulo": ["Sao Paulo, Brasilia", "Сан-Паулу, Бразилиа", "Сан-Паулу, Бразилиа"],
  "America/Buenos_Aires": ["Buenos Aires", "Буэнос-Айрес", "Буэнос-Айрес"],
  "Atlantic/Azores": ["Azores", "Азорские острова", "Азор аралдары"],
  "Atlantic/Cape_Verde": ["Cape Verde", "Кабо-Верде", "Кабо-Верде"],
  "Atlantic/Reykjavik": ["Reykjavik", "Рейкьявик", "Рейкьявик"],
  "Europe/London": ["London, Edinburgh", "Лондон, Эдинбург", "Лондон, Эдинбург"],
  "Europe/Dublin": ["Dublin", "Дублин", "Дублин"],
  "Europe/Lisbon": ["Lisbon", "Лиссабон", "Лиссабон"],
  "Europe/Berlin": ["Berlin, Amsterdam, Rome, Vienna", "Берлин, Амстердам, Рим, Вена", "Берлин, Амстердам, Рим, Вена"],
  "Europe/Paris": ["Paris, Brussels, Madrid", "Париж, Брюссель, Мадрид", "Париж, Брюссель, Мадрид"],
  "Africa/Lagos": ["Lagos, West Central Africa", "Лагос, Западная Центральная Африка", "Лагос, Батыс Орталық Африка"],
  "Africa/Cairo": ["Cairo", "Каир", "Каир"],
  "Africa/Johannesburg": ["Johannesburg, Pretoria", "Йоханнесбург, Претория", "Йоханнесбург, Претория"],
  "Europe/Athens": ["Athens, Bucharest", "Афины, Бухарест", "Афина, Бухарест"],
  "Europe/Helsinki": ["Helsinki, Riga, Tallinn", "Хельсинки, Рига, Таллин", "Хельсинки, Рига, Таллин"],
  "Europe/Kiev": ["Kyiv", "Киев", "Киев"],
  "Europe/Istanbul": ["Istanbul", "Стамбул", "Ыстанбұл"],
  "Europe/Minsk": ["Minsk", "Минск", "Минск"],
  "Europe/Moscow": ["Moscow, Saint Petersburg", "Москва, Санкт-Петербург", "Мәскеу, Санкт-Петербург"],
  "Africa/Nairobi": ["Nairobi", "Найроби", "Найроби"],
  "Asia/Riyadh": ["Riyadh, Kuwait", "Эр-Рияд, Кувейт", "Эр-Рияд, Кувейт"],
  "Asia/Tehran": ["Tehran", "Тегеран", "Тегеран"],
  "Asia/Dubai": ["Dubai, Abu Dhabi, Muscat", "Дубай, Абу-Даби, Маскат", "Дубай, Әбу-Даби, Маскат"],
  "Asia/Baku": ["Baku", "Баку", "Баку"],
  "Asia/Tbilisi": ["Tbilisi", "Тбилиси", "Тбилиси"],
  "Asia/Yerevan": ["Yerevan", "Ереван", "Ереван"],
  "Asia/Kabul": ["Kabul", "Кабул", "Кабул"],
  "Asia/Almaty": ["Almaty, Astana, Kazakhstan", "Алматы, Астана, Казахстан", "Алматы, Астана, Қазақстан"],
  "Asia/Tashkent": ["Tashkent, Uzbekistan", "Ташкент, Узбекистан", "Ташкент, Өзбекстан"],
  "Asia/Karachi": ["Karachi, Islamabad", "Карачи, Исламабад", "Карачи, Исламабад"],
  "Asia/Yekaterinburg": ["Yekaterinburg", "Екатеринбург", "Екатеринбург"],
  "Asia/Calcutta": ["New Delhi, Mumbai, Kolkata", "Нью-Дели, Мумбаи, Калькутта", "Нью-Дели, Мумбаи, Калькутта"],
  "Asia/Colombo": ["Colombo, Sri Lanka", "Коломбо, Шри-Ланка", "Коломбо, Шри-Ланка"],
  "Asia/Katmandu": ["Kathmandu, Nepal", "Катманду, Непал", "Катманду, Непал"],
  "Asia/Dhaka": ["Dhaka, Bangladesh", "Дакка, Бангладеш", "Дакка, Бангладеш"],
  "Asia/Bishkek": ["Bishkek, Kyrgyzstan", "Бишкек, Кыргызстан", "Бішкек, Қырғызстан"],
  "Asia/Omsk": ["Omsk", "Омск", "Омбы"],
  "Asia/Rangoon": ["Yangon, Myanmar", "Янгон, Мьянма", "Янгон, Мьянма"],
  "Asia/Bangkok": ["Bangkok, Hanoi", "Бангкок, Ханой", "Бангкок, Ханой"],
  "Asia/Jakarta": ["Jakarta", "Джакарта", "Джакарта"],
  "Asia/Novosibirsk": ["Novosibirsk", "Новосибирск", "Новосибирск"],
  "Asia/Krasnoyarsk": ["Krasnoyarsk", "Красноярск", "Красноярск"],
  "Asia/Hong_Kong": ["Beijing, Hong Kong, Macau", "Пекин, Гонконг, Макао", "Бейжің, Гонконг, Макао"],
  "Asia/Shanghai": ["Beijing, Shanghai", "Пекин, Шанхай", "Бейжің, Шанхай"],
  "Asia/Macau": ["Macau", "Макао", "Макао"],
  "Asia/Singapore": ["Singapore", "Сингапур", "Сингапур"],
  "Asia/Kuala_Lumpur": ["Kuala Lumpur", "Куала-Лумпур", "Куала-Лумпур"],
  "Asia/Taipei": ["Taipei", "Тайбэй", "Тайбэй"],
  "Asia/Irkutsk": ["Irkutsk", "Иркутск", "Иркутск"],
  "Australia/Perth": ["Perth", "Перт", "Перт"],
  "Asia/Tokyo": ["Tokyo, Osaka", "Токио, Осака", "Токио, Осака"],
  "Asia/Seoul": ["Seoul", "Сеул", "Сеул"],
  "Asia/Yakutsk": ["Yakutsk", "Якутск", "Якутск"],
  "Australia/Darwin": ["Darwin", "Дарвин", "Дарвин"],
  "Australia/Adelaide": ["Adelaide", "Аделаида", "Аделаида"],
  "Australia/Brisbane": ["Brisbane", "Брисбен", "Брисбен"],
  "Australia/Sydney": ["Sydney, Melbourne, Canberra", "Сидней, Мельбурн, Канберра", "Сидней, Мельбурн, Канберра"],
  "Asia/Vladivostok": ["Vladivostok", "Владивосток", "Владивосток"],
  "Australia/Lord_Howe": ["Lord Howe Island", "Остров Лорд-Хау", "Лорд-Хау аралы"],
  "Pacific/Noumea": ["Noumea, New Caledonia", "Нумеа, Новая Каледония", "Нумеа, Жаңа Каледония"],
  "Asia/Magadan": ["Magadan", "Магадан", "Магадан"],
  "Asia/Kamchatka": ["Petropavlovsk-Kamchatsky", "Петропавловск-Камчатский", "Петропавл-Камчатский"],
  "Pacific/Fiji": ["Fiji", "Фиджи", "Фиджи"],
  "Pacific/Auckland": ["Auckland, Wellington", "Окленд, Веллингтон", "Окленд, Веллингтон"],
  "Pacific/Chatham": ["Chatham Islands", "Острова Чатем", "Чатем аралдары"],
  "Pacific/Tongatapu": ["Nuku'alofa, Tonga", "Нукуалофа, Тонга", "Нукуалофа, Тонга"],
  "Pacific/Apia": ["Apia, Samoa", "Апиа, Самоа", "Апиа, Самоа"],
  "Pacific/Kiritimati": ["Kiritimati, Line Islands", "Киритимати, острова Лайн", "Киритимати, Лайн аралдары"],
};
const formatters = new Map<string, Intl.DateTimeFormat>();
export function timezoneOffsetMinutes(zone: string, instant: Date): number {
  let formatter = formatters.get(zone);
  if (!formatter) { formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }); formatters.set(zone, formatter); }
  const name = formatter.formatToParts(instant).find(part => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
}
export function formatGmtOffset(minutes: number) {
  return `GMT${minutes < 0 ? "−" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
}
export function timezoneOptions(locale: EventLocale, current: string, instant: Date): CreationOption[] {
  const index = locale === "en" ? 0 : locale === "ru" ? 1 : 2;
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : Object.keys(places);
  const ids = new Set([...supported, "UTC", current]);
  // Include friendly entries even when Intl exposes an older alias for the same timezone.
  const names = { ...places };
  for (const [id, labels] of Object.entries(places)) try {
    const canonical = new Intl.DateTimeFormat("en", { timeZone: id }).resolvedOptions().timeZone;
    if (!names[canonical]) names[canonical] = labels;
    if (!supported.includes(id) && !supported.includes(canonical)) ids.add(id);
  } catch { /* Unsupported entries are omitted below. */ }
  const entries: (CreationOption & { offset: number })[] = [];
  for (const value of ids) try {
    const offset = timezoneOffsetMinutes(value, instant), gmt = formatGmtOffset(offset);
    const canonical = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
    const namesForZone = names[value] ?? names[canonical];
    const city = namesForZone?.[index] ?? value.split("/").at(-1)!.replaceAll("_", " ");
    const shortCity = value === "Asia/Hong_Kong" ? ["Hong Kong", "Гонконг", "Гонконг"][index] : city.split(",")[0];
    entries.push({ value, selectedLabel: `${gmt} · ${shortCity}`, label: `${gmt} · ${city}`, keywords: `${value} ${namesForZone?.join(" ") ?? ""} ${gmt.replace("−", "-")} GMT${offset < 0 ? "" : "+"}${offset / 60} GMT ${offset < 0 ? "" : "+"}${offset / 60} UTC${offset < 0 ? "" : "+"}${offset / 60}`, offset });
  } catch { /* A malformed legacy value stays visible in the trigger until a valid zone is chosen. */ }
  return entries.sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label, locale)).map(({ offset: _offset, ...option }) => option);
}
