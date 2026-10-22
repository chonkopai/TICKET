import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@event-platform/database";
import { validatedReturnPath, type TelegramOidcCompleteRequest, type TelegramOidcCompleteResponse, type TelegramOidcStartRequest, type TelegramOidcStartResponse } from "@event-platform/shared-types";
import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig } from "./auth.constants.js";
import { AuthService } from "./auth.service.js";

const ISSUER = "https://oauth.telegram.org";
const TTL_MS = 10 * 60 * 1000;
const keys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), { timeoutDuration: 10_000 });
const invalid = () => new UnauthorizedException({ code: "TELEGRAM_INVALID" });
const unavailable = () => new ServiceUnavailableException({ code: "TELEGRAM_UNAVAILABLE" });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

@Injectable()
export class TelegramOidcService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private configuration() {
    const { telegramOidcEnabled, telegramOidcClientId, telegramOidcClientSecret, webOrigin } = this.config;
    if (!telegramOidcEnabled || !telegramOidcClientId || !telegramOidcClientSecret || !webOrigin) throw unavailable();
    return { clientId: telegramOidcClientId, clientSecret: telegramOidcClientSecret, webOrigin };
  }

  async start(input: TelegramOidcStartRequest): Promise<TelegramOidcStartResponse> {
    const { clientId, webOrigin } = this.configuration();
    const now = new Date();
    // Opportunistic bounded cleanup uses the expiry index; no unbounded deletion or in-memory state.
    await this.db.$executeRaw`DELETE FROM "TelegramLoginAttempt" WHERE "id" IN (SELECT "id" FROM "TelegramLoginAttempt" WHERE "expiresAt" < ${now} ORDER BY "expiresAt" LIMIT 100)`;
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const redirectUri = `${webOrigin}/login/telegram/callback`;
    const returnTo = new URL(validatedReturnPath(input.returnTo, webOrigin, "/"), webOrigin);
    returnTo.searchParams.set("lang", input.locale);
    const expiresAt = new Date(now.getTime() + TTL_MS);
    await this.db.telegramLoginAttempt.create({ data: {
      stateHash: hash(state), browserProofHash: input.browserProofHash, nonce, codeVerifier, redirectUri,
      returnTo: returnTo.pathname + returnTo.search + returnTo.hash, locale: input.locale, expiresAt,
    } });
    const authorizationUrl = new URL(`${ISSUER}/auth`);
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: "code",
      scope: "openid profile telegram:bot_access", state, nonce,
      code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"), code_challenge_method: "S256",
    }).toString();
    return { authorizationUrl: authorizationUrl.toString(), state, expiresAt: expiresAt.toISOString() };
  }

  async complete(input: TelegramOidcCompleteRequest): Promise<TelegramOidcCompleteResponse> {
    const { clientId, clientSecret, webOrigin } = this.configuration();
    const now = new Date();
    const stateHash = hash(input.state);
    const browserProofHash = hash(input.browserProof);
    const attempt = await this.db.telegramLoginAttempt.findUnique({ where: { stateHash } });
    if (!attempt || attempt.claimedAt || attempt.expiresAt <= now || attempt.browserProofHash !== browserProofHash || attempt.redirectUri !== `${webOrigin}/login/telegram/callback`) throw invalid();
    // Claim before making network calls. Failed/lost exchanges require a fresh attempt.
    // The captured verifier is scrubbed from storage at the same time as claiming.
    const claimed = await this.db.telegramLoginAttempt.updateMany({
      where: { id: attempt.id, browserProofHash, claimedAt: null, expiresAt: { gt: now } },
      data: { claimedAt: now, codeVerifier: "" },
    });
    if (claimed.count !== 1) throw invalid();

    let idToken: string;
    try {
      const response = await fetch(`${ISSUER}/token`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
        body: new URLSearchParams({ grant_type: "authorization_code", code: input.code, client_id: clientId, redirect_uri: attempt.redirectUri, code_verifier: attempt.codeVerifier }),
      });
      if (response.status >= 500 || response.status === 429) throw unavailable();
      if (!response.ok) throw invalid();
      const body: unknown = JSON.parse(await boundedResponseText(response));
      if (!body || typeof body !== "object" || !("id_token" in body) || typeof body.id_token !== "string" || body.id_token.length > 16000) throw invalid();
      idToken = body.id_token;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) throw error;
      throw unavailable();
    }

    let identity: { id: bigint; name: string | null; photoUrl: string | null; botAccess: boolean };
    try {
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: ISSUER, audience: clientId, algorithms: ["RS256"],
        requiredClaims: ["sub", "iat", "exp", "nonce", "id"], maxTokenAge: "10m", clockTolerance: 30,
      });
      if (payload.nonce !== attempt.nonce || !payload.sub || payload.sub.length > 255 || payload.iat! < Math.floor(attempt.createdAt.getTime() / 1000) - 30) throw invalid();
      const id = telegramIdentityId(payload.id);
      const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 200) : null;
      let photoUrl: string | null = null;
      if (typeof payload.picture === "string" && payload.picture.length <= 2048 && new URL(payload.picture).protocol === "https:") photoUrl = payload.picture;
      identity = { id, name, photoUrl, botAccess: true };
    } catch { throw invalid(); }
    if (attempt.expiresAt <= new Date()) throw invalid();
    return { session: await this.auth.loginWithVerifiedTelegram(identity), returnTo: validatedReturnPath(attempt.returnTo, webOrigin, `/?lang=${attempt.locale}`) };
  }
}

function telegramIdentityId(value: unknown): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) throw invalid();
  if (typeof value !== "number" && typeof value !== "string") throw invalid();
  const decimal = String(value);
  if (!/^[1-9][0-9]{0,18}$/.test(decimal)) throw invalid();
  const id = BigInt(decimal);
  if (id > 9223372036854775807n) throw invalid();
  return id;
}

async function boundedResponseText(response: Response): Promise<string> {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      length += value.byteLength;
      if (length > 65536) { await reader.cancel(); throw unavailable(); }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}
