import type { Event, Prisma, PrismaClient } from "@event-platform/database";
import { EventStatus } from "@event-platform/database";
import type {
  CreateEventRequest,
  DeleteEventResponse,
  OrganizerEvent,
  OrganizerEventList,
  UpdateEventRequest,
} from "@event-platform/shared-types";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { MAX_POSTER_BYTES, OBJECT_STORAGE } from "./events.constants.js";
import { presentEvent } from "./events.presenter.js";
import type { ObjectStorage, UploadedPoster } from "./object-storage.js";

type EventTransaction = Pick<Prisma.TransactionClient, "auditLog" | "event" | "outboxEvent">;

@Injectable()
export class EventsService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
  ) {}

  async create(organizerId: string, input: CreateEventRequest): Promise<OrganizerEvent> {
    const data = createData(organizerId, input);
    const event = await this.database.$transaction(async (transaction) => {
      const created = await transaction.event.create({ data });
      await this.recordMutation(transaction, organizerId, created, "event.created", [
        "title",
        "category",
        "city",
        "date",
        "time",
        "timezone",
        "venueName",
        "address",
      ]);
      return created;
    });
    return presentEvent(event);
  }

  async list(
    organizerId: string,
    query: { page: number; limit: number },
  ): Promise<OrganizerEventList> {
    const skip = (query.page - 1) * query.limit;
    const [events, total] = await this.database.$transaction([
      this.database.event.findMany({
        where: { organizerId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit,
      }),
      this.database.event.count({ where: { organizerId } }),
    ]);

    return {
      items: events.map(presentEvent),
      page: query.page,
      limit: query.limit,
      total,
      hasNext: skip + events.length < total,
    };
  }

  async get(organizerId: string, id: string): Promise<OrganizerEvent> {
    return presentEvent(await this.findOwned(this.database, organizerId, id));
  }

  async update(
    organizerId: string,
    id: string,
    input: UpdateEventRequest,
  ): Promise<OrganizerEvent> {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({
        code: "EVENT_UPDATE_EMPTY",
        message: "At least one event field is required",
      });
    }

    const event = await this.database.$transaction(async (transaction) => {
      const current = await this.findOwned(transaction, organizerId, id);
      const data = updateData(input, current);
      const changedFields = Object.keys(data);
      const updated = await transaction.event.update({ where: { id }, data });
      await this.recordMutation(
        transaction,
        organizerId,
        updated,
        "event.updated",
        changedFields,
      );
      return updated;
    });
    return presentEvent(event);
  }

  publish(organizerId: string, id: string): Promise<OrganizerEvent> {
    return this.transition(organizerId, id, EventStatus.published);
  }

  cancel(organizerId: string, id: string): Promise<OrganizerEvent> {
    return this.transition(organizerId, id, EventStatus.cancelled);
  }

  complete(organizerId: string, id: string): Promise<OrganizerEvent> {
    return this.transition(organizerId, id, EventStatus.completed);
  }

  async deleteDraft(organizerId: string, id: string): Promise<DeleteEventResponse> {
    const posterKey = await this.database.$transaction(async (transaction) => {
      const current = await this.findOwned(transaction, organizerId, id);
      if (current.status !== EventStatus.draft) {
        throw new ConflictException({
          code: "EVENT_DELETE_NOT_ALLOWED",
          message: "Only a never-published draft can be permanently deleted",
        });
      }

      const deleted = await transaction.event.deleteMany({
        where: { id, organizerId, status: EventStatus.draft },
      });
      if (deleted.count !== 1) throw invalidTransition();

      await this.domainEvents.append(transaction, {
        eventType: "event.deleted",
        aggregateType: "event",
        aggregateId: id,
        payload: { organizerId, status: EventStatus.draft },
      });
      await transaction.auditLog.create({
        data: {
          actorId: organizerId,
          action: "event.deleted",
          entityType: "event",
          entityId: id,
          meta: { previousStatus: EventStatus.draft },
        },
      });
      return managedPosterKey(current.posterUrl);
    });

    if (posterKey) await this.storage.deletePoster(posterKey);
    return { deleted: true, id };
  }

  async replacePoster(
    organizerId: string,
    id: string,
    file: UploadedPoster | undefined,
  ): Promise<OrganizerEvent> {
    const poster = validatePoster(file);
    await this.findOwned(this.database, organizerId, id);
    const stored = await this.storage.putPoster(poster);

    let result: { event: Event; oldPosterKey: string | null };
    try {
      result = await this.database.$transaction(async (transaction) => {
        const current = await this.findOwned(transaction, organizerId, id);
        const replaced = await transaction.event.updateMany({
          where: { id, organizerId, posterUrl: current.posterUrl },
          data: { posterUrl: stored.url },
        });
        if (replaced.count !== 1) {
          throw new ConflictException({
            code: "EVENT_POSTER_CONFLICT",
            message: "The poster changed while this upload was in progress",
          });
        }

        const updated = await transaction.event.findUniqueOrThrow({ where: { id } });
        await this.recordMutation(transaction, organizerId, updated, "event.updated", [
          "posterUrl",
        ]);
        return { event: updated, oldPosterKey: managedPosterKey(current.posterUrl) };
      });
    } catch (error) {
      await this.storage.deletePoster(stored.key);
      throw error;
    }

    if (result.oldPosterKey) await this.storage.deletePoster(result.oldPosterKey);
    return presentEvent(result.event);
  }

  async removePoster(organizerId: string, id: string): Promise<OrganizerEvent> {
    const result = await this.database.$transaction(async (transaction) => {
      const current = await this.findOwned(transaction, organizerId, id);
      if (!current.posterUrl) return { event: current, oldPosterKey: null };

      const removed = await transaction.event.updateMany({
        where: { id, organizerId, posterUrl: current.posterUrl },
        data: { posterUrl: null },
      });
      if (removed.count !== 1) {
        throw new ConflictException({
          code: "EVENT_POSTER_CONFLICT",
          message: "The poster changed while it was being removed",
        });
      }

      const updated = await transaction.event.findUniqueOrThrow({ where: { id } });
      await this.recordMutation(transaction, organizerId, updated, "event.updated", [
        "posterUrl",
      ]);
      return { event: updated, oldPosterKey: managedPosterKey(current.posterUrl) };
    });

    if (result.oldPosterKey) await this.storage.deletePoster(result.oldPosterKey);
    return presentEvent(result.event);
  }

  private async transition(
    organizerId: string,
    id: string,
    target: "published" | "cancelled" | "completed",
  ): Promise<OrganizerEvent> {
    const event = await this.database.$transaction(async (transaction) => {
      const current = await this.findOwned(transaction, organizerId, id);
      const expected = target === EventStatus.published ? EventStatus.draft : EventStatus.published;
      if (current.status !== expected) throw invalidTransition(current.status, target);
      if (target === EventStatus.published) {
        assertPublishable(current);
        await assertDepositItems(transaction, current);
      }

      const changed = await transaction.event.updateMany({
        where: { id, organizerId, status: expected },
        data: {
          status: target,
          ...(target === EventStatus.published ? { publishedAt: new Date() } : {}),
        },
      });
      if (changed.count !== 1) throw invalidTransition(current.status, target);

      const updated = await transaction.event.findUniqueOrThrow({ where: { id } });
      await this.recordMutation(transaction, organizerId, updated, `event.${target}`, ["status"], {
        previousStatus: current.status,
      });
      return updated;
    });
    return presentEvent(event);
  }

  private async findOwned(
    database: Pick<PrismaClient, "event"> | Pick<Prisma.TransactionClient, "event">,
    organizerId: string,
    id: string,
  ): Promise<Event> {
    const event = await database.event.findFirst({ where: { id, organizerId } });
    if (!event) {
      throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    }
    return event;
  }

  private async recordMutation(
    database: EventTransaction,
    actorId: string,
    event: Event,
    eventType: string,
    changedFields: string[],
    extraMeta: Prisma.InputJsonObject = {},
  ): Promise<void> {
    const meta: Prisma.InputJsonObject = { changedFields, ...extraMeta };
    await this.domainEvents.append(database, {
      eventType,
      aggregateType: "event",
      aggregateId: event.id,
      payload: {
        organizerId: event.organizerId,
        status: event.status,
        changedFields,
        occurredForTimezone: event.timezone,
      },
    });
    await database.auditLog.create({
      data: {
        actorId,
        action: eventType,
        entityType: "event",
        entityId: event.id,
        meta,
      },
    });
  }
}

function createData(organizerId: string, input: CreateEventRequest): Prisma.EventUncheckedCreateInput {
  return {
    organizerId,
    title: requiredText(input.title, "title"),
    category: input.category,
    city: requiredText(input.city, "city"),
    date: parseDate(input.date),
    time: parseTime(input.time),
    timezone: parseTimezone(input.timezone ?? "Asia/Almaty"),
    venueName: requiredText(input.venueName, "venueName"),
    address: requiredText(input.address, "address"),
    announcement: nullableText(input.announcement) ?? null,
    description: nullableText(input.description) ?? null,
    program: nullableText(input.program) ?? null,
    rules: nullableText(input.rules) ?? null,
    visitTerms: nullableText(input.visitTerms) ?? null,
    cancellationTerms: nullableText(input.cancellationTerms) ?? null,
    paymentMode: input.paymentMode ?? "full_payment",
    showFullAmountForDeposit:
      input.paymentMode === "deposit" ? (input.showFullAmountForDeposit ?? false) : false,
    depositTerms: nullableText(input.depositTerms) ?? null,
    extraConditions: nullableText(input.extraConditions) ?? null,
    status: EventStatus.draft,
  };
}

function updateData(input: UpdateEventRequest, current: Event): Prisma.EventUpdateManyMutationInput {
  const data: Prisma.EventUpdateManyMutationInput = {};
  if (input.title !== undefined) data.title = requiredText(input.title, "title");
  if (input.category !== undefined) data.category = input.category;
  if (input.city !== undefined) data.city = requiredText(input.city, "city");
  if (input.date !== undefined) data.date = parseDate(input.date);
  if (input.time !== undefined) data.time = parseTime(input.time);
  if (input.timezone !== undefined) data.timezone = parseTimezone(input.timezone);
  if (input.venueName !== undefined) data.venueName = requiredText(input.venueName, "venueName");
  if (input.address !== undefined) data.address = requiredText(input.address, "address");
  if (input.announcement !== undefined) data.announcement = providedNullableText(input.announcement);
  if (input.description !== undefined) data.description = providedNullableText(input.description);
  if (input.program !== undefined) data.program = providedNullableText(input.program);
  if (input.rules !== undefined) data.rules = providedNullableText(input.rules);
  if (input.visitTerms !== undefined) data.visitTerms = providedNullableText(input.visitTerms);
  if (input.cancellationTerms !== undefined) {
    data.cancellationTerms = providedNullableText(input.cancellationTerms);
  }
  if (input.paymentMode !== undefined || input.showFullAmountForDeposit !== undefined) {
    if (current.status !== EventStatus.draft) {
      throw new ConflictException({
        code: "EVENT_PAYMENT_POLICY_LOCKED",
        message: "Payment policy can only be changed while the event is a draft",
      });
    }
    const paymentMode = input.paymentMode ?? current.paymentMode;
    if (input.paymentMode !== undefined) data.paymentMode = paymentMode;
    data.showFullAmountForDeposit =
      paymentMode === "deposit"
        ? (input.showFullAmountForDeposit ?? current.showFullAmountForDeposit)
        : false;
  }
  if (input.depositTerms !== undefined) {
    data.depositTerms = providedNullableText(input.depositTerms);
  }
  if (input.extraConditions !== undefined) {
    data.extraConditions = providedNullableText(input.extraConditions);
  }
  return data;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException({
      code: "EVENT_FIELD_REQUIRED",
      message: `${field} cannot be blank`,
    });
  }
  return normalized;
}

function nullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() || null;
}

function providedNullableText(value: string | null): string | null {
  if (value === null) return null;
  return value.trim() || null;
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw invalidDate();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw invalidDate();
  }
  return date;
}

function parseTime(value: string): Date {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new BadRequestException({ code: "EVENT_TIME_INVALID", message: "time is invalid" });
  }
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function parseTimezone(value: string): string {
  const normalized = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format();
  } catch {
    throw new BadRequestException({
      code: "EVENT_TIMEZONE_INVALID",
      message: "timezone must be a valid IANA timezone",
    });
  }
  return normalized;
}

function invalidDate(): BadRequestException {
  return new BadRequestException({ code: "EVENT_DATE_INVALID", message: "date is invalid" });
}

function assertPublishable(event: Event): void {
  const missingFields: string[] = [];
  if (!event.title.trim()) missingFields.push("title");
  if (!event.category) missingFields.push("category");
  if (!event.city.trim()) missingFields.push("city");
  if (!event.venueName.trim()) missingFields.push("venueName");
  if (!event.address.trim()) missingFields.push("address");
  if (!event.description?.trim()) missingFields.push("description");
  if (!event.cancellationTerms?.trim()) missingFields.push("cancellationTerms");
  if (event.paymentMode === "deposit" && !event.depositTerms?.trim()) {
    missingFields.push("depositTerms");
  }
  if (missingFields.length > 0) {
    throw new BadRequestException({
      code: "EVENT_PUBLISH_VALIDATION_FAILED",
      message: "Event is missing fields required for publication",
      details: { missingFields },
    });
  }
}

async function assertDepositItems(transaction: Prisma.TransactionClient, event: Event): Promise<void> {
  if (event.paymentMode !== "deposit") return;
  const ticketTypes = await transaction.ticketType.findMany({
    where: { eventId: event.id, status: { in: ["active", "sold_out"] } },
    select: { deposit: true, price: true },
  });
  const tables = await transaction.table.findMany({
    where: { venueLayout: { eventId: event.id }, status: "available" },
    select: { deposit: true, price: true },
  });
  const invalid = [...ticketTypes, ...tables].some(({ deposit, price }) =>
    deposit <= 0 || (event.showFullAmountForDeposit && price < deposit),
  );
  if (invalid) {
    throw new BadRequestException({
      code: "EVENT_PUBLISH_VALIDATION_FAILED",
      message: "Every purchasable ticket and table requires a positive deposit",
      details: { missingFields: ["itemDeposit"] },
    });
  }
}

function invalidTransition(current?: string, target?: string): ConflictException {
  return new ConflictException({
    code: "EVENT_INVALID_TRANSITION",
    message: "Event lifecycle transition is not allowed",
    details: current && target ? { current, target } : undefined,
  });
}

function validatePoster(file: UploadedPoster | undefined): {
  body: Buffer;
  contentType: string;
  extension: "jpg" | "png" | "webp";
} {
  if (!file?.buffer?.length) {
    throw new BadRequestException({ code: "POSTER_REQUIRED", message: "Poster file is required" });
  }
  if (file.size > MAX_POSTER_BYTES || file.buffer.byteLength > MAX_POSTER_BYTES) {
    throw new BadRequestException({
      code: "POSTER_TOO_LARGE",
      message: "Poster must not exceed 5 MB",
    });
  }

  const detected = detectImage(file.buffer);
  if (!detected || detected.contentType !== file.mimetype.toLowerCase()) {
    throw new BadRequestException({
      code: "POSTER_TYPE_INVALID",
      message: "Poster must be a valid JPEG, PNG, or WebP image",
    });
  }
  return { body: file.buffer, ...detected };
}

function detectImage(
  body: Buffer,
): { contentType: string; extension: "jpg" | "png" | "webp" } | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    body.length >= 8 &&
    body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString("ascii") === "RIFF" &&
    body.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

function managedPosterKey(url: string | null): string | null {
  const prefix = "/media/posters/";
  return url?.startsWith(prefix) ? url.slice(prefix.length) : null;
}
