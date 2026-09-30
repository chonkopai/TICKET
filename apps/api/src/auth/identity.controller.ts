import type { AuthResponse, LinkedMethodsResponse, VerificationGrantResponse, VerificationRequestResponse } from "@event-platform/shared-types";
import { Body, Controller, Get, Header, Inject, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";

import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { CurrentUser } from "./auth.decorators.js";
import type { AuthenticatedPrincipal } from "./auth.constants.js";
import { JwtAuthGuard } from "./auth.guards.js";
import { IdentityAuthService } from "./identity-auth.service.js";
import { ChangePasswordDto, CompleteLinkDto, CompletePasswordResetDto, CompleteRegistrationDto, ContactDto, PasswordLoginDto, TelegramLinkTokenDto, VerifyContactDto } from "./identity.dto.js";
import { SensitiveRateGuard } from "./sensitive-rate.guard.js";
import { TelegramLinkService } from "./telegram-link.service.js";

type NetworkRequest = { ip?: string; socket?: { remoteAddress?: string } };
function clientKey(request: NetworkRequest): string { return request.socket?.remoteAddress ?? request.ip ?? "unknown"; }

@Controller("auth")
@UseGuards(SensitiveRateGuard)
export class IdentityAuthController {
  constructor(@Inject(IdentityAuthService) private readonly identity: IdentityAuthService) {}

  @Post("register/request-code")
  @Header("Cache-Control", "no-store")
  registerRequest(@Body(new ExplicitDtoPipe(ContactDto)) body: ContactDto, @Req() req: NetworkRequest): Promise<VerificationRequestResponse> {
    return this.identity.registerRequest({ ...body, clientKey: clientKey(req) });
  }

  @Post("register/verify-code")
  @Header("Cache-Control", "no-store")
  registerVerify(@Body(new ExplicitDtoPipe(VerifyContactDto)) body: VerifyContactDto, @Req() req: NetworkRequest): Promise<VerificationGrantResponse> {
    return this.identity.registerVerify({ ...body, clientKey: clientKey(req) });
  }

  @Post("register/complete")
  @Header("Cache-Control", "no-store")
  registerComplete(@Body(new ExplicitDtoPipe(CompleteRegistrationDto)) body: CompleteRegistrationDto): Promise<AuthResponse> {
    return this.identity.registerComplete(body);
  }

  @Post("password/login")
  @Header("Cache-Control", "no-store")
  passwordLogin(@Body(new ExplicitDtoPipe(PasswordLoginDto)) body: PasswordLoginDto, @Req() req: NetworkRequest): Promise<AuthResponse> {
    return this.identity.login({ ...body, clientKey: clientKey(req) });
  }

  @Post("password/reset/request-code")
  @Header("Cache-Control", "no-store")
  passwordResetRequest(@Body(new ExplicitDtoPipe(ContactDto)) body: ContactDto, @Req() req: NetworkRequest): Promise<VerificationRequestResponse> {
    return this.identity.requestPasswordReset({ ...body, clientKey: clientKey(req) });
  }

  @Post("password/reset/verify-code")
  @Header("Cache-Control", "no-store")
  passwordResetVerify(@Body(new ExplicitDtoPipe(VerifyContactDto)) body: VerifyContactDto, @Req() req: NetworkRequest): Promise<VerificationGrantResponse> {
    return this.identity.verifyPasswordReset({ ...body, clientKey: clientKey(req) });
  }

  @Post("password/reset/complete")
  @Header("Cache-Control", "no-store")
  passwordResetComplete(@Body(new ExplicitDtoPipe(CompletePasswordResetDto)) body: CompletePasswordResetDto): Promise<{ reset: true }> {
    return this.identity.completePasswordReset(body);
  }
}

@Controller("me")
@UseGuards(JwtAuthGuard, SensitiveRateGuard)
export class IdentityMethodsController {
  constructor(@Inject(IdentityAuthService) private readonly identity: IdentityAuthService, @Inject(TelegramLinkService) private readonly telegramLinks: TelegramLinkService) {}

  @Get("identities")
  methods(@CurrentUser() user: AuthenticatedPrincipal): Promise<LinkedMethodsResponse> { return this.identity.methods(user.userId); }

  @Post("identities/request-code")
  requestLink(@CurrentUser() user: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(ContactDto)) body: ContactDto, @Req() req: NetworkRequest): Promise<VerificationRequestResponse> {
    return this.identity.requestLink(user, { ...body, clientKey: clientKey(req) });
  }

  @Post("identities/verify-code")
  verifyLink(@CurrentUser() user: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(VerifyContactDto)) body: VerifyContactDto, @Req() req: NetworkRequest): Promise<VerificationGrantResponse> {
    return this.identity.verifyLink(user, { ...body, clientKey: clientKey(req) });
  }

  @Post("identities/complete")
  completeLink(@CurrentUser() user: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(CompleteLinkDto)) body: CompleteLinkDto): Promise<LinkedMethodsResponse> {
    return this.identity.completeLink(user, body);
  }

  @Post("password/change")
  changePassword(@CurrentUser() user: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(ChangePasswordDto)) body: ChangePasswordDto): Promise<{ changed: true }> {
    return this.identity.changePassword(user, body);
  }

  @Post("identities/telegram/status")
  telegramStatus(@CurrentUser() user: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(TelegramLinkTokenDto)) body: TelegramLinkTokenDto): Promise<{ state: "waiting" | "ready" | "linked" | "expired" }> {
    if (!user.sessionFamilyId) return Promise.resolve({ state: "expired" });
    return this.telegramLinks.status(user.userId, user.sessionFamilyId, body.token);
  }

  @Post("identities/telegram/confirm")
  async telegramConfirm(@CurrentUser() user: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(TelegramLinkTokenDto)) body: TelegramLinkTokenDto): Promise<LinkedMethodsResponse> {
    if (!user.sessionFamilyId || !user.authenticatedAt || Date.now() / 1_000 - user.authenticatedAt > 10 * 60) throw new UnauthorizedException({ code: "RECENT_AUTH_REQUIRED" });
    await this.telegramLinks.confirm(user.userId, user.sessionFamilyId, body.token);
    return this.identity.methods(user.userId);
  }
}
