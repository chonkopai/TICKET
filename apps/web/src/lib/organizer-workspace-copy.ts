import type { EventLocale } from "@event-platform/shared-types";

const ru = {
  workspace: "Кабинет организатора", sections: "Рабочее пространство", events: "Мои события", profile: "Профиль организатора",
  totalEventsHint: "Все статусы событий", eventsHint: "Управляйте публикациями, билетами и продажами в одном месте.", incomplete: "Контакты не заполнены", complete: "Контакты заполнены",
  contactHint: "Укажите email и телефон для связи с гостями.", completeHint: "Видимость контактов настраивается в профиле.", fillProfile: "Заполнить профиль", guest: "Перейти в профиль гостя",
  help: "Помощь и поддержка", logout: "Выйти из аккаунта", close: "Закрыть", helpHint: "Выберите событие и откройте «Управление», чтобы работать с заказами, продажами и сообщениями гостей. Контакты и их видимость настраиваются в профиле организатора.",
  retry: "Повторить", eventColumn: "Событие", salesColumn: "Продажи", revenueColumn: "Выручка", actionsColumn: "Действия", quickStart: "Готовы к следующему событию?",
  shown: "Показано", of: "из", pageSales: "Продано на этой странице", units: "билетов / мест / столов", revenueUnavailable: "Общий итог недоступен: нет единой валюты.", noSales: "Продаж пока нет", tables: "столов", tickets: "билетов", seats: "мест",
  profileHint: "Укажите данные для связи и выберите, показывать ли их гостям на страницах событий.", loginHint: "Эти контакты не становятся способами входа; их можно подтвердить в разделе «Способы входа» личного кабинета.", basic: "Основная информация", basicHint: "Название организации и имя представителя.", contacts: "Контактные данные", contactsHint: "Для связи с гостями. Не используются для входа в аккаунт.",
  alwaysVisible: "Всегда видно гостям на странице события.", visibilityTitle: "Что видят гости", previewHint: "Предпросмотр. Изменения появятся у гостей после сохранения.", always: "Всегда видно", contactVisibility: "Профиль и контакты", hidden: "Скрыты от гостей", visible: "Видны гостям", hiddenHint: "Включите показ профиля, если хотите поделиться контактами на страницах событий.",
  loginTitle: "Данные для входа — отдельно", back: "К списку событий", noValue: "Не указано", photoImmediate: "Фото сохраняется сразу, отдельно от остальных изменений.", photoInvalid: "Выберите JPEG, PNG или WebP до 5 МБ.",
};
type WorkspaceCopy = { [K in keyof typeof ru]: string };
export const ORGANIZER_WORKSPACE_COPY: Record<EventLocale, WorkspaceCopy> = {
  ru,
  kk: {
    workspace: "Ұйымдастырушы кабинеті", sections: "Жұмыс кеңістігі", events: "Менің іс-шараларым", profile: "Ұйымдастырушы профилі",
    totalEventsHint: "Барлық іс-шара күйлері", eventsHint: "Жарияланымдарды, билеттерді және сатылымдарды бір жерден басқарыңыз.", incomplete: "Байланыс деректері толтырылмаған", complete: "Байланыс деректері толтырылған",
    contactHint: "Қонақтармен байланысу үшін email мен телефонды көрсетіңіз.", completeHint: "Байланыс деректерінің көрінуі профильде бапталады.", fillProfile: "Профильді толтыру", guest: "Қонақ профиліне өту",
    help: "Көмек және қолдау", logout: "Аккаунттан шығу", close: "Жабу", helpHint: "Тапсырыстарды, сатылымдарды және қонақ хабарламаларын басқару үшін іс-шараны таңдап, «Басқару» бөлімін ашыңыз. Байланыс деректері мен олардың көрінуі ұйымдастырушы профилінде бапталады.",
    retry: "Қайталау", eventColumn: "Іс-шара", salesColumn: "Сатылымдар", revenueColumn: "Түсім", actionsColumn: "Әрекеттер", quickStart: "Келесі іс-шараға дайынсыз ба?",
    shown: "Көрсетілді", of: "/", pageSales: "Осы бетте сатылды", units: "билет / орын / үстел", revenueUnavailable: "Жалпы сома қолжетімсіз: бірыңғай валюта жоқ.", noSales: "Әзірге сатылым жоқ", tables: "үстел", tickets: "билет", seats: "орын",
    profileHint: "Байланыс деректерін көрсетіп, оларды іс-шара беттерінде қонақтарға көрсету-көрсетпеуді таңдаңыз.", loginHint: "Бұл деректер кіру әдісіне айналмайды; оларды жеке кабинеттегі «Кіру әдістері» бөлімінде растауға болады.", basic: "Негізгі ақпарат", basicHint: "Ұйым атауы және өкілдің аты.", contacts: "Байланыс деректері", contactsHint: "Қонақтармен байланысу үшін. Аккаунтқа кіру үшін қолданылмайды.",
    alwaysVisible: "Іс-шара бетінде қонақтарға әрқашан көрінеді.", visibilityTitle: "Қонақтар не көреді", previewHint: "Алдын ала қарау. Өзгерістер сақталғаннан кейін қонақтарға көрінеді.", always: "Әрқашан көрінеді", contactVisibility: "Профиль және байланыс деректері", hidden: "Қонақтардан жасырылған", visible: "Қонақтарға көрінеді", hiddenHint: "Іс-шара бетінде байланыс деректерін көрсету үшін профиль көрінуін қосыңыз.",
    loginTitle: "Кіру деректері бөлек", back: "Іс-шаралар тізіміне", noValue: "Көрсетілмеген", photoImmediate: "Фото басқа өзгерістерден бөлек бірден сақталады.", photoInvalid: "5 МБ-қа дейінгі JPEG, PNG немесе WebP таңдаңыз.",
  },
  en: {
    workspace: "Organizer dashboard", sections: "Workspace", events: "My events", profile: "Organizer profile",
    totalEventsHint: "Across all event statuses", eventsHint: "Manage publications, tickets, and sales in one place.", incomplete: "Contacts not provided", complete: "Contacts provided",
    contactHint: "Add an email and phone number so guests can reach you.", completeHint: "Control contact visibility in your profile.", fillProfile: "Complete profile", guest: "Go to guest profile",
    help: "Help and support", logout: "Sign out", close: "Close", helpHint: "Choose an event and open Manage to work with orders, sales, and guest messages. Set contact details and their visibility in your organizer profile.",
    retry: "Retry", eventColumn: "Event", salesColumn: "Sales", revenueColumn: "Revenue", actionsColumn: "Actions", quickStart: "Ready for your next event?",
    shown: "Showing", of: "of", pageSales: "Sold on this page", units: "tickets / seats / tables", revenueUnavailable: "A combined total is unavailable: there is no single currency.", noSales: "No sales yet", tables: "tables", tickets: "tickets", seats: "seats",
    profileHint: "Add contact details and choose whether guests can see them on event pages.", loginHint: "These contacts do not become sign-in methods; you can verify them under Sign-in methods in your account.", basic: "Basic information", basicHint: "Organization name and representative's name.", contacts: "Contact details", contactsHint: "For guests to reach you. These are not account sign-in methods.",
    alwaysVisible: "Always displayed to guests on the event page.", visibilityTitle: "What guests see", previewHint: "Preview. Changes appear for guests after saving.", always: "Always visible", contactVisibility: "Profile and contacts", hidden: "Hidden from guests", visible: "Visible to guests", hiddenHint: "Enable profile visibility to share your contact details on event pages.",
    loginTitle: "Sign-in details are separate", back: "Back to events", noValue: "Not provided", photoImmediate: "Photos are saved immediately, separately from other changes.", photoInvalid: "Choose a JPEG, PNG, or WebP up to 5 MB.",
  },
};
