import { randomUUID } from "node:crypto";

import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { CancelDto, TableCheckoutDto, TicketCheckoutDto } from "./booking.dto.js";

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

describe("booking request validation", () => {
  it("rejects browser-supplied money and payment-policy fields", async () => {
    await expect(pipe.transform({
      ticketTypeId: randomUUID(),
      quantity: 1,
      termsAccepted: true,
      amount: 1,
      currency: "USD",
      paymentMode: "full_payment",
    }, { type: "body", metatype: TicketCheckoutDto })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires explicit terms and cancellation confirmation", async () => {
    await expect(pipe.transform({ tableId: randomUUID(), termsAccepted: false }, { type: "body", metatype: TableCheckoutDto })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ confirmed: false }, { type: "body", metatype: CancelDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});
