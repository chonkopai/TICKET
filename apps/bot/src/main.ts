import { createHash } from "node:crypto";

import { loadBotEnv } from "@event-platform/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { webhookCallback } from "grammy";

import { createBot } from "./bot.js";
import { verifyTelegramWebhookSecret } from "./webhook.js";

const env = loadBotEnv();
if (!env.TELEGRAM_WEBHOOK_SECRET) throw new Error("TELEGRAM_WEBHOOK_SECRET must be configured separately from BOT_API_SECRET");
const bot = createBot(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_BOT_USERNAME, { apiBaseUrl: env.API_BASE_URL, botApiSecret: env.BOT_API_SECRET });
const botId = env.TELEGRAM_BOT_TOKEN.split(":")[0] ?? env.TELEGRAM_BOT_USERNAME;
const telegramHandler = webhookCallback(bot, "express");
const app = express();

app.get("/health", (_request, response) => { response.status(200).json({ status: "ok" }); });

// Keep the exact raw bytes for the inbox hash and reject unauthenticated updates before grammY.
app.post("/telegram/webhook", express.raw({ type: "application/json", limit: "256kb" }), async (request, response, next) => {
  const provided = request.header("x-telegram-bot-api-secret-token");
  if (!verifyTelegramWebhookSecret(provided, env.TELEGRAM_WEBHOOK_SECRET)) { response.status(401).json({ code: "TELEGRAM_WEBHOOK_UNAUTHORIZED" }); return; }
  const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
  let update: { update_id?: number };
  try { update = JSON.parse(raw.toString("utf8")) as { update_id?: number }; }
  catch { response.status(400).json({ code: "TELEGRAM_UPDATE_INVALID" }); return; }
  if (!Number.isSafeInteger(update.update_id) || update.update_id! < 0) { response.status(400).json({ code: "TELEGRAM_UPDATE_INVALID" }); return; }
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  const headers = { "content-type": "application/json", "x-bot-api-secret": env.BOT_API_SECRET };
  try {
    const claimResponse = await fetch(new URL("/bot/updates/claim", env.API_BASE_URL), { method: "POST", headers, body: JSON.stringify({ botId, updateId: String(update.update_id), payloadHash }) });
    if (!claimResponse.ok) { response.status(503).json({ code: "TELEGRAM_INBOX_UNAVAILABLE" }); return; }
    const claim = await claimResponse.json() as { process?: boolean; retry?: boolean };
    if (claim.retry === true) { response.status(503).json({ code: "TELEGRAM_UPDATE_IN_PROGRESS" }); return; }
    if (claim.process !== true) { response.status(200).json({ ok: true, duplicate: true }); return; }
    request.body = update;
    let handlerError: unknown;
    try { await telegramHandler(request, response); } catch (error) { handlerError = error; }
    const complete = await fetch(new URL("/bot/updates/complete", env.API_BASE_URL), { method: "POST", headers, body: JSON.stringify({ botId, updateId: String(update.update_id), payloadHash, failed: Boolean(handlerError) }) });
    if (!complete.ok) console.error("Telegram inbox completion failed");
    if (handlerError) next(handlerError);
  } catch (error) { next(error); }
});

app.use(express.json());
app.use((_error: unknown, _request: Request, response: Response, _next: NextFunction) => { console.error("Telegram webhook failed"); response.status(500).json({ status: "error" }); });

const server = app.listen(env.BOT_PORT, "0.0.0.0", () => { console.log(`Telegram webhook listening on http://localhost:${env.BOT_PORT}/telegram/webhook`); });
function shutdown(): void { server.close((error) => { if (error) { console.error("Bot server shutdown failed", error); process.exitCode = 1; } }); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
