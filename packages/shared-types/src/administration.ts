import { z } from "zod";
import { COUNTRY_CODES } from "./countries.js";
export type StaffRole = "support" | "moderator";
export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  mfaEnrolled: boolean;
}
export interface StaffSessionView {
  staff: StaffUser;
  csrf: string;
  authenticated: boolean;
}
export type CaseStatus = "new" | "in_progress" | "closed";
export interface SupportCase {
  id: string;
  subject: string;
  status: CaseStatus;
  ownerId: string | null;
  anonymousSessionId: string | null;
  assignedStaffId: string | null;
  orderId: string | null;
  eventId: string | null;
  ticketId: string | null;
  updatedAt: string;
  unread: boolean;
}
export interface SupportMessage {
  id: string;
  authorKind: string;
  internal: boolean;
  text: string;
  createdAt: string;
  files: PrivateFile[];
}
export interface PrivateFile {
  id: string;
  name: string;
  mime: string;
  size: number;
}
export interface VerificationView {
  id: string;
  version: number;
  status: string;
  legalName: string;
  entityType: string;
  entityTypeDetails?: string | null;
  countryCode: string;
  registrationId: string;
  email: string;
  phone: string;
  caseId: string;
  reviewReason: string | null;
  createdAt: string;
  documents: PrivateFile[];
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
}
const id = z.uuid();
export const staffLoginSchema = z
  .object({ email: z.email().max(320), password: z.string().min(1).max(1024) })
  .strict();
export const staffOtpSchema = z
  .object({ code: z.string().trim().min(6).max(40) })
  .strict();
export const staffMfaResetSchema = z
  .object({
    password: z.string().min(1).max(1024),
    code: z.string().trim().min(6).max(40),
  })
  .strict();
export const staffInviteSchema = z
  .object({
    email: z.email().max(320),
    name: z.string().trim().min(1).max(120),
    role: z.enum(["support", "moderator"]),
  })
  .strict();
export const staffAcceptSchema = z
  .object({
    token: z.string().min(32).max(100),
    password: z.string().min(12).max(1024),
  })
  .strict();
export const supportCreateSchema = z
  .object({
    subject: z.string().trim().min(3).max(160),
    text: z.string().trim().min(1).max(4000),
    orderId: id.optional(),
    eventId: id.optional(),
    ticketId: id.optional(),
    clientKey: id,
  })
  .strict();
export const supportMessageSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    clientKey: id,
    internal: z.boolean().optional(),
    fileIds: z.array(id).max(5).default([]),
  })
  .strict();
export const supportUpdateSchema = z
  .object({
    status: z.enum(["new", "in_progress", "closed"]).optional(),
    assignedStaffId: id.nullable().optional(),
    eventId: id.nullable().optional(),
    orderId: id.nullable().optional(),
    ticketId: id.nullable().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const verificationSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    entityType: z.enum(["ip", "ooo", "other"]),
    entityTypeDetails: z.string().trim().min(2).max(120).optional(),
    countryCode: z.enum(COUNTRY_CODES),
    registrationId: z.string().trim().min(1).max(120),
    email: z.email().max(320),
    phone: z.string().trim().min(3).max(40),
    fileIds: z.array(id).min(1).max(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.entityType === "other" && !value.entityTypeDetails) {
      ctx.addIssue({ code: "custom", path: ["entityTypeDetails"], message: "Specify your entity type" });
    }
    if (value.entityType !== "other" && value.entityTypeDetails) {
      ctx.addIssue({ code: "custom", path: ["entityTypeDetails"], message: "Details are only available for other entity types" });
    }
  });
export const decisionSchema = z
  .object({
    decision: z.enum(["verified", "changes_requested", "rejected", "revoked"]),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const reasonSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export const staffChangeSchema = z
  .object({
    role: z.enum(["support", "moderator"]).optional(),
    disabled: z.boolean().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const moderateEventSchema = z
  .object({
    action: z.enum([
      "approve",
      "reject",
      "hide",
      "unhide",
      "pause",
      "resume",
      "cancel",
    ]),
    reason: z.string().trim().min(3).max(500),
    notify: z.boolean().default(false),
  })
  .strict();
export const refundAdminSchema = z
  .object({
    ticketIds: z.array(id).min(1).max(200).optional(),
    reason: z.string().trim().min(10).max(500),
    key: id,
    override: z.boolean().default(false),
  })
  .strict();
export const payoutSchema = z
  .object({
    organizerId: id,
    amount: z.number().int().positive().max(2147483647),
    currency: z.string().regex(/^[A-Z]{3}$/),
    reference: z.string().trim().min(3).max(120),
    paidAt: z.iso.datetime(),
    testOnly: z.boolean().default(false),
    key: id,
  })
  .strict();
export const commissionSchema = z
  .object({
    organizerId: id.optional(),
    basisPoints: z.number().int().min(0).max(10000),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const staffOrderActionSchema = z
  .object({ key: z.uuid(), reason: z.string().trim().min(3).max(500) })
  .strict();
export const staffResendSchema = staffOrderActionSchema
  .extend({ channel: z.enum(["auto", "email", "telegram"]).default("auto") })
  .strict();
