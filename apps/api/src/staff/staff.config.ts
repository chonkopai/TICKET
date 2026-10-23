import { loadApiEnv } from "@event-platform/config";
import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { StaffRole } from "@event-platform/shared-types";
import type { Prisma } from "@event-platform/database";
export const STAFF_CONFIG = Symbol("STAFF_CONFIG");
export interface StaffConfig {
  enabled: boolean;
  origin: string;
  gatewaySecret: string;
  encryptionKey: string;
  storageDir: string;
  emailKey?: string | undefined;
  emailFrom?: string | undefined;
}
export interface StaffPrincipal {
  id: string;
  role: StaffRole;
  sessionId: string;
  authenticated: boolean;
}
export function staffConfig(): StaffConfig {
  const env = loadApiEnv();
  return {
    enabled: env.STAFF_ENABLED,
    origin: env.ADMIN_ORIGIN,
    gatewaySecret: env.STAFF_GATEWAY_SECRET ?? "",
    encryptionKey: env.STAFF_MFA_ENCRYPTION_KEY ?? "",
    storageDir: env.PRIVATE_SUPPORT_STORAGE_DIR,
    emailKey: env.RESEND_API_KEY,
    emailFrom: env.RESEND_FROM_EMAIL,
  };
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export function parse<T>(
  schema: {
    safeParse(
      value: unknown,
    ): { success: true; data: T } | { success: false; error: unknown };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({ code: "INVALID_REQUEST" });
  return result.data;
}
export function pageOf(query: Record<string, string | undefined>) {
  const page = Number(query.page ?? 1),
    limit = Number(query.limit ?? 20);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new BadRequestException({ code: "PAGINATION_INVALID" });
  return { page, limit, skip: (page - 1) * limit };
}
export function enabled(config: StaffConfig) {
  if (
    !config.enabled ||
    config.gatewaySecret.length < 32 ||
    !/^[a-f0-9]{64}$/i.test(config.encryptionKey)
  )
    throw new ServiceUnavailableException({ code: "STAFF_UNAVAILABLE" });
}
export function encrypt(value: string, config: StaffConfig) {
  enabled(config);
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(config.encryptionKey, "hex"),
      iv,
    );
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((v) => v.toString("base64url"))
    .join(".");
}
export function decrypt(value: string, config: StaffConfig) {
  enabled(config);
  const [iv, tag, data] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data) throw new Error("MFA storage invalid");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(config.encryptionKey, "hex"),
    iv,
  );
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export async function staffAudit(
  tx: Prisma.TransactionClient,
  actor: Pick<StaffPrincipal, "id" | "role"> | null,
  action: string,
  targetType: string,
  targetId: string,
  reason?: string,
  before?: object,
  after?: object,
  caseId?: string,
) {
  await tx.staffAudit.create({
    data: {
      staffId: actor?.id ?? null,
      role: actor?.role ?? "system",
      action,
      targetType,
      targetId,
      ...(reason ? { reason } : {}),
      ...(before ? { before: before as Prisma.InputJsonObject } : {}),
      ...(after ? { after: after as Prisma.InputJsonObject } : {}),
      ...(caseId ? { caseId } : {}),
    },
  });
}
