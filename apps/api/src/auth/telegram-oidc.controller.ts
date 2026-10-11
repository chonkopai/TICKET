import type { TelegramOidcCompleteRequest, TelegramOidcStartRequest } from "@event-platform/shared-types";
import { Body, Controller, Header, Headers, Inject, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { AUTH_CONFIG, type AuthConfig } from "./auth.constants.js";
import { SensitiveRateGuard } from "./sensitive-rate.guard.js";
import { TelegramOidcService } from "./telegram-oidc.service.js";

export class TelegramOidcStartDto implements TelegramOidcStartRequest {
  @IsString() @Matches(/^[a-f0-9]{64}$/) browserProofHash!: string;
  @IsString() @MaxLength(2048) returnTo!: string;
  @IsIn(["ru", "kk", "en"]) locale!: "ru" | "kk" | "en";
}
export class TelegramOidcCompleteDto implements TelegramOidcCompleteRequest {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) state!: string;
  @IsString() @MinLength(1) @MaxLength(4096) code!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) browserProof!: string;
}

@Controller("auth/telegram/oidc")
@UseGuards(SensitiveRateGuard)
export class TelegramOidcController {
  constructor(@Inject(TelegramOidcService) private readonly telegram: TelegramOidcService, @Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  private checkOrigin(origin: string | undefined) {
    if (!origin || origin !== this.config.webOrigin) throw new UnauthorizedException({ code: "TELEGRAM_INVALID" });
  }

  @Post("start")
  @Header("Cache-Control", "no-store")
  start(@Body(new ExplicitDtoPipe(TelegramOidcStartDto)) body: TelegramOidcStartDto, @Headers("origin") origin?: string) {
    this.checkOrigin(origin);
    return this.telegram.start(body);
  }

  @Post("complete")
  @Header("Cache-Control", "no-store")
  complete(@Body(new ExplicitDtoPipe(TelegramOidcCompleteDto)) body: TelegramOidcCompleteDto, @Headers("origin") origin?: string) {
    this.checkOrigin(origin);
    return this.telegram.complete(body);
  }
}
