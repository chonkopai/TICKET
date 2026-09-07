import { ru, quickRu, type TelegramLinkConsumeRequest } from "@event-platform/shared-types";
import type { Context } from "grammy";

import { formatWelcome } from "../presentation.js";

export interface StartHandlerOptions {
  apiBaseUrl: string;
  botApiSecret: string;
  fetch?: typeof globalThis.fetch;
  getWelcome?: (ctx: Context) => Promise<string>;
}

export function createStartHandler(options: StartHandlerOptions): (ctx: Context) => Promise<void> {
  const request = options.fetch ?? globalThis.fetch;

  return async (ctx: Context): Promise<void> => {
    const token = parseStartToken(ctx.message?.text);
    if (!token) {
      await replyWelcome(ctx, options);
      return;
    }
    if (!ctx.from || !ctx.chat) {
      await ctx.reply(ru.bot.unableToIdentify);
      return;
    }

    if (token.startsWith("q_")) {
      if (ctx.chat.type !== "private") { await ctx.reply(ru.bot.unableToIdentify); return; }
      const message = await ctx.reply(quickRu.botPending);
      const response = await request(new URL("/quick/verify", options.apiBaseUrl), {
        method: "POST", headers: { "content-type": "application/json", "x-bot-api-secret": options.botApiSecret },
        body: JSON.stringify({ token: token.slice(2), telegramId: String(ctx.from.id), chatId: String(ctx.chat.id), messageId: message.message_id }),
      });
      if (!response.ok) await ctx.reply(ru.bot.invalidLink);
      else await ctx.reply(quickRu.botVerified);
      await replyWelcome(ctx, options);
      return;
    }

    const body: TelegramLinkConsumeRequest = {
      token,
      telegramId: ctx.from.id,
      chatId: ctx.chat.id,
      firstName: ctx.from.first_name,
      ...(ctx.from.last_name ? { lastName: ctx.from.last_name } : {}),
    };
    const response = await request(new URL("/auth/telegram/link/consume", options.apiBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-api-secret": options.botApiSecret,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await ctx.reply(ru.bot.invalidLink);
      await replyWelcome(ctx, options);
      return;
    }
    await ctx.reply(ru.bot.linked);
    await replyWelcome(ctx, options);
  };
}

async function replyWelcome(ctx: Context, options: StartHandlerOptions): Promise<void> {
  try {
    await ctx.reply(options.getWelcome ? await options.getWelcome(ctx) : formatWelcome("guest"));
  } catch {
    await ctx.reply(formatWelcome("guest"));
  }
}

export function parseStartToken(text: string | undefined): string | null {
  if (!text) return null;
  const match = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/.exec(text);
  return match?.[1] ?? null;
}
