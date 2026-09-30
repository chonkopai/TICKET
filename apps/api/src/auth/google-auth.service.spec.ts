import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleAuthService } from "./google-auth.service.js";
import { GoogleAuthController } from "./google-auth.controller.js";
const keys = vi.hoisted(() => ({ publicKey: undefined as CryptoKey | undefined }));
vi.mock("jose", async original => ({ ...await original<typeof import("jose")>(), createRemoteJWKSet: () => () => keys.publicKey }));
const secret = "a".repeat(64);
const nonce = createHash("sha256").update(secret).digest("hex");
let privateKey: CryptoKey;
const user = { id: "user-1", role: "guest", telegramId: null, telegramChatId: null, name: "Google Guest", photoUrl: null, phone: null, email: "guest@gmail.com", defaultCity: null };
const db = {
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  googleLoginProof: { create: vi.fn(), deleteMany: vi.fn() }, googleIdentity: { findUnique: vi.fn(), create: vi.fn() },
  contactIdentity: { findUnique: vi.fn() }, user: { create: vi.fn(), findUniqueOrThrow: vi.fn() }, auditLog: { create: vi.fn() },
};
const tokens = { issuePair: vi.fn() };
const service = new GoogleAuthService(db as never, { googleClientId: "client" } as never, tokens as never);
const principal = () => ({ userId: user.id, role: "guest" as const, sessionFamilyId: "family", authenticatedAt: Math.floor(Date.now() / 1000) });
async function credential(overrides: Record<string, unknown> = {}, signingKey = privateKey) {
  return new SignJWT({ sub: "google-1", email: user.email, email_verified: true, nonce, name: user.name, iss: "https://accounts.google.com", aud: "client", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...overrides }).setProtectedHeader({ alg: "RS256" }).sign(signingKey);
}
beforeAll(async () => { const pair = await generateKeyPair("RS256"); privateKey = pair.privateKey; keys.publicKey = pair.publicKey; });
beforeEach(() => {
  vi.resetAllMocks(); db.$transaction.mockImplementation(fn => fn(db));
  db.user.create.mockResolvedValue(user); db.user.findUniqueOrThrow.mockResolvedValue(user);
  tokens.issuePair.mockResolvedValue({ accessToken: "session" });
});
describe("Google authentication", () => {
  it("registers a guest and issues application tokens", async () => {
    expect(await service.authenticate({ credential: await credential(), secret })).toMatchObject({ user: { id: user.id }, tokens: { accessToken: "session" } });
    expect(db.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "guest", googleIdentity: { create: { subject: "google-1", email: user.email } } }) }));
    expect(db.googleLoginProof.create).toHaveBeenCalledWith({ data: { nonce, expiresAt: expect.any(Date) } });
  });
  it("finds returning accounts by subject despite an email change", async () => {
    db.googleIdentity.findUnique.mockResolvedValue({ userId: user.id, user });
    await service.authenticate({ credential: await credential({ email: "changed@gmail.com" }), secret });
    expect(db.user.create).not.toHaveBeenCalled(); expect(tokens.issuePair).toHaveBeenCalledWith(user);
  });
  it.each([{ aud: "other" }, { iss: "evil" }, { exp: 1 }, { iat: 1 }, { nonce: "wrong" }, { email_verified: false }, { sub: "" }])("rejects invalid claims %j", async claims => {
    await expect(service.authenticate({ credential: await credential(claims), secret })).rejects.toMatchObject({ response: { code: "GOOGLE_INVALID" } });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects a forged signature", async () => {
    const rogue = await generateKeyPair("RS256");
    await expect(service.authenticate({ credential: await credential({}, rogue.privateKey), secret })).rejects.toMatchObject({ response: { code: "GOOGLE_INVALID" } });
  });
  it("requires the original browser secret", async () => {
    await expect(service.authenticate({ credential: await credential(), secret: "b".repeat(64) })).rejects.toMatchObject({ response: { code: "GOOGLE_INVALID" } });
  });
  it("never merges matching email identities", async () => {
    db.contactIdentity.findUnique.mockResolvedValue({ userId: "existing" });
    await expect(service.authenticate({ credential: await credential(), secret })).rejects.toMatchObject({ response: { code: "GOOGLE_LINK_REQUIRED" } });
    expect(db.user.create).not.toHaveBeenCalled(); expect(tokens.issuePair).not.toHaveBeenCalled();
  });
  it("links only to the recently authenticated user", async () => {
    expect(await service.authenticate({ credential: await credential(), secret }, principal())).toEqual({ linked: true });
    expect(db.googleIdentity.create).toHaveBeenCalledWith({ data: { subject: "google-1", userId: user.id, email: user.email } });
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });
  it("rejects another user's Google identity", async () => {
    db.googleIdentity.findUnique.mockResolvedValue({ userId: "other", user });
    await expect(service.authenticate({ credential: await credential(), secret }, principal())).rejects.toMatchObject({ response: { code: "IDENTITY_ALREADY_LINKED" } });
  });
  it("requires recent authentication", async () => {
    await expect(service.authenticate({ credential: "unused", secret }, { ...principal(), authenticatedAt: 1 })).rejects.toMatchObject({ response: { code: "RECENT_AUTH_REQUIRED" } });
  });
  it("issues no session when nonce replay is rejected", async () => {
    db.googleLoginProof.create.mockRejectedValue(new Error("duplicate nonce"));
    await expect(service.authenticate({ credential: await credential(), secret })).rejects.toThrow("duplicate nonce");
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });
  it("rejects absent and foreign origins", () => {
    const controller = new GoogleAuthController(service, { webOrigin: "https://ticket.example" } as never);
    expect(() => controller.login({ credential: "unused", secret })).toThrow();
    expect(() => controller.login({ credential: "unused", secret }, "https://evil.example")).toThrow();
  });
});

describe.skipIf(process.env.GOOGLE_AUTH_DB_TEST !== "true")("Google database transactions", () => {
  it("serializes registration, rejects replay, and preserves account ownership", async () => {
    const { prisma } = await import("@event-platform/database");
    const { randomUUID } = await import("node:crypto");
    const subject = `test-google-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    const realService = new GoogleAuthService(prisma, { googleClientId: "client" } as never, tokens as never);
    const secrets = Array.from({ length: 4 }, () => randomUUID().replaceAll("-", "").repeat(2));
    const nonces = secrets.map(value => createHash("sha256").update(value).digest("hex"));
    const inputs = await Promise.all(secrets.map(async (value, index) => ({ secret: value, credential: await credential({ sub: subject, email, nonce: nonces[index] }) })));
    try {
      await Promise.all([realService.authenticate(inputs[0]!), realService.authenticate(inputs[1]!)]);
      const identity = await prisma.googleIdentity.findUniqueOrThrow({ where: { subject } });
      expect(await prisma.googleIdentity.count({ where: { subject } })).toBe(1);
      await expect(realService.authenticate(inputs[0]!)).rejects.toMatchObject({ response: { code: "GOOGLE_RETRY_OR_LINK" } });
      await expect(realService.authenticate(inputs[2]!, { ...principal(), userId: randomUUID() })).rejects.toMatchObject({ response: { code: "IDENTITY_ALREADY_LINKED" } });
      expect(await realService.authenticate(inputs[3]!, { ...principal(), userId: identity.userId })).toEqual({ linked: true });
    } finally {
      const identity = await prisma.googleIdentity.findUnique({ where: { subject } });
      if (identity) {
        await prisma.auditLog.deleteMany({ where: { actorId: identity.userId } });
        await prisma.user.delete({ where: { id: identity.userId } });
      }
      await prisma.googleLoginProof.deleteMany({ where: { nonce: { in: nonces } } });
      await prisma.$disconnect();
    }
  });
});
