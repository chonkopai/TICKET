import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@event-platform/database";
import type { AuthResponse, LinkedMethodsResponse, LoginContactMethod, VerificationGrantResponse, VerificationRequestResponse } from "@event-platform/shared-types";
import { ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

import { DATABASE_CLIENT, type AuthenticatedPrincipal } from "./auth.constants.js";
import { presentUser } from "./auth.presenter.js";
import { normalizeContact } from "./contact-identity.js";
import { checkPassword, hashPassword } from "./password.js";
import { TokenService } from "./token.service.js";
import { VerificationService } from "./verification.service.js";

type Contact = { method: LoginContactMethod; target: string };
type ChallengeProof = Contact & { challengeId: string; code: string };
type Completion = Contact & { grant: string };
type ClientRequest = { clientKey: string };

@Injectable()
export class IdentityAuthService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(VerificationService) private readonly verification: VerificationService,
  ) {}

  registerRequest(input: Contact & ClientRequest): Promise<VerificationRequestResponse> {
    return this.verification.issue({ ...input, purpose: "register" });
  }

  registerVerify(input: ChallengeProof & ClientRequest): Promise<VerificationGrantResponse> {
    return this.verification.verify({ ...input, purpose: "register" });
  }

  async registerComplete(input: Completion & { firstName: string; lastName: string; password: string }): Promise<AuthResponse> {
    const target = normalizeContact(input.method, input.target);
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) throw new ConflictException({ code: "NAME_REQUIRED" });
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.db.$transaction(async tx => {
        await this.verification.claimGrant(tx, { ...input, purpose: "register" });
        const created = await tx.user.create({ data: { role: "guest", name: `${firstName} ${lastName}`, firstName, lastName, passwordHash } });
        await tx.contactIdentity.create({ data: { userId: created.id, method: input.method, normalizedIdentifier: target, verifiedAt: new Date() } });
        await tx.auditLog.create({ data: { actorId: created.id, action: "identity.registered", entityType: "user", entityId: created.id, meta: { method: input.method } } });
        return created;
      });
      return { user: presentUser(user), tokens: await this.tokens.issuePair(user) };
    } catch (error) { throw identityConflict(error); }
  }

  async login(input: Contact & { password: string; clientKey: string }): Promise<AuthResponse> {
    const target = normalizeContact(input.method, input.target);
    await this.verification.enforceCredentialLimit(input.method, target, input.clientKey);
    const identity = await this.db.contactIdentity.findUnique({ where: { method_normalizedIdentifier: { method: input.method, normalizedIdentifier: target } }, include: { user: true } });
    const valid = await checkPassword(input.password, identity?.user.passwordHash ?? null);
    if (!identity || !valid) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
    return { user: presentUser(identity.user), tokens: await this.tokens.issuePair(identity.user) };
  }

  requestLink(principal: AuthenticatedPrincipal, input: Contact & ClientRequest): Promise<VerificationRequestResponse> {
    this.requireRecent(principal);
    return this.verification.issue({ ...input, purpose: "link", userId: principal.userId, sessionFamilyId: principal.sessionFamilyId! });
  }

  verifyLink(principal: AuthenticatedPrincipal, input: ChallengeProof & ClientRequest): Promise<VerificationGrantResponse> {
    this.requireRecent(principal);
    return this.verification.verify({ ...input, purpose: "link", userId: principal.userId, sessionFamilyId: principal.sessionFamilyId! });
  }

  async completeLink(principal: AuthenticatedPrincipal, input: Completion & { password?: string }): Promise<LinkedMethodsResponse> {
    this.requireRecent(principal);
    const target = normalizeContact(input.method, input.target);
    const candidateHash = input.password === undefined ? null : await hashPassword(input.password);
    try {
      await this.db.$transaction(async tx => {
        await this.verification.claimGrant(tx, { ...input, purpose: "link", userId: principal.userId, sessionFamilyId: principal.sessionFamilyId! });
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`identity-user:${principal.userId}`}, 0))`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
        if (!user.passwordHash && !candidateHash) throw new ConflictException({ code: "PASSWORD_SETUP_REQUIRED" });
        await tx.contactIdentity.create({ data: { userId: user.id, method: input.method, normalizedIdentifier: target, verifiedAt: new Date() } });
        if (!user.passwordHash && candidateHash) await tx.user.update({ where: { id: user.id }, data: { passwordHash: candidateHash } });
        await tx.auditLog.create({ data: { actorId: user.id, action: "identity.linked", entityType: "user", entityId: user.id, meta: { method: input.method } } });
      });
    } catch (error) { throw identityConflict(error); }
    return this.methods(principal.userId);
  }

  async requestPasswordReset(input: Contact & ClientRequest): Promise<VerificationRequestResponse> {
    const target = normalizeContact(input.method, input.target);
    await this.verification.enforceCredentialLimit(input.method, target, input.clientKey);
    if (!this.verification.providerAvailable(input.method)) throw new ServiceUnavailableException({ code: "VERIFICATION_PROVIDER_UNAVAILABLE" });
    const identity = await this.db.contactIdentity.findUnique({ where: { method_normalizedIdentifier: { method: input.method, normalizedIdentifier: target } }, select: { userId: true } });
    if (!identity) return { challengeId: randomUUID(), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), retryAfterSeconds: 60 };
    return this.verification.issue({ ...input, target, purpose: "password_reset" });
  }

  verifyPasswordReset(input: ChallengeProof & ClientRequest): Promise<VerificationGrantResponse> {
    return this.verification.verify({ ...input, purpose: "password_reset" });
  }

  async completePasswordReset(input: Completion & { newPassword: string }): Promise<{ reset: true }> {
    const target = normalizeContact(input.method, input.target);
    const passwordHash = await hashPassword(input.newPassword);
    await this.db.$transaction(async tx => {
      await this.verification.claimGrant(tx, { ...input, purpose: "password_reset" });
      const identity = await tx.contactIdentity.findUnique({ where: { method_normalizedIdentifier: { method: input.method, normalizedIdentifier: target } } });
      if (!identity) throw new UnauthorizedException({ code: "INVALID_RESET_PROOF" });
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`identity-user:${identity.userId}`}, 0))`;
      await tx.user.update({ where: { id: identity.userId }, data: { passwordHash, credentialVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId: identity.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: identity.userId, action: "password.reset", entityType: "user", entityId: identity.userId, meta: { method: input.method } } });
    });
    return { reset: true };
  }

  async changePassword(principal: AuthenticatedPrincipal, input: { currentPassword: string; newPassword: string }): Promise<{ changed: true }> {
    this.requireRecent(principal);
    const passwordHash = await hashPassword(input.newPassword);
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`identity-user:${principal.userId}`}, 0))`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
      if (!user.passwordHash || !await checkPassword(input.currentPassword, user.passwordHash)) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
      await tx.user.update({ where: { id: principal.userId }, data: { passwordHash, credentialVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId: principal.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: principal.userId, action: "password.changed", entityType: "user", entityId: principal.userId } });
    });
    return { changed: true };
  }

  async methods(userId: string): Promise<LinkedMethodsResponse> {
    const [user, identities] = await Promise.all([
      this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { telegramId: true, passwordHash: true } }),
      this.db.contactIdentity.findMany({ where: { userId }, select: { method: true, normalizedIdentifier: true, verifiedAt: true } }),
    ]);
    const google = await this.db.googleIdentity.findUnique({ where: { userId } });
    const email = identities.find(x => x.method === "email");
    const phone = identities.find(x => x.method === "phone");
    return {
      telegram: { linked: user.telegramId !== null, id: user.telegramId?.toString() ?? null },
      email: { linked: Boolean(email), address: email?.normalizedIdentifier ?? null, verifiedAt: email?.verifiedAt.toISOString() ?? null },
      phone: { linked: Boolean(phone), number: phone?.normalizedIdentifier ?? null, verifiedAt: phone?.verifiedAt.toISOString() ?? null },
      google: { linked: Boolean(google), email: google?.email ?? null },
      passwordSet: Boolean(user.passwordHash),
    };
  }

  private requireRecent(principal: AuthenticatedPrincipal): void {
    if (!principal.sessionFamilyId || !principal.authenticatedAt || Date.now() / 1_000 - principal.authenticatedAt > 10 * 60) throw new UnauthorizedException({ code: "RECENT_AUTH_REQUIRED" });
  }
}

function identityConflict(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new ConflictException({ code: "IDENTITY_ALREADY_LINKED" });
  return error as Error;
}
