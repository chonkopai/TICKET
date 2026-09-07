import type { AuthResponse, AuthTokens, AuthUser } from "@event-platform/shared-types";

const SESSION_KEY = "event-platform:session";

export interface BrowserSession {
  user: AuthUser;
  tokens: AuthTokens;
}

export function getSession(): BrowserSession | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(SESSION_KEY);
  if (!value) return null;

  try {
    return JSON.parse(value) as BrowserSession;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: AuthResponse | BrowserSession): void {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("event-platform:session-changed"));
}

export function updateSessionUser(user: AuthUser): void {
  const session = getSession();
  if (session) saveSession({ ...session, user });
}

export function clearSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("event-platform:session-changed"));
}
