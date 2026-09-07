import { loadBotEnv } from "@event-platform/config";

const env = loadBotEnv();
if (!env.TELEGRAM_WEBHOOK_SECRET) throw new Error("TELEGRAM_WEBHOOK_SECRET must be configured separately from BOT_API_SECRET");
const origin = process.env.WEB_ORIGIN;
if (!origin || new URL(origin).protocol !== "https:") throw new Error("WEB_ORIGIN must be the public HTTPS website URL");
const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: new URL("/telegram/webhook", origin).toString(), secret_token: env.TELEGRAM_WEBHOOK_SECRET }),
});
const result = await response.json() as { ok?: boolean };
if (!result.ok) throw new Error("Telegram webhook registration failed");
console.log("Telegram webhook registered with secret verification. No updates were discarded.");
