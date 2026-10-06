import type { EventPaymentMode, EventStatus } from "./events.js";

export const MANAGEMENT_ORDER_PAGE_SIZE = 20;
export const MANAGEMENT_ORDER_PAGE_MAX = 100;
export const MANAGEMENT_ANALYTICS_MAX_DAYS = 366;
export const MANAGEMENT_ANALYTICS_MAX_HOURLY_DAYS = 31;

export const MANAGEMENT_ANALYTICS_BUCKETS = ["day", "hour"] as const;
export type ManagementAnalyticsBucket = (typeof MANAGEMENT_ANALYTICS_BUCKETS)[number];

export const MANAGEMENT_PAYMENT_FILTERS = ["all", "pending", "paid", "failed", "cancelled", "refunded"] as const;
export type ManagementPaymentFilter = (typeof MANAGEMENT_PAYMENT_FILTERS)[number];

export const MANAGEMENT_BOOKING_FILTERS = ["all", "none", "pending", "confirmed", "cancelled", "expired"] as const;
export type ManagementBookingFilter = (typeof MANAGEMENT_BOOKING_FILTERS)[number];

export const MANAGEMENT_ATTENDANCE_FILTERS = ["all", "none", "partial", "all_checked_in", "group_pass_used", "unknown"] as const;
export type ManagementAttendanceFilter = (typeof MANAGEMENT_ATTENDANCE_FILTERS)[number];

export interface ManagementEventMetadata {
  id: string;
  title: string;
  status: EventStatus;
  paymentMode: EventPaymentMode;
  timezone: string;
  date: string;
  time: string;
  address: string;
  salesModes: Array<"ordinary" | "per_seat" | "whole_table">;
}

export interface ManagementCurrencyMoney {
  currency: string;
  amount: number;
}

export interface ManagementInventorySummary {
  configuredAdmissionCapacity: number;
  buyableAdmissions: number;
  heldAdmissions: number;
  soldAdmissions: number;
  issuedTickets: { total: number; pendingPayment: number; active: number; used: number; cancelled: number; refunded: number };
  wholeTables: { configured: number; held: number; sold: number; buyable: number };
  seats: { configured: number; held: number; sold: number; buyable: number; disabled: number };
  ticketTypes: Array<{ id: string; name: string; price: number; currency: string; configured: number; held: number; sold: number; buyable: number }>;
  saleGroups: Array<{ id: string; kind: "table" | "zone" | "row" | "ticket_type"; name: string; unit: "tables" | "seats" | "tickets"; price: number | null; currency: string; configured: number; held: number; sold: number; buyable: number; ticketTypeIds: string[] }>;
}

export interface ManagementAttendanceSummary {
  checkedInTickets: number;
  checkedInGroupPasses: number;
  individualAttendanceKnown: boolean;
}

export interface ManagementMoneySummary {
  grossReceived: ManagementCurrencyMoney[] | null;
  completedRefunds: ManagementCurrencyMoney[] | null;
  netReceived: ManagementCurrencyMoney[] | null;
  depositsReceived: ManagementCurrencyMoney[] | null;
  completeness: { settlementTime: "complete" | "partial" | "unavailable"; completedRefundMoney: "complete" | "partial" | "unavailable" };
}

export interface ManagementEventSummary {
  event: ManagementEventMetadata;
  asOf: string;
  inventory: ManagementInventorySummary;
  money: ManagementMoneySummary;
  attendance: ManagementAttendanceSummary;
  buyers: { registered: number; anonymousOrders: number; unknown: boolean };
  cancellations: { tickets: number; bookings: number; refundRequests: number };
}

export interface ManagementAnalyticsQuery {
  from: string;
  to: string;
  bucket: ManagementAnalyticsBucket;
}

export interface ManagementAnalyticsBucketValue {
  startsAt: string;
  label: string;
  money: Array<{ currency: string; grossReceived: number | null; completedRefunds: number | null; netReceived: number | null; depositsReceived: number | null }>;
  soldAdmissions: number | null;
  issuedTickets: number | null;
  salesByType: Array<{ ticketTypeId: string; name: string; currency: string; soldAdmissions: number; grossReceived: number | null }>;
}

export interface ManagementAnalyticsResponse {
  eventId: string;
  timezone: string;
  from: string;
  to: string;
  bucket: ManagementAnalyticsBucket;
  asOf: string;
  totals: ManagementMoneySummary;
  buckets: ManagementAnalyticsBucketValue[];
  unavailable: Array<"settlement_time" | "completed_refund_money" | "per_type_revenue">;
}

export interface ManagementOrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  payment?: ManagementPaymentFilter;
  booking?: ManagementBookingFilter;
  attendance?: ManagementAttendanceFilter;
  tableId?: string;
  sectorId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface ManagementOrderRow {
  id: string;
  createdAt: string;
  type: "ticket" | "table" | "deposit";
  buyer: { kind: "registered" | "anonymous" | "unknown"; name: string | null; contact: string | null };
  payment: { status: ManagementPaymentFilter; amount: number; currency: string; depositAmount: number | null; depositStatus: ManagementPaymentFilter | null };
  resources: { ticketCount: number; allocatedSeatCount: number; wholeTableCount: number; labels: string[] };
  attendance: { state: Exclude<ManagementAttendanceFilter, "all">; checkedInTickets: number; totalTickets: number; groupPassStatus: "active" | "used" | "cancelled" | null };
  booking: { status: Exclude<ManagementBookingFilter, "all" | "none"> | null; tableId: string | null; tableLabel: string | null; sectorId: string | null; sectorLabel: string | null };
}

export interface ManagementOrderList {
  asOf: string;
  items: ManagementOrderRow[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  statusCounts: Record<ManagementPaymentFilter, number>;
}

export interface ManagementOrderFilterOptions {
  tables: Array<{ id: string; label: string }>;
}

export interface ManagementHoldPreview {
  orderId: string;
  eligible: boolean;
  reason: "active" | "expired" | "released" | "not_pending" | "payment_received" | "no_active_hold";
  expiresAt: string | null;
  resourceLabels: string[];
}

export interface ManagementHoldRelease {
  orderId: string;
  released: true;
  alreadyReleased: boolean;
}

export interface ManagementRefundQuote {
  orderId: string;
  eligible: boolean;
  reason: "available" | "unsupported_provider" | "not_paid" | "already_requested" | "already_refunded" | "used_ticket" | "payment_mismatch";
  amount: number;
  currency: string;
  depositAmount: number | null;
  provider: string | null;
  testOnly: boolean;
  resourceLabels: string[];
}

export interface ManagementRefundRequest {
  id: string;
  orderId: string;
  status: "requested" | "processing" | "succeeded" | "failed";
  amount: number;
  currency: string;
  provider: string;
  testOnly: boolean;
  lastError: string | null;
  completedAt: string | null;
}

export interface ManagementOrderDetail extends ManagementOrderRow {
  acceptedPolicy?:import("./event-creation-v2.js").PurchaseSnapshotV2["refund"]|null;
  eventId: string;
  payments: Array<{ status: ManagementPaymentFilter; amount: number; currency: string; settledAt: string | null }>;
  tickets: Array<{ id: string; typeName: string; seatLabel: string | null; status: string; paidAt: string | null; usedAt: string | null; cancelledAt: string | null; refundedAt: string | null }>;
  history: Array<{ occurredAt: string; kind: string; description: string }>;
}

export const EVENT_NOTIFICATION_TYPES = ["program", "time", "venue", "rules", "conditions", "cancellation", "important"] as const;
export type EventNotificationType = typeof EVENT_NOTIFICATION_TYPES[number];

export interface EventNotificationPreview {
  eventId: string;
  eventTitle: string;
  type: EventNotificationType;
  audienceCount: number;
  reachableCount: number;
  unreachableCount: number;
  channel: "telegram";
}

export interface EventNotificationStatus {
  id: string;
  requestKey: string | null;
  type: EventNotificationType | "ticket.resend";
  message: string;
  status: "draft" | "queued" | "sending" | "sent" | "failed";
  audienceCount: number;
  reachableCount: number;
  counts: { queued: number; processing: number; accepted: number; failed: number; uncertain: number };
  failureReasons: Array<{ code: string; count: number }>;
  createdAt: string;
  sentAt: string | null;
}

export interface MarketingCampaignPreview {
  eventId: string;
  eventTitle: string;
  eligibleCount: number;
  channel: "telegram";
  description: string;
}

export interface MarketingCampaignStatus extends Omit<EventNotificationStatus, "type"> {
  type: "marketing.campaign";
  imageUrl: string | null;
}

export interface EventChatMessage {
  id: string;
  sender: "guest" | "organizer";
  text: string;
  createdAt: string;
  readAt: string | null;
}

export interface EventChatPage {
  items: EventChatMessage[];
  nextCursor: string | null;
}
