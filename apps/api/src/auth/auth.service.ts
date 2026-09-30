import type { PrismaClient, User } from "@event-platform/database";
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  TelegramLinkConsumeRequest,
  TelegramLinkTokenResponse,
  TelegramLoginPayload,
} from "@event-platform/shared-types";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig, type AuthenticatedPrincipal } from "./auth.constants.js";
import { presentUser } from "./auth.presenter.js";
import type { UpdateMeDto } from "./dto.js";
import { TelegramLinkService } from "./telegram-link.service.js";
import { verifyTelegramLogin } from "./telegram-login.js";
import { TokenService } from "./token.service.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(TelegramLinkService) private readonly telegramLinks: TelegramLinkService,
  ) {}

  async loginWithTelegram(payload: TelegramLoginPayload): Promise<AuthResponse> {
    if (!verifyTelegramLogin(payload, this.config.telegramBotToken)) {
      throw new UnauthorizedException("Telegram login data is invalid or expired");
    }

    const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ");
    const user = await this.database.user.upsert({
      where: { telegramId: BigInt(payload.id) },
      create: {
        telegramId: BigInt(payload.id),
        role: "guest",
        name,
        photoUrl: payload.photo_url ?? null,
      },
      update: {
        // Keep a name or photo explicitly chosen in the account editor.
      },
    });

    return { user: presentUser(user), tokens: await this.tokens.issuePair(user) };
  }

  rotateRefreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  revokeRefreshFamily(refreshToken: string): Promise<void> {
    return this.tokens.revokeFamily(refreshToken);
  }

  async authenticate(accessToken: string): Promise<{ userId: string; role: User["role"]; sessionFamilyId?: string; authenticatedAt?: number }> {
    const { userId, credentialVersion, sessionFamilyId, authenticatedAt } = await this.tokens.verifyAccess(accessToken);
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User no longer exists");
    if (credentialVersion !== undefined && credentialVersion !== user.credentialVersion) throw new UnauthorizedException("Session was revoked");
    return { userId: user.id, role: user.role, ...(sessionFamilyId ? { sessionFamilyId } : {}), ...(authenticatedAt ? { authenticatedAt } : {}) };
  }

  async getMe(userId: string): Promise<AuthUser> {
    return presentUser(await this.findUser(userId));
  }

  async updateMe(userId: string, input: UpdateMeDto): Promise<AuthUser> {
    const changedFields = Object.keys(input);
    const user = await this.database.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          ...(input.phone !== undefined ? { phone: normalized(input.phone) } : {}),
          ...(input.email !== undefined ? { email: normalized(input.email) } : {}),
          ...(input.defaultCity !== undefined ? { defaultCity: normalized(input.defaultCity) } : {}),
        },
      });
      await transaction.auditLog.create({
        data: { actorId: userId, action: "profile.updated", entityType: "user", entityId: userId, meta: { changedFields } },
      });
      await transaction.outboxEvent.create({
        data: { eventType: "profile.updated", aggregateType: "user", aggregateId: userId, payload: { changedFields } },
      });
      return updated;
    });
    return presentUser(user);
  }

  async becomeOrganizer(userId: string): Promise<AuthUser> {
    const current = await this.findUser(userId);
    if (current.role === "organizer" || current.role === "admin") {
      return presentUser(current);
    }
    if (this.config.organizerRequiresApproval) {
      throw new ConflictException("Organizer approval is required by the current policy");
    }

    return presentUser(
      await this.database.user.update({
        where: { id: userId },
        data: { role: "organizer" },
      }),
    );
  }

  async issueTelegramLinkToken(principal: AuthenticatedPrincipal): Promise<TelegramLinkTokenResponse> {
    await this.findUser(principal.userId);
    if (!principal.sessionFamilyId || !principal.authenticatedAt || Date.now() / 1_000 - principal.authenticatedAt > 10 * 60) throw new UnauthorizedException({ code: "RECENT_AUTH_REQUIRED" });
    return this.telegramLinks.issue(principal.userId, new Date(), principal.sessionFamilyId);
  }

  consumeTelegramLink(input: TelegramLinkConsumeRequest): Promise<User> {
    return this.telegramLinks.consume(input);
  }

  private async findUser(userId: string): Promise<User> {
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User was not found");
    return user;
  }
}

function normalized(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}
