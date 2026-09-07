import type {
  AuthResponse,
  RefreshResponse,
  TelegramLinkTokenResponse,
} from "@event-platform/shared-types";
import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "./auth.decorators.js";
import { BotApiGuard, JwtAuthGuard } from "./auth.guards.js";
import type { AuthenticatedPrincipal } from "./auth.constants.js";
import { AuthService } from "./auth.service.js";
import { ConsumeTelegramLinkDto, RefreshTokenDto, TelegramLoginDto } from "./dto.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("telegram/widget")
  loginWithTelegram(@Body() body: TelegramLoginDto): Promise<AuthResponse> {
    return this.auth.loginWithTelegram(body);
  }

  @Post("refresh")
  async refresh(@Body() body: RefreshTokenDto): Promise<RefreshResponse> {
    return { tokens: await this.auth.rotateRefreshToken(body.refreshToken) };
  }

  @Post("telegram/link-token")
  @UseGuards(JwtAuthGuard)
  createTelegramLink(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<TelegramLinkTokenResponse> {
    return this.auth.issueTelegramLinkToken(principal.userId);
  }

  @Post("telegram/link/consume")
  @UseGuards(BotApiGuard)
  async consumeTelegramLink(@Body() body: ConsumeTelegramLinkDto): Promise<{ linked: true }> {
    await this.auth.consumeTelegramLink(body);
    return { linked: true };
  }
}
