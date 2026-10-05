import type {
  BookingOptions,
  CancellationResponse,
  CancellationTermsResponse,
  CheckoutResponse,
  ManagementHoldPreview,
  ManagementHoldRelease,
} from "@event-platform/shared-types";
import { Body, Controller, Get, Header, Headers, Inject, Param, ParseUUIDPipe, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { SensitiveRateGuard } from "../auth/sensitive-rate.guard.js";
import { VerificationService } from "../auth/verification.service.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { CancelDto, CartCheckoutDto, CheckoutEmailRequestDto, CheckoutEmailVerifyDto, SeatCheckoutDto, TableCheckoutDto, TicketCheckoutDto } from "./booking.dto.js";
import { BookingService } from "./booking.service.js";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(@Inject(BookingService) private readonly booking: BookingService, @Inject(VerificationService) private readonly verification: VerificationService) {}

  @Post("checkouts/email/request-code") @UseGuards(SensitiveRateGuard) @Header("Cache-Control", "no-store")
  requestEmail(@CurrentUser() user: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(CheckoutEmailRequestDto)) body: CheckoutEmailRequestDto, @Req() req: { ip?: string; socket?: { remoteAddress?: string } }) {
    if (!user.sessionFamilyId) throw new UnauthorizedException({ code: "SESSION_REQUIRED" });
    return this.verification.issue({ purpose: "checkout_email", method: "email", target: body.address, userId: user.userId, sessionFamilyId: user.sessionFamilyId, clientKey: req.socket?.remoteAddress ?? req.ip ?? "unknown" });
  }

  @Post("checkouts/email/verify-code") @UseGuards(SensitiveRateGuard) @Header("Cache-Control", "no-store")
  verifyEmail(@CurrentUser() user: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(CheckoutEmailVerifyDto)) body: CheckoutEmailVerifyDto, @Req() req: { ip?: string; socket?: { remoteAddress?: string } }) {
    if (!user.sessionFamilyId) throw new UnauthorizedException({ code: "SESSION_REQUIRED" });
    return this.verification.verify({ purpose: "checkout_email", method: "email", target: body.address, challengeId: body.challengeId, code: body.code, userId: user.userId, sessionFamilyId: user.sessionFamilyId, clientKey: req.socket?.remoteAddress ?? req.ip ?? "unknown" });
  }

  @Post("checkouts/cart")
  @UseGuards(SensitiveRateGuard)
  cartCheckout(@CurrentUser() user: AuthenticatedPrincipal, @Headers("idempotency-key") key: string | undefined, @Body(new ExplicitDtoPipe(CartCheckoutDto)) body: CartCheckoutDto): Promise<CheckoutResponse> {
    return this.booking.checkoutCart(user.userId, key, body, undefined, user.sessionFamilyId);
  }

  @Post("checkouts/tickets")
  @UseGuards(SensitiveRateGuard)
  ticketCheckout(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ExplicitDtoPipe(TicketCheckoutDto)) body: TicketCheckoutDto,
  ): Promise<CheckoutResponse> {
    return this.booking.checkoutTickets(user.userId, key, body, undefined, user.sessionFamilyId);
  }

  @Post("checkouts/tables")
  @UseGuards(SensitiveRateGuard)
  tableCheckout(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ExplicitDtoPipe(TableCheckoutDto)) body: TableCheckoutDto,
  ): Promise<CheckoutResponse> {
    return this.booking.checkoutTable(user.userId, key, body, undefined, user.sessionFamilyId);
  }

  @Post("checkouts/seats")
  @UseGuards(SensitiveRateGuard)
  seatCheckout(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ExplicitDtoPipe(SeatCheckoutDto)) body: SeatCheckoutDto,
  ): Promise<CheckoutResponse> {
    return this.booking.checkoutSeats(user.userId, key, body, undefined, user.sessionFamilyId);
  }

  @Get("events/:eventId/booking-options")
  options(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("eventId") eventId: string,
  ): Promise<BookingOptions> {
    return this.booking.options(user.userId, eventId);
  }

  @Get("tickets/:id/cancellation")
  ticketTerms(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): Promise<CancellationTermsResponse> {
    return this.booking.ticketCancellationTerms(user.userId, id);
  }

  @Post("tickets/:id/cancel")
  cancelTicket(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ExplicitDtoPipe(CancelDto)) _body: CancelDto,
  ): Promise<CancellationResponse> {
    return this.booking.cancelTicket(user.userId, id, key);
  }

  @Get("bookings/:id/cancellation")
  bookingTerms(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): Promise<CancellationTermsResponse> {
    return this.booking.bookingCancellationTerms(user.userId, id);
  }

  @Post("bookings/:id/cancel")
  cancelBooking(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ExplicitDtoPipe(CancelDto)) _body: CancelDto,
  ): Promise<CancellationResponse> {
    return this.booking.cancelBooking(user.userId, id, key);
  }
}

@Controller("organizer/events/:eventId/orders")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizerHoldController {
  constructor(@Inject(BookingService) private readonly booking: BookingService) {}

  @Get(":orderId/hold")
  preview(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string,
  ): Promise<ManagementHoldPreview> { return this.booking.organizerHoldPreview(user.userId, eventId, orderId); }

  @Post(":orderId/hold/release")
  release(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string,
  ): Promise<ManagementHoldRelease> { return this.booking.organizerReleaseHold(user.userId, eventId, orderId); }
}
