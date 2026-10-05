import type { EventPaymentMode, PaymentLabel } from "./events.js";
import type { VenueLayoutAny } from "./venue.js";

export interface CheckoutSnapshot {
  acceptedPolicy?:import("./event-creation-v2.js").PurchaseSnapshotV2["refund"];contentLocale?:import("./events.js").EventLocale;
  eventId: string;
  eventTitle: string;
  eventDate?: string;
  eventTime?: string;
  eventTimezone?: string;
  venueName?: string;
  address?: string;
  itemId: string;
  itemName: string;
  itemKind: "ticket" | "table" | "cart";
  quantity: number;
  paymentMode: EventPaymentMode;
  paymentLabel: PaymentLabel;
  unitFullAmount: number;
  fullAmount: number | null;
  amountDue: number;
  currency: string;
  cancellationTerms: string | null;
  depositTerms: string | null;
  seatIds?: string[];
  seatLabels?: string[];
  seatAssignments?: Array<{
    seatId: string;
    seatNumber: number;
    parentKind: "table" | "row" | "standalone";
    parentNumber: number;
    displayLabel: string;
  }>;
  groupPass?: boolean;
  items?: Array<{ kind: "ticket" | "table" | "seat"; id: string; name: string; quantity: number; amountDue: number }>;
}

export interface CheckoutResponse {
  orderId: string;
  kind: "ticket" | "table" | "cart";
  paymentMode: EventPaymentMode;
  paymentLabel: PaymentLabel;
  amountDue: number;
  fullAmount: number | null;
  currency: string;
  paymentLink: string;
  expiresAt: string;
  ticketIds: string[];
  bookingId: string | null;
  groupPassId?: string | null;
  groupPassQrPath?: string | null;
  emailDelivery?: { address: string; status: "pending_payment" | "queued" } | null;
}

export interface CheckoutEmailChoice { address: string; grant?: string | undefined }
export interface CreateTicketCheckoutRequest { ticketTypeId: string; quantity: number; termsAccepted: true; contentLocale?:import("./events.js").EventLocale|undefined;policyRevision?:number|undefined; emailDelivery?: CheckoutEmailChoice | undefined }
export interface CreateTableCheckoutRequest { tableId: string; termsAccepted: true; contentLocale?:import("./events.js").EventLocale|undefined;policyRevision?:number|undefined; emailDelivery?: CheckoutEmailChoice | undefined }
export interface CreateSeatCheckoutRequest { seatIds: string[]; termsAccepted: true; contentLocale?:import("./events.js").EventLocale|undefined;policyRevision?:number|undefined; emailDelivery?: CheckoutEmailChoice | undefined }
export interface CreateCartCheckoutRequest {
  eventId: string;
  tickets: Array<{ ticketTypeId: string; quantity: number }>;
  tableId?: string | undefined;
  seatIds: string[];
  termsAccepted: true; contentLocale?:import("./events.js").EventLocale|undefined;policyRevision?:number|undefined;
  emailDelivery?: CheckoutEmailChoice | undefined;
}

export interface BookingOptions {
  eventId: string;
  paymentMode: EventPaymentMode;
  showFullAmountForDeposit: boolean;
  depositTerms: string | null;
  cancellationTerms: string | null;
  layout: VenueLayoutAny | null;
}

export interface CancellationTermsResponse {
  acceptedPolicy?:import("./event-creation-v2.js").PurchaseSnapshotV2["refund"];
  resourceId: string;
  status: string;
  cancellationTerms: string | null;
  paymentMode: EventPaymentMode;
  amountPaid: number;
  currency: string;
}

export interface CancellationResponse {
  resourceId: string;
  cancelled: true;
  refundPending: boolean;
}

export interface PaymentLinkResponse {
  orderId: string;
  paymentLink: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded" | "expired" | "review_required";
  expiresAt: string | null;
}

export interface PaymentStatusResponse {
  orderId: string;
  status: PaymentLinkResponse["status"];
  amount: number;
  currency: string;
  paymentMode: EventPaymentMode;
  paymentLabel: PaymentLabel;
  paymentLink: string | null;
  providerPaymentId: string | null;
  expiresAt: string | null;
  reviewRequired: boolean;
}

export interface CancelRequest { confirmed: true }
