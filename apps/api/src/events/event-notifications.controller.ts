import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { SensitiveRateGuard } from "../auth/sensitive-rate.guard.js";
import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { ExplicitDtoPipe } from "./explicit-dto.pipe.js";
import { EVENT_MESSAGE_TYPES, EventNotificationsService, type EventMessageType } from "./event-notifications.service.js";

class EventNotificationPreviewDto {
  @IsIn(EVENT_MESSAGE_TYPES)
  type!: EventMessageType;
}

class EventNotificationQueueDto extends EventNotificationPreviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsUUID("4")
  requestKey!: string;
}

class TicketResendDto {
  @IsUUID("4")
  requestKey!: string;
}

@Controller("organizer/events/:eventId/notifications")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventNotificationsController {
  constructor(@Inject(EventNotificationsService) private readonly service: EventNotificationsService) {}

  @Get("preview")
  preview(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Query(new ExplicitDtoPipe(EventNotificationPreviewDto)) query: EventNotificationPreviewDto) {
    return this.service.preview(actor.userId, eventId, query.type);
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string) {
    return this.service.list(actor.userId, eventId);
  }

  @Get(":broadcastId")
  status(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("broadcastId", new ParseUUIDPipe({ version: "4" })) broadcastId: string) {
    return this.service.status(actor.userId, eventId, broadcastId);
  }

  @Post()
  @UseGuards(SensitiveRateGuard)
  queue(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Body(new ExplicitDtoPipe(EventNotificationQueueDto)) input: EventNotificationQueueDto) {
    return this.service.queue(actor.userId, eventId, input);
  }
}

@Controller("organizer/events/:eventId/orders/:orderId/tickets")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventTicketResendController {
  constructor(@Inject(EventNotificationsService) private readonly service: EventNotificationsService) {}

  @Post(":ticketId/resend")
  @UseGuards(SensitiveRateGuard)
  resend(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string, @Param("ticketId", new ParseUUIDPipe({ version: "4" })) ticketId: string, @Body(new ExplicitDtoPipe(TicketResendDto)) input: TicketResendDto) {
    return this.service.resendTicket(actor.userId, eventId, orderId, ticketId, input.requestKey);
  }
}
