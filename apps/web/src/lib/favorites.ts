import type { FavoriteList } from "@event-platform/shared-types";

import { apiRequest } from "../app/(auth)/_lib/api";
import { getSession } from "../app/(auth)/_lib/session";
import { clearLocalFavorites, readLocalFavoriteIds, setLocalFavorite } from "./local-preferences";

let favoriteIdsCache: Set<string> | null = null;
let favoriteIdsRequest: Promise<Set<string>> | null = null;

export async function loadFavoriteIds(): Promise<Set<string>> {
  const session = getSession();
  if (!session) return new Set(readLocalFavoriteIds());
  if (favoriteIdsCache) return new Set(favoriteIdsCache);
  if (!favoriteIdsRequest) {
    favoriteIdsRequest = apiRequest<FavoriteList>("/me/favorites?page=1&limit=50")
      .then((page) => { favoriteIdsCache = new Set(page.items.map((item) => item.id)); return new Set(favoriteIdsCache); })
      .finally(() => { favoriteIdsRequest = null; });
  }
  return new Set(await favoriteIdsRequest);
}

export async function toggleFavorite(eventId: string, favorite: boolean): Promise<void> {
  if (!getSession()) {
    setLocalFavorite(eventId, favorite);
    return;
  }
  await apiRequest(`/me/favorites/${encodeURIComponent(eventId)}`, { method: favorite ? "POST" : "DELETE" });
  if (favoriteIdsCache) {
    if (favorite) favoriteIdsCache.add(eventId);
    else favoriteIdsCache.delete(eventId);
  }
}

export async function mergeLocalFavorites(): Promise<void> {
  if (!getSession()) return;
  const ids = readLocalFavoriteIds();
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => apiRequest(`/me/favorites/${encodeURIComponent(id)}`, { method: "POST" })));
  clearLocalFavorites();
  favoriteIdsCache = null;
}
