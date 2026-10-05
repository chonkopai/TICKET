import type { EventPaymentMode, PublicPaymentOption } from "@event-platform/shared-types";

/** Read-only compatibility for historical catalog/receipts. Never used to price a new checkout. */
export function historicalPaymentOption(
  event: { paymentMode: EventPaymentMode; showFullAmountForDeposit: boolean; depositTerms: string | null; cancellationTerms: string | null },
  price: number,
  deposit: number,
  currency: string,
): PublicPaymentOption {
  const historicalDeposit = event.paymentMode === "deposit";
  return {
    mode: event.paymentMode,
    label: event.paymentMode,
    amountDue: historicalDeposit ? deposit : price,
    fullAmount: !historicalDeposit || event.showFullAmountForDeposit ? price : null,
    currency,
    depositTerms: event.depositTerms,
    cancellationTerms: event.cancellationTerms,
  };
}
