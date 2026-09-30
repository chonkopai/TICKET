import type { EventLocale } from "@event-platform/shared-types";

interface AuthCopy {
  sentAgain: string; sent: string; verified: string; resetDone: string;
  registerTitle: string; resetTitle: string; loginTitle: string;
  emailAddress: string; phoneNumber: string; authRegion: string; catalog: string;
  methods: string; divider: string; telegramTitle: string; telegramHint: string;
  telegramClose: string; telegramReturn: string; methodLabel: string; phone: string;
  actionLabel: string; login: string; register: string; forgot: string;
  smsUnavailable: string; smsSoon: string; verifiedAddress: string; codeSentTo: string;
  change: string; mailCode: string; resendIn: string; resend: string;
  firstName: string; lastName: string; wait: string; legal: string;
  heroLabel: string; heroTitle: string; heroDescription: string; heroRegion: string;
  heroCreate: string; heroFind: string; heroJoin: string;
  soon: string; newPassword: string; password: string; hidePassword: string;
  showPassword: string; hide: string; show: string; passwordPlaceholder: string;
  passwordMinimum: string; submitLogin: string; submitResetCode: string;
  submitCode: string; submitConfirm: string; submitRegister: string; submitPassword: string;
  requestFailed: string;
}

export const AUTH_COPY: Record<EventLocale, AuthCopy> = {
  ru: {
    sentAgain: "Новый код отправлен. Предыдущий код больше не действует.", sent: "Если адрес доступен, код отправлен. Проверьте почту.",
    verified: "Контакт подтверждён. Завершите настройку.", resetDone: "Пароль обновлён. Войдите с новым паролем.",
    registerTitle: "Регистрация в TICKET", resetTitle: "Восстановление доступа", loginTitle: "Вход в TICKET",
    emailAddress: "Электронная почта", phoneNumber: "Номер телефона", authRegion: "Вход и регистрация", catalog: "TICKET — афиша",
    methods: "Способы входа", divider: "ИЛИ ЧЕРЕЗ ПОЧТУ И ТЕЛЕФОН", telegramTitle: "Войти через Telegram",
    telegramHint: "Продолжите вход в безопасном окне Telegram.", telegramClose: "Закрыть вход через Telegram",
    telegramReturn: "Вернуться к Email или телефону", methodLabel: "Способ входа", phone: "Телефон",
    actionLabel: "Действие", login: "Войти", register: "Создать аккаунт", forgot: "Забыли пароль?",
    smsUnavailable: "Подтверждение по SMS пока недоступно. Используйте Email или Telegram.", smsSoon: "SMS-код скоро",
    verifiedAddress: "Подтверждённый адрес", codeSentTo: "Код отправлен на", change: "Изменить",
    mailCode: "Код из письма", resendIn: "Новый код через", resend: "Отправить код ещё раз",
    firstName: "Имя", lastName: "Фамилия", wait: "Подождите…",
    legal: "Используйте проверенные способы входа в аккаунт TICKET. Контактные данные нужны для защиты доступа к билетам.",
    heroLabel: "АФИША ДЛЯ КАЖДОГО", heroTitle: "Создавайте события. Открывайте новые.",
    heroDescription: "Легко создавайте любое событие — от встречи друзей до концерта. Находите мероприятия других людей в одной афише.",
    heroRegion: "Как работает TICKET", heroCreate: "Создайте событие", heroFind: "Найдите интересное", heroJoin: "Участвуйте",
    soon: "Скоро", newPassword: "Новый пароль", password: "Пароль", hidePassword: "Скрыть пароль",
    showPassword: "Показать пароль", hide: "Скрыть", show: "Показать", passwordPlaceholder: "Введите пароль",
    passwordMinimum: "Не менее 12 символов.", submitLogin: "Войти в аккаунт", submitResetCode: "Получить код доступа",
    submitCode: "Получить код", submitConfirm: "Подтвердить код", submitRegister: "Зарегистрироваться",
    submitPassword: "Сохранить пароль", requestFailed: "Не удалось выполнить запрос.",
  },
  kk: {
    sentAgain: "Жаңа код жіберілді. Алдыңғы код енді жарамсыз.", sent: "Мекенжай қолжетімді болса, код жіберілді. Поштаңызды тексеріңіз.",
    verified: "Байланыс расталды. Тіркеуді аяқтаңыз.", resetDone: "Құпиясөз жаңартылды. Жаңа құпиясөзбен кіріңіз.",
    registerTitle: "TICKET-те тіркелу", resetTitle: "Қолжетімділікті қалпына келтіру", loginTitle: "TICKET-ке кіру",
    emailAddress: "Электрондық пошта", phoneNumber: "Телефон нөмірі", authRegion: "Кіру және тіркелу", catalog: "TICKET — афиша",
    methods: "Кіру тәсілдері", divider: "НЕМЕСЕ ПОШТА МЕН ТЕЛЕФОН АРҚЫЛЫ", telegramTitle: "Telegram арқылы кіру",
    telegramHint: "Telegram-ның қауіпсіз терезесінде кіруді жалғастырыңыз.", telegramClose: "Telegram арқылы кіруді жабу",
    telegramReturn: "Email немесе телефонға оралу", methodLabel: "Кіру тәсілі", phone: "Телефон",
    actionLabel: "Әрекет", login: "Кіру", register: "Аккаунт ашу", forgot: "Құпиясөзді ұмыттыңыз ба?",
    smsUnavailable: "SMS арқылы растау әзірге қолжетімсіз. Email немесе Telegram пайдаланыңыз.", smsSoon: "SMS-код жақында",
    verifiedAddress: "Расталған мекенжай", codeSentTo: "Код жіберілген мекенжай", change: "Өзгерту",
    mailCode: "Хаттағы код", resendIn: "Жаңа код", resend: "Кодты қайта жіберу",
    firstName: "Аты", lastName: "Тегі", wait: "Күте тұрыңыз…",
    legal: "TICKET аккаунтына кірудің тексерілген тәсілдерін пайдаланыңыз. Байланыс деректері билеттеріңізге қолжетімділікті қорғау үшін қажет.",
    heroLabel: "БАРШАҒА АРНАЛҒАН АФИША", heroTitle: "Іс-шаралар жасаңыз. Жаңа әсерлер ашыңыз.",
    heroDescription: "Достармен кездесуден концертке дейін кез келген іс-шараны оңай жасаңыз. Басқалардың іс-шараларын бір афишадан табыңыз.",
    heroRegion: "TICKET қалай жұмыс істейді", heroCreate: "Іс-шара жасаңыз", heroFind: "Қызықтысын табыңыз", heroJoin: "Қатысыңыз",
    soon: "Жақында", newPassword: "Жаңа құпиясөз", password: "Құпиясөз", hidePassword: "Құпиясөзді жасыру",
    showPassword: "Құпиясөзді көрсету", hide: "Жасыру", show: "Көрсету", passwordPlaceholder: "Құпиясөзді енгізіңіз",
    passwordMinimum: "Кемінде 12 таңба.", submitLogin: "Аккаунтқа кіру", submitResetCode: "Қалпына келтіру кодын алу",
    submitCode: "Код алу", submitConfirm: "Кодты растау", submitRegister: "Тіркелу",
    submitPassword: "Құпиясөзді сақтау", requestFailed: "Сұрауды орындау мүмкін болмады.",
  },
  en: {
    sentAgain: "A new code was sent. The previous code no longer works.", sent: "If the address is available, a code was sent. Check your email.",
    verified: "Contact verified. Finish setting up your account.", resetDone: "Password updated. Sign in with your new password.",
    registerTitle: "Sign up for TICKET", resetTitle: "Recover your account", loginTitle: "Sign in to TICKET",
    emailAddress: "Email address", phoneNumber: "Phone number", authRegion: "Sign in and sign up", catalog: "TICKET — events",
    methods: "Sign-in methods", divider: "OR USE EMAIL OR PHONE", telegramTitle: "Sign in with Telegram",
    telegramHint: "Continue in Telegram's secure window.", telegramClose: "Close Telegram sign-in",
    telegramReturn: "Return to email or phone", methodLabel: "Sign-in method", phone: "Phone",
    actionLabel: "Action", login: "Sign in", register: "Create account", forgot: "Forgot password?",
    smsUnavailable: "SMS verification is not available yet. Use email or Telegram.", smsSoon: "SMS code coming soon",
    verifiedAddress: "Verified address", codeSentTo: "Code sent to", change: "Change",
    mailCode: "Code from email", resendIn: "New code in", resend: "Send another code",
    firstName: "First name", lastName: "Last name", wait: "Please wait…",
    legal: "Use a verified sign-in method for your TICKET account. Contact details help protect access to your tickets.",
    heroLabel: "EVENTS FOR EVERYONE", heroTitle: "Create events. Discover new ones.",
    heroDescription: "Create any event, from a get-together with friends to a concert. Find events made by other people in one place.",
    heroRegion: "How TICKET works", heroCreate: "Create an event", heroFind: "Find something interesting", heroJoin: "Join in",
    soon: "Soon", newPassword: "New password", password: "Password", hidePassword: "Hide password",
    showPassword: "Show password", hide: "Hide", show: "Show", passwordPlaceholder: "Enter password",
    passwordMinimum: "At least 12 characters.", submitLogin: "Sign in", submitResetCode: "Get recovery code",
    submitCode: "Get code", submitConfirm: "Confirm code", submitRegister: "Sign up",
    submitPassword: "Save password", requestFailed: "Request failed.",
  },
};
