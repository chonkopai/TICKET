import type { AuthResponse, AuthTokens, AuthUser } from "@event-platform/shared-types";

const SESSION_KEY = "event-platform:session";
const SESSION_CHANGED = "event-platform:session-changed";

export interface BrowserSession {
  user: AuthUser;
  tokens: AuthTokens;
}

export function getSession(): BrowserSession | null {
  if (typeof window === "undefined") return null;
  let shared: string | null = null;
  try { shared = window.localStorage.getItem(SESSION_KEY); } catch { /* Use tab storage when browser storage is restricted. */ }
  if (shared !== null) {
    // A shared null is a sign-out marker. Older tabs must not restore their copy.
    removeLegacySession();
    return parseSession(shared);
  }
  let legacy: string | null = null;
  try { legacy = window.sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  const session = parseSession(legacy);
  if (!session) { removeLegacySession(); return null; }
  // Migrate an existing login without making the user sign in again.
  try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(session)); removeLegacySession(); } catch { /* Keep the existing tab session. */ }
  return session;
}

function parseSession(value: string | null): BrowserSession | null {
  try {
    const session = JSON.parse(value ?? "null") as BrowserSession | null;
    return session && typeof session.user?.id === "string" && typeof session.tokens?.accessToken === "string" && typeof session.tokens?.refreshToken === "string" ? session : null;
  } catch { return null; }
}

function removeLegacySession(): void {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage can be disabled. */ }
}

export function saveSession(session: AuthResponse | BrowserSession): void {
  const value = JSON.stringify(session);
  try { window.localStorage.setItem(SESSION_KEY, value); removeLegacySession(); }
  catch { window.sessionStorage.setItem(SESSION_KEY, value); }
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

export function updateSessionUser(user: AuthUser): void {
  const session = getSession();
  if (session) saveSession({ ...session, user });
}

export function clearSession(): void {
  try { window.localStorage.setItem(SESSION_KEY, "null"); } catch { /* Clear the fallback below. */ }
  removeLegacySession();
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

export function subscribeSession(listener: () => void): () => void {
  const changed = (event: StorageEvent) => { if (event.key === SESSION_KEY || event.key === null) listener(); };
  window.addEventListener(SESSION_CHANGED, listener);
  window.addEventListener("storage", changed);
  return () => { window.removeEventListener(SESSION_CHANGED, listener); window.removeEventListener("storage", changed); };
}
