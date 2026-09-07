import type { Context } from "grammy";
import { ru, quickRu } from "@event-platform/shared-types";
import { describe, expect, it, vi } from "vitest";

import { createStartHandler } from "./handlers/start.js";
import { BOT_CLIENT_OPTIONS, parseSearchQuery } from "./bot.js";
import { formatWelcome } from "./presentation.js";

describe("/start", () => {
  it("retains Telegram API results in webhook mode for idempotent delivery", () => {
    expect(BOT_CLIENT_OPTIONS.canUseWebhookReply("sendMessage")).toBe(false);
  });
  it("verifies an anonymous recipient without invoking account linking", async () => {
    const reply = vi.fn().mockResolvedValue({ message_id: 12 });
    const request = vi.fn().mockResolvedValue({ ok: true });
    const token = "a".repeat(43);
    const context = { message: { text: `/start q_${token}` }, from: { id: 777 }, chat: { id: 777, type: "private" }, reply } as unknown as Context;
    await createStartHandler({ apiBaseUrl: "http://localhost:3001", botApiSecret: "s".repeat(32), fetch: request })(context);
    expect(request.mock.calls[0]?.[0].pathname).toBe("/quick/verify");
    expect(JSON.parse(request.mock.calls[0]?.[1].body)).toEqual({ token, telegramId: "777", chatId: "777", messageId: 12 });
    expect(reply).toHaveBeenCalledWith(quickRu.botVerified);
  });
  it("does not verify anonymous recipients from a group chat", async () => {
    const request = vi.fn(), reply = vi.fn();
    const context = { message: { text: `/start q_${"a".repeat(43)}` }, from: { id: 777 }, chat: { id: -1, type: "group" }, reply } as unknown as Context;
    await createStartHandler({ apiBaseUrl: "http://localhost:3001", botApiSecret: "s".repeat(32), fetch: request })(context);
    expect(request).not.toHaveBeenCalled();
  });
  it("opens the bot help entry point", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const context = { message: { text: "/start" }, reply } as unknown as Context;
    const handler = createStartHandler({
      apiBaseUrl: "http://localhost:3001",
      botApiSecret: "a".repeat(32),
    });

    await handler(context);

    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(formatWelcome("guest"));
  });

  it("consumes a deep-link token using the sender and chat identity", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ ok: true });
    const context = {
      message: { text: "/start abc_DEF-123" },
      from: { id: 777, first_name: "Aruzhan", last_name: "S." },
      chat: { id: 999 },
      reply,
    } as unknown as Context;
    const handler = createStartHandler({
      apiBaseUrl: "http://localhost:3001",
      botApiSecret: "s".repeat(32),
      fetch: request,
    });

    await handler(context);

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "x-bot-api-secret": "s".repeat(32) },
      body: JSON.stringify({
        token: "abc_DEF-123",
        telegramId: 777,
        chatId: 999,
        firstName: "Aruzhan",
        lastName: "S.",
      }),
    });
    expect(reply).toHaveBeenCalledWith(ru.bot.linked);
  });
});

describe("/search", () => {
  it("accepts a query with an optional bot username and normalizes whitespace", () => {
    expect(parseSearchQuery("/search@event_platform   джаз   Алматы")).toBe("джаз Алматы");
    expect(parseSearchQuery("/search")).toBe("");
    expect(parseSearchQuery("/events джаз")).toBe("");
  });
});
