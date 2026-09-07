import type { PaymentLinkResponse, PaymentStatusResponse } from "@event-platform/shared-types";
import { BadRequestException, Controller, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { JwtAuthGuard } from "../auth/auth.guards.js";
import { BookingService } from "../booking/booking.service.js";
import { PaymentService } from "./payment.service.js";

@Controller("orders")
@UseGuards(JwtAuthGuard)
export class OrdersPaymentController {
  constructor(private readonly payments: PaymentService, private readonly booking: BookingService) {}

  @Post(":id/pay")
  async pay(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") orderId: string, @Headers("idempotency-key") key: string | undefined): Promise<PaymentLinkResponse> {
    const result = await this.payments.createLink(user.userId, orderId, key);
    if (result.amount === 0 && result.status === "pending") {
      await this.booking.settleSucceeded(orderId);
      return { ...result, status: "paid" };
    }
    return result;
  }

  @Get(":id/payment-status")
  async status(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") orderId: string): Promise<PaymentStatusResponse> {
    await this.booking.expireDueCheckouts(100);
    return this.payments.status(user.userId, orderId);
  }
}

@Controller("payments")
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentService, private readonly booking: BookingService) {}

  @Post("webhooks/:provider")
  @HttpCode(200)
  async webhook(@Param("provider") provider: string, @Req() request: { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> }): Promise<{ accepted: true; duplicate: boolean; reviewRequired: boolean }> {
    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length > 256 * 1024) throw new BadRequestException({ code: "PAYMENT_PAYLOAD_INVALID", message: "Payment payload is invalid" });
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(request.headers)) headers[name] = Array.isArray(value) ? value[0] : value;
    const normalized = this.payments.verifyWebhook(provider, rawBody, headers);
    return this.booking.handlePaymentWebhook(normalized);
  }
}
