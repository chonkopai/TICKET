import type { PublicEvent, PublicEventList } from "@event-platform/shared-types";

export interface PublicEventsQuery {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: "recent" | "popular" | undefined;
  search?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  city?: string | undefined;
  category?: string | undefined;
  datePreset?: "today" | "weekend" | undefined;
  paymentMode?: "deposit" | "full_payment" | undefined;
  free?: boolean | undefined;
}

export async function fetchPublicEvents(query: PublicEventsQuery = {}): Promise<PublicEventList> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.sort) params.set("sort", query.sort);
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.city?.trim()) params.set("city", query.city.trim());
  if (query.category) params.set("category", query.category);
  if (query.datePreset) params.set("datePreset", query.datePreset);
  if (query.paymentMode) params.set("paymentMode", query.paymentMode);
  if (query.free !== undefined) params.set("free", String(query.free));
  const response = await fetch(`/api/events?${params.toString()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "EVENTS_NOT_FOUND" : "EVENTS_UNAVAILABLE");
  return response.json() as Promise<PublicEventList>;
}

export async function fetchPublicEvent(id: string): Promise<PublicEvent> {
  const response = await fetch(`/api/events/${encodeURIComponent(id)}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "EVENT_NOT_FOUND" : "EVENT_UNAVAILABLE");
  return response.json() as Promise<PublicEvent>;
}

export function publicEventToSummary(event: PublicEvent): PublicEventList["items"][number] {
  const options = [...event.ticketTypes, ...event.tables].map((item) => item.payment).sort((left, right) => left.amountDue - right.amountDue);
  const remainingTickets = event.ticketTypes.reduce((sum, item) => sum + item.remaining, 0);
  const remainingTables = event.tables.filter((item) => item.availability === "available").length;
  const remaining = remainingTickets + remainingTables;
  return {
    id: event.id, title: event.title, category: event.category, city: event.city, posterUrl: event.posterUrl,
    announcement: event.announcement, date: event.date, time: event.time, timezone: event.timezone,
    startsAt: event.startsAt, venueName: event.venueName, address: event.address, paymentMode: event.paymentMode,
    paymentLabel: event.paymentMode, startingAmount: options[0]?.amountDue ?? null,
    startingFullAmount: options[0]?.fullAmount ?? null, startingCurrency: options[0]?.currency ?? null,
    remainingTickets, remainingTables,
    saleStatus: remaining === 0 ? "sold_out" : remaining <= 5 ? "few_left" : "available",
    organizer: event.organizer,
  };
}
