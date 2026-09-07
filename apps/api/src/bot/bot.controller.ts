import type { BotIdentityResponse, BotOrganizerTodayResponse, BotTicketsResponse, PublicEvent, PublicEventList } from "@event-platform/shared-types";
import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from "@nestjs/common";

import type { BotPrincipal } from "../auth/auth.constants.js";
import { CurrentBotActor } from "../auth/auth.decorators.js";
import { BotActorGuard, BotApiGuard } from "../auth/auth.guards.js";
import { AnonymousService } from "../orders/anonymous.service.js";
import { BotService } from "./bot.service.js";

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ code: "BOT_REQUEST_INVALID" });
  return value as Record<string, unknown>;
}
function number(value: unknown, fallback: number, max: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new BadRequestException({ code: "BOT_REQUEST_INVALID" });
  return parsed;
}

@Controller("bot")
@UseGuards(BotApiGuard)
export class BotController {
  constructor(@Inject(BotService) private readonly service: BotService, @Inject(AnonymousService) private readonly anonymous: AnonymousService) {}

  @Post("identity")
  identity(@Body() body: unknown): Promise<BotIdentityResponse> {
    const input = objectBody(body);
    if (typeof input.telegramId !== "string" || typeof input.chatId !== "string") throw new BadRequestException({ code: "BOT_IDENTITY_INVALID" });
    return this.service.identity({ telegramId: input.telegramId, chatId: input.chatId });
  }

  @Get("events")
  listEvents(@Query("page") page?: string, @Query("limit") limit?: string, @Query("sort") sort?: string, @Query("search") search?: string, @Query("from") from?: string, @Query("to") to?: string): Promise<PublicEventList> {
    return this.service.listEvents({ page: number(page, 1, 10_000), limit: number(limit, 8, 20), sort: sort === "popular" ? "popular" : "recent", ...(search ? { search } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }

  @Get("events/:id")
  getEvent(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<PublicEvent> { return this.service.getEvent(id); }

  @Post("quick-session")
  quickSession(@Body() body: unknown) {
    const input = objectBody(body);
    if (typeof input.name !== "string" || typeof input.telegramId !== "string" || typeof input.chatId !== "string") throw new BadRequestException({ code: "BOT_REQUEST_INVALID" });
    return this.service.startQuickSession({ name: input.name, telegramId: input.telegramId, chatId: input.chatId });
  }

  @Post("quick-session/message")
  setQuickDeliveryMessage(@Body() body: unknown) {
    const input = objectBody(body);
    if (typeof input.sessionToken !== "string" || typeof input.telegramId !== "string" || typeof input.chatId !== "string" || typeof input.messageId !== "number") throw new BadRequestException({ code: "BOT_REQUEST_INVALID" });
    return this.service.setQuickDeliveryMessage({ sessionToken: input.sessionToken, telegramId: input.telegramId, chatId: input.chatId, messageId: input.messageId });
  }

  @Get("tickets")
  @UseGuards(BotActorGuard)
  tickets(@CurrentBotActor() actor: BotPrincipal): Promise<BotTicketsResponse> { return this.service.ticketsFor(actor); }

  @Get("tickets/:id/qr")
  @UseGuards(BotActorGuard)
  async ticketQr(@CurrentBotActor() actor: BotPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Res() response: { setHeader(name: string, value: string): void; type(value: string): void; send(value: Buffer): void }): Promise<void> {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer"); response.type("image/png"); response.send(await this.service.qrForActor(actor, id));
  }

  @Get("anonymous-tickets/:id/qr")
  async anonymousTicketQr(@Headers("x-telegram-id") telegramId: string | undefined, @Headers("x-telegram-chat-id") chatId: string | undefined, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Res() response: { setHeader(name: string, value: string): void; type(value: string): void; send(value: Buffer): void }): Promise<void> {
    if (!telegramId || !chatId || !/^\d+$/.test(telegramId) || telegramId !== chatId) throw new BadRequestException({ code: "BOT_PRIVATE_CHAT_REQUIRED" });
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer"); response.type("image/png"); response.send(await this.service.qrForAnonymous(telegramId, chatId, id));
  }

  @Get("anonymous-tickets")
  anonymousTickets(@Headers("x-telegram-id") telegramId: string | undefined, @Headers("x-telegram-chat-id") chatId: string | undefined) {
    if (!telegramId || !chatId || !/^\d+$/.test(telegramId) || telegramId !== chatId) throw new BadRequestException({ code: "BOT_PRIVATE_CHAT_REQUIRED" });
    return this.service.anonymousTickets(telegramId, chatId).then((sessions) => ({ items: sessions.flatMap((session) => (session.order?.tickets ?? []).map((ticket) => ({ id: ticket.id, eventId: ticket.ticketType.eventId, eventTitle: ticket.ticketType.event.title, ticketTypeName: ticket.ticketType.name, status: ticket.status, usedAt: ticket.usedAt?.toISOString() ?? null, anonymous: true }))) }));
  }

  @Get("organizer/today")
  @UseGuards(BotActorGuard)
  today(@CurrentBotActor() actor: BotPrincipal): Promise<BotOrganizerTodayResponse> { return this.service.today(actor); }

  @Get("organizer/events/:id/guests")
  @UseGuards(BotActorGuard)
  guests(@CurrentBotActor() actor: BotPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.guests(actor, id); }

  @Post("updates/claim")
  @HttpCode(200)
  claim(@Body() body: unknown) {
    const input = objectBody(body);
    if (typeof input.botId !== "string" || typeof input.updateId !== "string" || typeof input.payloadHash !== "string") throw new BadRequestException({ code: "BOT_UPDATE_INVALID" });
    return this.service.claimUpdate(input.botId, input.updateId, input.payloadHash);
  }

  @Post("updates/complete")
  @HttpCode(204)
  async complete(@Body() body: unknown): Promise<void> {
    const input = objectBody(body);
    if (typeof input.botId !== "string" || typeof input.updateId !== "string" || typeof input.payloadHash !== "string") throw new BadRequestException({ code: "BOT_UPDATE_INVALID" });
    await this.service.completeUpdate(input.botId, input.updateId, input.payloadHash, input.failed === true);
  }
}
