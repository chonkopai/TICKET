import { createHash, createHmac, randomBytes } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramOidcService } from "./telegram-oidc.service.js";
import { TelegramOidcController, TelegramOidcCompleteDto, TelegramOidcStartDto } from "./telegram-oidc.controller.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";

const keys = vi.hoisted(() => ({ publicKey: undefined as CryptoKey | undefined }));
vi.mock("jose", async original => ({ ...await original<typeof import("jose")>(), createRemoteJWKSet: () => () => keys.publicKey }));
let privateKey: CryptoKey;
const proof = "a".repeat(64);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const config = { telegramOidcEnabled: true, telegramOidcClientId: "123456", telegramOidcClientSecret: "server-only-secret", webOrigin: "https://ticket.example", accessTokenSecret: "a".repeat(32), refreshTokenSecret: "b".repeat(32), telegramBotToken: "123456:test", telegramBotUsername: "test_bot", botApiSecret: "c".repeat(32), organizerRequiresApproval: false };
type Attempt = { id: string; stateHash: string; browserProofHash: string; nonce: string; codeVerifier: string; redirectUri: string; returnTo: string; locale: string; createdAt: Date; expiresAt: Date; claimedAt: Date | null };
let attempt: Attempt;
const db = { $executeRaw: vi.fn(), telegramLoginAttempt: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() } };
const auth = { loginWithVerifiedTelegram: vi.fn() };
const service = new TelegramOidcService(db as never, config, auth as never);
const fetchMock = vi.fn();
async function start(returnTo = "/events/example?mode=buy#tickets") {
  return service.start({ browserProofHash: hash(proof), returnTo, locale: "en" });
}
async function idToken(claims: Record<string, unknown> = {}, key = privateKey, algorithm = "RS256") {
  return new SignJWT({ iss: "https://oauth.telegram.org", aud: config.telegramOidcClientId, sub: "999999999999999999", id: 42, name: "Telegram Guest", nonce: attempt.nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims }).setProtectedHeader({ alg: algorithm }).sign(key);
}
async function response(claims: Record<string, unknown> = {}, key = privateKey) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id_token: await idToken(claims, key) }), { status: 200 }));
}
beforeAll(async () => { const pair = await generateKeyPair("RS256"); privateKey = pair.privateKey; keys.publicKey = pair.publicKey; });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", fetchMock);
  db.telegramLoginAttempt.create.mockImplementation(async ({ data }) => { attempt = { ...data, id: "attempt-1", createdAt: new Date(), claimedAt: null }; return attempt; });
  db.telegramLoginAttempt.findUnique.mockImplementation(async ({ where }) => where.stateHash === attempt?.stateHash ? { ...attempt } : null);
  db.telegramLoginAttempt.updateMany.mockImplementation(async () => {
    if (attempt.claimedAt || attempt.expiresAt <= new Date()) return { count: 0 };
    attempt.claimedAt = new Date(); attempt.codeVerifier = ""; return { count: 1 };
  });
  auth.loginWithVerifiedTelegram.mockResolvedValue({ user: { id: "same-account", role: "organizer" }, tokens: { accessToken: "application-session" } });
});

describe("Telegram OIDC", () => {
  it("starts browser-bound PKCE with a canonical callback, safe destination, and no phone-sharing scope", async () => {
    const result = await start(); const url = new URL(result.authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://oauth.telegram.org/auth");
    expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update(attempt.codeVerifier).digest("base64url"));
    expect(url.searchParams.get("nonce")).toBe(attempt.nonce);
    expect(url.searchParams.get("redirect_uri")).toBe("https://ticket.example/login/telegram/callback");
    expect(url.searchParams.get("scope")).toBe("openid profile telegram:bot_access");
    expect(attempt.stateHash).toBe(hash(result.state)); expect(attempt.browserProofHash).toBe(hash(proof));
    expect(attempt.returnTo).toBe("/events/example?mode=buy&lang=en#tickets");
    expect(url.toString()).not.toContain(config.telegramOidcClientSecret);
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\nevil", "/login/telegram/callback?code=bad"])("rejects an unsafe return destination: %s", async destination => {
    await start(destination); expect(attempt.returnTo).toBe("/?lang=en");
  });
  it("exchanges once on the server and maps numeric profile id, never OIDC sub", async () => {
    const result = await start(); const verifier = attempt.codeVerifier; await response();
    expect(await service.complete({ state: result.state, code: "provider-code", browserProof: proof })).toMatchObject({ session: { user: { id: "same-account", role: "organizer" } }, returnTo: "/events/example?mode=buy&lang=en#tickets" });
    expect(auth.loginWithVerifiedTelegram).toHaveBeenCalledWith({ id: 42n, name: "Telegram Guest", photoUrl: null, botAccess: true });
    const request = fetchMock.mock.calls[0]![1];
    expect(request.body.get("code_verifier")).toBe(verifier);
    expect(request.headers.authorization).toBe(`Basic ${Buffer.from(`${config.telegramOidcClientId}:${config.telegramOidcClientSecret}`).toString("base64")}`);
    expect(attempt.codeVerifier).toBe("");
    await expect(service.complete({ state: result.state, code: "provider-code", browserProof: proof })).rejects.toMatchObject({ response: { code: "TELEGRAM_INVALID" } });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(auth.loginWithVerifiedTelegram).toHaveBeenCalledTimes(1);
  });
  it.each(["foreign-state", "foreign-browser", "expired", "callback-mismatch"])("rejects %s before exchanging any code", async problem => {
    const result = await start();
    if (problem === "expired") attempt.expiresAt = new Date(0);
    if (problem === "callback-mismatch") attempt.redirectUri = "https://other.example/login/telegram/callback";
    await expect(service.complete({ state: problem === "foreign-state" ? "b".repeat(43) : result.state, code: "code", browserProof: problem === "foreign-browser" ? "b".repeat(64) : proof })).rejects.toMatchObject({ response: { code: "TELEGRAM_INVALID" } });
    expect(fetchMock).not.toHaveBeenCalled(); expect(auth.loginWithVerifiedTelegram).not.toHaveBeenCalled();
  });
  it.each([{ iss: "evil" }, { aud: "wrong" }, { nonce: "wrong" }, { exp: 1 }, { iat: 1 }, { iat: Math.floor(Date.now() / 1000) + 1000 }, { id: null }, { id: 0 }, { id: 1.1 }, { id: 9007199254740992 }, { id: "9223372036854775808" }, { sub: "" }])("rejects invalid signed claims %j", async claims => {
    const result = await start(); await response(claims);
    await expect(service.complete({ state: result.state, code: "code", browserProof: proof })).rejects.toMatchObject({ response: { code: "TELEGRAM_INVALID" } });
    expect(auth.loginWithVerifiedTelegram).not.toHaveBeenCalled();
  });
  it("preserves a decimal string identity without rounding", async () => {
    const result = await start(); await response({ id: "9007199254740993" });
    await service.complete({ state: result.state, code: "code", browserProof: proof });
    expect(auth.loginWithVerifiedTelegram).toHaveBeenCalledWith(expect.objectContaining({ id: 9007199254740993n }));
  });
  it("rejects a forged signature", async () => {
    const result = await start(); const rogue = await generateKeyPair("RS256"); await response({}, rogue.privateKey);
    await expect(service.complete({ state: result.state, code: "code", browserProof: proof })).rejects.toMatchObject({ response: { code: "TELEGRAM_INVALID" } });
    expect(auth.loginWithVerifiedTelegram).not.toHaveBeenCalled();
  });
  it("rejects a token signed with an unexpected algorithm", async () => {
    const result = await start();
    const token = await new SignJWT({ sub: "subject", id: 42, nonce: attempt.nonce }).setProtectedHeader({ alg: "HS256" }).setIssuer("https://oauth.telegram.org").setAudience(config.telegramOidcClientId).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("untrusted-secret"));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id_token: token })));
    await expect(service.complete({ state: result.state, code: "code", browserProof: proof })).rejects.toMatchObject({ response: { code: "TELEGRAM_INVALID" } });
    expect(auth.loginWithVerifiedTelegram).not.toHaveBeenCalled();
  });
  it.each(["network", "oversized"])("fails closed for a %s provider response", async problem => {
    const result = await start();
    if (problem === "network") fetchMock.mockRejectedValue(new Error("network timeout"));
    else fetchMock.mockResolvedValue(new Response("x".repeat(65537)));
    await expect(service.complete({ state: result.state, code: "code", browserProof: proof })).rejects.toMatchObject({ response: { code: "TELEGRAM_UNAVAILABLE" } });
    expect(auth.loginWithVerifiedTelegram).not.toHaveBeenCalled();
  });
  it("allows only one concurrent completion", async () => {
    const result = await start(); await response();
    const input = { state: result.state, code: "code", browserProof: proof };
    const completed = await Promise.allSettled([service.complete(input), service.complete(input)]);
    expect(completed.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(auth.loginWithVerifiedTelegram).toHaveBeenCalledTimes(1);
  });
  it.each([400, 429, 503])("fails closed after provider HTTP %s and requires a fresh attempt", async status => {
    const result = await start(); fetchMock.mockResolvedValue(new Response("{}", { status }));
    const input = { state: result.state, code: "code", browserProof: proof };
    await expect(service.complete(input)).rejects.toMatchObject({ response: { code: status === 400 ? "TELEGRAM_INVALID" : "TELEGRAM_UNAVAILABLE" } });
    await expect(service.complete(input)).rejects.toMatchObject({ response: { code: "TELEGRAM_INVALID" } });
    expect(auth.loginWithVerifiedTelegram).not.toHaveBeenCalled();
  });
  it("keeps disabled installations independent of the new table/provider", async () => {
    const disabled = new TelegramOidcService(db as never, { ...config, telegramOidcEnabled: false }, auth as never);
    await expect(disabled.start({ browserProofHash: hash(proof), returnTo: "/", locale: "en" })).rejects.toMatchObject({ response: { code: "TELEGRAM_UNAVAILABLE" } });
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
  it("rejects absent and foreign origins", () => {
    const controller = new TelegramOidcController(service, config);
    expect(() => controller.start({ browserProofHash: hash(proof), returnTo: "/", locale: "en" })).toThrow();
    expect(() => controller.complete({ state: "s".repeat(43), code: "code", browserProof: proof }, "https://evil.example")).toThrow();
  });
  it("validates DTOs explicitly in development and production", async () => {
    const metadata = { type: "body" as const };
    await expect(new ExplicitDtoPipe(TelegramOidcStartDto).transform({ browserProofHash: proof, returnTo: "/", locale: "invalid" }, metadata)).rejects.toThrow();
    await expect(new ExplicitDtoPipe(TelegramOidcCompleteDto).transform({ state: "s".repeat(43), code: "code", browserProof: proof, injected: "no" }, metadata)).rejects.toThrow();
  });
});

describe.skipIf(process.env.TELEGRAM_OIDC_DB_TEST !== "true")("Telegram OIDC database integration", () => {
  it("atomically claims attempts and preserves one account across both login methods", async () => {
    const { prisma } = await import("@event-platform/database");
    const { AuthService } = await import("./auth.service.js");
    const { TokenService } = await import("./token.service.js");
    const realAuth = new AuthService(prisma, config, new TokenService(prisma, config), {} as never);
    const realService = new TelegramOidcService(prisma, config, realAuth);
    const telegramId = BigInt(`7${randomBytes(6).readUIntBE(0, 6)}`);
    const states: string[] = [];
    const credentials = new Map<string, string>();
    try {
      const starts = await Promise.all([0, 1].map(async () => {
        const value = await realService.start({ browserProofHash: hash(proof), returnTo: "/favorites", locale: "en" });
        states.push(value.state); return value;
      }));
      for (const [index, value] of starts.entries()) {
        const row = await prisma.telegramLoginAttempt.findUniqueOrThrow({ where: { stateHash: hash(value.state) } });
        credentials.set(`code-${index}`, await new SignJWT({ sub: "different-oidc-subject", id: telegramId.toString(), name: "Temporary Telegram test", nonce: row.nonce }).setProtectedHeader({ alg: "RS256" }).setIssuer("https://oauth.telegram.org").setAudience(config.telegramOidcClientId).setIssuedAt().setExpirationTime("1h").sign(privateKey));
      }
      fetchMock.mockImplementation(async (_url, options) => new Response(JSON.stringify({ id_token: credentials.get(options.body.get("code")) }), { status: 200 }));
      const first = { state: starts[0]!.state, code: "code-0", browserProof: proof };
      const outcomes = await Promise.allSettled([realService.complete(first), realService.complete(first), realService.complete({ state: starts[1]!.state, code: "code-1", browserProof: proof })]);
      expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(2);
      expect(outcomes.filter(value => value.status === "rejected")).toHaveLength(1);
      const user = await prisma.user.findUniqueOrThrow({ where: { telegramId } });
      expect(await prisma.user.count({ where: { telegramId } })).toBe(1);
      expect(user.role).toBe("guest"); expect(user.telegramChatId).toBeNull();
      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(2);
      expect(await prisma.contactIdentity.count({ where: { userId: user.id } })).toBe(0);
      for (const outcome of outcomes) if (outcome.status === "fulfilled") expect(outcome.value.session.user.id).toBe(user.id);
      await prisma.user.update({ where: { id: user.id }, data: { role: "organizer", name: "My edited name", photoUrl: "https://example.com/my-photo.png" } });
      const unsigned = { id: Number(telegramId), first_name: "Provider name", auth_date: Math.floor(Date.now() / 1000) };
      const data = Object.entries(unsigned).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
      const signature = createHmac("sha256", createHash("sha256").update(config.telegramBotToken).digest()).update(data).digest("hex");
      expect((await realAuth.loginWithTelegram({ ...unsigned, hash: signature })).user).toMatchObject({ id: user.id, role: "organizer", name: "My edited name", photoUrl: "https://example.com/my-photo.png", telegramChatId: null });
    } finally {
      // Only these randomized fixtures are touched. No global deletion/reset.
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (user) await prisma.user.delete({ where: { id: user.id } });
      await prisma.telegramLoginAttempt.deleteMany({ where: { stateHash: { in: states.map(hash) } } });
      await prisma.$disconnect();
    }
  });
});
