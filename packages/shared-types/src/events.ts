export type EventStatus = "draft" | "published" | "cancelled" | "completed";
export const EVENT_LOCALES = ["ru", "kk", "en"] as const;
export type EventLocale = (typeof EVENT_LOCALES)[number];
export interface EventLocalizedContent {
  title: string;
  address: string;
  description: string | null;
  program: string | null;
  rules: string | null;
  visitTerms: string | null;
  cancellationTerms: string | null;
  depositTerms: string | null;
  extraConditions: string | null;
}
export interface EventTranslation extends EventLocalizedContent {
  locale: EventLocale;
  status: "source" | "manual" | "machine" | "stale";
  translatedFrom: EventLocale | null;
  updatedAt: string;
}
export type EventPaymentMode = "deposit" | "full_payment";
export type PaymentLabel = "deposit" | "full_payment";
export type PublicSaleStatus =
  | "available"
  | "few_left"
  | "sold_out"
  | "temporarily_unavailable"
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
export const EVENT_AGE_RESTRICTIONS = [0, 6, 12, 16, 18, 21] as const;
export type EventAgeRestriction = (typeof EVENT_AGE_RESTRICTIONS)[number];

export interface OrganizerEvent {
  creationVersion?:number|null;
  currency?: string | null | undefined;
  id: string;
  organizerId: string;
  sourceLocale?: EventLocale | undefined;
  title: string;
  category: EventCategory;
  countryCode: string;
  city: string;
  posterUrl: string | null;
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
  ageRestriction: EventAgeRestriction;
  address: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

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
  venueObjectId: string | null;
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
  typeLabel: string | null;
  shortDescription: string | null;
  saleMode: "whole_table" | "per_seat";
  seatsDetail: Array<{ id: string; number: number; label: string; sortOrder: number; status: "available" | "unavailable" }>;
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

export interface PublicEventMedia {id:string;slot:number;kind:"image"|"video";width:number;height:number;url:string;posterUrl:string|null;isCard:boolean;isBackground:boolean;galleryVisible:boolean;caption:string|null;crops:import("./event-creation-v2.js").EventCreationDraftV2["media"]["crops"]}

export interface PublicEvent {
  creationVersion?:2; saleMode?:import("./event-creation-v2.js").EventSaleMode;currency?:string;endsAt?:string|null;refundsAvailable?:boolean;refundPolicyRevision?:number;media?:PublicEventMedia[];
  id: string;
  contentLocale?: EventLocale;
  sourceLocale?: EventLocale;
  title: string;
  category: EventCategory;
  countryCode: string;
  city: string;
  posterUrl: string | null;
  galleryUrls?: string[];
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
  ageRestriction: EventAgeRestriction;
  startsAt: string;
  address: string;
  ticketTypes: PublicTicketType[];
  tables: PublicTable[];
  organizer: { name: string | null; personName: string | null; photoUrl: string | null; contact: string | null };
}

export interface PublicEventSummary {
  creationVersion?:2;saleMode?:import("./event-creation-v2.js").EventSaleMode;currency?:string;endsAt?:string|null;media?:PublicEventMedia[];
  id: string;
  contentLocale?: EventLocale;
  sourceLocale?: EventLocale;
  title: string;
  category: EventCategory;
  countryCode: string;
  city: string;
  posterUrl: string | null;
  date: string;
  time: string;
  timezone: string;
  ageRestriction: EventAgeRestriction;
  startsAt: string;
  address: string;
  paymentMode: EventPaymentMode;
  paymentLabel: PaymentLabel;
  startingAmount: number | null;
  startingFullAmount: number | null;
  startingCurrency: string | null;
  /** What one starting amount buys; a whole table is never a per-seat price. */
  startingUnit: "ticket" | "seat" | "table" | null;
  /** One minimum due-now option per currency; never compare unlike currencies. */
  startingPrices: Array<{ amount: number; fullAmount: number | null; currency: string; unit: "ticket" | "seat" | "table" }>;
  remainingTickets: number;
  remainingTables: number;
  remainingSeats: number;
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
