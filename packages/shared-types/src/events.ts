export type EventStatus = "draft" | "published" | "cancelled" | "completed";
export type EventPaymentMode = "deposit" | "full_payment";
export type PaymentLabel = "deposit" | "full_payment";
export type PublicSaleStatus =
  | "available"
  | "few_left"
  | "sold_out"
  | "sales_not_started"
  | "sales_ended";
export const EVENT_CATEGORIES = [
  "music",
  "nightlife",
  "festival",
  "comedy",
  "theatre",
  "business",
  "education",
  "workshop",
  "sport",
  "family",
  "food",
  "other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface OrganizerEvent {
  id: string;
  organizerId: string;
  title: string;
  category: EventCategory;
  city: string;
  posterUrl: string | null;
  announcement: string | null;
  description: string | null;
  program: string | null;
  rules: string | null;
  visitTerms: string | null;
  cancellationTerms: string | null;
  paymentMode: EventPaymentMode;
  showFullAmountForDeposit: boolean;
  depositTerms: string | null;
  extraConditions: string | null;
  date: string;
  time: string;
  timezone: string;
  venueName: string;
  address: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventRequest {
  title: string;
  category: EventCategory;
  city: string;
  date: string;
  time: string;
  timezone?: string;
  venueName: string;
  address: string;
  announcement?: string | null;
  description?: string | null;
  program?: string | null;
  rules?: string | null;
  visitTerms?: string | null;
  cancellationTerms?: string | null;
  paymentMode?: EventPaymentMode;
  showFullAmountForDeposit?: boolean;
  depositTerms?: string | null;
  extraConditions?: string | null;
}

export type UpdateEventRequest = Partial<CreateEventRequest>;

export interface OrganizerEventList {
  items: OrganizerEvent[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export interface DeleteEventResponse {
  deleted: true;
  id: string;
}

export interface PublicTicketType {
  id: string;
  name: string;
  price: number | null;
  deposit: number;
  currency: string;
  description: string | null;
  restrictions: string | null;
  salesStartAt: string | null;
  salesEndAt: string | null;
  remaining: number;
  status: "active" | "sold_out";
  payment: PublicPaymentOption;
}

export interface PublicTable {
  id: string;
  number: number;
  name: string | null;
  seats: number;
  price: number | null;
  deposit: number;
  currency: string;
  description: string | null;
  availability: "available" | "unavailable" | "booked";
  payment: PublicPaymentOption;
}

export interface PublicPaymentOption {
  mode: EventPaymentMode;
  label: PaymentLabel;
  amountDue: number;
  fullAmount: number | null;
  currency: string;
  depositTerms: string | null;
  cancellationTerms: string | null;
}

export interface PublicEvent {
  id: string;
  title: string;
  category: EventCategory;
  city: string;
  posterUrl: string | null;
  announcement: string | null;
  description: string | null;
  program: string | null;
  rules: string | null;
  visitTerms: string | null;
  cancellationTerms: string | null;
  paymentMode: EventPaymentMode;
  showFullAmountForDeposit: boolean;
  depositTerms: string | null;
  extraConditions: string | null;
  date: string;
  time: string;
  timezone: string;
  startsAt: string;
  venueName: string;
  address: string;
  ticketTypes: PublicTicketType[];
  tables: PublicTable[];
  organizer: { name: string | null; photoUrl: string | null; contact: string | null };
}

export interface PublicEventSummary {
  id: string;
  title: string;
  category: EventCategory;
  city: string;
  posterUrl: string | null;
  announcement: string | null;
  date: string;
  time: string;
  timezone: string;
  startsAt: string;
  venueName: string;
  address: string;
  paymentMode: EventPaymentMode;
  paymentLabel: PaymentLabel;
  startingAmount: number | null;
  startingFullAmount: number | null;
  startingCurrency: string | null;
  remainingTickets: number;
  remainingTables: number;
  saleStatus: PublicSaleStatus;
  organizer: { name: string | null; photoUrl: string | null };
}

export interface OrganizerEventPreview extends PublicEvent {
  status: EventStatus;
}

export interface PublicEventList {
  items: PublicEventSummary[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}
