import { EVENT_LOCALES, type EventLocale, type EventScanPreview, type GuestTicket, type OrganizerTicket, type UseGroupPassResponse, type UseTicketResponse } from "@event-platform/shared-types";
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
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { SensitiveRateGuard } from "../auth/sensitive-rate.guard.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { InspectEventScanDto, UseGroupPassDto, UseTicketDto } from "./tickets.dto.js";
import { TicketsService } from "./tickets.service.js";

@Controller("organizer/tickets")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly tickets: TicketsService) {}

  @Post("events/:eventId/inspect")
  @UseGuards(SensitiveRateGuard)
  @HttpCode(HttpStatus.OK)
  inspectEventScan(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ExplicitDtoPipe(InspectEventScanDto)) body: InspectEventScanDto,
  ): Promise<EventScanPreview> {
    return this.tickets.inspectEventScan(principal.userId, eventId, body.token);
  }

  @Post("events/:eventId/use")
  @UseGuards(SensitiveRateGuard)
  @HttpCode(HttpStatus.OK)
  useForEvent(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ExplicitDtoPipe(UseTicketDto)) body: UseTicketDto,
  ): Promise<UseTicketResponse> {
    return this.tickets.useByQrToken(principal.userId, body.qrToken, eventId);
  }

  @Post("events/:eventId/group-pass/use")
  @UseGuards(SensitiveRateGuard)
  @HttpCode(HttpStatus.OK)
  useGroupPassForEvent(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ExplicitDtoPipe(UseGroupPassDto)) body: UseGroupPassDto,
  ): Promise<UseGroupPassResponse> {
    return this.tickets.useGroupPass(principal.userId, body.token, body.confirm, eventId);
  }

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
  @UseGuards(SensitiveRateGuard)
  @HttpCode(HttpStatus.OK)
  use(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body(new ExplicitDtoPipe(UseTicketDto)) body: UseTicketDto,
  ): Promise<UseTicketResponse> {
    return this.tickets.useByQrToken(principal.userId, body.qrToken);
  }

  @Post("group-pass/use")
  @UseGuards(SensitiveRateGuard)
  @HttpCode(HttpStatus.OK)
  useGroupPass(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body(new ExplicitDtoPipe(UseGroupPassDto)) body: UseGroupPassDto,
  ) {
    return this.tickets.useGroupPass(principal.userId, body.token, body.confirm);
  }
}

@Controller("me/tickets")
@UseGuards(JwtAuthGuard)
export class GuestTicketsController {
  constructor(@Inject(TicketsService) private readonly tickets: TicketsService) {}

  @Get(":id")
  get(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Query("locale") requestedLocale?: string): Promise<GuestTicket> {
    const locale: EventLocale = EVENT_LOCALES.some((value) => value === requestedLocale) ? requestedLocale as EventLocale : "ru";
    return this.tickets.getForUser(principal.userId, id, locale);
  }

  @Get(":id/qr")
  async qr(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.tickets.renderQrForUser(principal.userId, id), { type: "image/png", disposition: `inline; filename="ticket-${id}.png"` });
  }

  @Get(":id/wallet")
  async wallet(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.tickets.walletPassForUser(principal.userId, id), { type: "application/vnd.apple.pkpass", disposition: `attachment; filename="ticket-${id}.pkpass"` });
  }

  @Get("group-passes/:id/qr")
  async groupPassQr(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.tickets.renderGroupPassQrForUser(principal.userId, id), { type: "image/png", disposition: `inline; filename="group-pass-${id}.png"` });
  }
}
