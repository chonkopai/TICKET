import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@event-platform/database";
import { ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { AUTH_CONFIG, DATABASE_CLIENT, type AuthConfig, type AuthenticatedPrincipal } from "./auth.constants.js";
import { presentUser } from "./auth.presenter.js";
import { normalizeContact } from "./contact-identity.js";
import { TokenService } from "./token.service.js";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async authenticate(input: { credential: string; secret: string }, principal?: AuthenticatedPrincipal) {
    if (!this.config.googleClientId) throw new ServiceUnavailableException({ code: "GOOGLE_UNAVAILABLE" });
    if (principal && (!principal.sessionFamilyId || !principal.authenticatedAt || Date.now() / 1000 - principal.authenticatedAt > 600)) {
      throw new UnauthorizedException({ code: "RECENT_AUTH_REQUIRED" });
    }
    const payload = await this.verify(input);
    const email = normalizeContact("email", payload.email as string);
    try {
      const user = await this.db.$transaction(async tx => {
        // Serialize first sign-ins for the same Google account, including linking.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`google:${payload.sub}`}, 0))`;
        await tx.googleLoginProof.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await tx.googleLoginProof.create({ data: { nonce: payload.nonce as string, expiresAt: new Date(payload.exp! * 1000) } });
        const linked = await tx.googleIdentity.findUnique({ where: { subject: payload.sub! }, include: { user: true } });
        if (linked) {
          if (principal && linked.userId !== principal.userId) throw new ConflictException({ code: "IDENTITY_ALREADY_LINKED" });
          return linked.user;
        }
        if (principal) {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`identity-user:${principal.userId}`}, 0))`;
          await tx.googleIdentity.create({ data: { subject: payload.sub!, userId: principal.userId, email } });
          await tx.auditLog.create({ data: { actorId: principal.userId, action: "google.linked", entityType: "user", entityId: principal.userId } });
          return tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
        }
        const existing = await tx.contactIdentity.findUnique({ where: { method_normalizedIdentifier: { method: "email", normalizedIdentifier: email } } });
        if (existing) throw new ConflictException({ code: "GOOGLE_LINK_REQUIRED" });
        // Google email is display metadata, not a password/reset identity. Users
        // explicitly verify email in account settings before enabling that method.
        const created = await tx.user.create({ data: {
          role: "guest", email,
          name: typeof payload.name === "string" ? payload.name.slice(0, 200) : null,
          firstName: typeof payload.given_name === "string" ? payload.given_name.slice(0, 100) : null,
          lastName: typeof payload.family_name === "string" ? payload.family_name.slice(0, 100) : null,
          googleIdentity: { create: { subject: payload.sub!, email } },
        } });
        await tx.auditLog.create({ data: { actorId: created.id, action: "google.registered", entityType: "user", entityId: created.id } });
        return created;
      });
      if (principal) return { linked: true as const };
      return { user: presentUser(user), tokens: await this.tokens.issuePair(user) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException({ code: "GOOGLE_RETRY_OR_LINK" });
      throw error;
    }
  }

  private async verify(input: { credential: string; secret: string }) {
    try {
      const { payload } = await jwtVerify(input.credential, googleKeys, {
        algorithms: ["RS256"], audience: this.config.googleClientId!,
        issuer: ["accounts.google.com", "https://accounts.google.com"],
        requiredClaims: ["sub", "exp", "iat", "nonce", "email"], maxTokenAge: "10m",
      });
      // Only the hash goes to Google. The browser retains the random secret,
      // binding the returned credential to the initiating browser flow.
      const expectedNonce = createHash("sha256").update(input.secret).digest("hex");
      if (payload.nonce !== expectedNonce || !payload.sub || payload.sub.length > 255 || payload.email_verified !== true || typeof payload.email !== "string") throw new Error("Invalid Google claims");
      return payload;
    } catch { throw new UnauthorizedException({ code: "GOOGLE_INVALID" }); }
  }
}
