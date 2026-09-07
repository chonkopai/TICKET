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
});
