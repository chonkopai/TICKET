import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { loadApiEnv, loadBotEnv, loadWebEnv } from "./index.js";

describe("environment loaders", () => {
  it("loads and coerces API configuration", () => {
    const env = loadApiEnv({
      API_PORT: "3101",
      DATABASE_URL: "postgresql://user:password@localhost:5432/event_platform",
      JWT_SECRET: "a-secure-development-secret-with-32-chars",
      JWT_REFRESH_SECRET: "a-separate-refresh-secret-with-32-characters",
      REDIS_URL: "redis://localhost:6379",
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      TELEGRAM_BOT_USERNAME: "event_platform_bot",
      BOT_API_SECRET: "a-secure-bot-api-secret-with-32-characters",
    });

    expect(env.API_PORT).toBe(3101);
    expect(env.PAYMENT_PROVIDER_NAME).toBe("mock");
    expect(env.TABLE_HOLD_TTL_SECONDS).toBe(600);
    expect(env.TABLE_HOLD_CLEANUP_INTERVAL_SECONDS).toBe(60);
    expect(env.CHECKOUT_TTL_SECONDS).toBe(900);
    expect(env.CHECKOUT_CLEANUP_INTERVAL_SECONDS).toBe(60);
    expect(env.TRANSACTIONAL_NOTIFICATIONS_ENABLED).toBe(false);
    expect(loadApiEnv({
      API_PORT: "3101",
      DATABASE_URL: "postgresql://user:password@localhost:5432/event_platform",
      JWT_SECRET: "a-secure-development-secret-with-32-chars",
      JWT_REFRESH_SECRET: "a-separate-refresh-secret-with-32-characters",
      REDIS_URL: "redis://localhost:6379",
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      TELEGRAM_BOT_USERNAME: "event_platform_bot",
      BOT_API_SECRET: "a-secure-bot-api-secret-with-32-characters",
      TRANSACTIONAL_NOTIFICATIONS_ENABLED: "true",
    }).TRANSACTIONAL_NOTIFICATIONS_ENABLED).toBe(true);
  });

  it("rejects an insecure JWT secret", () => {
    expect(() =>
      loadApiEnv({
        DATABASE_URL: "postgresql://user:password@localhost:5432/event_platform",
        JWT_SECRET: "short",
        JWT_REFRESH_SECRET: "a-separate-refresh-secret-with-32-characters",
        REDIS_URL: "redis://localhost:6379",
        TELEGRAM_BOT_TOKEN: "123456:test-token",
        TELEGRAM_BOT_USERNAME: "event_platform_bot",
        BOT_API_SECRET: "a-secure-bot-api-secret-with-32-characters",
      }),
    ).toThrow(ZodError);
  });

  it("loads surface-specific web and bot configuration", () => {
    expect(
      loadWebEnv({
        NEXT_PUBLIC_API_URL: "http://localhost:3001",
        NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "event_platform_bot",
      }).NODE_ENV,
    ).toBe("development");
    expect(
      loadBotEnv({
        API_BASE_URL: "http://localhost:3001",
        BOT_API_SECRET: "a-secure-bot-api-secret-with-32-characters",
        TELEGRAM_BOT_TOKEN: "123456:test-token",
        TELEGRAM_BOT_USERNAME: "event_platform_bot",
        TELEGRAM_WEBHOOK_SECRET: "a-dedicated-webhook-secret-with-32-characters",
      }).BOT_PORT,
    ).toBe(3002);
  });

  it("rejects insecure production origins and ephemeral relative media paths", () => {
    expect(() => loadApiEnv({
      NODE_ENV: "production", DATABASE_URL: "postgresql://user:password@localhost:5432/event_platform", REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "a".repeat(32), JWT_REFRESH_SECRET: "b".repeat(32), BOT_API_SECRET: "c".repeat(32),
      TELEGRAM_BOT_TOKEN: "123456:test-token", TELEGRAM_BOT_USERNAME: "event_platform_bot", WEB_ORIGIN: "http://example.com", POSTER_STORAGE_DIR: "var/posters",
    })).toThrow(ZodError);
    expect(() => loadWebEnv({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: "http://example.com", NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "event_platform_bot" })).toThrow(ZodError);
  });

  it("rejects a Resend key without the verified sender domain", () => {
    const base = {
      DATABASE_URL: "postgresql://user:password@localhost:5432/event_platform", REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "a".repeat(32), JWT_REFRESH_SECRET: "b".repeat(32), BOT_API_SECRET: "c".repeat(32),
      TELEGRAM_BOT_TOKEN: "123456:test-token", TELEGRAM_BOT_USERNAME: "event_platform_bot", RESEND_API_KEY: "re_testkey",
    };
    expect(() => loadApiEnv(base)).toThrow(ZodError);
    expect(() => loadApiEnv({ ...base, RESEND_FROM_EMAIL: "tickets@other.example" })).toThrow(ZodError);
    expect(loadApiEnv({ ...base, RESEND_FROM_EMAIL: "tickets@mail.ticketron.live" }).RESEND_FROM_EMAIL).toBe("tickets@mail.ticketron.live");
  });
});
