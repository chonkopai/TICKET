import type {
  BookingOptions,
  CancellationResponse,
  CancellationTermsResponse,
  CheckoutResponse,
} from "@event-platform/shared-types";
import { Body, Controller, Get, Headers, Inject, Param, Post, UseGuards } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { JwtAuthGuard } from "../auth/auth.guards.js";
import { CancelDto, TableCheckoutDto, TicketCheckoutDto } from "./booking.dto.js";
import { BookingService } from "./booking.service.js";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(@Inject(BookingService) private readonly booking: BookingService) {}

  @Post("checkouts/tickets")
  ticketCheckout(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: TicketCheckoutDto,
  ): Promise<CheckoutResponse> {
    return this.booking.checkoutTickets(user.userId, key, body);
  }

  @Post("checkouts/tables")
  tableCheckout(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: TableCheckoutDto,
  ): Promise<CheckoutResponse> {
    return this.booking.checkoutTable(user.userId, key, body);
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
    @Body() _body: CancelDto,
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
    @Body() _body: CancelDto,
  ): Promise<CancellationResponse> {
    return this.booking.cancelBooking(user.userId, id, key);
  }
}
