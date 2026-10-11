import { validatedReturnPath, type EventLocale, type TelegramOidcCompleteResponse, type TelegramOidcStartResponse } from "@event-platform/shared-types";
import { authErrorMessage, publicAuthRequest } from "./public-auth";

const ATTEMPT_KEY = "event-platform:telegram-login-attempt";
const LATEST_KEY = "event-platform:telegram-login-request";
interface BrowserAttempt { state: string; browserProof: string; returnTo: string; locale: EventLocale; expiresAt: string }

function failure(code: string): Error { return new Error(authErrorMessage(code) ?? "Telegram sign-in could not be completed."); }

export function pendingTelegramLogin(): BrowserAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(ATTEMPT_KEY);
    const value = raw ? JSON.parse(raw) as BrowserAttempt : null;
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value.state) || !/^[a-f0-9]{64}$/.test(value.browserProof) || !["ru", "kk", "en"].includes(value.locale) || typeof value.returnTo !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) return null;
    return value;
  } catch { return null; }
}

export function cancelTelegramLogin(): void {
  try {
    window.sessionStorage.removeItem(ATTEMPT_KEY);
    window.sessionStorage.removeItem(LATEST_KEY);
  } catch { /* Storage may be unavailable; starting authorization will fail closed. */ }
}

/** Returns null when superseded/canceled. Only a current attempt can navigate. */
export async function beginTelegramLogin(locale: EventLocale, returnTo: string): Promise<string | null> {
  cancelTelegramLogin();
  const browserProof = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  window.sessionStorage.setItem(LATEST_KEY, browserProof);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(browserProof));
  const browserProofHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  let result: TelegramOidcStartResponse;
  try {
    result = await publicAuthRequest<TelegramOidcStartResponse>("/auth/telegram/oidc/start", { browserProofHash, returnTo, locale }, AbortSignal.timeout(15_000));
  } catch (error) {
    if (window.sessionStorage.getItem(LATEST_KEY) === browserProof) window.sessionStorage.removeItem(LATEST_KEY);
    throw error;
  }
  if (window.sessionStorage.getItem(LATEST_KEY) !== browserProof) return null;
  const url = new URL(result.authorizationUrl);
  if (url.origin !== "https://oauth.telegram.org" || url.pathname !== "/auth" || url.username || url.password || url.searchParams.get("state") !== result.state || !/^[A-Za-z0-9_-]{43}$/.test(result.state) || Date.parse(result.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(result.expiresAt))) {
    window.sessionStorage.removeItem(LATEST_KEY);
    throw failure("TELEGRAM_INVALID");
  }
  const attempt: BrowserAttempt = { state: result.state, browserProof, returnTo: validatedReturnPath(returnTo, window.location.origin, `/?lang=${locale}`), locale, expiresAt: result.expiresAt };
  window.sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
  window.sessionStorage.removeItem(LATEST_KEY);
  return url.toString();
}

export async function completeTelegramLogin(search: string): Promise<TelegramOidcCompleteResponse> {
  const parameters = new URLSearchParams(search);
  const attempt = pendingTelegramLogin();
  const state = parameters.get("state");
  if (!attempt || state !== attempt.state || parameters.getAll("state").length !== 1) throw failure("TELEGRAM_BROWSER_REQUIRED");
  if (Date.parse(attempt.expiresAt) <= Date.now()) { cancelTelegramLogin(); throw failure("TELEGRAM_INVALID"); }
  if (parameters.has("error")) {
    cancelTelegramLogin();
    throw failure(parameters.get("error") === "access_denied" ? "TELEGRAM_CANCELED" : "TELEGRAM_INVALID");
  }
  const code = parameters.get("code");
  if (!code || parameters.getAll("code").length !== 1) { cancelTelegramLogin(); throw failure("TELEGRAM_INVALID"); }
  try {
    const result = await publicAuthRequest<TelegramOidcCompleteResponse>("/auth/telegram/oidc/complete", { state, code, browserProof: attempt.browserProof }, AbortSignal.timeout(25_000));
    if (pendingTelegramLogin()?.state !== state) throw failure("TELEGRAM_INVALID");
    return { session: result.session, returnTo: validatedReturnPath(result.returnTo, window.location.origin, `/?lang=${attempt.locale}`) };
  } finally {
    if (pendingTelegramLogin()?.state === state) cancelTelegramLogin();
  }
}
