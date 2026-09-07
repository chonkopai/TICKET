import type { EventPaymentMode, PaymentLabel } from "./events.js";
import type { VenueLayoutJson } from "./venue.js";

export interface CheckoutSnapshot {
  eventId: string;
  eventTitle: string;
  itemId: string;
  itemName: string;
  itemKind: "ticket" | "table";
  quantity: number;
  paymentMode: EventPaymentMode;
  paymentLabel: PaymentLabel;
  unitFullAmount: number;
  fullAmount: number | null;
  amountDue: number;
  currency: string;
  cancellationTerms: string | null;
  depositTerms: string | null;
}

export interface CheckoutResponse {
  orderId: string;
  kind: "ticket" | "table";
  paymentMode: EventPaymentMode;
  paymentLabel: PaymentLabel;
  amountDue: number;
  fullAmount: number | null;
  currency: string;
  paymentLink: string;
  expiresAt: string;
  ticketIds: string[];
  bookingId: string | null;
}

export interface CreateTicketCheckoutRequest { ticketTypeId: string; quantity: number; termsAccepted: true }
export interface CreateTableCheckoutRequest { tableId: string; termsAccepted: true }

export interface BookingOptions {
  eventId: string;
  paymentMode: EventPaymentMode;
  showFullAmountForDeposit: boolean;
  depositTerms: string | null;
  cancellationTerms: string | null;
  layout: VenueLayoutJson | null;
}

export interface CancellationTermsResponse {
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
