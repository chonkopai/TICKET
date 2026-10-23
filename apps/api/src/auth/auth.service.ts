import { Prisma, type PrismaClient, type User } from "@event-platform/database";
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  TelegramLinkConsumeRequest,
  TelegramLinkTokenResponse,
  TelegramLoginPayload,
} from "@event-platform/shared-types";
import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig, type AuthenticatedPrincipal } from "./auth.constants.js";
import { ensureOrganizer } from "./organizer-policy.js";
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
    return this.loginWithVerifiedTelegram({ id: BigInt(payload.id), name, photoUrl: payload.photo_url ?? null });
  }

  /** Internal only: callers must cryptographically verify Telegram's identity first. */
  async loginWithVerifiedTelegram(identity: { id: bigint; name: string | null; photoUrl: string | null; botAccess?: boolean }): Promise<AuthResponse> {
    let user: User;
    try {
      user = await this.database.user.upsert({
        where: { telegramId: identity.id },
        create: {
          telegramId: identity.id,
          ...(identity.botAccess ? { telegramChatId: identity.id } : {}),
          role: "guest",
          name: identity.name,
          photoUrl: identity.photoUrl,
        },
        // Keep a name or photo explicitly chosen in the account editor.
        update: identity.botAccess ? { telegramChatId: identity.id } : {},
      });
    } catch (error) {
      // Empty-update upserts can race when both providers see a new identity at once.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existing = await this.database.user.findUnique({ where: { telegramId: identity.id } });
      if (!existing) throw error;
      user = identity.botAccess ? await this.database.user.update({ where: { id: existing.id }, data: { telegramChatId: identity.id } }) : existing;
    }

    return { user: presentUser(user), tokens: await this.tokens.issuePair(user) };
  }

  rotateRefreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  revokeRefreshFamily(refreshToken: string): Promise<void> {
    return this.tokens.revokeFamily(refreshToken);
  }

  async authenticate(accessToken: string): Promise<{ userId: string; role: User["role"]; restricted?: boolean; sessionFamilyId?: string; authenticatedAt?: number }> {
    const { userId, credentialVersion, sessionFamilyId, authenticatedAt } = await this.tokens.verifyAccess(accessToken);
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User no longer exists");
    if (credentialVersion !== undefined && credentialVersion !== user.credentialVersion) throw new UnauthorizedException("Session was revoked");
    return { userId: user.id, role: user.role, ...(user.blockedAt ? {restricted:true} : {}), ...(sessionFamilyId ? { sessionFamilyId } : {}), ...(authenticatedAt ? { authenticatedAt } : {}) };
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
          ...(input.defaultCountry !== undefined ? { defaultCountry: input.defaultCountry } : {}),
          ...(input.preferredCurrency !== undefined ? { preferredCurrency: input.preferredCurrency } : {}),
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
    return ensureOrganizer(this.database,userId,this.config.organizerRequiresApproval).then(presentUser);
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
