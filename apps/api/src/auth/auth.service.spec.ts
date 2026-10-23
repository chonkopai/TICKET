import type { PrismaClient, User } from "@event-platform/database";
import { describe, expect, it, vi } from "vitest";

import type { AuthConfig } from "./auth.constants.js";
import { AuthService } from "./auth.service.js";
import type { TelegramLinkService } from "./telegram-link.service.js";
import type { TokenService } from "./token.service.js";

describe("AuthService profile and organizer activation", () => {
  it("returns /me data and observes the new role immediately with the same access token", async () => {
    const now = new Date();
    const user: User = {
      id: "00000000-0000-4000-8000-000000000102",
      telegramId: 102n,
      telegramChatId: null,
      role: "guest",
      name: null,
      firstName: null,
      lastName: null,
      passwordHash: null,
      credentialVersion: 0,
      photoUrl: null,
      phone: null,
      email: null,
      blockedAt: null, blockedReason: null, organizerVerifiedAt: null, commissionBps: null,
    defaultCity: null,
    defaultCountry: null,
    preferredCurrency: null,
      createdAt: now,
      updatedAt: now,
    };
    const database = {
      user: {
        findUnique: vi.fn(async () => ({ ...user })),
        update: vi.fn(async ({ data }: { data: Partial<User> }) => {
          Object.assign(user, data, { updatedAt: new Date() });
          return { ...user };
        }),
      },
    } as unknown as PrismaClient;
    const tokens = {
      verifyAccess: vi.fn(async () => ({ userId: user.id })),
    } as unknown as TokenService;
    const service = new AuthService(
      database,
      { organizerRequiresApproval: false } as AuthConfig,
      tokens,
      {} as TelegramLinkService,
    );

    await expect(service.getMe(user.id)).resolves.toMatchObject({
      telegramId: "102",
      role: "guest",
      phone: null,
      email: null,
    });
    await expect(service.authenticate("same-access-token")).resolves.toEqual({
      userId: user.id,
      role: "guest",
    });

    await expect(service.becomeOrganizer(user.id)).resolves.toMatchObject({ role: "organizer" });
    await expect(service.authenticate("same-access-token")).resolves.toEqual({
      userId: user.id,
      role: "organizer",
    });
  });
});

it.each([true, false])("records Telegram messaging access only when granted: %s", async botAccess => {
  const upsert = vi.fn().mockResolvedValue({ id: "u", telegramId: 77n, telegramChatId: botAccess ? 77n : null, role: "guest" });
  const issuePair = vi.fn();
  const service = new AuthService({ user: { upsert } } as never, {} as never, { issuePair } as never, {} as never);
  await service.loginWithVerifiedTelegram({ id: 77n, name: "Fixture", photoUrl: null, botAccess });
  const request = upsert.mock.calls[0]![0];
  expect(request.update).toEqual(botAccess ? { telegramChatId: 77n } : {});
  expect(request.create.telegramChatId).toBe(botAccess ? 77n : undefined);
});
