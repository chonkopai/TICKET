import { Body, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Post, Res, UseGuards } from "@nestjs/common";
import { IsString, Matches } from "class-validator";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { JwtAuthGuard } from "../auth/auth.guards.js";
import { SensitiveRateGuard } from "../auth/sensitive-rate.guard.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { TicketEmailDeliveryService } from "./ticket-email-delivery.service.js";

class AccessTokenDto { @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string; }
type BinaryResponse = { setHeader(name: string, value: string): void; type(value: string): void; send(value: Buffer): void };

@Controller("ticket-email")
@UseGuards(SensitiveRateGuard)
export class TicketEmailAccessController {
  constructor(@Inject(TicketEmailDeliveryService) private readonly delivery: TicketEmailDeliveryService) {}

  @Post("access") @Header("Cache-Control", "no-store") @Header("Referrer-Policy", "no-referrer")
  view(@Body(new ExplicitDtoPipe(AccessTokenDto)) body: AccessTokenDto) { return this.delivery.view(body.token); }

  @Post("tickets/:id/qr") @Header("Cache-Control", "no-store") @Header("Referrer-Policy", "no-referrer")
  async qr(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body(new ExplicitDtoPipe(AccessTokenDto)) body: AccessTokenDto, @Res() response: BinaryResponse) {
    const data = await this.delivery.qr(body.token, id);
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer"); response.type("image/png"); response.send(data);
  }

  @Post("group-passes/:id/qr") @Header("Cache-Control", "no-store") @Header("Referrer-Policy", "no-referrer")
  async groupQr(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body(new ExplicitDtoPipe(AccessTokenDto)) body: AccessTokenDto, @Res() response: BinaryResponse) {
    const data = await this.delivery.groupQr(body.token, id);
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer"); response.type("image/png"); response.send(data);
  }
}

@Controller("me/orders")
@UseGuards(JwtAuthGuard, SensitiveRateGuard)
export class MyTicketEmailController {
  constructor(@Inject(TicketEmailDeliveryService) private readonly delivery: TicketEmailDeliveryService) {}
  @Get(":id/email-delivery") @Header("Cache-Control", "no-store")
  status(@CurrentUser() user: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) { return this.delivery.statusForUser(user.userId, id); }
  @Post(":id/email-delivery/resend") @Header("Cache-Control", "no-store")
  resend(@CurrentUser() user: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) { return this.delivery.resendForUser(user.userId, id); }
}
