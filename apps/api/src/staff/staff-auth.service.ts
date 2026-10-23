import {
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
  HttpException,
} from "@nestjs/common";
import type { PrismaClient, StaffAccount } from "@event-platform/database";
import { generateSecret, generateURI, verify } from "otplib";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { checkPassword, hashPassword } from "../auth/password.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import {
  STAFF_CONFIG,
  type StaffConfig,
  type StaffPrincipal,
  digest,
  secret,
  encrypt,
  decrypt,
  enabled,
  staffAudit,
} from "./staff.config.js";
import type { StaffRole } from "@event-platform/shared-types";
const invalid = () => new UnauthorizedException({ code: "STAFF_AUTH_INVALID" });
const emailOf = (email: string) => email.trim().toLowerCase();
export function staffCookie(config: StaffConfig) {
  return config.origin.startsWith("https:")
    ? "__Host-ticket-staff"
    : "ticket-staff-local";
}
export function sessionCookie(
  config: StaffConfig,
  token: string,
  expires: Date,
) {
  return `${staffCookie(config)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}${config.origin.startsWith("https:") ? "; Secure" : ""}`;
}
export function staffView(row: StaffAccount) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    mfaEnrolled: !!row.mfaConfirmedAt,
  };
}
@Injectable()
export class StaffAuthService {
  constructor(
    @Inject(DATABASE_CLIENT) readonly db: PrismaClient,
    @Inject(STAFF_CONFIG) readonly config: StaffConfig,
  ) {}
  async rate(key: string, max = 8, seconds = 600) {
    const now = new Date(),
      expires = new Date(now.getTime() + seconds * 1000),
      hash = digest(key);
    const rows = await this.db.$queryRaw<
      Array<{ count: number }>
    >`INSERT INTO "StaffRateBucket" (key,count,"expiresAt") VALUES (${hash},1,${expires}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "StaffRateBucket"."expiresAt" < ${now} THEN 1 ELSE "StaffRateBucket".count+1 END,"expiresAt"=CASE WHEN "StaffRateBucket"."expiresAt" < ${now} THEN ${expires} ELSE "StaffRateBucket"."expiresAt" END RETURNING count`;
    if ((rows[0]?.count ?? max + 1) > max)
      throw new HttpException({ code: "STAFF_RATE_LIMITED" }, 429);
  }
  async login(email: string, password: string) {
    enabled(this.config);
    const normalized = emailOf(email);
    await this.rate(`login:${normalized}`);
    const account = await this.db.staffAccount.findUnique({
      where: { email: normalized },
    });
    const valid = await checkPassword(password, account?.passwordHash ?? null);
    if (!valid || !account || account.disabledAt) {
      await this.db.$transaction((tx) =>
        staffAudit(tx, null, "staff.login_failed", "staff", digest(normalized)),
      );
      throw invalid();
    }
    return this.newSession(account, false, 10 * 60);
  }
  private async newSession(
    account: StaffAccount,
    authenticated: boolean,
    seconds: number,
  ) {
    const token = secret(),
      csrf = digest(`csrf:${token}`),
      expiresAt = new Date(Date.now() + seconds * 1000);
    const session = await this.db.staffSession.create({
      data: {
        staffId: account.id,
        tokenHash: digest(token),
        csrfHash: digest(csrf),
        version: account.version,
        authenticated,
        expiresAt,
      },
    });
    return {
      token,
      expiresAt,
      session: { staff: staffView(account), csrf, authenticated },
      id: session.id,
    };
  }
  async authenticate(
    raw: string | undefined,
    csrf?: string,
    mutate = false,
    pending = false,
  ): Promise<StaffPrincipal> {
    enabled(this.config);
    if (!raw || raw.length > 100) throw invalid();
    const row = await this.db.staffSession.findUnique({
      where: { tokenHash: digest(raw) },
      include: { staff: true },
    });
    if (
      !row ||
      row.expiresAt <= new Date() ||
      row.staff.disabledAt ||
      row.version !== row.staff.version ||
      (!pending && (!row.authenticated || !row.staff.mfaConfirmedAt))
    )
      throw invalid();
    if (mutate && (!csrf || digest(csrf) !== row.csrfHash))
      throw new ForbiddenException({ code: "CSRF_INVALID" });
    return {
      id: row.staff.id,
      role: row.staff.role,
      sessionId: row.id,
      authenticated: row.authenticated,
    };
  }
  async session(actor: StaffPrincipal) {
    return {
      staff: staffView(
        await this.db.staffAccount.findUniqueOrThrow({
          where: { id: actor.id },
        }),
      ),
      authenticated: actor.authenticated,
    };
  }
  async csrf(actor: StaffPrincipal, raw: string) {
    return { ...(await this.session(actor)), csrf: digest(`csrf:${raw}`) };
  }
  async enrollment(actor: StaffPrincipal) {
    const account = await this.db.staffAccount.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if (account.mfaConfirmedAt)
      throw new ConflictException({ code: "MFA_ALREADY_ENROLLED" });
    const value = generateSecret();
    await this.db.staffAccount.update({
      where: { id: actor.id },
      data: { mfaSecret: encrypt(value, this.config) },
    });
    return {
      secret: value,
      uri: generateURI({
        issuer: "TICKET Admin",
        label: account.email,
        secret: value,
      }),
    };
  }
  async otp(actor: StaffPrincipal, code: string) {
    await this.rate(`mfa:${actor.id}`);
    const account = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StaffAccount" WHERE id=${actor.id}::uuid FOR UPDATE`;
      const row = await tx.staffAccount.findUniqueOrThrow({
        where: { id: actor.id },
      });
      if (row.disabledAt || !row.mfaSecret) throw invalid();
      const recoveryIndex = row.mfaConfirmedAt
        ? row.recoveryHashes.indexOf(
            digest(code.replaceAll("-", "").toUpperCase()),
          )
        : -1;
      let step = row.mfaLastStep;
      if (recoveryIndex < 0) {
        let result;
        try {
          result = await verify({
            secret: decrypt(row.mfaSecret, this.config),
            token: code,
            epochTolerance: 30,
            ...(row.mfaLastStep < 0 ? {} : { afterTimeStep: row.mfaLastStep }),
          });
        } catch {
          throw invalid();
        }
        if (
          !result.valid ||
          !("timeStep" in result) ||
          typeof result.timeStep !== "number"
        )
          throw invalid();
        step = result.timeStep;
      }
      const enrolled = !!row.mfaConfirmedAt;
      const codes = !enrolled
        ? Array.from({ length: 10 }, () =>
            randomBytes(10).toString("hex").toUpperCase(),
          )
        : [];
      const remaining =
        recoveryIndex >= 0
          ? row.recoveryHashes.filter((_, index) => index !== recoveryIndex)
          : row.recoveryHashes;
      const updated = await tx.staffAccount.update({
        where: { id: row.id },
        data: {
          mfaLastStep: step,
          ...(!enrolled
            ? { mfaConfirmedAt: new Date(), recoveryHashes: codes.map(digest) }
            : recoveryIndex >= 0
              ? { recoveryHashes: remaining }
              : {}),
        },
      });
      await tx.staffSession.delete({ where: { id: actor.sessionId } });
      await staffAudit(
        tx,
        actor,
        enrolled ? "staff.mfa_login" : "staff.mfa_enrolled",
        "staff",
        row.id,
        recoveryIndex >= 0 ? "Recovery code used" : undefined,
      );
      return { updated, codes };
    });
    const result = await this.newSession(account.updated, true, 8 * 3600);
    return { ...result, recoveryCodes: account.codes };
  }
  async resetMfa(actor: StaffPrincipal, password: string, code: string) {
    await this.rate(`mfa-reset:${actor.id}`, 5, 3600);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StaffAccount" WHERE id=${actor.id}::uuid FOR UPDATE`;
      const row = await tx.staffAccount.findUniqueOrThrow({
        where: { id: actor.id },
      });
      if (
        row.disabledAt ||
        !row.mfaSecret ||
        !(await checkPassword(password, row.passwordHash))
      )
        throw invalid();
      const recovery = row.recoveryHashes.includes(
        digest(code.replaceAll("-", "").toUpperCase()),
      );
      if (!recovery) {
        const result = await verify({
          secret: decrypt(row.mfaSecret, this.config),
          token: code,
          epochTolerance: 30,
          afterTimeStep: row.mfaLastStep,
        });
        if (!result.valid) throw invalid();
      }
      await tx.staffAccount.update({
        where: { id: row.id },
        data: {
          mfaSecret: null,
          mfaConfirmedAt: null,
          recoveryHashes: [],
          mfaLastStep: -1,
          version: { increment: 1 },
        },
      });
      await tx.staffSession.deleteMany({ where: { staffId: row.id } });
      await staffAudit(
        tx,
        actor,
        "staff.mfa_reset",
        "staff",
        actor.id,
        "Password and second factor confirmed; mandatory re-enrollment",
      );
      return { reenrollmentRequired: true };
    });
  }
  async logout(actor: StaffPrincipal, sessionId = actor.sessionId) {
    await this.db.$transaction(async (tx) => {
      await tx.staffSession.deleteMany({
        where: { id: sessionId, staffId: actor.id },
      });
      await staffAudit(
        tx,
        actor,
        "staff.session_revoked",
        "staff_session",
        sessionId,
      );
    });
    return { revoked: true };
  }
  sessions(actor: StaffPrincipal) {
    return this.db.staffSession.findMany({
      where: {
        staffId: actor.id,
        authenticated: true,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }
  private requireMail() {
    if (!this.config.emailKey || !this.config.emailFrom)
      throw new ServiceUnavailableException({
        code: "STAFF_EMAIL_UNAVAILABLE",
      });
  }
  private async sendEmail(to: string, subject: string, url: string) {
    this.requireMail();
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.emailKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: `TICKET <${this.config.emailFrom}>`,
          to: [to],
          subject,
          text: `${subject}\n\n${url}\n\nTICKET Administration`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
    } catch {
      throw new ServiceUnavailableException({
        code: "STAFF_EMAIL_SEND_FAILED",
      });
    }
  }
  async invite(
    actor: StaffPrincipal,
    input: { email: string; name: string; role: StaffRole },
  ) {
    this.requireMail();
    const raw = secret(),
      expiresAt = new Date(Date.now() + 24 * 3600_000);
    const invitation = await this.db.$transaction(async (tx) => {
      const email = emailOf(input.email);
      const existing = await tx.staffAccount.findUnique({ where: { email } });
      if (existing?.passwordHash)
        throw new ConflictException({ code: "STAFF_EXISTS" });
      const account =
        existing ??
        (await tx.staffAccount.create({
          data: { email, name: input.name, role: input.role },
        }));
      if (existing)
        await tx.staffAccount.update({
          where: { id: account.id },
          data: { name: input.name, role: input.role },
        });
      await tx.staffToken.updateMany({
        where: { staffId: account.id, purpose: "invite", usedAt: null },
        data: { usedAt: new Date() },
      });
      const token = await tx.staffToken.create({
        data: {
          staffId: account.id,
          tokenHash: digest(raw),
          purpose: "invite",
          expiresAt,
        },
      });
      await staffAudit(
        tx,
        actor,
        "staff.invited",
        "staff",
        account.id,
        undefined,
        undefined,
        { role: input.role },
      );
      return { token, account };
    });
    try {
      await this.sendEmail(
        invitation.account.email,
        "Приглашение в TICKET Admin",
        `${this.config.origin}/admin/login#invite=${raw}`,
      );
    } catch (error) {
      await this.db.staffToken.update({
        where: { id: invitation.token.id },
        data: { usedAt: new Date() },
      });
      throw error;
    }
    return { sent: true, expiresAt };
  }
  async recover(email: string) {
    this.requireMail();
    const normalized = emailOf(email);
    await this.rate(`recover:${normalized}`, 3, 3600);
    const account = await this.db.staffAccount.findUnique({
      where: { email: normalized },
    });
    if (account && !account.disabledAt && account.passwordHash) {
      const raw = secret();
      const token = await this.db.staffToken.create({
        data: {
          staffId: account.id,
          purpose: "reset",
          tokenHash: digest(raw),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      try {
        await this.sendEmail(
          account.email,
          "Восстановление TICKET Admin",
          `${this.config.origin}/admin/login#reset=${raw}`,
        );
      } catch (error) {
        await this.db.staffToken.update({
          where: { id: token.id },
          data: { usedAt: new Date() },
        });
        throw error;
      }
    }
    return { sent: true };
  }
  async accept(raw: string, password: string, purpose: "invite" | "reset") {
    const passwordHash = await hashPassword(password);
    return this.db.$transaction(async (tx) => {
      const token = await tx.staffToken.findUnique({
        where: { tokenHash: digest(raw) },
        include: { staff: true },
      });
      if (
        !token ||
        token.purpose !== purpose ||
        token.usedAt ||
        token.expiresAt <= new Date() ||
        token.staff.disabledAt ||
        (purpose === "invite" && token.staff.passwordHash)
      )
        throw invalid();
      const claimed = await tx.staffToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalid();
      await tx.staffAccount.update({
        where: { id: token.staffId },
        data: { passwordHash, version: { increment: 1 } },
      });
      await tx.staffSession.deleteMany({ where: { staffId: token.staffId } });
      await tx.staffToken.updateMany({
        where: { staffId: token.staffId, purpose: "reset", usedAt: null },
        data: { usedAt: new Date() },
      });
      await staffAudit(
        tx,
        { id: token.staffId, role: token.staff.role },
        `staff.${purpose}_accepted`,
        "staff",
        token.staffId,
      );
      return { accepted: true };
    });
  }
  listStaff() {
    return this.db.staffAccount.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        disabledAt: true,
        mfaConfirmedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }
  async change(
    actor: StaffPrincipal,
    id: string,
    input: {
      role?: StaffRole | undefined;
      disabled?: boolean | undefined;
      reason: string;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended('staff-team',0))`;
      const row = await tx.staffAccount.findUniqueOrThrow({ where: { id } });
      if (
        row.role === "moderator" &&
        !row.disabledAt &&
        (input.disabled || input.role === "support")
      ) {
        const count = await tx.staffAccount.count({
          where: {
            role: "moderator",
            disabledAt: null,
            passwordHash: { not: null },
            mfaConfirmedAt: { not: null },
          },
        });
        if (count <= 1) throw new ConflictException({ code: "LAST_MODERATOR" });
      }
      const updated = await tx.staffAccount.update({
        where: { id },
        data: {
          ...(input.role ? { role: input.role } : {}),
          ...(input.disabled !== undefined
            ? { disabledAt: input.disabled ? new Date() : null }
            : {}),
          version: { increment: 1 },
        },
      });
      await tx.staffSession.deleteMany({ where: { staffId: id } });
      await staffAudit(
        tx,
        actor,
        "staff.changed",
        "staff",
        id,
        input.reason,
        { role: row.role, disabled: !!row.disabledAt },
        { role: updated.role, disabled: !!updated.disabledAt },
      );
      return staffView(updated);
    });
  }
}
export function secureEqual(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
