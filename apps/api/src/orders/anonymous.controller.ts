import { quickClaimSchema, quickIdSchema, quickStartSchema, quickTableSchema, quickTicketSchema, quickVerifySchema } from "@event-platform/shared-types";
import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { TicketsService } from "../tickets/tickets.service.js";
import { AnonymousService } from "./anonymous.service.js";
import { QuickBotGuard, QuickRateGuard } from "./quick.guards.js";

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: "QUICK_REQUEST_INVALID", message: "Invalid request" });
  return result.data;
}
function bearer(value?: string): string {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!match?.[1]) throw new BadRequestException({ code: "QUICK_ACCESS_INVALID" });
  return match[1];
}
function key(value?: string): string {
  if (!value || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw new BadRequestException({ code: "IDEMPOTENCY_KEY_INVALID" });
  return value;
}

@Controller("quick")
@UseGuards(QuickRateGuard)
export class AnonymousController {
  constructor(@Inject(AnonymousService) private readonly quick: AnonymousService, @Inject(TicketsService) private readonly tickets: TicketsService) {}

  @Post("sessions") @Header("Cache-Control", "no-store")
  start(@Body() body: unknown) { return this.quick.start(parse(quickStartSchema, body).name); }

  @Get("session") @Header("Cache-Control", "no-store")
  async session(@Headers("authorization") auth?: string) {
    const row = await this.quick.session(bearer(auth));
    return { verified: Boolean(row.telegramId), orderId: row.orderId };
  }

  @Get("events/:id/options") @Header("Cache-Control", "no-store")
  options(@Param("id") id: string) {
    return this.quick.options(parse(quickIdSchema, id));
  }

  @Post("verify") @UseGuards(QuickBotGuard) @Header("Cache-Control", "no-store")
  verify(@Body() body: unknown) { return this.quick.verify(parse(quickVerifySchema, body)); }

  @Post("checkouts/tickets") @Header("Cache-Control", "no-store")
  ticket(@Headers("authorization") auth: string, @Headers("idempotency-key") idempotency: string, @Body() body: unknown) {
    return this.quick.checkout(bearer(auth), key(idempotency), "ticket", parse(quickTicketSchema, body));
  }

  @Post("checkouts/tables") @Header("Cache-Control", "no-store")
  table(@Headers("authorization") auth: string, @Headers("idempotency-key") idempotency: string, @Body() body: unknown) {
    return this.quick.checkout(bearer(auth), key(idempotency), "table", parse(quickTableSchema, body));
  }

  @Get("order") @Header("Cache-Control", "no-store")
  status(@Headers("authorization") auth: string) { return this.quick.status(bearer(auth)); }

  @Post("claim-token") @Header("Cache-Control", "no-store")
  issue(@Headers("authorization") auth: string) { return this.quick.issueClaim(bearer(auth)); }

  @Post("claim") @UseGuards(JwtAuthGuard) @Header("Cache-Control", "no-store")
  claim(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown) { return this.quick.claim(user.userId, parse(quickClaimSchema, body).claimToken); }

  @Get("tickets/:id/:format") @Header("Cache-Control", "no-store")
  async asset(@Headers("authorization") auth: string, @Param("id") id: string, @Param("format") format: string, @Res() res: { type(v: string): unknown; send(v: Buffer): unknown; setHeader(k: string, v: string): unknown }) {
    parse(quickIdSchema, id);
    if (!["qr", "wallet"].includes(format)) throw new BadRequestException();
    const session = await this.quick.access(bearer(auth));
    const data = await this.tickets.assetForAnonymousOrder(session.orderId!, id, format === "wallet");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.type(format === "qr" ? "image/png" : "application/vnd.apple.pkpass");
    return res.send(data);
  }
}

@Controller("organizer/events")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("organizer", "admin")
export class OrganizerPurchasesController {
  constructor(@Inject(AnonymousService) private readonly quick: AnonymousService) {}
  @Get(":id/purchases") @Header("Cache-Control", "no-store")
  list(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Query("page") raw?: string) {
    const page = Number(raw ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new BadRequestException();
    return this.quick.purchases(user.userId, parse(quickIdSchema, id), page);
  }
}
