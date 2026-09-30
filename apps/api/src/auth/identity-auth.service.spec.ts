import { createHash, createHmac, randomInt, randomUUID } from "node:crypto";

import { createPrismaClient, type PrismaClient } from "@event-platform/database";
import { UnauthorizedException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthService } from "./auth.service.js";
import { IdentityAuthService } from "./identity-auth.service.js";
import { TokenService } from "./token.service.js";
import { TelegramLinkService } from "./telegram-link.service.js";
import { VerificationService } from "./verification.service.js";
import type { VerificationMessage, VerificationSender } from "./verification-sender.js";

const testUrl = process.env.VERIFICATION_TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration("multi-channel identity API against isolated PostgreSQL", () => {
  let db: PrismaClient;
  let verification: VerificationService;
  let identity: IdentityAuthService;
  let auth: AuthService;
  let tokens: TokenService;
  const sent: VerificationMessage[] = [];
  const sender: VerificationSender = { available: () => true, send: async message => { sent.push(message); } };

  beforeAll(() => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testUrl;
    db = createPrismaClient();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    verification = new VerificationService(db, { hmacSecret: "test-only-verification-hmac-secret-long-enough" }, sender);
    tokens = new TokenService(db, { accessTokenSecret: "a".repeat(32), refreshTokenSecret: "b".repeat(32) } as never);
    identity = new IdentityAuthService(db, tokens, verification);
    auth = new AuthService(db, { organizerRequiresApproval: false, telegramBotToken: "test-telegram-bot-token" } as never, tokens, {} as TelegramLinkService);
  });
  afterAll(async () => { await db?.$disconnect(); });

  it("registers with email, links phone on one account, then rejects old sessions after reset", async () => {
    const email = `${randomUUID()}@example.com`;
    const phone = `+7701${randomInt(1_000_000, 10_000_000)}`;
    const clientKey = randomUUID();
    const registration = await identity.registerRequest({ method: "email", target: email, clientKey });
    const proof = await identity.registerVerify({ method: "email", target: email, challengeId: registration.challengeId, code: sent.at(-1)!.code, clientKey });
    const account = await identity.registerComplete({ method: "email", target: email, grant: proof.grant, firstName: "Alice", lastName: "Example", password: "correct horse battery" });
    expect(account.user.telegramId).toBeNull();
    const login = await identity.login({ method: "email", target: email, password: "correct horse battery", clientKey });
    expect(login.user.id).toBe(account.user.id);
    const unverifiedProfileEmail = `${randomUUID()}@example.com`;
    await auth.updateMe(account.user.id, { email: unverifiedProfileEmail });
    await expect(identity.login({ method: "email", target: unverifiedProfileEmail, password: "correct horse battery", clientKey })).rejects.toBeInstanceOf(UnauthorizedException);
    const principal = await auth.authenticate(login.tokens.accessToken);
    expect(principal.sessionFamilyId).toBeTruthy();
    const requestedPhone = await identity.requestLink(principal, { method: "phone", target: phone, clientKey });
    const phoneProof = await identity.verifyLink(principal, { method: "phone", target: phone, challengeId: requestedPhone.challengeId, code: sent.at(-1)!.code, clientKey });
    const methods = await identity.completeLink(principal, { method: "phone", target: phone, grant: phoneProof.grant });
    expect(methods.email.linked).toBe(true);
    expect(methods.phone.linked).toBe(true);
    const phoneLogin = await identity.login({ method: "phone", target: phone, password: "correct horse battery", clientKey });
    expect(phoneLogin.user.id).toBe(account.user.id);
    await expect(identity.login({ method: "email", target: email, password: "wrong password", clientKey })).rejects.toBeInstanceOf(UnauthorizedException);
    const resetRequest = await identity.requestPasswordReset({ method: "email", target: email, clientKey });
    const resetProof = await identity.verifyPasswordReset({ method: "email", target: email, challengeId: resetRequest.challengeId, code: sent.at(-1)!.code, clientKey });
    await identity.completePasswordReset({ method: "email", target: email, grant: resetProof.grant, newPassword: "a newer and longer password" });
    await expect(auth.authenticate(login.tokens.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(tokens.rotate(login.tokens.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(identity.completePasswordReset({ method: "email", target: email, grant: resetProof.grant, newPassword: "replayed reset password" })).rejects.toBeTruthy();
    await expect(identity.login({ method: "phone", target: phone, password: "correct horse battery", clientKey })).rejects.toBeInstanceOf(UnauthorizedException);
    const afterReset = await identity.login({ method: "phone", target: phone, password: "a newer and longer password", clientKey });
    expect(afterReset.user.id).toBe(account.user.id);

    const freshPrincipal = await auth.authenticate(afterReset.tokens.accessToken);
    const telegramLinks = new TelegramLinkService(db, { telegramBotUsername: "test_ticket_bot" } as never);
    const telegramLink = await telegramLinks.issue(account.user.id, new Date(), freshPrincipal.sessionFamilyId);
    const telegramId = randomInt(1_000_000_000, 2_000_000_000);
    const pending = await telegramLinks.consume({ token: telegramLink.token, telegramId, chatId: telegramId });
    expect(pending.telegramId).toBeNull();
    expect(await telegramLinks.status(account.user.id, freshPrincipal.sessionFamilyId!, telegramLink.token)).toEqual({ state: "ready" });
    await expect(telegramLinks.confirm(account.user.id, randomUUID(), telegramLink.token)).rejects.toBeInstanceOf(UnauthorizedException);
    const linkedTelegram = await telegramLinks.confirm(account.user.id, freshPrincipal.sessionFamilyId!, telegramLink.token);
    expect(linkedTelegram.id).toBe(account.user.id);
    expect(linkedTelegram.telegramId).toBe(BigInt(telegramId));
    expect((await identity.methods(account.user.id)).telegram.linked).toBe(true);
    const widget = { id: telegramId, first_name: "Telegram Alice", auth_date: Math.floor(Date.now() / 1_000) };
    const secret = createHash("sha256").update("test-telegram-bot-token").digest();
    const data = Object.entries(widget).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
    const telegramLogin = await auth.loginWithTelegram({ ...widget, hash: createHmac("sha256", secret).update(data).digest("hex") });
    expect(telegramLogin.user.id).toBe(account.user.id);
    await identity.changePassword(freshPrincipal, { currentPassword: "a newer and longer password", newPassword: "a third password for this account" });
    await expect(auth.authenticate(afterReset.tokens.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect((await identity.login({ method: "email", target: email, password: "a third password for this account", clientKey })).user.id).toBe(account.user.id);
  });

  it("sets a password on a Telegram-only user's first contact link and preserves it on the second", async () => {
    const user = await db.user.create({ data: { telegramId: BigInt(randomInt(2_000_000_000, 3_000_000_000)), role: "guest", name: "Telegram Guest" } });
    const session = await tokens.issuePair(user);
    const principal = await auth.authenticate(session.accessToken);
    const clientKey = randomUUID();
    const email = `${randomUUID()}@example.com`;
    const requested = await identity.requestLink(principal, { method: "email", target: email, clientKey });
    const proof = await identity.verifyLink(principal, { method: "email", target: email, challengeId: requested.challengeId, code: sent.at(-1)!.code, clientKey });
    await expect(identity.completeLink(principal, { method: "email", target: email, grant: proof.grant })).rejects.toBeTruthy();
    await identity.completeLink(principal, { method: "email", target: email, grant: proof.grant, password: "initial account password" });
    const phone = `+7701${randomInt(1_000_000, 10_000_000)}`;
    const phoneRequest = await identity.requestLink(principal, { method: "phone", target: phone, clientKey });
    const phoneProof = await identity.verifyLink(principal, { method: "phone", target: phone, challengeId: phoneRequest.challengeId, code: sent.at(-1)!.code, clientKey });
    await identity.completeLink(principal, { method: "phone", target: phone, grant: phoneProof.grant, password: "should not replace original" });
    await expect(identity.login({ method: "phone", target: phone, password: "should not replace original", clientKey })).rejects.toBeInstanceOf(UnauthorizedException);
    expect((await identity.login({ method: "phone", target: phone, password: "initial account password", clientKey })).user.id).toBe(user.id);
  });
});
