import type { EventLocale } from "@event-platform/shared-types";

interface EventCopy {
  refreshFailed: string; notFound: string; returnToEvents: string; syncFailed: string; retry: string;
  breadcrumbs: string; catalog: string; seatMapSelection: string; hallMap: string;
  share: string; copied: string; about: string; metres: string;
  mixedCurrencies: string; row: string; table: string; seat: string; selectedSeat: string;
  interactiveMap: string; chooseSeat: string; selectionHint: string; dimensions: string;
  available: string; selected: string; unavailable: string; mapZoom: string; zoomOut: string;
  zoomReset: string; zoomIn: string; yourSelection: string; noSelection: string;
  remove: string; wholeTable: string; seats: string; remaining: string;
  decrease: string; increase: string; checkout: string; removeSelection: string;
  seatSelected: string; seatAvailable: string; seatUnavailable: string;
  descriptionSoon: string; gallery: string; galleryAtmosphere: string;
  galleryDetail: string; galleryGuests: string; program: string; schedule: string;
  location: string; openMap: string; visitRules: string; visitTerms: string;
  cancellationTerms: string; depositTerms: string; extraConditions: string;
  terms: string; organizer: string; organizerTeam: string; verifiedOrganizer: string;
  contactUnavailable: string; eventStart: string; programStep: string;
}

export const EVENT_COPY: Record<EventLocale, EventCopy> = {
  ru: {
    refreshFailed: "Не удалось обновить доступность мест.", notFound: "Мероприятие не найдено.", returnToEvents: "Вернуться в афишу",
    syncFailed: "Не удалось обновить данные события. Перед оплатой доступность и цена будут проверены снова.", retry: "Повторить",
    breadcrumbs: "Хлебные крошки", catalog: "Афиша", seatMapSelection: "Выбор мест на схеме", hallMap: "Схема зала",
    share: "Поделиться", copied: "Ссылка скопирована", about: "О событии", metres: "м",
    mixedCurrencies: "Места с разными валютами нужно оформить отдельно.", row: "Ряд", table: "Стол",
    seat: "место", selectedSeat: "Выбранное место", interactiveMap: "Интерактивная схема",
    chooseSeat: "Выберите место, стол или зону", selectionHint: "Выбор на схеме появится справа и в блоке оформления. Доступность проверяется при покупке.",
    dimensions: "Габариты зала:", available: "Свободно", selected: "Выбрано", unavailable: "Недоступно",
    mapZoom: "Масштаб схемы", zoomOut: "Уменьшить схему", zoomReset: "Сбросить масштаб", zoomIn: "Увеличить схему",
    yourSelection: "Ваш выбор", noSelection: "Нажмите на свободное место, стол или зону на схеме. Можно выбрать несколько видов билетов вместе.",
    remove: "Убрать", wholeTable: "Стол целиком", seats: "мест", remaining: "Доступно:",
    decrease: "Уменьшить", increase: "Увеличить", checkout: "Перейти к оформлению", removeSelection: "Убрать",
    seatSelected: "выбрано", seatAvailable: "свободно", seatUnavailable: "недоступно",
    descriptionSoon: "Описание скоро появится.", gallery: "Фотогалерея", galleryAtmosphere: "Атмосфера мероприятия",
    galleryDetail: "Деталь мероприятия", galleryGuests: "Гости мероприятия", program: "Программа",
    schedule: "Расписание события", location: "Локация и проезд", openMap: "Открыть карту",
    visitRules: "Правила посещения", visitTerms: "Условия посещения", cancellationTerms: "Условия отмены",
    depositTerms: "Условия депозита", extraConditions: "Дополнительные условия", terms: "Правила и условия",
    organizer: "Организатор", organizerTeam: "Команда мероприятия", verifiedOrganizer: "Подтверждённый организатор",
    contactUnavailable: "Контакт не указан", eventStart: "Начало мероприятия", programStep: "Этап программы",
  },
  kk: {
    refreshFailed: "Орындардың қолжетімділігін жаңарту мүмкін болмады.", notFound: "Іс-шара табылмады.", returnToEvents: "Афишаға оралу",
    syncFailed: "Іс-шара деректерін жаңарту мүмкін болмады. Төлем алдында қолжетімділік пен баға қайта тексеріледі.", retry: "Қайталау",
    breadcrumbs: "Навигация жолы", catalog: "Афиша", seatMapSelection: "Сызбадан орын таңдау", hallMap: "Зал сызбасы",
    share: "Бөлісу", copied: "Сілтеме көшірілді", about: "Іс-шара туралы", metres: "м",
    mixedCurrencies: "Әртүрлі валютамен көрсетілген орындарды бөлек рәсімдеңіз.", row: "Қатар", table: "Үстел",
    seat: "орын", selectedSeat: "Таңдалған орын", interactiveMap: "Интерактивті сызба",
    chooseSeat: "Орынды, үстелді немесе аймақты таңдаңыз", selectionHint: "Таңдауыңыз оң жақта және рәсімдеу бөлімінде көрінеді. Қолжетімділік сатып алу кезінде тексеріледі.",
    dimensions: "Зал өлшемі:", available: "Бос", selected: "Таңдалған", unavailable: "Қолжетімсіз",
    mapZoom: "Сызба масштабы", zoomOut: "Сызбаны кішірейту", zoomReset: "Масштабты қалпына келтіру", zoomIn: "Сызбаны үлкейту",
    yourSelection: "Сіздің таңдауыңыз", noSelection: "Сызбадағы бос орынды, үстелді немесе аймақты басыңыз. Билеттердің бірнеше түрін бірге таңдауға болады.",
    remove: "Алып тастау", wholeTable: "Үстел толығымен", seats: "орын", remaining: "Қолжетімді:",
    decrease: "Азайту", increase: "Көбейту", checkout: "Рәсімдеуге өту", removeSelection: "Алып тастау",
    seatSelected: "таңдалған", seatAvailable: "бос", seatUnavailable: "қолжетімсіз",
    descriptionSoon: "Сипаттама жақында пайда болады.", gallery: "Фотогалерея", galleryAtmosphere: "Іс-шара атмосферасы",
    galleryDetail: "Іс-шара көрінісі", galleryGuests: "Іс-шара қонақтары", program: "Бағдарлама",
    schedule: "Іс-шара кестесі", location: "Орны және жол", openMap: "Картаны ашу",
    visitRules: "Қатысу ережелері", visitTerms: "Қатысу шарттары", cancellationTerms: "Бас тарту шарттары",
    depositTerms: "Депозит шарттары", extraConditions: "Қосымша шарттар", terms: "Ережелер мен шарттар",
    organizer: "Ұйымдастырушы", organizerTeam: "Іс-шара командасы", verifiedOrganizer: "Расталған ұйымдастырушы",
    contactUnavailable: "Байланыс дерегі көрсетілмеген", eventStart: "Іс-шараның басталуы", programStep: "Бағдарлама кезеңі",
  },
  en: {
    refreshFailed: "Could not refresh seat availability.", notFound: "Event not found.", returnToEvents: "Back to events",
    syncFailed: "Could not refresh event details. Availability and prices will be checked again before payment.", retry: "Retry",
    breadcrumbs: "Breadcrumbs", catalog: "Events", seatMapSelection: "Choose seats on the map", hallMap: "Venue map",
    share: "Share", copied: "Link copied", about: "About this event", metres: "m",
    mixedCurrencies: "Seats priced in different currencies must be purchased separately.", row: "Row", table: "Table",
    seat: "seat", selectedSeat: "Selected seat", interactiveMap: "Interactive map",
    chooseSeat: "Choose a seat, table, or area", selectionHint: "Your selection will appear on the right and at checkout. Availability is checked when you buy.",
    dimensions: "Venue dimensions:", available: "Available", selected: "Selected", unavailable: "Unavailable",
    mapZoom: "Map zoom", zoomOut: "Zoom out", zoomReset: "Reset zoom", zoomIn: "Zoom in",
    yourSelection: "Your selection", noSelection: "Choose an available seat, table, or area on the map. You can select multiple ticket types.",
    remove: "Remove", wholeTable: "Whole table", seats: "seats", remaining: "Available:",
    decrease: "Decrease", increase: "Increase", checkout: "Continue to checkout", removeSelection: "Remove",
    seatSelected: "selected", seatAvailable: "available", seatUnavailable: "unavailable",
    descriptionSoon: "Description coming soon.", gallery: "Photo gallery", galleryAtmosphere: "Event atmosphere",
    galleryDetail: "Event detail", galleryGuests: "Event guests", program: "Program",
    schedule: "Event schedule", location: "Location and directions", openMap: "Open map",
    visitRules: "Attendance rules", visitTerms: "Visit terms", cancellationTerms: "Cancellation terms",
    depositTerms: "Deposit terms", extraConditions: "Additional conditions", terms: "Rules and terms",
    organizer: "Organizer", organizerTeam: "Event team", verifiedOrganizer: "Verified organizer",
    contactUnavailable: "No contact provided", eventStart: "Event starts", programStep: "Program item",
  },
};
