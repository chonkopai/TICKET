import type { EventLocale } from "@event-platform/shared-types";

interface NavbarCopy {
  city: string; allCities: string; catalog: string; favorites: string; myEvents: string;
  language: string; navigation: string; mobileNavigation: string; openMenu: string;
  closeMenu: string; createEvent: string; account: string; profile: string;
  logout: string; organizer: string; logoutFailed: string;
  location: string; country: string; chooseCountry: string; chooseCity: string; searchCountry: string; searchCity: string; backToCountries: string; noCities: string; noMatches: string; loadingCities: string; citiesUnavailable: string; retry: string;
}

export const NAV_COPY: Record<EventLocale, NavbarCopy> = {
  ru: {
    city: "Город", allCities: "Все города", catalog: "Афиша", favorites: "Избранное",
    myEvents: "Мои мероприятия", language: "Язык", navigation: "Основная навигация",
    mobileNavigation: "Мобильная навигация", openMenu: "Открыть меню", closeMenu: "Закрыть меню",
    createEvent: "Создать мероприятие", account: "Личный кабинет", profile: "Профиль",
    logout: "Выйти", organizer: "Кабинет организатора", logoutFailed: "Не удалось закрыть серверную сессию.",
    location: "Местоположение", country: "Страна", chooseCountry: "Выберите страну", chooseCity: "Выберите город", searchCountry: "Найти страну", searchCity: "Найти город", backToCountries: "Назад к странам", noCities: "Здесь пока нет опубликованных событий", noMatches: "Ничего не найдено", loadingCities: "Загружаем города…", citiesUnavailable: "Не удалось загрузить города", retry: "Повторить",
  },
  kk: {
    city: "Қала", allCities: "Барлық қалалар", catalog: "Афиша", favorites: "Таңдаулылар",
    myEvents: "Менің іс-шараларым", language: "Тіл", navigation: "Негізгі навигация",
    mobileNavigation: "Мобильді навигация", openMenu: "Мәзірді ашу", closeMenu: "Мәзірді жабу",
    createEvent: "Іс-шара жасау", account: "Жеке кабинет", profile: "Профиль",
    logout: "Шығу", organizer: "Ұйымдастырушы кабинеті", logoutFailed: "Сервердегі сеансты жабу мүмкін болмады.",
    location: "Орналасқан жер", country: "Ел", chooseCountry: "Елді таңдаңыз", chooseCity: "Қаланы таңдаңыз", searchCountry: "Елді іздеу", searchCity: "Қаланы іздеу", backToCountries: "Елдерге оралу", noCities: "Мұнда әзірге жарияланған іс-шара жоқ", noMatches: "Ештеңе табылмады", loadingCities: "Қалалар жүктелуде…", citiesUnavailable: "Қалаларды жүктеу мүмкін болмады", retry: "Қайталау",
  },
  en: {
    city: "City", allCities: "All cities", catalog: "Events", favorites: "Favorites",
    myEvents: "My events", language: "Language", navigation: "Main navigation",
    mobileNavigation: "Mobile navigation", openMenu: "Open menu", closeMenu: "Close menu",
    createEvent: "Create an event", account: "My account", profile: "Profile",
    logout: "Sign out", organizer: "Organizer dashboard", logoutFailed: "Could not end the server session.",
    location: "Location", country: "Country", chooseCountry: "Choose a country", chooseCity: "Choose a city", searchCountry: "Search countries", searchCity: "Search cities", backToCountries: "Back to countries", noCities: "No published events here yet", noMatches: "No matches found", loadingCities: "Loading cities…", citiesUnavailable: "Could not load cities", retry: "Retry",
  },
};
