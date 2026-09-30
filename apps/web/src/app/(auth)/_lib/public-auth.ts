import type { EventLocale } from "@event-platform/shared-types";
import { localeFromBrowser, localeUrl } from "../../../lib/locale";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const ruMessages = {
  GOOGLE_UNAVAILABLE: "Google сейчас недоступен. Выберите другой способ входа.",
  GOOGLE_INVALID: "Не удалось подтвердить вход через Google. Попробуйте снова.",
  GOOGLE_LINK_REQUIRED: "Войдите существующим способом, затем подключите Google в настройках аккаунта.",
  GOOGLE_RETRY_OR_LINK: "Попробуйте снова. Этот Google-аккаунт или способ входа уже использован.",
  INVALID_CREDENTIALS: "Неверные данные для входа.",
  INVALID_VERIFICATION_CODE: "Код неверен, истёк или уже использован.",
  INVALID_VERIFICATION_GRANT: "Подтверждение истекло. Запросите новый код.",
  VERIFICATION_RATE_LIMITED: "Слишком много попыток. Повторите позже.",
  LOGIN_RATE_LIMITED: "Слишком много попыток входа. Повторите позже.",
  VERIFICATION_PROVIDER_UNAVAILABLE: "Этот способ подтверждения пока недоступен.",
  VERIFICATION_SEND_FAILED: "Не удалось отправить код. Попробуйте позже.",
  IDENTITY_ALREADY_LINKED: "Этот способ входа уже привязан к другому аккаунту.",
  PASSWORD_LENGTH: "Пароль должен содержать не менее 12 символов.",
  PASSWORD_SETUP_REQUIRED: "Для первого способа входа задайте пароль.",
  RECENT_AUTH_REQUIRED: "Для этого действия войдите в аккаунт заново.",
  IDENTITY_ALREADY_EXISTS: "Этот контакт уже используется другим аккаунтом.",
  CONTACT_ALREADY_LINKED: "Этот способ входа уже подключён.",
  VERIFICATION_EXPIRED: "Код истёк. Запросите новый.",
  VERIFICATION_ATTEMPTS_EXCEEDED: "Попытки исчерпаны. Запросите новый код.",
} as const;

type AuthErrorCode = keyof typeof ruMessages;
const messages: Record<EventLocale, Record<AuthErrorCode, string>> = {
  ru: ruMessages,
  kk: {
  GOOGLE_UNAVAILABLE: "Google қазір қолжетімсіз. Басқа кіру тәсілін таңдаңыз.",
  GOOGLE_INVALID: "Google арқылы кіру расталмады. Қайталап көріңіз.",
  GOOGLE_LINK_REQUIRED: "Бұрынғы тәсілмен кіріп, аккаунт баптауларында Google қосыңыз.",
  GOOGLE_RETRY_OR_LINK: "Қайталап көріңіз. Бұл Google аккаунты немесе кіру тәсілі бұрын қолданылған.",
    INVALID_CREDENTIALS: "Кіру деректері қате.",
    INVALID_VERIFICATION_CODE: "Код қате, мерзімі өткен немесе бұрын қолданылған.",
    INVALID_VERIFICATION_GRANT: "Растау мерзімі өтті. Жаңа код сұраңыз.",
    VERIFICATION_RATE_LIMITED: "Әрекет саны тым көп. Кейінірек қайталаңыз.",
    LOGIN_RATE_LIMITED: "Кіру әрекеті тым көп. Кейінірек қайталаңыз.",
    VERIFICATION_PROVIDER_UNAVAILABLE: "Бұл растау тәсілі әзірге қолжетімсіз.",
    VERIFICATION_SEND_FAILED: "Кодты жіберу мүмкін болмады. Кейінірек қайталаңыз.",
    IDENTITY_ALREADY_LINKED: "Бұл кіру тәсілі басқа аккаунтқа тіркелген.",
    PASSWORD_LENGTH: "Құпиясөз кемінде 12 таңбадан тұруы керек.",
    PASSWORD_SETUP_REQUIRED: "Алғашқы кіру тәсілі үшін құпиясөз орнатыңыз.",
    RECENT_AUTH_REQUIRED: "Бұл әрекет үшін аккаунтқа қайта кіріңіз.",
    IDENTITY_ALREADY_EXISTS: "Бұл байланыс дерегі басқа аккаунтта қолданылып жатыр.",
    CONTACT_ALREADY_LINKED: "Бұл кіру тәсілі қосылған.",
    VERIFICATION_EXPIRED: "Кодтың мерзімі өтті. Жаңа код сұраңыз.",
    VERIFICATION_ATTEMPTS_EXCEEDED: "Әрекет саны таусылды. Жаңа код сұраңыз.",
  },
  en: {
  GOOGLE_UNAVAILABLE: "Google is currently unavailable. Choose another sign-in method.",
  GOOGLE_INVALID: "Could not verify Google sign-in. Please try again.",
  GOOGLE_LINK_REQUIRED: "Sign in using your existing method, then connect Google in account settings.",
  GOOGLE_RETRY_OR_LINK: "Please try again. This Google account or sign-in attempt has already been used.",
    INVALID_CREDENTIALS: "Incorrect sign-in details.",
    INVALID_VERIFICATION_CODE: "The code is invalid, expired, or already used.",
    INVALID_VERIFICATION_GRANT: "Verification expired. Request a new code.",
    VERIFICATION_RATE_LIMITED: "Too many attempts. Try again later.",
    LOGIN_RATE_LIMITED: "Too many sign-in attempts. Try again later.",
    VERIFICATION_PROVIDER_UNAVAILABLE: "This verification method is not available yet.",
    VERIFICATION_SEND_FAILED: "Could not send the code. Try again later.",
    IDENTITY_ALREADY_LINKED: "This sign-in method belongs to another account.",
    PASSWORD_LENGTH: "Your password must have at least 12 characters.",
    PASSWORD_SETUP_REQUIRED: "Set a password for your first sign-in method.",
    RECENT_AUTH_REQUIRED: "Sign in again to continue.",
    IDENTITY_ALREADY_EXISTS: "This contact is already used by another account.",
    CONTACT_ALREADY_LINKED: "This sign-in method is already connected.",
    VERIFICATION_EXPIRED: "The code expired. Request a new one.",
    VERIFICATION_ATTEMPTS_EXCEEDED: "No attempts remain. Request a new code.",
  },
};

const requestFailed: Record<EventLocale, string> = {
  ru: "Не удалось выполнить запрос. Попробуйте ещё раз.",
  kk: "Сұрауды орындау мүмкін болмады. Қайталап көріңіз.",
  en: "The request could not be completed. Please try again.",
};

export function authErrorMessage(code: string | undefined): string | null {
  return code && code in ruMessages ? messages[localeFromBrowser()][code as AuthErrorCode] : null;
}

export async function publicAuthRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(new URL(path, API_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    let code: string | undefined;
    try { code = (await response.json() as { code?: string }).code; } catch { /* no body */ }
    throw new Error(authErrorMessage(code) ?? requestFailed[localeFromBrowser()]);
  }
  return await response.json() as T;
}

export function safeReturnPath(): string {
  const home = localeUrl("/", localeFromBrowser());
  if (typeof window === "undefined") return home;
  const candidate = new URLSearchParams(window.location.search).get("returnTo");
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || [...candidate].some(character => character === "\\" || character.charCodeAt(0) < 32)) return home;
  const resolved = new URL(candidate, window.location.origin);
  return resolved.origin === window.location.origin ? resolved.pathname + resolved.search + resolved.hash : home;
}
