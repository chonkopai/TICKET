import { createHash, randomBytes } from "node:crypto";

import { Prisma, type PrismaClient, type User } from "@event-platform/database";
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

  async issue(userId: string, now = new Date(), sessionFamilyId?: string): Promise<TelegramLinkTokenResponse> {
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MS);

    await this.database.telegramLinkToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt, ...(sessionFamilyId ? { sessionFamilyId } : {}) },
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

    try {
      return await this.database.$transaction(async (transaction) => {
      const record = await transaction.telegramLinkToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!record || record.usedAt || record.expiresAt <= now) {
        throw new UnauthorizedException("Telegram link token is invalid, expired, or already used");
      }
      if (record.user.telegramId !== telegramId) {
        if (record.user.telegramId !== null) throw new ForbiddenException("This link token belongs to a different Telegram account");
        if (!record.sessionFamilyId) throw new UnauthorizedException("A web session is required to confirm this link");
        const identityOwner = await transaction.user.findUnique({ where: { telegramId } });
        if (identityOwner && identityOwner.id !== record.userId) throw new ConflictException("This Telegram account is already linked to another user");
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

      if (record.user.telegramId === null) {
        await transaction.telegramLinkToken.update({ where: { id: record.id }, data: { pendingTelegramId: telegramId, pendingChatId: telegramChatId, pendingAt: now } });
        return record.user;
      }

      const telegramName = [input.firstName, input.lastName].filter(Boolean).join(" ") || undefined;
      const data: Prisma.UserUpdateInput = { telegramChatId };
      if (!record.user.name && telegramName) data.name = telegramName;
      return transaction.user.update({
        where: { id: record.userId },
        data,
      });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("This Telegram chat is already linked to another user");
      throw error;
    }
  }

  async status(userId: string, sessionFamilyId: string, token: string, now = new Date()): Promise<{ state: "waiting" | "ready" | "linked" | "expired" }> {
    const row = await this.database.telegramLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.userId !== userId || row.sessionFamilyId !== sessionFamilyId || row.expiresAt <= now) return { state: "expired" };
    if (row.confirmedAt) return { state: "linked" };
    if (row.usedAt && !row.pendingTelegramId) return { state: "linked" };
    return { state: row.pendingTelegramId && row.pendingChatId ? "ready" : "waiting" };
  }

  async confirm(userId: string, sessionFamilyId: string, token: string, now = new Date()): Promise<User> {
    try {
      return await this.database.$transaction(async transaction => {
        const row = await transaction.telegramLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
        if (!row || row.userId !== userId || row.sessionFamilyId !== sessionFamilyId || !row.usedAt || !row.pendingTelegramId || !row.pendingChatId || row.confirmedAt || row.expiresAt <= now) throw new UnauthorizedException("Telegram link is not ready for confirmation");
        await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`telegram-link:${userId}`}, 0))`;
        const telegramOwner = await transaction.user.findUnique({ where: { telegramId: row.pendingTelegramId } });
        const chatOwner = await transaction.user.findUnique({ where: { telegramChatId: row.pendingChatId } });
        if ((telegramOwner && telegramOwner.id !== userId) || (chatOwner && chatOwner.id !== userId)) throw new ConflictException("Telegram identity is already linked");
        const claimed = await transaction.user.updateMany({ where: { id: userId, telegramId: null }, data: { telegramId: row.pendingTelegramId, telegramChatId: row.pendingChatId } });
        if (claimed.count !== 1) throw new ConflictException("Telegram identity is already linked");
        await transaction.telegramLinkToken.update({ where: { id: row.id }, data: { confirmedAt: now } });
        await transaction.auditLog.create({ data: { actorId: userId, action: "identity.telegram_linked", entityType: "user", entityId: userId } });
        return transaction.user.findUniqueOrThrow({ where: { id: userId } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Telegram identity is already linked");
      throw error;
    }
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
