import { loadApiEnv } from "@event-platform/config";
import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig } from "./auth.constants.js";
import { BotActorGuard, BotApiGuard, JwtAuthGuard, RolesGuard } from "./auth.guards.js";
import { AuthService } from "./auth.service.js";
import { AccountService } from "./account.service.js";
import { MeController } from "./me.controller.js";
import { TelegramLinkService } from "./telegram-link.service.js";
import { TokenService } from "./token.service.js";
import { SensitiveRateGuard } from "./sensitive-rate.guard.js";
import { LocalObjectStorage } from "../events/local-object-storage.service.js";
import { EVENTS_CONFIG, OBJECT_STORAGE, type EventsConfig } from "../events/events.constants.js";
import { OrganizerPhotoService } from "./organizer-photo.service.js";
import { VerificationService } from "./verification.service.js";
import { ResendVerificationSender } from "./verification-sender.js";
import { VERIFICATION_CONFIG, VERIFICATION_SENDER, type VerificationConfig } from "./verification.tokens.js";
import { IdentityAuthController, IdentityMethodsController } from "./identity.controller.js";
import { IdentityAuthService } from "./identity-auth.service.js";

import { GoogleAuthController, GoogleLinkController } from "./google-auth.controller.js";
import { GoogleAuthService } from "./google-auth.service.js";

@Module({
  controllers: [GoogleAuthController, GoogleLinkController, AuthController, MeController, IdentityAuthController, IdentityMethodsController],
  providers: [
    { provide: DATABASE_CLIENT, useValue: prisma },
    {
      provide: AUTH_CONFIG,
      useFactory: (): AuthConfig => {
        const env = loadApiEnv();
        return {
          googleClientId: env.GOOGLE_CLIENT_ID,
          webOrigin: env.WEB_ORIGIN,
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
    AccountService,
    { provide: EVENTS_CONFIG, useFactory: (): EventsConfig => ({ posterStorageDirectory: loadApiEnv().POSTER_STORAGE_DIR }) },
    LocalObjectStorage,
    { provide: OBJECT_STORAGE, useExisting: LocalObjectStorage },
    OrganizerPhotoService,
    { provide: VERIFICATION_CONFIG, useFactory: (): VerificationConfig => {
      const secret = loadApiEnv().OTP_HMAC_SECRET;
      if (!secret) throw new Error("OTP_HMAC_SECRET is required for verification");
      return { hmacSecret: secret };
    } },
    { provide: VERIFICATION_SENDER, useFactory: () => {
      const env = loadApiEnv();
      return new ResendVerificationSender(env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
    } },
    VerificationService,
    IdentityAuthService,
    GoogleAuthService,
    TokenService,
    TelegramLinkService,
    JwtAuthGuard,
    RolesGuard,
    BotApiGuard,
    BotActorGuard,
    SensitiveRateGuard,
  ],
  exports: [AUTH_CONFIG, AuthService, VerificationService, JwtAuthGuard, RolesGuard, BotApiGuard, BotActorGuard, SensitiveRateGuard],
})
export class AuthModule {}
