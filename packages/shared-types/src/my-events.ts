import type { GuestTicket } from "./tickets.js";

export type GuestParticipationStatus = "registered" | "attended" | "no_show" | "cancelled";

export interface GuestBooking {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  table: { id: string; number: number; name: string | null; seats: number; price: number; deposit: number; currency: string };
  order: { amount: number; currency: string; paymentStatus: string };
  deposit: { amount: number; currency: string; status: string; terms: string } | null;
}

export interface GuestEvent {
  id: string;
  title: string;
  posterUrl: string | null;
  announcement: string | null;
  description: string | null;
  program: string | null;
  rules: string | null;
  visitTerms: string | null;
  cancellationTerms: string | null;
  paymentMode: "deposit" | "full_payment";
  showFullAmountForDeposit: boolean;
  depositTerms: string | null;
  extraConditions: string | null;
  date: string;
  time: string;
  timezone: string;
  startsAt: string;
  venueName: string;
  address: string;
  eventStatus: "draft" | "published" | "cancelled" | "completed";
  participationStatus: GuestParticipationStatus;
  tickets: Array<GuestTicket & { participationStatus: GuestParticipationStatus }>;
  bookings: GuestBooking[];
}

export interface GuestEventList {
  items: GuestEvent[];
  status: "upcoming" | "past";
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export interface GuestEventQuery {
  status: "upcoming" | "past";
  page: number;
  limit: number;
}
