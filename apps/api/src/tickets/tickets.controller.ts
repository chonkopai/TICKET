import type { GuestTicket, OrganizerTicket, UseTicketResponse } from "@event-platform/shared-types";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { UseTicketDto } from "./tickets.dto.js";
import { TicketsService } from "./tickets.service.js";

@Controller("organizer/tickets")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly tickets: TicketsService) {}

  @Get(":id")
  get(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerTicket> {
    return this.tickets.get(principal.userId, id);
  }

  @Get(":id/qr")
  async qr(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.tickets.renderQr(principal.userId, id), {
      type: "image/png",
      disposition: `inline; filename="ticket-${id}.png"`,
    });
  }

  @Get(":id/wallet")
  async wallet(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.tickets.walletPass(principal.userId, id), {
      type: "application/vnd.apple.pkpass",
      disposition: `attachment; filename="ticket-${id}.pkpass"`,
    });
  }

  @Post("use")
  @HttpCode(HttpStatus.OK)
  use(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body(new ExplicitDtoPipe(UseTicketDto)) body: UseTicketDto,
  ): Promise<UseTicketResponse> {
    return this.tickets.useByQrToken(principal.userId, body.qrToken);
  }
}

@Controller("me/tickets")
@UseGuards(JwtAuthGuard)
export class GuestTicketsController {
  constructor(@Inject(TicketsService) private readonly tickets: TicketsService) {}

  @Get(":id")
  get(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<GuestTicket> {
    return this.tickets.getForUser(principal.userId, id);
  }

  @Get(":id/qr")
  async qr(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.tickets.renderQrForUser(principal.userId, id), { type: "image/png", disposition: `inline; filename="ticket-${id}.png"` });
  }

  @Get(":id/wallet")
  async wallet(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.tickets.walletPassForUser(principal.userId, id), { type: "application/vnd.apple.pkpass", disposition: `attachment; filename="ticket-${id}.pkpass"` });
  }
}
