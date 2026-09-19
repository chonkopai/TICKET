import type { EventStatus, OrganizerEvent } from "./events.js";

export interface AccountDashboard {
  activeAdmissions: number;
  attendedEvents: number;
}

export interface NotificationPreferences {
  transactionalTicketDelivery: boolean;
  eventReminders: boolean;
  marketingAnnouncements: boolean;
}

export interface OrganizerProfile {
  organizationName: string;
}

export type AccountOrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export interface AccountOrder {
  id: string;
  type: "ticket" | "table" | "deposit";
  status: AccountOrderStatus;
  amount: number;
  currency: string;
  createdAt: string;
  eventId: string | null;
  eventTitle: string;
  itemSummary: string;
  receiptUrl: null;
}

export interface AccountOrderList {
  items: AccountOrder[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export type OrganizerEventStatusGroup = "all" | "on_sale" | "draft" | "archive";
export type OrganizerEventSort = "updated_desc" | "date_asc" | "date_desc";
export type OrganizerAdmissionMode = "ordinary" | "per_seat" | "whole_table";

export interface OrganizerEventMetrics {
  mode: OrganizerAdmissionMode;
  sold: number;
  capacity: number;
  remaining: number;
  settledRevenue: number;
  currency: string | null;
  includedSeats: number | null;
}

export interface OrganizerWorkspaceEvent extends OrganizerEvent {
  displayId: string;
  metrics: OrganizerEventMetrics;
}

export interface OrganizerWorkspaceEventList {
  items: OrganizerWorkspaceEvent[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export interface OrganizerDashboard {
  totalEvents: number;
  publishedEvents: number;
  draftEvents: number;
  completedEvents: number;
  cancelledEvents: number;
  settledRevenue: number;
  currency: string | null;
  soldAdmissions: number;
  totalAdmissions: number;
}

export const ORGANIZER_STATUS_GROUPS: OrganizerEventStatusGroup[] = [
  "all",
  "on_sale",
  "draft",
  "archive",
];

export const ORGANIZER_EVENT_SORTS: OrganizerEventSort[] = [
  "updated_desc",
  "date_asc",
  "date_desc",
];

export function statusesForOrganizerGroup(group: OrganizerEventStatusGroup): EventStatus[] | null {
  if (group === "on_sale") return ["published"];
  if (group === "draft") return ["draft"];
  if (group === "archive") return ["completed", "cancelled"];
  return null;
}
