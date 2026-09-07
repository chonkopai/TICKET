import { Bot, Context, InlineKeyboard, InputFile } from "grammy";
import { ru } from "@event-platform/shared-types";

import { BotApiClient, isPrivateChat } from "./api-client.js";
import { createStartHandler, type StartHandlerOptions } from "./handlers/start.js";
import {
  formatEventDetails,
  formatEventList,
  formatHelp,
  formatWelcome,
  type BotRole,
} from "./presentation.js";

// Verification delivery needs Telegram's actual message_id. Webhook replies hide API results.
export const BOT_CLIENT_OPTIONS = { canUseWebhookReply: (_method: string): boolean => false };

interface BotOptions extends StartHandlerOptions { webOrigin?: string; }
interface PendingPurchase { kind: "ticket" | "table"; itemId: string; sessionToken: string; accessToken: string; key: string; }
interface EventListState { page: number; search: string; }
const SEARCH_MAX_LENGTH = 120;

export function createBot(token: string, username: string, options: BotOptions): Bot {
  const tokenBotId = Number.parseInt(token.split(":")[0] ?? "0", 10);
  const bot = new Bot(token, {
    botInfo: { id: Number.isSafeInteger(tokenBotId) ? tokenBotId : 0, is_bot: true, first_name: "Event Platform", username, can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false },
    client: BOT_CLIENT_OPTIONS,
  });

  const api = (): BotApiClient => new BotApiClient({ apiBaseUrl: options.apiBaseUrl, botApiSecret: options.botApiSecret, fetch: options.fetch });
  const pending = new Map<number, PendingPurchase>();
  const eventListState = new Map<number, EventListState>();

  bot.command("start", createStartHandler({
    ...options,
    getWelcome: (ctx) => welcomeForContext(ctx, api()),
  }));
  bot.command("help", async (ctx) => { await ctx.reply(await helpForContext(ctx, api())); });
  bot.command("events", async (ctx) => { await showEvents(ctx, api(), eventListState, 1); });
  bot.command("search", async (ctx) => {
    const query = parseSearchQuery(ctx.message?.text);
    if (!query) { await ctx.reply(ru.bot.searchUsage); return; }
    if (query.length > SEARCH_MAX_LENGTH) { await ctx.reply(ru.bot.searchTooLong); return; }
    await showEvents(ctx, api(), eventListState, 1, query);
  });
  bot.command(["tickets", "my_tickets"], async (ctx) => { await showTickets(ctx, api()); });
  bot.command("today", async (ctx) => {
    if (!isPrivateChat(ctx)) { await ctx.reply(ru.bot.privateOnly); return; }
    try {
      const result = await api().organizerToday(ctx.from!.id, ctx.chat!.id);
      if (!result.items.length) { await ctx.reply(ru.bot.noToday); return; }
      await ctx.reply(result.items.map((event) => `${event.title}\n${event.date} ${event.time} (${event.timezone})\n${ru.bot.guestCount}: ${event.guestCount}`).join("\n\n"));
    } catch (error) { await ctx.reply(error instanceof Error && error.message.includes("BOT_API_404") ? ru.bot.organizerOnly : ru.bot.unavailable); }
  });
  bot.command("notify", async (ctx) => { await ctx.reply(ru.bot.broadcastUnavailable); });
  bot.command("chat", async (ctx) => { await ctx.reply(ru.bot.chatUnavailable); });
  bot.command("check_payment", async (ctx) => {
    if (!isPrivateChat(ctx)) { await ctx.reply(ru.bot.privateOnly); return; }
    const item = ctx.from ? pending.get(ctx.from.id) : undefined;
    if (!item) { await ctx.reply(ru.bot.expired); return; }
    try {
      const status = await api().quickStatus(item.accessToken);
      if (status.status === "paid") {
        await ctx.reply(ru.bot.paymentPaid);
        for (const ticket of status.tickets ?? []) { try { await sendQr(ctx, await api().qr(ticket.id, ctx.from!.id, ctx.chat!.id, true)); } catch { await ctx.reply(ru.bot.unavailable); } }
        pending.delete(ctx.from!.id);
      } else if (status.status === "pending") await ctx.reply(ru.bot.paymentPending);
      else await ctx.reply(ru.bot.paymentFailed);
    } catch { await ctx.reply(ru.bot.unavailable); }
  });

  bot.on("callback_query:data", async (ctx) => {
    // Telegram requires an acknowledgement quickly, before any database/API work.
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;
    const state = ctx.from ? eventListState.get(ctx.from.id) : undefined;
    if (data === "events:next") { await showEvents(ctx, api(), eventListState, (state?.page ?? 1) + 1, state?.search); return; }
    if (data === "events:prev") { await showEvents(ctx, api(), eventListState, Math.max(1, (state?.page ?? 1) - 1), state?.search); return; }
    if (data === "events:back") { await showEvents(ctx, api(), eventListState, state?.page ?? 1, state?.search); return; }
    const eventMatch = /^event:([0-9a-f-]{36})$/.exec(data);
    if (eventMatch) { await showEvent(ctx, api(), eventMatch[1]!); return; }
    const buyMatch = /^buy:(ticket|table):([0-9a-f-]{36})$/.exec(data);
    if (buyMatch) { await preparePurchase(ctx, api(), pending, buyMatch[1] as "ticket" | "table", buyMatch[2]!); return; }
    const confirmMatch = /^confirm:(ticket|table):([0-9a-f-]{36})$/.exec(data);
    if (confirmMatch) { await confirmPurchase(ctx, api(), pending, confirmMatch[1] as "ticket" | "table", confirmMatch[2]!); return; }
  });
  return bot;
}

async function showEvents(
  ctx: Context,
  api: BotApiClient,
  state: Map<number, EventListState>,
  page: number,
  search = "",
): Promise<void> {
  try {
    const normalizedSearch = search.trim();
    const result = await api.events(page, "recent", normalizedSearch || undefined);
    if (ctx.from) state.set(ctx.from.id, { page, search: normalizedSearch });
    if (!result.items.length) { await ctx.reply(normalizedSearch ? ru.bot.searchNoResults : ru.bot.noEvents); return; }
    const keyboard = new InlineKeyboard();
    for (const event of result.items.slice(0, 6)) keyboard.text(event.title.slice(0, 55), `event:${event.id}`).row();
    if (page > 1) keyboard.text(ru.bot.previous, "events:prev");
    if (result.hasNext) keyboard.text(ru.bot.next, "events:next");
    const heading = normalizedSearch ? `${ru.bot.searchResults}: ${normalizedSearch}` : ru.bot.events;
    await ctx.reply(`${heading}\n\n${formatEventList(result.items.slice(0, 6))}`, { reply_markup: keyboard });
  } catch { await ctx.reply(ru.bot.unavailable); }
}

async function showEvent(ctx: Context, api: BotApiClient, id: string): Promise<void> {
  try {
    const event = await api.event(id);
    const keyboard = new InlineKeyboard();
    for (const ticket of event.ticketTypes.filter((item) => item.status === "active" && item.remaining > 0)) keyboard.text(`${ru.bot.ticketOption}: ${ticket.name}`, `buy:ticket:${ticket.id}`).row();
    for (const table of event.tables.filter((item) => item.availability === "available")) keyboard.text(`${ru.bot.tableOption}: ${table.name ?? table.number}`, `buy:table:${table.id}`).row();
    keyboard.text(ru.bot.back, "events:back");
    await ctx.reply(formatEventDetails(event), { reply_markup: keyboard });
  } catch { await ctx.reply(ru.bot.eventNotFound); }
}

async function preparePurchase(ctx: Context, api: BotApiClient, pending: Map<number, PendingPurchase>, kind: "ticket" | "table", itemId: string): Promise<void> {
  if (!isPrivateChat(ctx) || !ctx.from || !ctx.chat) { await ctx.reply(ru.bot.privateOnly); return; }
  try {
    const session = await api.quickSession(ctx.from.first_name ?? "Гость", ctx.from.id, ctx.chat.id);
    pending.set(ctx.from.id, { kind, itemId, sessionToken: session.sessionToken, accessToken: session.accessToken, key: `tg-${ctx.from.id}-${Date.now()}` });
    const termsMessage = await ctx.reply(ru.bot.terms, { reply_markup: new InlineKeyboard().text(ru.bot.confirm, `confirm:${kind}:${itemId}`) });
    await api.setQuickDeliveryMessage(session.sessionToken, ctx.from.id, ctx.chat.id, termsMessage.message_id);
  } catch { await ctx.reply(ru.bot.unavailable); }
}

async function confirmPurchase(ctx: Context, api: BotApiClient, pending: Map<number, PendingPurchase>, kind: "ticket" | "table", itemId: string): Promise<void> {
  if (!isPrivateChat(ctx) || !ctx.from) { await ctx.reply(ru.bot.privateOnly); return; }
  const item = pending.get(ctx.from.id);
  if (!item || item.kind !== kind || item.itemId !== itemId) { await ctx.reply(ru.bot.expired); return; }
  try {
    const result = await api.quickCheckout(item.sessionToken, item.key, kind, itemId);
    if (result.paymentLink) await ctx.reply(`${ru.bot.purchaseCreated}\n${ru.bot.paymentPending}\n${result.paymentLink}`);
    else await ctx.reply(ru.bot.paymentPaid);
  } catch { await ctx.reply(ru.bot.unavailable); }
}

async function showTickets(ctx: Context, api: BotApiClient): Promise<void> {
  if (!isPrivateChat(ctx) || !ctx.from || !ctx.chat) { await ctx.reply(ru.bot.privateOnly); return; }
  try {
    const result = await api.tickets(ctx.from.id, ctx.chat.id);
    if (!result.items.length) { await ctx.reply(ru.bot.noTickets); return; }
    for (const ticket of result.items) {
      await ctx.reply(`${ticket.eventTitle}\n${ticket.ticketTypeName}\n${ticket.status}`);
      try { await sendQr(ctx, await api.qr(ticket.id, ctx.from.id, ctx.chat.id, ticket.anonymous)); } catch { await ctx.reply(ru.bot.unavailable); }
    }
  } catch (error) { await ctx.reply(error instanceof Error && error.message.includes("BOT_API_404") ? ru.bot.identityNotLinked : ru.bot.unavailable); }
}

async function sendQr(ctx: Context, buffer: Buffer): Promise<void> { await ctx.replyWithPhoto(new InputFile(buffer, "ticket.png"), { caption: ru.bot.qrCaption }); }

async function welcomeForContext(ctx: Context, api: BotApiClient): Promise<string> {
  return formatWelcome(await roleForContext(ctx, api));
}

async function helpForContext(ctx: Context, api: BotApiClient): Promise<string> {
  return formatHelp(await roleForContext(ctx, api));
}

async function roleForContext(ctx: Context, api: BotApiClient): Promise<BotRole> {
  if (!isPrivateChat(ctx) || !ctx.from || !ctx.chat) return "guest";
  try {
    return (await api.identity(ctx.from.id, ctx.chat.id)).user.role;
  } catch {
    return "guest";
  }
}

export function parseSearchQuery(text: string | undefined): string {
  const match = /^\/search(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*?))?\s*$/.exec(text ?? "");
  return match?.[1]?.trim().replace(/\s+/g, " ") ?? "";
}
