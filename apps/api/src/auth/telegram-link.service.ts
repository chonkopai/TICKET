import { createHash, randomBytes } from "node:crypto";

import type { Prisma, PrismaClient, User } from "@event-platform/database";
import type {
  TelegramLinkConsumeRequest,
  TelegramLinkTokenResponse,
} from "@event-platform/shared-types";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig } from "./auth.constants.js";

const LINK_TOKEN_TTL_MS = 10 * 60 * 1_000;

@Injectable()
export class TelegramLinkService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async issue(userId: string, now = new Date()): Promise<TelegramLinkTokenResponse> {
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MS);

    await this.database.telegramLinkToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      deepLinkUrl: `https://t.me/${this.config.telegramBotUsername}?start=${token}`,
    };
  }

  async consume(input: TelegramLinkConsumeRequest, now = new Date()): Promise<User> {
    const tokenHash = hashToken(input.token);
    const telegramId = BigInt(input.telegramId);
    const telegramChatId = BigInt(input.chatId);

    return this.database.$transaction(async (transaction) => {
      const record = await transaction.telegramLinkToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!record || record.usedAt || record.expiresAt <= now) {
        throw new UnauthorizedException("Telegram link token is invalid, expired, or already used");
      }
      if (record.user.telegramId !== telegramId) {
        throw new ForbiddenException("This link token belongs to a different Telegram account");
      }

      const chatOwner = await transaction.user.findUnique({ where: { telegramChatId } });
      if (chatOwner && chatOwner.id !== record.userId) {
        throw new ConflictException("This Telegram chat is already linked to another user");
      }

      const claimed = await transaction.telegramLinkToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new ConflictException("Telegram link token was already used");

      const telegramName = [input.firstName, input.lastName].filter(Boolean).join(" ") || undefined;
      const data: Prisma.UserUpdateInput = { telegramChatId };
      if (!record.user.name && telegramName) data.name = telegramName;
      return transaction.user.update({
        where: { id: record.userId },
        data,
      });
    });
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
