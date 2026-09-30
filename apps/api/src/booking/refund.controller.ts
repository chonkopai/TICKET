import type { ManagementRefundQuote, ManagementRefundRequest } from "@event-platform/shared-types";
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { RefundService } from "./refund.service.js";

class RefundReasonDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}

@Controller("organizer/events/:eventId/orders/:orderId/refund")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizerRefundController {
  constructor(@Inject(RefundService) private readonly refunds: RefundService) {}

  @Get("quote")
  quote(@CurrentUser() user: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string): Promise<ManagementRefundQuote> {
    return this.refunds.quote(user.userId, eventId, orderId);
  }

  @Get()
  status(@CurrentUser() user: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string): Promise<ManagementRefundRequest | null> {
    return this.refunds.status(user.userId, eventId, orderId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  request(@CurrentUser() user: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string, @Body(new ExplicitDtoPipe(RefundReasonDto)) body: RefundReasonDto): Promise<ManagementRefundRequest> {
    return this.refunds.request(user.userId, eventId, orderId, body.reason);
  }
}
