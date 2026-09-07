import type { PublicEventSummary } from "./events.js";

export interface FavoriteList {
  items: PublicEventSummary[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export interface FavoriteMutation {
  eventId: string;
  favorited: boolean;
}
