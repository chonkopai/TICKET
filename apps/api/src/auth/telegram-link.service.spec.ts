import type { PrismaClient } from "@event-platform/database";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { AuthConfig } from "./auth.constants.js";
import { TelegramLinkService } from "./telegram-link.service.js";

interface LinkRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

function fixture(): { service: TelegramLinkService; records: LinkRecord[] } {
  const records: LinkRecord[] = [];
  const user = {
    id: "user-1",
    telegramId: 777n,
    telegramChatId: null as bigint | null,
    role: "guest",
    name: null as string | null,
  };
  const transaction = {
    telegramLinkToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const record = records.find((item) => item.tokenHash === where.tokenHash);
        return record ? { ...record, user } : null;
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: { usedAt: Date } }) => {
        const record = records.find(
          (item) => item.id === where.id && !item.usedAt && item.expiresAt > data.usedAt,
        );
        if (!record) return { count: 0 };
        record.usedAt = data.usedAt;
        return { count: 1 };
      },
    },
    user: {
      findUnique: async () => null,
      update: async ({ data }: { data: { telegramChatId: bigint; name?: string } }) => {
        user.telegramChatId = data.telegramChatId;
        if (data.name) user.name = data.name;
        return user;
      },
    },
  };
  const database = {
    telegramLinkToken: {
      create: async ({ data }: { data: Omit<LinkRecord, "id" | "usedAt"> }) => {
        records.push({ id: `link-${records.length + 1}`, usedAt: null, ...data });
      },
    },
    $transaction: async (callback: (client: typeof transaction) => unknown) => callback(transaction),
  } as unknown as PrismaClient;
  const config = {
    telegramBotUsername: "event_platform_bot",
  } as AuthConfig;

  return { service: new TelegramLinkService(database, config), records };
}

describe("TelegramLinkService", () => {
  const input = { telegramId: 777, chatId: 777, firstName: "Aruzhan" };

  it("rejects a token at or after its ten-minute expiry", async () => {
    const { service } = fixture();
    const issuedAt = new Date("2026-09-02T00:00:00.000Z");
    const link = await service.issue("user-1", issuedAt);

    await expect(
      service.consume({ token: link.token, ...input }, new Date("2026-09-02T00:10:00.000Z")),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("consumes a link token only once", async () => {
    const { service, records } = fixture();
    const issuedAt = new Date("2026-09-02T00:00:00.000Z");
    const link = await service.issue("user-1", issuedAt);
    const consumedAt = new Date("2026-09-02T00:01:00.000Z");

    await expect(service.consume({ token: link.token, ...input }, consumedAt)).resolves.toMatchObject({
      telegramChatId: 777n,
    });
    await expect(service.consume({ token: link.token, ...input }, consumedAt)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(records[0]?.usedAt).toEqual(consumedAt);
  });
});
