import type { EventLocale, PublicEventSummary } from "@event-platform/shared-types";
import { HOME_COPY } from "../app/home-copy";

export function formatCatalogPrice(event: PublicEventSummary, formatMoney: (amount: number, currency: string) => string, locale: EventLocale): string {
  const copy = HOME_COPY[locale];
  if (["sold_out", "sales_ended", "temporarily_unavailable"].includes(event.saleStatus)) {
    return copy.saleStatuses[event.saleStatus];
  }
  const unit = (value: string | null) => value === "table" ? copy.tableUnit : value === "seat" ? copy.seatUnit : copy.ticketUnit;
  if (event.startingPrices.length > 1) {
    return event.startingPrices.map((item) => `${copy.from} ${formatMoney(item.amount, item.currency)} ${unit(item.unit)}`).join(" · ");
  }
  if (event.startingAmount === null) return copy.priceUnknown;
  if (event.startingAmount === 0) return copy.free;
  return `${copy.from} ${formatMoney(event.startingAmount, event.startingCurrency ?? "KZT")} ${unit(event.startingUnit)}`;
}
