import { describe, expect, it } from "vitest";

import { verifyTelegramWebhookSecret } from "./webhook.js";

describe("Telegram webhook secret", () => {
  it("accepts only an exact configured secret", () => {
    expect(verifyTelegramWebhookSecret("x".repeat(32), "x".repeat(32))).toBe(true);
    expect(verifyTelegramWebhookSecret("x".repeat(31), "x".repeat(32))).toBe(false);
    expect(verifyTelegramWebhookSecret(undefined, "x".repeat(32))).toBe(false);
    expect(verifyTelegramWebhookSecret("x".repeat(32), undefined)).toBe(false);
  });
});
