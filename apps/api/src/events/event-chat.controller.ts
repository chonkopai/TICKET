import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { SensitiveRateGuard } from "../auth/sensitive-rate.guard.js";
import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { QuickRateGuard } from "../orders/quick.guards.js";
import { EventChatService } from "./event-chat.service.js";
import { ExplicitDtoPipe } from "./explicit-dto.pipe.js";

class ChatListDto {
  @IsOptional()
  @IsUUID("4")
  before?: string;
}
class ChatSendDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsUUID("4")
  requestKey!: string;
}
function quickToken(header?: string): string {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? "");
  if (!match?.[1]) throw new BadRequestException({ code: "QUICK_ACCESS_INVALID" });
  return match[1];
}

@Controller("organizer/events/:eventId/orders/:orderId/chat")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizerEventChatController {
  constructor(@Inject(EventChatService) private readonly chat: EventChatService) {}
  @Get() @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string, @Query(new ExplicitDtoPipe(ChatListDto)) query: ChatListDto) { return this.chat.list(eventId, orderId, { kind: "organizer", userId: actor.userId }, query.before); }
  @Post() @UseGuards(SensitiveRateGuard) @Header("Cache-Control", "private, no-store")
  send(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string, @Body(new ExplicitDtoPipe(ChatSendDto)) body: ChatSendDto) { return this.chat.send(eventId, orderId, { kind: "organizer", userId: actor.userId }, body.text, body.requestKey); }
  @Post("read") @Header("Cache-Control", "private, no-store")
  read(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string) { return this.chat.markRead(eventId, orderId, { kind: "organizer", userId: actor.userId }); }
}

@Controller("me/events/:eventId/orders/:orderId/chat")
@UseGuards(JwtAuthGuard)
export class GuestEventChatController {
  constructor(@Inject(EventChatService) private readonly chat: EventChatService) {}
  @Get() @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string, @Query(new ExplicitDtoPipe(ChatListDto)) query: ChatListDto) { return this.chat.list(eventId, orderId, { kind: "guest", userId: actor.userId }, query.before); }
  @Post() @UseGuards(SensitiveRateGuard) @Header("Cache-Control", "private, no-store")
  send(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string, @Body(new ExplicitDtoPipe(ChatSendDto)) body: ChatSendDto) { return this.chat.send(eventId, orderId, { kind: "guest", userId: actor.userId }, body.text, body.requestKey); }
  @Post("read") @Header("Cache-Control", "private, no-store")
  read(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string) { return this.chat.markRead(eventId, orderId, { kind: "guest", userId: actor.userId }); }
}

@Controller("quick/events/:eventId/orders/:orderId/chat")
@UseGuards(QuickRateGuard)
export class AnonymousEventChatController {
  constructor(@Inject(EventChatService) private readonly chat: EventChatService) {}
  @Get() @Header("Cache-Control", "no-store")
  list(@Headers("authorization") auth: string, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string, @Query(new ExplicitDtoPipe(ChatListDto)) query: ChatListDto) { return this.chat.list(eventId, orderId, { kind: "guest", accessToken: quickToken(auth) }, query.before); }
  @Post() @Header("Cache-Control", "no-store")
  send(@Headers("authorization") auth: string, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string, @Body(new ExplicitDtoPipe(ChatSendDto)) body: ChatSendDto) { return this.chat.send(eventId, orderId, { kind: "guest", accessToken: quickToken(auth) }, body.text, body.requestKey); }
  @Post("read") @Header("Cache-Control", "no-store")
  read(@Headers("authorization") auth: string, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string) { return this.chat.markRead(eventId, orderId, { kind: "guest", accessToken: quickToken(auth) }); }
}
