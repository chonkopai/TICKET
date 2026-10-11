import type { EventLocale } from "@event-platform/shared-types";

export const TELEGRAM_AUTH_COPY = {
  ru: {
    continue: "Продолжить с Telegram", phone: "Войти через Telegram по номеру телефона",
    hint: "Подтвердите вход в Telegram. Если приложение не открылось, войдите по номеру телефона в безопасном окне Telegram.",
    phoneHint: "Номер и подтверждение вводятся только в окне Telegram.",
    waiting: "Открываем Telegram…", verifying: "Проверяем подтверждение Telegram…", retry: "Попробовать снова",
    unavailable: "Не удалось открыть Telegram. Попробуйте ещё раз или войдите по номеру телефона.",
    notConfigured: "Telegram не настроен для этого сайта.", failed: "Не удалось подтвердить вход через Telegram.",
    back: "Вернуться ко входу", title: "Вход через Telegram",
  },
  kk: {
    continue: "Telegram арқылы жалғастыру", phone: "Telegram-ға телефон нөмірімен кіру",
    hint: "Telegram-да кіруді растаңыз. Қолданба ашылмаса, Telegram-ның қауіпсіз терезесінде телефон нөмірімен кіріңіз.",
    phoneHint: "Нөмір мен растау тек Telegram терезесінде енгізіледі.",
    waiting: "Telegram ашылуда…", verifying: "Telegram растауы тексерілуде…", retry: "Қайталау",
    unavailable: "Telegram ашылмады. Қайталап көріңіз немесе телефон нөмірімен кіріңіз.",
    notConfigured: "Бұл сайт үшін Telegram бапталмаған.", failed: "Telegram арқылы кіру расталмады.",
    back: "Кіру бетіне оралу", title: "Telegram арқылы кіру",
  },
  en: {
    continue: "Continue with Telegram", phone: "Sign in to Telegram with a phone number",
    hint: "Approve sign-in in Telegram. If the app does not open, use phone-number login in Telegram's secure window.",
    phoneHint: "Enter your number and verification only in Telegram's window.",
    waiting: "Opening Telegram…", verifying: "Verifying Telegram approval…", retry: "Try again",
    unavailable: "Could not open Telegram. Try again or sign in with a phone number.",
    notConfigured: "Telegram is not configured for this website.", failed: "Could not verify Telegram sign-in.",
    back: "Return to sign-in", title: "Telegram sign-in",
  },
} satisfies Record<EventLocale, Record<string, string>>;
