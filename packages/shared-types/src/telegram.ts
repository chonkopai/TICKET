import type { EventPaymentMode, PublicEvent, PublicEventList } from "./events.js";

export interface BotIdentityRequest {
  telegramId: string;
  chatId: string;
}

export interface BotIdentityResponse {
  token: string;
  expiresAt: string;
  user: { id: string; role: "guest" | "organizer" | "admin" };
}

export interface BotTicketSummary {
  id: string;
  eventId: string;
  eventTitle: string;
  ticketTypeName: string;
  status: string;
  usedAt: string | null;
  anonymous: boolean;
}

export interface BotTicketsResponse {
  items: BotTicketSummary[];
}

export interface BotOrganizerEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  timezone: string;
  guestCount: number;
}

export interface BotOrganizerTodayResponse {
  items: BotOrganizerEvent[];
}

export interface BotQuickSessionResponse {
  sessionToken: string;
  accessToken: string;
  expiresAt: string;
  accessExpiresAt: string;
}

export type BotEventSummary = PublicEventList["items"][number];
export type BotEvent = PublicEvent;

export interface BotQuickCheckoutRequest {
  ticketTypeId?: string;
  tableId?: string;
  quantity?: number;
  termsAccepted: true;
}

export interface BotPaymentStatus {
  orderId: string;
  status: string;
  title: string;
  paymentMode: EventPaymentMode;
  amountDue: number;
  currency: string;
  paymentLink?: string | null;
}
