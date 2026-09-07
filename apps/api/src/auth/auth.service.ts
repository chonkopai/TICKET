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

import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig } from "./auth.constants.js";
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
        name,
        ...(payload.photo_url ? { photoUrl: payload.photo_url } : {}),
      },
    });

    return { user: presentUser(user), tokens: await this.tokens.issuePair(user) };
  }

  rotateRefreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  async authenticate(accessToken: string): Promise<{ userId: string; role: User["role"] }> {
    const { userId } = await this.tokens.verifyAccess(accessToken);
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User no longer exists");
    return { userId: user.id, role: user.role };
  }

  async getMe(userId: string): Promise<AuthUser> {
    return presentUser(await this.findUser(userId));
  }

  async updateMe(userId: string, input: UpdateMeDto): Promise<AuthUser> {
    const user = await this.database.user.update({
      where: { id: userId },
      data: {
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      },
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

  issueTelegramLinkToken(userId: string): Promise<TelegramLinkTokenResponse> {
    return this.telegramLinks.issue(userId);
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
