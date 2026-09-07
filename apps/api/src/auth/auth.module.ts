import { loadApiEnv } from "@event-platform/config";
import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig } from "./auth.constants.js";
import { BotActorGuard, BotApiGuard, JwtAuthGuard, RolesGuard } from "./auth.guards.js";
import { AuthService } from "./auth.service.js";
import { MeController } from "./me.controller.js";
import { TelegramLinkService } from "./telegram-link.service.js";
import { TokenService } from "./token.service.js";

@Module({
  controllers: [AuthController, MeController],
  providers: [
    { provide: DATABASE_CLIENT, useValue: prisma },
    {
      provide: AUTH_CONFIG,
      useFactory: (): AuthConfig => {
        const env = loadApiEnv();
        return {
          accessTokenSecret: env.JWT_SECRET,
          refreshTokenSecret: env.JWT_REFRESH_SECRET,
          telegramBotToken: env.TELEGRAM_BOT_TOKEN,
          telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
          botApiSecret: env.BOT_API_SECRET,
          organizerRequiresApproval: env.ORGANIZER_REQUIRES_APPROVAL,
        };
      },
    },
    AuthService,
    TokenService,
    TelegramLinkService,
    JwtAuthGuard,
    RolesGuard,
    BotApiGuard,
    BotActorGuard,
  ],
  exports: [AUTH_CONFIG, AuthService, JwtAuthGuard, RolesGuard, BotApiGuard, BotActorGuard],
})
export class AuthModule {}
