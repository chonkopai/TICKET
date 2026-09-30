import { randomUUID } from "node:crypto";

import { createPrismaClient, type PrismaClient } from "@event-platform/database";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { VerificationService } from "./verification.service.js";
import { ResendVerificationSender, type VerificationMessage, type VerificationSender } from "./verification-sender.js";

describe("Resend verification adapter", () => {
  it("stays unavailable without credentials and redacts provider failures", async () => {
    const sender = new ResendVerificationSender();
    expect(sender.available("email")).toBe(false);
    expect(sender.available("phone")).toBe(false);
    await expect(sender.send({ method: "email", target: "a@example.com", code: "123456", idempotencyKey: "otp/test" })).rejects.toBeInstanceOf(ServiceUnavailableException);
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => ({ ok: false }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const configured = new ResendVerificationSender("re_testsecret", "tickets@mail.ticketron.live");
      await expect(configured.send({ method: "email", target: "a@example.com", code: "123456", idempotencyKey: "otp/test" })).rejects.toMatchObject({ response: { code: "VERIFICATION_SEND_FAILED" } });
      const request = fetchMock.mock.calls[0];
      expect(request?.[0]).toBe("https://api.resend.com/emails");
      expect(request?.[1]?.headers).toMatchObject({ "Idempotency-Key": "otp/test" });
    } finally { vi.unstubAllGlobals(); }
  });
});

const testUrl = process.env.VERIFICATION_TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration("verification challenge with isolated PostgreSQL", () => {
  let db: PrismaClient;
  let service: VerificationService;
  const messages: VerificationMessage[] = [];
  const sender: VerificationSender = { available: method => method === "email", send: async message => { messages.push(message); } };

  beforeAll(() => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testUrl;
    db = createPrismaClient();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    service = new VerificationService(db, { hmacSecret: "test-only-verification-hmac-secret-long-enough" }, sender);
  });
  afterAll(async () => { await db?.$disconnect(); });

  it("binds proof to purpose and target, commits wrong attempts, and prevents grant replay", async () => {
    const target = `${randomUUID()}@example.com`;
    const request = { purpose: "register" as const, method: "email" as const, target, clientKey: randomUUID() };
    const issued = await service.issue(request);
    const message = messages.at(-1)!;
    const persisted = await db.verificationChallenge.findUniqueOrThrow({ where: { id: issued.challengeId } });
    expect(persisted.secretVerifier).not.toContain(message.code);
    await expect(service.verify({ ...request, purpose: "checkout_email", challengeId: issued.challengeId, code: message.code })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verify({ ...request, challengeId: issued.challengeId, code: "000000" === message.code ? "000001" : "000000" })).rejects.toBeInstanceOf(BadRequestException);
    expect((await db.verificationChallenge.findUniqueOrThrow({ where: { id: issued.challengeId } })).failedAttempts).toBe(1);
    const proof = await service.verify({ ...request, challengeId: issued.challengeId, code: message.code });
    await expect(db.$transaction(tx => service.claimGrant(tx, { ...request, purpose: "link", grant: proof.grant }))).rejects.toBeInstanceOf(BadRequestException);
    await db.$transaction(tx => service.claimGrant(tx, { ...request, grant: proof.grant }));
    await expect(db.$transaction(tx => service.claimGrant(tx, { ...request, grant: proof.grant }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verify({ ...request, challengeId: issued.challengeId, code: message.code })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("invalidates an older generation and accepts only one concurrent verification", async () => {
    const target = `${randomUUID()}@example.com`;
    const request = { purpose: "register" as const, method: "email" as const, target, clientKey: randomUUID() };
    const first = await service.issue(request);
    const oldCode = messages.at(-1)!.code;
    await db.verificationChallenge.update({ where: { id: first.challengeId }, data: { lastSentAt: new Date(Date.now() - 61_000) } });
    const second = await service.issue(request);
    const newCode = messages.at(-1)!.code;
    await expect(service.verify({ ...request, challengeId: first.challengeId, code: oldCode })).rejects.toBeInstanceOf(BadRequestException);
    const outcomes = await Promise.allSettled([
      service.verify({ ...request, challengeId: second.challengeId, code: newCode }),
      service.verify({ ...request, challengeId: second.challengeId, code: newCode }),
    ]);
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
  });

  it("rejects expired codes and an unconfigured phone provider", async () => {
    const target = `${randomUUID()}@example.com`;
    const request = { purpose: "register" as const, method: "email" as const, target, clientKey: randomUUID() };
    const issued = await service.issue(request);
    const code = messages.at(-1)!.code;
    await db.verificationChallenge.update({ where: { id: issued.challengeId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expect(service.verify({ ...request, challengeId: issued.challengeId, code })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.issue({ purpose: "register", method: "phone", target: "+12025550123", clientKey: randomUUID() })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("locks after five wrong codes and enforces a shared target send budget", async () => {
    const target = `${randomUUID()}@example.com`;
    const request = { purpose: "register" as const, method: "email" as const, target, clientKey: randomUUID() };
    const first = await service.issue(request);
    const correct = messages.at(-1)!.code;
    const wrong = correct === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(service.verify({ ...request, challengeId: first.challengeId, code: wrong })).rejects.toBeInstanceOf(BadRequestException);
    }
    expect((await db.verificationChallenge.findUniqueOrThrow({ where: { id: first.challengeId } })).failedAttempts).toBe(5);
    await expect(service.verify({ ...request, challengeId: first.challengeId, code: correct })).rejects.toBeInstanceOf(BadRequestException);
    for (let requestNumber = 1; requestNumber < 5; requestNumber++) {
      const last = await db.verificationChallenge.findFirstOrThrow({ where: { purpose: "register", method: "email", normalizedTarget: target }, orderBy: { createdAt: "desc" } });
      await db.verificationChallenge.update({ where: { id: last.id }, data: { lastSentAt: new Date(Date.now() - 61_000) } });
      await service.issue(request);
    }
    await expect(service.issue(request)).rejects.toMatchObject({ status: 429 });
  });

  it("survives a service restart and closes a challenge when sending fails", async () => {
    const target = `${randomUUID()}@example.com`;
    const request = { purpose: "register" as const, method: "email" as const, target, clientKey: randomUUID() };
    const issued = await service.issue(request);
    const code = messages.at(-1)!.code;
    const restarted = new VerificationService(db, { hmacSecret: "test-only-verification-hmac-secret-long-enough" }, sender);
    await expect(restarted.verify({ ...request, challengeId: issued.challengeId, code })).resolves.toHaveProperty("grant");

    const failingTarget = `${randomUUID()}@example.com`;
    const failing = new VerificationService(db, { hmacSecret: "test-only-verification-hmac-secret-long-enough" }, {
      available: () => true,
      send: async () => { throw new Error("private provider payload"); },
    });
    await expect(failing.issue({ ...request, target: failingTarget })).rejects.toMatchObject({ response: { code: "VERIFICATION_SEND_FAILED" } });
    const closed = await db.verificationChallenge.findFirstOrThrow({ where: { normalizedTarget: failingTarget }, orderBy: { createdAt: "desc" } });
    expect(closed.consumedAt).not.toBeNull();
  });
});
