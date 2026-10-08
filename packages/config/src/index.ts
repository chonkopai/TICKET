import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

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
  OTP_HMAC_SECRET: z.string().min(32).optional(),
  RESEND_API_KEY: z.string().regex(/^re_[A-Za-z0-9_]+$/).optional(),
  RESEND_FROM_EMAIL: z.email().optional(),
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

export const translationEnvSchema = z.object({
  TRANSLATION_PROVIDER: z.enum(["google", "azure"]).default("google"),
  AZURE_TRANSLATOR_KEY: z.preprocess(value => typeof value === "string" && !value.trim() ? undefined : value, z.string().trim().min(1).max(512).optional()),
  AZURE_TRANSLATOR_REGION: z.string().trim().regex(/^[a-z0-9-]+$/).default("global"),
  GOOGLE_TRANSLATE_API_KEY: z.preprocess(value => typeof value === "string" && !value.trim() ? undefined : value, z.string().trim().min(1).max(512).optional()),
  TRANSLATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  TRANSLATION_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  TRANSLATION_HOURLY_REQUESTS: z.coerce.number().int().min(1).max(100).default(20),
  TRANSLATION_DAILY_CHARACTERS: z.coerce.number().int().min(1).max(1000000).default(100000),
  TRANSLATION_CACHE_SECONDS: z.coerce.number().int().min(60).max(604800).default(604800),
});
export function loadTranslationEnv(source:NodeJS.ProcessEnv=process.env){return translationEnvSchema.parse(source);}

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  DEMO_MODE: booleanSchema,
  API_PORT: portSchema.default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^redis(?:s)?$/ }),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  BOT_API_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().endsWith(".apps.googleusercontent.com").optional(),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  ORGANIZER_REQUIRES_APPROVAL: booleanSchema,
  EVENT_CONTENT_V2_ENABLED: booleanSchema,
  TRANSACTIONAL_NOTIFICATIONS_ENABLED: booleanSchema,
  POSTER_STORAGE_DIR: z.string().min(1).default("var/posters"),
  DRAFT_MEDIA_STORAGE_DIR: z.string().min(1).default("var/draft-media"),
  MEDIA_FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  MEDIA_FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  MEDIA_IMAGE_MAX_BYTES: z.coerce.number().int().positive().max(104857600).default(10485760),
  MEDIA_VIDEO_MAX_BYTES: z.coerce.number().int().positive().max(1073741824).default(104857600),
  MEDIA_VIDEO_MAX_SECONDS: z.coerce.number().positive().max(600).default(60),
  MEDIA_DRAFT_MAX_BYTES: z.coerce.number().int().positive().max(2147483647).default(262144000),
  TABLE_HOLD_TTL_SECONDS: z.coerce.number().int().min(30).max(86_400).default(600),
  TABLE_HOLD_CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3_600).default(60),
  CHECKOUT_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  CHECKOUT_CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3_600).default(60),
  PAYMENT_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
  QUICK_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  QUICK_ACCESS_TTL_SECONDS: z.coerce.number().int().min(3600).max(31_536_000).default(2_592_000),
  QUICK_CLAIM_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  ...providerSchema.shape,
  ...translationEnvSchema.shape,
}).superRefine((env, context) => {
  if (env.RESEND_API_KEY && !env.RESEND_FROM_EMAIL) context.addIssue({ code: "custom", path: ["RESEND_FROM_EMAIL"], message: "Resend sender is required with an API key" });
  if (env.RESEND_FROM_EMAIL && !env.RESEND_FROM_EMAIL.toLowerCase().endsWith("@mail.ticketron.live")) context.addIssue({ code: "custom", path: ["RESEND_FROM_EMAIL"], message: "Sender must use the verified mail.ticketron.live domain" });
  if (env.NODE_ENV === "production" && !env.OTP_HMAC_SECRET) context.addIssue({ code: "custom", path: ["OTP_HMAC_SECRET"], message: "OTP HMAC secret is required in production" });
  if (env.NODE_ENV === "production" && env.PAYMENT_PROVIDER_NAME === "mock" && !env.DEMO_MODE) context.addIssue({ code: "custom", path: ["DEMO_MODE"], message: "Mock payments require explicit demo mode in production" });
  if (env.NODE_ENV !== "production") return;
  if (!env.WEB_ORIGIN.startsWith("https://")) context.addIssue({ code: "custom", path: ["WEB_ORIGIN"], message: "Production web origin must use HTTPS" });
  if (!isAbsolute(env.POSTER_STORAGE_DIR)) context.addIssue({ code: "custom", path: ["POSTER_STORAGE_DIR"], message: "Production media directory must be an absolute mounted path" });
  if (!isAbsolute(env.DRAFT_MEDIA_STORAGE_DIR)) context.addIssue({ code: "custom", path: ["DRAFT_MEDIA_STORAGE_DIR"], message: "Production draft media directory must be an absolute private mounted path" });
  if (new Set([env.JWT_SECRET, env.JWT_REFRESH_SECRET, env.BOT_API_SECRET]).size !== 3) context.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "Production authentication secrets must be distinct" });
});

export const botEnvSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  BOT_PORT: portSchema.default(3002),
  API_BASE_URL: z.url(),
  WEB_ORIGIN: z.url().optional(),
  BOT_API_SECRET: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production" && (!env.WEB_ORIGIN || !env.WEB_ORIGIN.startsWith("https://"))) context.addIssue({ code: "custom", path: ["WEB_ORIGIN"], message: "Telegram webhook requires a public HTTPS origin" });
});

export const webEnvSchema = z.object({
  YANDEX_GEOCODER_API_KEY: z.string().optional(),
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().endsWith(".apps.googleusercontent.com").optional(),
  NODE_ENV: nodeEnvironmentSchema,
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production" && !env.NEXT_PUBLIC_API_URL.startsWith("https://")) context.addIssue({ code: "custom", path: ["NEXT_PUBLIC_API_URL"], message: "Browser API origin must use HTTPS" });
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
