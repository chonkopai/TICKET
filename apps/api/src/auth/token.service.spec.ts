import type { PrismaClient, User } from "@event-platform/database";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { AuthConfig } from "./auth.constants.js";
import { TokenService } from "./token.service.js";

interface StoredRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  createdAt: Date;
}

describe("TokenService refresh rotation", () => {
  it("rejects a reused token while the newly issued token remains valid", async () => {
    const user = fixtureUser();
    const records: StoredRefreshToken[] = [];
    const refreshToken = {
      create: async ({ data }: { data: Omit<StoredRefreshToken, "createdAt" | "revokedAt" | "replacedByTokenId"> }) => {
        records.push({
          ...data,
          createdAt: new Date(),
          revokedAt: null,
          replacedByTokenId: null,
        });
        return records.at(-1);
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const record = records.find((item) => item.tokenHash === where.tokenHash);
        return record ? { ...record, user } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; revokedAt: null; expiresAt: { gt: Date } };
        data: { revokedAt: Date };
      }) => {
        const record = records.find(
          (item) =>
            item.id === where.id && !item.revokedAt && item.expiresAt > where.expiresAt.gt,
        );
        if (!record) return { count: 0 };
        record.revokedAt = data.revokedAt;
        return { count: 1 };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { replacedByTokenId: string };
      }) => {
        const record = records.find((item) => item.id === where.id);
        if (!record) throw new Error("Refresh token fixture was not found");
        record.replacedByTokenId = data.replacedByTokenId;
        return record;
      },
    };
    const database = {
      refreshToken,
      $transaction: async (callback: (transaction: { refreshToken: typeof refreshToken }) => unknown) =>
        callback({ refreshToken }),
    } as unknown as PrismaClient;
    const config = {
      accessTokenSecret: "a".repeat(32),
      refreshTokenSecret: "b".repeat(32),
    } as AuthConfig;
    const service = new TokenService(database, config);

    const original = await service.issuePair(user);
    const rotated = await service.rotate(original.refreshToken);

    await expect(service.rotate(original.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.rotate(rotated.refreshToken)).resolves.toMatchObject({
      accessExpiresInSeconds: 900,
      refreshExpiresInSeconds: 2_592_000,
    });
  });
});

function fixtureUser(): User {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000101",
    telegramId: 101n,
    telegramChatId: null,
    role: "guest",
    name: "Тестовый гость",
    photoUrl: null,
    phone: null,
    email: null,
    createdAt: now,
    updatedAt: now,
  };
}
