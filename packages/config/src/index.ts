import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]).default("development");
const portSchema = z.coerce.number().int().min(1).max(65_535);
const booleanSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const providerSchema = z.object({
  PAYMENT_PROVIDER_NAME: z.string().default("mock"),
  PAYMENT_PROVIDER_API_KEY: z.string().optional(),
  PAYMENT_PROVIDER_WEBHOOK_SECRET: z.string().optional(),
  SMS_PROVIDER_NAME: z.string().optional(),
  SMS_PROVIDER_API_KEY: z.string().optional(),
  SMS_PROVIDER_SENDER_ID: z.string().optional(),
  PUSH_PROVIDER_NAME: z.string().optional(),
  PUSH_PROVIDER_API_KEY: z.string().optional(),
  PUSH_PROVIDER_PROJECT_ID: z.string().optional(),
  APPLE_WALLET_PASS_TYPE_ID: z.string().optional(),
  APPLE_WALLET_TEAM_ID: z.string().optional(),
  APPLE_WALLET_ORGANIZATION_NAME: z.string().optional(),
  APPLE_WALLET_SIGNER_CERT_PATH: z.string().optional(),
  APPLE_WALLET_SIGNER_KEY_PATH: z.string().optional(),
  APPLE_WALLET_SIGNER_KEY_PASSWORD: z.string().optional(),
  APPLE_WALLET_WWDR_CERT_PATH: z.string().optional(),
  APPLE_WALLET_ICON_PATH: z.string().optional(),
});

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  API_PORT: portSchema.default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^redis(?:s)?$/ }),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  BOT_API_SECRET: z.string().min(32),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  ORGANIZER_REQUIRES_APPROVAL: booleanSchema,
  POSTER_STORAGE_DIR: z.string().min(1).default("var/posters"),
  TABLE_HOLD_TTL_SECONDS: z.coerce.number().int().min(30).max(86_400).default(600),
  TABLE_HOLD_CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3_600).default(60),
  CHECKOUT_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  CHECKOUT_CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3_600).default(60),
  PAYMENT_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
  QUICK_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  QUICK_ACCESS_TTL_SECONDS: z.coerce.number().int().min(3600).max(31_536_000).default(2_592_000),
  QUICK_CLAIM_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  ...providerSchema.shape,
});

export const botEnvSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  BOT_PORT: portSchema.default(3002),
  API_BASE_URL: z.url(),
  BOT_API_SECRET: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
});

export const webEnvSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type BotEnv = z.infer<typeof botEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

let environmentFilesLoaded = false;

function loadEnvironmentFiles(): void {
  if (environmentFilesLoaded) return;

  const explicitPath = process.env.ENV_FILE;
  const candidates = explicitPath
    ? [resolve(explicitPath)]
    : [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];

  for (const path of candidates) {
    if (existsSync(path)) loadDotenv({ path, override: false, quiet: true });
  }

  environmentFilesLoaded = true;
}

function prepare(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (source === process.env) loadEnvironmentFiles();
  return source;
}

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return apiEnvSchema.parse(prepare(source));
}

export function loadBotEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  return botEnvSchema.parse(prepare(source));
}

export function loadWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return webEnvSchema.parse(prepare(source));
}
