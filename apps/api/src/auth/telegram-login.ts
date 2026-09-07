import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { TelegramLoginPayload } from "@event-platform/shared-types";

export interface TelegramVerificationOptions {
  now?: Date;
  maxAgeSeconds?: number;
  futureToleranceSeconds?: number;
}

export function verifyTelegramLogin(
  payload: TelegramLoginPayload,
  botToken: string,
  options: TelegramVerificationOptions = {},
): boolean {
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  const maxAgeSeconds = options.maxAgeSeconds ?? 300;
  const futureToleranceSeconds = options.futureToleranceSeconds ?? 30;

  if (!Number.isSafeInteger(payload.id) || payload.id <= 0) return false;
  if (!Number.isSafeInteger(payload.auth_date)) return false;
  if (payload.auth_date < nowSeconds - maxAgeSeconds) return false;
  if (payload.auth_date > nowSeconds + futureToleranceSeconds) return false;
  if (!/^[a-fA-F0-9]{64}$/.test(payload.hash)) return false;

  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const receivedHash = Buffer.from(payload.hash, "hex");

  return receivedHash.length === expectedHash.length && timingSafeEqual(receivedHash, expectedHash);
}
