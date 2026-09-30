import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import type { Prisma, PrismaClient, VerificationPurpose } from "@event-platform/database";
import { BadRequestException, HttpException, Inject, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";

import { DATABASE_CLIENT } from "./auth.constants.js";
import { normalizeContact, type ContactMethod } from "./contact-identity.js";
import { VERIFICATION_CONFIG, VERIFICATION_SENDER, type VerificationConfig } from "./verification.tokens.js";
import type { VerificationSender } from "./verification-sender.js";

const CODE_TTL_MS = 5 * 60_000;
const GRANT_TTL_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

export interface VerificationContext {
  purpose: VerificationPurpose;
  method: ContactMethod;
  target: string;
  userId?: string;
  sessionFamilyId?: string;
}

export interface IssueVerification extends VerificationContext {
  /** Trusted network address, never an untrusted forwarded header. */
  clientKey: string;
}

export interface VerifyCode extends VerificationContext {
  challengeId: string;
  code: string;
  clientKey: string;
}

export interface ClaimGrant extends VerificationContext {
  grant: string;
}

@Injectable()
export class VerificationService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(VERIFICATION_CONFIG) private readonly config: VerificationConfig,
    @Inject(VERIFICATION_SENDER) private readonly sender: VerificationSender,
  ) {
    if (config.hmacSecret.length < 32) throw new Error("OTP_HMAC_SECRET must contain at least 32 characters");
  }

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => { void this.cleanupExpired().catch(() => undefined); }, 30 * 60_000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async issue(input: IssueVerification): Promise<{ challengeId: string; expiresAt: string; retryAfterSeconds: number }> {
    const target = normalizeContact(input.method, input.target);
    this.validateContext(input);
    if (!this.sender.available(input.method)) throw new ServiceUnavailableException({ code: "VERIFICATION_PROVIDER_UNAVAILABLE" });
    const now = new Date();
    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    const scope = { ...input, target };
    const result = await this.db.$transaction(async tx => {
      const allowed = await this.applyLimits(tx, this.issueLimitKeys(scope), now);
      if (!allowed) return false;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`otp:${input.purpose}:${input.method}:${target}`}, 0))`;
      const active = await tx.verificationChallenge.findFirst({
        where: { purpose: input.purpose, method: input.method, normalizedTarget: target, userId: input.userId ?? null, sessionFamilyId: input.sessionFamilyId ?? null, consumedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      });
      if (active?.lastSentAt && now.getTime() - active.lastSentAt.getTime() < COOLDOWN_MS) return false;
      await tx.verificationChallenge.updateMany({
        where: { purpose: input.purpose, method: input.method, normalizedTarget: target, userId: input.userId ?? null, sessionFamilyId: input.sessionFamilyId ?? null, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.verificationChallenge.create({ data: {
        id, purpose: input.purpose, method: input.method, normalizedTarget: target,
        userId: input.userId ?? null, sessionFamilyId: input.sessionFamilyId ?? null,
        secretVerifier: this.codeVerifier(id, input.purpose, target, code),
        expiresAt, lastSentAt: now, sendCount: 1,
      } });
      return true;
    });
    if (!result) throw new HttpException({ code: "VERIFICATION_RATE_LIMITED", retryAfterSeconds: 60 }, 429);
    try {
      await this.sender.send({ method: input.method, target, code, idempotencyKey: `otp/${id}` });
    } catch {
      await this.db.verificationChallenge.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
      throw new ServiceUnavailableException({ code: "VERIFICATION_SEND_FAILED" });
    }
    return { challengeId: id, expiresAt: expiresAt.toISOString(), retryAfterSeconds: 60 };
  }

  async verify(input: VerifyCode): Promise<{ grant: string; expiresAt: string }> {
    const target = normalizeContact(input.method, input.target);
    this.validateContext(input);
    if (!/^\d{6}$/.test(input.code)) throw new BadRequestException({ code: "INVALID_VERIFICATION_CODE" });
    const grant = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + GRANT_TTL_MS);
    const result = await this.db.$transaction(async tx => {
      const allowed = await this.applyLimits(tx, this.verifyLimitKeys({ ...input, target }), now);
      if (!allowed) return "rate";
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`otp-challenge:${input.challengeId}`}, 0))`;
      const row = await tx.verificationChallenge.findUnique({ where: { id: input.challengeId } });
      if (!row || row.purpose !== input.purpose || row.method !== input.method || row.normalizedTarget !== target || row.userId !== (input.userId ?? null) || row.sessionFamilyId !== (input.sessionFamilyId ?? null) || row.consumedAt || row.expiresAt <= now || row.failedAttempts >= MAX_ATTEMPTS) return "invalid";
      const expected = Buffer.from(row.secretVerifier, "hex");
      const actual = Buffer.from(this.codeVerifier(row.id, row.purpose, target, input.code), "hex");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        await tx.verificationChallenge.update({ where: { id: row.id }, data: { failedAttempts: { increment: 1 } } });
        return "invalid";
      }
      await tx.verificationChallenge.update({ where: { id: row.id }, data: { consumedAt: now } });
      await tx.verificationGrant.create({ data: {
        challengeId: row.id, tokenHash: hash(grant), purpose: row.purpose, method: row.method,
        normalizedTarget: row.normalizedTarget, userId: row.userId, sessionFamilyId: row.sessionFamilyId, expiresAt,
      } });
      return "valid";
    });
    if (result === "rate") throw new HttpException({ code: "VERIFICATION_RATE_LIMITED" }, 429);
    if (result !== "valid") throw new BadRequestException({ code: "INVALID_VERIFICATION_CODE" });
    return { grant, expiresAt: expiresAt.toISOString() };
  }

  /** Call inside the account/order transaction so a grant and its effect commit together. */
  async claimGrant(tx: Prisma.TransactionClient, input: ClaimGrant): Promise<{ method: ContactMethod; target: string }> {
    const target = normalizeContact(input.method, input.target);
    this.validateContext(input);
    const row = await tx.verificationGrant.findUnique({ where: { tokenHash: hash(input.grant) } });
    const now = new Date();
    if (!row || row.purpose !== input.purpose || row.method !== input.method || row.normalizedTarget !== target || row.userId !== (input.userId ?? null) || row.sessionFamilyId !== (input.sessionFamilyId ?? null) || row.consumedAt || row.expiresAt <= now) throw new BadRequestException({ code: "INVALID_VERIFICATION_GRANT" });
    const claimed = await tx.verificationGrant.updateMany({ where: { id: row.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (claimed.count !== 1) throw new BadRequestException({ code: "INVALID_VERIFICATION_GRANT" });
    return { method: row.method, target: row.normalizedTarget };
  }

  async cleanupExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
    await this.db.verificationChallenge.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    await this.db.verificationRateLimit.deleteMany({ where: { windowEnd: { lt: cutoff } } });
  }

  async enforceCredentialLimit(method: ContactMethod, target: string, clientKey: string): Promise<void> {
    const normalized = normalizeContact(method, target);
    const now = new Date();
    const allowed = await this.db.$transaction(tx => this.applyLimits(tx, [
      [this.key("login-target", `${method}:${normalized}`), 20],
      [this.key("login-client", clientKey), 100],
    ], now));
    if (!allowed) throw new HttpException({ code: "LOGIN_RATE_LIMITED" }, 429);
  }

  providerAvailable(method: ContactMethod): boolean { return this.sender.available(method); }

  private validateContext(input: VerificationContext): void {
    if (input.purpose === "link" && (!input.userId || !input.sessionFamilyId)) throw new BadRequestException({ code: "SESSION_REQUIRED" });
    if (input.purpose === "checkout_email" && !input.sessionFamilyId) throw new BadRequestException({ code: "CHECKOUT_SESSION_REQUIRED" });
    if (input.method === "phone" && input.purpose === "checkout_email") throw new BadRequestException({ code: "EMAIL_REQUIRED" });
  }

  private codeVerifier(id: string, purpose: VerificationPurpose, target: string, code: string): string {
    return createHmac("sha256", this.config.hmacSecret).update(`${id}:${purpose}:${target}:${code}`).digest("hex");
  }

  private key(label: string, value: string): string {
    return `${label}:${createHmac("sha256", this.config.hmacSecret).update(value).digest("hex")}`;
  }

  private issueLimitKeys(input: IssueVerification): Array<[string, number]> {
    return [
      [this.key("target", `${input.method}:${input.target}`), 5],
      [this.key("client", input.clientKey), 20],
      [this.key("actor", input.userId ?? input.sessionFamilyId ?? input.clientKey), 10],
      [this.key("global", "send"), 1000],
    ];
  }

  private verifyLimitKeys(input: VerifyCode): Array<[string, number]> {
    return [
      [this.key("verify-target", `${input.method}:${input.target}`), 25],
      [this.key("verify-client", input.clientKey), 60],
    ];
  }

  private async applyLimits(tx: Prisma.TransactionClient, limits: Array<[string, number]>, now: Date): Promise<boolean> {
    let allowed = true;
    for (const [scopeKey, max] of limits.sort(([a], [b]) => a.localeCompare(b))) {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`otp-limit:${scopeKey}`}, 0))`;
      const existing = await tx.verificationRateLimit.findUnique({ where: { scopeKey } });
      const count = !existing || existing.windowEnd <= now ? 1 : existing.count + 1;
      const windowEnd = !existing || existing.windowEnd <= now ? new Date(now.getTime() + 60 * 60_000) : existing.windowEnd;
      await tx.verificationRateLimit.upsert({ where: { scopeKey }, create: { scopeKey, count, windowEnd }, update: { count, windowEnd } });
      if (count > max) allowed = false;
    }
    return allowed;
  }
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
