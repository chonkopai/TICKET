import type { EventCategory, EventLocale, PublicSaleStatus } from "@event-platform/shared-types";

interface HomeCopy {
  online: string; heading: string; headingCity: string; searchLabel: string; searchPlaceholder: string;
  search: string; categoriesLabel: string; all: string; allCategories: string; results: string;
  otherCities: string; current: string; liveBooking: string; emptyResults: string; loading: string; showMore: string; previousPage: string; nextPage: string; pageLabel: string;
  editorsChoice: string; featuredList: string; featuredHint: string; previousEvent: string;
  nextEvent: string; event: string; of: string; deposit: string; tickets: string; buyTicket: string; chooseSeats: string;
  filters: string; free: string; currency: string; exchangeRates: string; loadingRates: string; paymentCurrency: string;
  appliedFilters: string; applied: string; city: string; allCities: string; allCountries: string; allEvents: string;
  searchTerm: string; today: string; weekend: string; andLater: string; freeEvents: string;
  price: string; clearAll: string; sort: string; popular: string; recent: string;
  priceRange: string; minPrice: string; maxPrice: string; cost: string;
  emptyTitle: string; emptyDescription: string; loadingEvents: string;
  footerTagline: string; footerLinks: string; forOrganizers: string;
  favorites: string; from: string; tableUnit: string; seatUnit: string; ticketUnit: string;
  priceUnknown: string; loadFailed: string;
  categories: Record<EventCategory, string>;
  saleStatuses: Record<PublicSaleStatus, string>;
}

export const HOME_COPY: Record<EventLocale, HomeCopy> = {
  ru: {
    online: "событий онлайн", heading: "Афиша событий", headingCity: "Афиша событий в",
    searchLabel: "Поиск событий", searchPlaceholder: "Найти концерт, спектакль, выставку или вечеринку...",
    search: "Искать", categoriesLabel: "Категории событий", all: "Все", allCategories: "Все категории",
    results: "Результаты поиска", otherCities: "События в других городах", current: "Актуальные события", liveBooking: "Живое бронирование мест",
    emptyResults: "По выбранным фильтрам событий не найдено.", loading: "Загрузка…", showMore: "Показать ещё события", previousPage: "Предыдущая страница", nextPage: "Следующая страница", pageLabel: "Страница",
    editorsChoice: "Выбор редакции", featuredList: "Рекомендуемые события", featuredHint: "Проведите в сторону для просмотра",
    previousEvent: "Предыдущее событие", nextEvent: "Следующее событие", event: "Событие", of: "из",
    deposit: "Депозит", tickets: "Билеты", buyTicket: "Купить билет", chooseSeats: "Выбрать места на схеме",
    filters: "Фильтры событий", free: "Бесплатно", currency: "Валюта отображения",
    exchangeRates: "Ориентировочные курсы Нацбанка Казахстана на", loadingRates: "Загружаем курсы Нацбанка Казахстана", paymentCurrency: "Оплата в валюте события.",
    appliedFilters: "Применённые фильтры", applied: "Применено:", city: "Город:", allCities: "Все города", allCountries: "Все страны",
    allEvents: "Все события", searchTerm: "Поиск:", today: "Сегодня", weekend: "На выходных",
    andLater: "и позже", freeEvents: "Бесплатные", price: "Цена:", clearAll: "Сбросить все",
    sort: "Сортировка", popular: "По популярности", recent: "Сначала новые",
    priceRange: "Диапазон цены билета", minPrice: "Цена от", maxPrice: "Цена до", cost: "Стоимость",
    emptyTitle: "События скоро появятся", emptyDescription: "Пока можно посмотреть события во всех городах.",
    loadingEvents: "Загрузка событий", footerTagline: "События для каждого", footerLinks: "Ссылки внизу страницы",
    forOrganizers: "Организаторам", favorites: "Избранное",
    from: "от", tableUnit: "за стол", seatUnit: "за место", ticketUnit: "за билет", priceUnknown: "Цена уточняется", loadFailed: "Не удалось загрузить мероприятия.",
    categories: { music: "Музыка", nightlife: "Ночная жизнь", festival: "Фестиваль", comedy: "Комедия и стендап", theatre: "Театр", business: "Бизнес", education: "Образование", workshop: "Мастер-класс", sport: "Спорт", family: "Для всей семьи", food: "Еда и гастрономия", other: "Другое" },
    saleStatuses: { available: "Есть билеты", few_left: "Осталось мало", sold_out: "Продано", temporarily_unavailable: "Временно занято", sales_not_started: "Продажи ещё не начались", sales_ended: "Продажи завершены" },
  },
  kk: {
    otherCities: "Басқа қалалардағы іс-шаралар",
    online: "іс-шара онлайн", heading: "Іс-шаралар афишасы", headingCity: "Іс-шаралар —",
    searchLabel: "Іс-шараларды іздеу", searchPlaceholder: "Концерт, қойылым, көрме немесе кеш іздеңіз...",
    search: "Іздеу", categoriesLabel: "Іс-шара санаттары", all: "Барлығы", allCategories: "Барлық санаттар",
    results: "Іздеу нәтижелері", current: "Өзекті іс-шаралар", liveBooking: "Орындарды нақты уақытта брондау",
    emptyResults: "Таңдалған сүзгілер бойынша іс-шара табылмады.", loading: "Жүктелуде…", showMore: "Тағы іс-шараларды көрсету", previousPage: "Алдыңғы бет", nextPage: "Келесі бет", pageLabel: "Бет",
    editorsChoice: "Редакция таңдауы", featuredList: "Ұсынылған іс-шаралар", featuredHint: "Көру үшін сырғытыңыз",
    previousEvent: "Алдыңғы іс-шара", nextEvent: "Келесі іс-шара", event: "Іс-шара", of: "/",
    deposit: "Депозит", tickets: "Билеттер", buyTicket: "Билет сатып алу", chooseSeats: "Сызбадан орын таңдау",
    filters: "Іс-шара сүзгілері", free: "Тегін", currency: "Көрсету валютасы",
    exchangeRates: "Қазақстан Ұлттық банкінің шамамен бағамы:", loadingRates: "Ұлттық банк бағамдары жүктелуде", paymentCurrency: "Төлем іс-шара валютасымен жүргізіледі.",
    appliedFilters: "Қолданылған сүзгілер", applied: "Қолданылды:", city: "Қала:", allCities: "Барлық қалалар", allCountries: "Барлық елдер",
    allEvents: "Барлық іс-шаралар", searchTerm: "Іздеу:", today: "Бүгін", weekend: "Демалыста",
    andLater: "және кейін", freeEvents: "Тегін", price: "Баға:", clearAll: "Барлығын тазалау",
    sort: "Сұрыптау", popular: "Танымалдығы бойынша", recent: "Алдымен жаңалары",
    priceRange: "Билет бағасының аралығы", minPrice: "Ең төмен баға", maxPrice: "Ең жоғары баға", cost: "Құны",
    emptyTitle: "Іс-шаралар жақында пайда болады", emptyDescription: "Әзірге барлық қалалардағы іс-шараларды қараңыз.",
    loadingEvents: "Іс-шаралар жүктелуде", footerTagline: "Баршаға арналған іс-шаралар", footerLinks: "Төменгі сілтемелер",
    forOrganizers: "Ұйымдастырушыларға", favorites: "Таңдаулылар",
    from: "бастап", tableUnit: "үстел үшін", seatUnit: "орын үшін", ticketUnit: "билет үшін", priceUnknown: "Бағасы нақтылануда", loadFailed: "Іс-шараларды жүктеу мүмкін болмады.",
    categories: { music: "Музыка", nightlife: "Түнгі өмір", festival: "Фестиваль", comedy: "Комедия және стендап", theatre: "Театр", business: "Бизнес", education: "Білім", workshop: "Шеберлік сабағы", sport: "Спорт", family: "Отбасылық", food: "Тағам және гастрономия", other: "Басқа" },
    saleStatuses: { available: "Билеттер бар", few_left: "Аз қалды", sold_out: "Сатылып кетті", temporarily_unavailable: "Уақытша бос емес", sales_not_started: "Сатылым әлі басталмады", sales_ended: "Сатылым аяқталды" },
  },
  en: {
    otherCities: "Events in other cities",
    online: "events online", heading: "Events", headingCity: "Events in",
    searchLabel: "Search events", searchPlaceholder: "Find a concert, play, exhibition, or party...",
    search: "Search", categoriesLabel: "Event categories", all: "All", allCategories: "All categories",
    results: "Search results", current: "Current events", liveBooking: "Live seat availability",
    emptyResults: "No events match these filters.", loading: "Loading…", showMore: "Show more events", previousPage: "Previous page", nextPage: "Next page", pageLabel: "Page",
    editorsChoice: "Editor's pick", featuredList: "Featured events", featuredHint: "Swipe to browse",
    previousEvent: "Previous event", nextEvent: "Next event", event: "Event", of: "of",
    deposit: "Deposit", tickets: "Tickets", buyTicket: "Buy ticket", chooseSeats: "Choose seats on the map",
    filters: "Event filters", free: "Free", currency: "Display currency",
    exchangeRates: "Indicative National Bank of Kazakhstan rates as of", loadingRates: "Loading National Bank rates", paymentCurrency: "Payment uses the event currency.",
    appliedFilters: "Applied filters", applied: "Applied:", city: "City:", allCities: "All cities", allCountries: "All countries",
    allEvents: "All events", searchTerm: "Search:", today: "Today", weekend: "This weekend",
    andLater: "and later", freeEvents: "Free events", price: "Price:", clearAll: "Clear all",
    sort: "Sort", popular: "Most popular", recent: "Newest first",
    priceRange: "Ticket price range", minPrice: "Minimum price", maxPrice: "Maximum price", cost: "Price",
    emptyTitle: "Events are coming soon", emptyDescription: "You can browse events in all cities for now.",
    loadingEvents: "Loading events", footerTagline: "Events for everyone", footerLinks: "Footer links",
    forOrganizers: "For organizers", favorites: "Favorites",
    from: "from", tableUnit: "per table", seatUnit: "per seat", ticketUnit: "per ticket", priceUnknown: "Price to be confirmed", loadFailed: "Could not load events.",
    categories: { music: "Music", nightlife: "Nightlife", festival: "Festival", comedy: "Comedy and stand-up", theatre: "Theatre", business: "Business", education: "Education", workshop: "Workshop", sport: "Sports", family: "Family", food: "Food and drink", other: "Other" },
    saleStatuses: { available: "Tickets available", few_left: "Few left", sold_out: "Sold out", temporarily_unavailable: "Temporarily unavailable", sales_not_started: "Sales have not started", sales_ended: "Sales ended" },
  },
};
