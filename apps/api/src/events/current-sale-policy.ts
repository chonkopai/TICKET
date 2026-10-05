import { BadRequestException, ConflictException } from "@nestjs/common";

/** Historical deposits remain payable/refundable; they cannot originate a new sale. */
export function assertCurrentSale(event: { paymentMode: string }): void {
  if (event.paymentMode === "deposit") throw new ConflictException({
    code: "LEGACY_DEPOSIT_SALES_CLOSED",
    message: "New deposit sales are closed. Existing purchases retain their original amounts and terms; the organizer must review this event before reopening sales.",
  });
}

export function rejectDepositInput(input: object): void {
  if (Object.prototype.hasOwnProperty.call(input, "deposit")) throw new BadRequestException({
    code: "DEPOSIT_INPUT_REMOVED", message: "Deposit pricing is no longer accepted.",
  });
}

export function assertCurrentResourceWrite(event: { paymentMode: string; creationVersion?: number | null }): void {
  assertCurrentSale(event);
  if (event.creationVersion === 2) throw new ConflictException({
    code: "NORMALIZED_EVENT_EDITOR_REQUIRED",
    message: "Edit this event through its revisioned creation editor.",
  });
}

/** Current hall wire formats exclude deposit keys at every depth, even zero. */
export function rejectHallDepositInput(value: unknown): void {
  if (!value || typeof value !== "object") return;
  rejectDepositInput(value);
  for (const child of Object.values(value)) rejectHallDepositInput(child);
}
