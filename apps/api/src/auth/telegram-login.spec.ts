import { createHash, createHmac } from "node:crypto";

import type { TelegramLoginPayload } from "@event-platform/shared-types";
import { describe, expect, it } from "vitest";

import { verifyTelegramLogin } from "./telegram-login.js";

const botToken = "123456789:unit-test-bot-token";
const now = new Date("2026-09-02T04:00:00.000Z");

function signedPayload(overrides: Partial<TelegramLoginPayload> = {}): TelegramLoginPayload {
  const unsigned = {
    id: 123_456_789,
    first_name: "Ada",
    last_name: "Lovelace",
    username: "ada",
    photo_url: "https://example.com/ada.jpg",
    auth_date: Math.floor(now.getTime() / 1_000),
    ...overrides,
  };
  const dataCheckString = Object.entries(unsigned)
    .filter(([key, value]) => key !== "hash" && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return { ...unsigned, hash };
}

describe("verifyTelegramLogin", () => {
  it("accepts a correctly signed fresh payload", () => {
    expect(verifyTelegramLogin(signedPayload(), botToken, { now })).toBe(true);
  });

  it("rejects tampered profile data", () => {
    const payload = signedPayload();
    expect(verifyTelegramLogin({ ...payload, first_name: "Mallory" }, botToken, { now })).toBe(
      false,
    );
  });

  it("rejects an expired payload", () => {
    const authDate = Math.floor(now.getTime() / 1_000) - 301;
    expect(verifyTelegramLogin(signedPayload({ auth_date: authDate }), botToken, { now })).toBe(
      false,
    );
  });
});
