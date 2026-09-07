const FAVORITES_KEY = "event-platform:favorites";
const RECENT_KEY = "event-platform:recently-viewed";
const MAX_RECENT = 12;

function read(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage can be disabled */ }
}

export function readLocalFavoriteIds(): string[] { return read(FAVORITES_KEY); }

export function setLocalFavorite(eventId: string, favorite: boolean): string[] {
  const next = readLocalFavoriteIds().filter((id) => id !== eventId);
  if (favorite) next.unshift(eventId);
  write(FAVORITES_KEY, next.slice(0, 100));
  return next;
}

export function clearLocalFavorites(): void { write(FAVORITES_KEY, []); }

export function readRecentlyViewedIds(): string[] { return read(RECENT_KEY).slice(0, MAX_RECENT); }

export function rememberRecentlyViewed(eventId: string): void {
  const next = [eventId, ...readRecentlyViewedIds().filter((id) => id !== eventId)].slice(0, MAX_RECENT);
  write(RECENT_KEY, next);
}
