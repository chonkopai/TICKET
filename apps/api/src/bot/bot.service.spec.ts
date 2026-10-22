import { describe, expect, it, vi } from "vitest";

import { BotService } from "./bot.service.js";

function service(database: Record<string, unknown>) {
  return new BotService(
    database as never,
    { botApiSecret: "s".repeat(32), accessTokenSecret: "a".repeat(32), refreshTokenSecret: "r".repeat(32), telegramBotToken: "1:token", telegramBotUsername: "event_bot", organizerRequiresApproval: false },
    { list: vi.fn(), get: vi.fn() } as never,
    { renderQrForUser: vi.fn(), assetForAnonymousOrder: vi.fn() } as never,
    { startForVerifiedRecipient: vi.fn() } as never,
  );
}

describe("BotService", () => {
  it("mints a short-lived identity token only for the linked Telegram chat", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "user-1", role: "guest" });
    const result = await service({ user: { findFirst } }).identity({ telegramId: "77", chatId: "77" });
    expect(result.token.startsWith("bot.")).toBe(true);
    expect(result.user).toEqual({ id: "user-1", role: "guest" });
    expect(findFirst).toHaveBeenCalledWith({ where: { telegramId: 77n, telegramChatId: 77n } });
  });

  it("checks organizer ownership before returning guest counts", async () => {
    const userFind = vi.fn().mockResolvedValue({ id: "organizer-1", role: "organizer" });
    const eventFind = vi.fn().mockResolvedValue({ id: "event-1" });
    const count = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    const result = await service({ user: { findFirst: userFind }, event: { findFirst: eventFind }, ticket: { count }, booking: { count } }).guests({ userId: "u", role: "guest", telegramId: "77", chatId: "77" }, "event-1");
    expect(result).toEqual({ eventId: "event-1", guestCount: 5 });
    expect(eventFind).toHaveBeenCalledWith({ where: { id: "event-1", organizerId: "organizer-1" }, select: { id: true } });
  });
});

it("links messaging permission received before the website login callback", async () => {
  const upsert = vi.fn();
  await expect(service({ user: { upsert } }).grantWriteAccess({ telegramId: "77", chatId: "77" })).resolves.toEqual({ linked: true });
  expect(upsert).toHaveBeenCalledWith({ where: { telegramId: 77n }, create: { telegramId: 77n, telegramChatId: 77n, role: "guest" }, update: { telegramChatId: 77n } });
});
it("rejects messaging permission for a different or group chat", async () => {
  const upsert = vi.fn();
  for (const chatId of ["78", "-77"]) await expect(service({ user: { upsert } }).grantWriteAccess({ telegramId: "77", chatId })).rejects.toBeTruthy();
  expect(upsert).not.toHaveBeenCalled();
});
