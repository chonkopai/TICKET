import type {
  AuthResponse,
  RefreshResponse,
  TelegramLinkTokenResponse,
} from "@event-platform/shared-types";
import { Body, Controller, Header, Inject, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "./auth.decorators.js";
import { BotApiGuard, JwtAuthGuard } from "./auth.guards.js";
import type { AuthenticatedPrincipal } from "./auth.constants.js";
import { AuthService } from "./auth.service.js";
import { SensitiveRateGuard } from "./sensitive-rate.guard.js";
import { ConsumeTelegramLinkDto, RefreshTokenDto, TelegramLoginDto } from "./dto.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("telegram/widget")
  @Header("Cache-Control", "no-store")
  @UseGuards(SensitiveRateGuard)
  loginWithTelegram(@Body() body: TelegramLoginDto): Promise<AuthResponse> {
    return this.auth.loginWithTelegram(body);
  }

  @Post("refresh")
  @Header("Cache-Control", "no-store")
  @UseGuards(SensitiveRateGuard)
  async refresh(@Body() body: RefreshTokenDto): Promise<RefreshResponse> {
    return { tokens: await this.auth.rotateRefreshToken(body.refreshToken) };
  }

  @Post("logout")
  @Header("Cache-Control", "no-store")
  @UseGuards(SensitiveRateGuard)
  async logout(@Body() body: RefreshTokenDto): Promise<{ revoked: true }> {
    await this.auth.revokeRefreshFamily(body.refreshToken);
    return { revoked: true };
  }

  @Post("telegram/link-token")
  @Header("Cache-Control", "private, no-store")
  @UseGuards(JwtAuthGuard, SensitiveRateGuard)
  createTelegramLink(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<TelegramLinkTokenResponse> {
    return this.auth.issueTelegramLinkToken(principal);
  }

  @Post("telegram/link/consume")
  @UseGuards(BotApiGuard, SensitiveRateGuard)
  async consumeTelegramLink(@Body() body: ConsumeTelegramLinkDto): Promise<{ linked: boolean; pending: boolean }> {
    const user = await this.auth.consumeTelegramLink(body);
    return { linked: user.telegramId !== null, pending: user.telegramId === null };
  }
}
