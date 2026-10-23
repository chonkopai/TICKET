import type { Prisma, PrismaClient } from "@event-platform/database";
import {
  supportCreateSchema,
  supportMessageSchema,
  supportUpdateSchema,
  verificationSchema,
  decisionSchema,
} from "@event-platform/shared-types";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { StaffAuthService } from "./staff-auth.service.js";
import {
  STAFF_CONFIG,
  type StaffConfig,
  type StaffPrincipal,
  parse,
  pageOf,
  staffAudit,
} from "./staff.config.js";
export interface Participant {
  userId?: string | undefined;
  anonymousSessionId?: string | undefined;
  role?: string | undefined;
  orderId?: string | null | undefined;
}
export interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
const missing = () => new NotFoundException({ code: "SUPPORT_NOT_FOUND" });
const fileSelect = { id: true, name: true, mime: true, size: true };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validId(value: string) {
  if (!uuid.test(value)) throw new BadRequestException({ code: "ID_INVALID" });
  return value;
}
function participantWhere(actor: Participant): Prisma.PlatformCaseWhereInput {
  if (actor.userId) return { ownerId: actor.userId };
  if (actor.anonymousSessionId)
    return { anonymousSessionId: actor.anonymousSessionId };
  throw new ForbiddenException();
}
export async function supportNotification(
  tx: Prisma.TransactionClient,
  userId: string,
  text: string,
  caseId: string,
) {
  await tx.notification.create({
    data: {
      userId,
      channel: "in_app",
      type: "platform.support",
      payload: { text, caseId },
      status: "sent",
      sentAt: new Date(),
    },
  });
}
@Injectable()
export class PlatformSupportService {
  constructor(
    @Inject(DATABASE_CLIENT) readonly db: PrismaClient,
    @Inject(STAFF_CONFIG) private config: StaffConfig,
    @Inject(StaffAuthService) private auth: StaffAuthService,
  ) {}
  async access(id: string, actor: Participant | StaffPrincipal) {
    validId(id);
    const row = await this.db.platformCase.findFirst({
      where: { id, ...("sessionId" in actor ? {} : participantWhere(actor)) },
    });
    if (!row) throw missing();
    return row;
  }
  async cases(
    actor: Participant | StaffPrincipal,
    query: Record<string, string | undefined>,
  ) {
    const { page, limit, skip } = pageOf(query),
      staff = "sessionId" in actor;
    const where: Prisma.PlatformCaseWhereInput = {
      ...(!staff ? participantWhere(actor) : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(staff && query.assigned
        ? { assignedStaffId: validId(query.assigned) }
        : {}),
      ...(query.search
        ? {
            subject: {
              contains: query.search.slice(0, 160),
              mode: "insensitive",
            },
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.platformCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      this.db.platformCase.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        unread:
          (await this.db.platformMessage.count({
            where: {
              caseId: row.id,
              internal: false,
              ...(staff
                ? {
                    staffId: null,
                    createdAt: { gt: row.staffReadAt ?? new Date(0) },
                  }
                : {
                    staffId: { not: null },
                    createdAt: { gt: row.ownerReadAt ?? new Date(0) },
                  }),
            },
          })) > 0,
      })),
    );
    return { items, total, page, limit, hasNext: skip + rows.length < total };
  }
  private async validateContext(
    tx: Prisma.TransactionClient,
    actor: Participant,
    input: {
      orderId?: string | null | undefined;
      eventId?: string | null | undefined;
      ticketId?: string | null | undefined;
    },
  ) {
    let orderId = input.orderId ?? null;
    if (input.ticketId) {
      const ticket = await tx.ticket.findUnique({
        where: { id: input.ticketId },
        select: { orderId: true },
      });
      if (!ticket) throw missing();
      if (orderId && orderId !== ticket.orderId)
        throw new ConflictException({ code: "CASE_CONTEXT_MISMATCH" });
      orderId = ticket.orderId;
    }
    if (orderId) {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          tickets: { select: { ticketType: { select: { eventId: true } } } },
          booking: {
            select: {
              table: { select: { venueLayout: { select: { eventId: true } } } },
            },
          },
        },
      });
      if (!order) throw missing();
      const events = [
        ...order.tickets.map((t) => t.ticketType.eventId),
        ...(order.booking ? [order.booking.table.venueLayout.eventId] : []),
      ].filter((v): v is string => !!v);
      const owns = actor.anonymousSessionId
        ? actor.orderId === orderId
        : order.buyerUserId === actor.userId ||
          ((actor.role === "organizer" || actor.role === "admin") &&
            !!(await tx.event.findFirst({
              where: { id: { in: events }, organizerId: actor.userId! },
            })));
      if (!owns) throw missing();
      if (input.eventId && !events.includes(input.eventId))
        throw new ConflictException({ code: "CASE_CONTEXT_MISMATCH" });
    } else if (actor.anonymousSessionId) throw missing();
    if (input.eventId && !orderId) {
      const event = await tx.event.findFirst({
        where: {
          id: input.eventId,
          OR: [
            {
              organizerId:
                actor.userId ?? "00000000-0000-0000-0000-000000000000",
            },
            { status: "published" },
          ],
        },
      });
      if (!event) throw missing();
    }
    return {
      orderId,
      eventId: input.eventId ?? null,
      ticketId: input.ticketId ?? null,
    };
  }
  async create(actor: Participant, body: unknown) {
    const input = parse(supportCreateSchema, body);
    await this.auth.rate(
      `case:${actor.userId ?? actor.anonymousSessionId}`,
      15,
      3600,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`case-create:${input.clientKey}`},0))`;
      const existing = await tx.platformCase.findUnique({
        where: { id: input.clientKey },
      });
      if (existing) {
        if (
          (actor.userId && existing.ownerId !== actor.userId) ||
          (actor.anonymousSessionId &&
            existing.anonymousSessionId !== actor.anonymousSessionId)
        )
          throw missing();
        const first = await tx.platformMessage.findUnique({
          where: {
            caseId_clientKey: {
              caseId: existing.id,
              clientKey: input.clientKey,
            },
          },
        });
        if (existing.subject !== input.subject || first?.text !== input.text)
          throw new ConflictException({ code: "CASE_KEY_REUSED" });
        return existing;
      }
      const context = await this.validateContext(tx, actor, {
        ...input,
        ...(actor.anonymousSessionId
          ? { orderId: actor.orderId ?? undefined }
          : {}),
      });
      const row = await tx.platformCase.create({
        data: {
          id: input.clientKey,
          ownerId: actor.userId ?? null,
          anonymousSessionId: actor.anonymousSessionId ?? null,
          subject: input.subject,
          ...context,
        },
      });
      await tx.platformMessage.create({
        data: {
          caseId: row.id,
          clientKey: input.clientKey,
          authorKind:
            actor.role === "organizer" || actor.role === "admin"
              ? "organizer"
              : "customer",
          text: input.text,
        },
      });
      return row;
    });
  }
  async messages(
    id: string,
    actor: Participant | StaffPrincipal,
    query: Record<string, string | undefined>,
  ) {
    const row = await this.access(id, actor),
      staff = "sessionId" in actor;
    const { page, limit, skip } = pageOf(query);
    const where = { caseId: row.id, ...(!staff ? { internal: false } : {}) };
    const [rows, total] = await this.db.$transaction([
      this.db.platformMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          authorKind: true,
          internal: true,
          text: true,
          createdAt: true,
          files: { select: fileSelect },
        },
      }),
      this.db.platformMessage.count({ where }),
    ]);
    await this.db.platformCase.update({
      where: { id },
      data: staff
        ? { staffReadAt: new Date(), updatedAt: row.updatedAt }
        : { ownerReadAt: new Date(), updatedAt: row.updatedAt },
    });
    return {
      case: row,
      items: rows.reverse(),
      total,
      page,
      limit,
      hasNext: skip + rows.length < total,
    };
  }
  async message(
    id: string,
    actor: Participant | StaffPrincipal,
    body: unknown,
  ) {
    const input = parse(supportMessageSchema, body),
      row = await this.access(id, actor),
      staff = "sessionId" in actor;
    if (!staff && input.internal)
      throw new ForbiddenException({ code: "INTERNAL_NOTE_FORBIDDEN" });
    await this.auth.rate(
      `message:${staff ? actor.id : (actor.userId ?? actor.anonymousSessionId)}`,
      60,
      600,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PlatformCase" WHERE id=${id}::uuid FOR UPDATE`;
      const existing = await tx.platformMessage.findUnique({
        where: { caseId_clientKey: { caseId: id, clientKey: input.clientKey } },
        select: { id: true, text: true, internal: true, staffId: true },
      });
      if (existing) {
        if (
          existing.text !== input.text ||
          existing.internal !== !!input.internal ||
          existing.staffId !== (staff ? actor.id : null)
        )
          throw new ConflictException({ code: "MESSAGE_KEY_REUSED" });
        return { id: existing.id };
      }
      const files = await tx.privateUpload.findMany({
        where: {
          id: { in: input.fileIds },
          messageId: null,
          verificationId: null,
          ...(staff
            ? { staffId: actor.id, caseId: id }
            : actor.userId
              ? { ownerId: actor.userId }
              : { anonymousSessionId: actor.anonymousSessionId! }),
        },
      });
      if (files.length !== input.fileIds.length)
        throw new ForbiddenException({ code: "ATTACHMENT_NOT_OWNED" });
      const result = await tx.platformMessage.create({
        data: {
          caseId: id,
          clientKey: input.clientKey,
          text: input.text,
          internal: staff && !!input.internal,
          staffId: staff ? actor.id : null,
          authorKind: staff
            ? actor.role
            : actor.role === "organizer" || actor.role === "admin"
              ? "organizer"
              : "customer",
        },
      });
      await tx.privateUpload.updateMany({
        where: { id: { in: files.map((file) => file.id) } },
        data: { messageId: result.id, caseId: id },
      });
      await tx.platformCase.update({
        where: { id },
        data: { status: "in_progress", updatedAt: new Date() },
      });
      if (staff) {
        await staffAudit(
          tx,
          actor,
          input.internal ? "support.note" : "support.reply",
          "case",
          id,
          undefined,
          undefined,
          undefined,
          id,
        );
        if (row.ownerId && !input.internal)
          await supportNotification(
            tx,
            row.ownerId,
            "Новый ответ поддержки TICKET",
            id,
          );
      }
      return { id: result.id };
    });
  }
  async update(id: string, actor: StaffPrincipal, body: unknown) {
    const input = parse(supportUpdateSchema, body),
      row = await this.access(id, actor);
    return this.db.$transaction(async (tx) => {
      if (
        input.assignedStaffId &&
        !(await tx.staffAccount.findFirst({
          where: { id: input.assignedStaffId, disabledAt: null },
        }))
      )
        throw missing();
      const contextChanged =
        input.orderId !== undefined ||
        input.eventId !== undefined ||
        input.ticketId !== undefined;
      let context = {};
      if (contextChanged) {
        const owner = row.ownerId
          ? await tx.user.findUnique({
              where: { id: row.ownerId },
              select: { role: true },
            })
          : null;
        const guest = row.anonymousSessionId
          ? await tx.anonymousCheckoutSession.findUnique({
              where: { id: row.anonymousSessionId },
              select: { orderId: true },
            })
          : null;
        context = await this.validateContext(
          tx,
          row.ownerId
            ? { userId: row.ownerId, role: owner?.role }
            : {
                anonymousSessionId: row.anonymousSessionId!,
                orderId: guest?.orderId,
              },
          {
            orderId: input.orderId === undefined ? row.orderId : input.orderId,
            eventId: input.eventId === undefined ? row.eventId : input.eventId,
            ticketId:
              input.ticketId === undefined ? row.ticketId : input.ticketId,
          },
        );
      }
      const result = await tx.platformCase.update({
        where: { id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.assignedStaffId !== undefined
            ? { assignedStaffId: input.assignedStaffId }
            : {}),
          ...context,
        },
      });
      await staffAudit(
        tx,
        actor,
        "support.updated",
        "case",
        id,
        input.reason,
        { status: row.status, assignedStaffId: row.assignedStaffId },
        { status: result.status, assignedStaffId: result.assignedStaffId },
        id,
      );
      return result;
    });
  }
  async orderChat(
    id: string,
    actor: StaffPrincipal,
    query: Record<string, string | undefined> = {},
  ) {
    const row = await this.access(id, actor);
    if (!row.orderId) throw missing();
    const { page, limit, skip } = pageOf(query);
    return this.db.$transaction(async (tx) => {
      await staffAudit(
        tx,
        actor,
        "support.order_chat_viewed",
        "order",
        row.orderId!,
        "Linked support investigation",
        undefined,
        undefined,
        id,
      );
      const items = await tx.chatMessage.findMany({
        where: { orderId: row.orderId },
        select: { id: true, sender: true, text: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: limit,
        skip,
      });
      return {
        items,
        total: await tx.chatMessage.count({ where: { orderId: row.orderId } }),
        page,
        limit,
      };
    });
  }
  async upload(
    actor: Participant | StaffPrincipal,
    file: UploadFile | undefined,
    caseId?: string,
  ) {
    if (
      !file ||
      file.buffer.length < 4 ||
      file.buffer.length > 10 * 1024 * 1024
    )
      throw new BadRequestException({ code: "FILE_SIZE_INVALID" });
    if (caseId) await this.access(caseId, actor);
    const staff = "sessionId" in actor;
    await this.auth.rate(
      `upload:${staff ? actor.id : (actor.userId ?? actor.anonymousSessionId)}`,
      25,
      3600,
    );
    const ext = file.originalname.split(".").at(-1)?.toLowerCase();
    let mime: string,
      buffer = file.buffer;
    if (
      ext === "pdf" &&
      buffer.subarray(0, 5).toString() === "%PDF-" &&
      buffer.subarray(-2048).includes(Buffer.from("%%EOF"))
    ) {
      if (
        /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction)\b/i.test(
          buffer.toString("latin1"),
        )
      )
        throw new BadRequestException({ code: "PDF_ACTIVE_CONTENT" });
      mime = "application/pdf";
    } else if (["jpg", "jpeg", "png"].includes(ext ?? "")) {
      try {
        const image = sharp(buffer, { limitInputPixels: 25_000_000 });
        const metadata = await image.metadata();
        if (
          (metadata.format !== "jpeg" && metadata.format !== "png") ||
          (metadata.format === "png") !== (ext === "png")
        )
          throw new Error();
        buffer = await image.rotate().toBuffer();
        mime = metadata.format === "png" ? "image/png" : "image/jpeg";
      } catch {
        throw new BadRequestException({ code: "IMAGE_INVALID" });
      }
    } else throw new BadRequestException({ code: "FILE_TYPE_INVALID" });
    if (buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException({ code: "FILE_SIZE_INVALID" });
    if (mime !== file.mimetype)
      throw new BadRequestException({ code: "FILE_TYPE_MISMATCH" });
    const id = randomUUID(),
      storageKey = `${id}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`,
      name = file.originalname
        .replace(/[\\/]/g, "_")
        .split("")
        .map((char) => (char.charCodeAt(0) < 32 ? "_" : char))
        .join("")
        .slice(0, 150);
    await mkdir(resolve(this.config.storageDir), {
      recursive: true,
      mode: 0o700,
    });
    const path = resolve(this.config.storageDir, storageKey);
    await writeFile(path, buffer, { flag: "wx", mode: 0o600 });
    try {
      return await this.db.privateUpload.create({
        data: {
          id,
          name,
          mime,
          size: buffer.length,
          storageKey,
          ...(staff
            ? { staffId: actor.id }
            : actor.userId
              ? { ownerId: actor.userId }
              : { anonymousSessionId: actor.anonymousSessionId! }),
          ...(caseId ? { caseId } : {}),
        },
        select: fileSelect,
      });
    } catch (error) {
      await unlink(path).catch(() => {});
      throw error;
    }
  }
  async file(id: string, actor: Participant | StaffPrincipal) {
    validId(id);
    const row = await this.db.privateUpload.findUnique({
      where: { id },
      include: {
        message: { select: { internal: true } },
        verification: { select: { organizerId: true } },
      },
    });
    if (!row) throw missing();
    const staff = "sessionId" in actor;
    if (row.verificationId) {
      if (staff && actor.role !== "moderator") throw new ForbiddenException();
      if (!staff && row.verification?.organizerId !== actor.userId)
        throw missing();
    } else if (row.messageId && row.caseId) {
      await this.access(row.caseId, actor);
      if (!staff && row.message?.internal) throw missing();
    } else if (
      staff
        ? row.staffId !== actor.id
        : actor.userId
          ? row.ownerId !== actor.userId
          : row.anonymousSessionId !== actor.anonymousSessionId
    )
      throw missing();
    if (staff)
      await this.db.$transaction((tx) =>
        staffAudit(
          tx,
          actor,
          "private_file.viewed",
          row.verificationId ? "verification" : "case",
          row.verificationId ?? row.caseId ?? id,
          "Protected attachment access",
          undefined,
          undefined,
          row.caseId ?? undefined,
        ),
      );
    return {
      name: row.name,
      mime: row.mime,
      buffer: await readFile(resolve(this.config.storageDir, row.storageKey)),
    };
  }
  async verification(userId: string) {
    return this.db.organizerVerification.findMany({
      where: { organizerId: userId },
      include: { documents: { select: fileSelect } },
      orderBy: { version: "desc" },
      take: 20,
    });
  }
  async submit(userId: string, body: unknown) {
    const input = parse(verificationSchema, body);
    await this.auth.rate(`verify:${userId}`, 5, 3600);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.blockedAt || !["organizer", "admin"].includes(user.role))
        throw new ForbiddenException();
      if (
        await tx.organizerVerification.findFirst({
          where: { organizerId: userId, status: "pending" },
        })
      )
        throw new ConflictException({ code: "VERIFICATION_PENDING" });
      const files = await tx.privateUpload.findMany({
        where: {
          id: { in: input.fileIds },
          ownerId: userId,
          verificationId: null,
          messageId: null,
          caseId: null,
        },
      });
      if (files.length !== input.fileIds.length)
        throw new ForbiddenException({ code: "DOCUMENT_NOT_OWNED" });
      const last = await tx.organizerVerification.findFirst({
        where: { organizerId: userId },
        orderBy: { version: "desc" },
      });
      const linked = await tx.platformCase.create({
        data: {
          ownerId: userId,
          subject: `Проверка организатора: ${input.legalName}`,
        },
      });
      const { fileIds: _, ...details } = input;
      const row = await tx.organizerVerification.create({
        data: {
          ...details,
          organizerId: userId,
          version: (last?.version ?? 0) + 1,
          caseId: linked.id,
        },
      });
      await tx.privateUpload.updateMany({
        where: { id: { in: input.fileIds } },
        data: { verificationId: row.id },
      });
      await tx.user.update({
        where: { id: userId },
        data: { organizerVerifiedAt: null },
      });
      await tx.platformMessage.create({
        data: {
          caseId: linked.id,
          clientKey: randomUUID(),
          authorKind: "organizer",
          text: "Заявка на проверку отправлена. Документы доступны модератору в защищённом разделе.",
        },
      });
      return row;
    });
  }
  async review(id: string, actor: StaffPrincipal, body: unknown) {
    const input = parse(decisionSchema, body);
    return this.db.$transaction(async (tx) => {
      const first = await tx.organizerVerification.findUnique({
        where: { id: validId(id) },
      });
      if (!first) throw missing();
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${first.organizerId}::uuid FOR UPDATE`;
      const row = await tx.organizerVerification.findUniqueOrThrow({
        where: { id },
      });
      const latest = await tx.organizerVerification.findFirst({
        where: { organizerId: row.organizerId },
        orderBy: { version: "desc" },
      });
      if (
        latest?.id !== id ||
        (input.decision === "revoked"
          ? row.status !== "verified"
          : row.status !== "pending")
      )
        throw new ConflictException({ code: "VERIFICATION_STATE_CHANGED" });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: row.organizerId },
      });
      if (input.decision === "verified" && user.blockedAt)
        throw new ConflictException({ code: "ORGANIZER_BLOCKED" });
      const now = new Date();
      const result = await tx.organizerVerification.update({
        where: { id },
        data: {
          status: input.decision,
          reviewedBy: actor.id,
          reviewReason: input.reason,
          reviewedAt: now,
        },
      });
      await tx.user.update({
        where: { id: row.organizerId },
        data: {
          organizerVerifiedAt: input.decision === "verified" ? now : null,
        },
      });
      await tx.platformMessage.create({
        data: {
          caseId: row.caseId,
          clientKey: randomUUID(),
          authorKind: actor.role,
          staffId: actor.id,
          text: `${input.decision}: ${input.reason}`,
        },
      });
      await tx.platformCase.update({
        where: { id: row.caseId },
        data: {
          updatedAt: now,
          status:
            input.decision === "changes_requested" ? "in_progress" : "closed",
        },
      });
      await supportNotification(
        tx,
        row.organizerId,
        `Проверка организатора: ${input.decision}`,
        row.caseId,
      );
      await staffAudit(
        tx,
        actor,
        "verification.reviewed",
        "verification",
        id,
        input.reason,
        { status: row.status },
        { status: input.decision },
        row.caseId,
      );
      return result;
    });
  }
}
