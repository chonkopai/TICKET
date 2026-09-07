import { createHmac, timingSafeEqual } from "node:crypto";

import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  AUTH_CONFIG,
  ROLES_KEY,
  type AuthConfig,
  type AuthenticatedPrincipal,
  type BotPrincipal,
} from "./auth.constants.js";
import { AuthService } from "./auth.service.js";

type AuthCarrier = {
  headers?: Record<string, string | string[] | undefined>;
  handshake?: { headers?: Record<string, string | string[] | undefined> };
  user?: AuthenticatedPrincipal;
  botActor?: BotPrincipal;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const carrier = getCarrier(context);
    const authorization = readHeader(carrier, "authorization");
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
    if (!match?.[1]) throw new UnauthorizedException("A bearer access token is required");

    carrier.user = await this.auth.authenticate(match[1]);
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<AuthenticatedPrincipal["role"][]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed?.length) return true;

    const user = getCarrier(context).user;
    if (!user) throw new UnauthorizedException();
    if (!allowed.includes(user.role)) throw new ForbiddenException("This role cannot access the resource");
    return true;
  }
}

@Injectable()
export class BotApiGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const provided = readHeader(getCarrier(context), "x-bot-api-secret");
    const expected = this.config.botApiSecret;
    if (!provided || !constantTimeEqual(provided, expected)) {
      throw new UnauthorizedException("Bot API credentials are invalid");
    }
    return true;
  }
}

/** Verifies a short-lived identity assertion minted by the internal bot endpoint. */
@Injectable()
export class BotActorGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const carrier = getCarrier(context);
    const authorization = readHeader(carrier, "authorization");
    const value = /^Bearer\s+bot\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/i.exec(authorization ?? "");
    if (!value) throw new UnauthorizedException("A bot identity token is required");
    const encoded = value[1];
    const signature = value[2];
    if (!encoded || !signature) throw new UnauthorizedException("Bot identity is invalid");
    const expected = createHmac("sha256", this.config.botApiSecret).update(encoded).digest("base64url");
    if (!constantTimeEqual(signature, expected)) throw new UnauthorizedException("Bot identity is invalid");
    let payload: { sub: string; telegramId: string; chatId: string; exp: number };
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as typeof payload;
    } catch {
      throw new UnauthorizedException("Bot identity is invalid");
    }
    if (!payload.sub || !payload.telegramId || !payload.chatId || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
      throw new UnauthorizedException("Bot identity is expired");
    }
    carrier.botActor = { userId: payload.sub, role: "guest", telegramId: payload.telegramId, chatId: payload.chatId };
    return true;
  }
}

function getCarrier(context: ExecutionContext): AuthCarrier {
  return context.getType<string>() === "ws"
    ? context.switchToWs().getClient<AuthCarrier>()
    : context.switchToHttp().getRequest<AuthCarrier>();
}

function readHeader(carrier: AuthCarrier, name: string): string | undefined {
  const value = carrier.headers?.[name] ?? carrier.handshake?.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
