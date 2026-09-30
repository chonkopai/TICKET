import { Body, Controller, Header, Headers, Inject, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { AUTH_CONFIG, type AuthConfig, type AuthenticatedPrincipal } from "./auth.constants.js";
import { CurrentUser } from "./auth.decorators.js";
import { JwtAuthGuard } from "./auth.guards.js";
import { GoogleAuthService } from "./google-auth.service.js";
import { SensitiveRateGuard } from "./sensitive-rate.guard.js";

export class GoogleCredentialDto {
  @IsString() @MinLength(1) @MaxLength(12000) credential!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) secret!: string;
}

function checkOrigin(origin: string | undefined, config: AuthConfig) {
  if (!origin || origin !== config.webOrigin) throw new UnauthorizedException({ code: "GOOGLE_INVALID" });
}

@Controller("auth/google")
@UseGuards(SensitiveRateGuard)
export class GoogleAuthController {
  constructor(@Inject(GoogleAuthService) private readonly google: GoogleAuthService, @Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}
  @Post()
  @Header("Cache-Control", "no-store")
  login(@Body(new ExplicitDtoPipe(GoogleCredentialDto)) body: GoogleCredentialDto, @Headers("origin") origin?: string) {
    checkOrigin(origin, this.config);
    return this.google.authenticate(body);
  }
}

@Controller("me/identities/google")
@UseGuards(JwtAuthGuard, SensitiveRateGuard)
export class GoogleLinkController {
  constructor(@Inject(GoogleAuthService) private readonly google: GoogleAuthService, @Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}
  @Post()
  @Header("Cache-Control", "no-store")
  link(@CurrentUser() principal: AuthenticatedPrincipal, @Body(new ExplicitDtoPipe(GoogleCredentialDto)) body: GoogleCredentialDto, @Headers("origin") origin?: string) {
    checkOrigin(origin, this.config);
    return this.google.authenticate(body, principal);
  }
}
