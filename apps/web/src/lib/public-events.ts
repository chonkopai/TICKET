import type { PublicEvent, PublicEventList, PublicEventSummary } from "@event-platform/shared-types";
import { localeFromBrowser } from "./locale";

export interface PublicEventsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: "recent" | "popular" | undefined;
  search?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  city?: string | undefined;
  countryCode?: string | undefined;
  category?: string | undefined;
  datePreset?: "today" | "weekend" | undefined;
  paymentMode?: "deposit" | "full_payment" | undefined;
  free?: boolean | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
}

export async function fetchPublicEvents(query: PublicEventsQuery = {}): Promise<PublicEventList> {
  const params = new URLSearchParams();
  params.set("locale", localeFromBrowser());
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.sort) params.set("sort", query.sort);
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.city?.trim()) params.set("city", query.city.trim());
  if (query.countryCode) params.set("countryCode", query.countryCode);
  if (query.category) params.set("category", query.category);
  if (query.datePreset) params.set("datePreset", query.datePreset);
  if (query.paymentMode) params.set("paymentMode", query.paymentMode);
  if (query.free !== undefined) params.set("free", String(query.free));
  if (query.minPrice !== undefined) params.set("minPrice", String(query.minPrice));
  if (query.maxPrice !== undefined) params.set("maxPrice", String(query.maxPrice));
  const response = await fetch(`/api/events?${params.toString()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "EVENTS_NOT_FOUND" : "EVENTS_UNAVAILABLE");
  return response.json() as Promise<PublicEventList>;
}

export async function fetchPublicEvent(id: string): Promise<PublicEvent> {
  const response = await fetch(`/api/events/${encodeURIComponent(id)}?locale=${localeFromBrowser()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "EVENT_NOT_FOUND" : "EVENT_UNAVAILABLE");
  return response.json() as Promise<PublicEvent>;
}

export async function fetchPublicEventSummary(id: string): Promise<PublicEventSummary | null> {
  const response = await fetch(`/api/events/${encodeURIComponent(id)}/summary?locale=${localeFromBrowser()}`, { headers: { accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("EVENT_UNAVAILABLE");
  return response.json() as Promise<PublicEventSummary | null>;
}
