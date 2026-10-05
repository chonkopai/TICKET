import { Prisma, type PrismaClient } from "@event-platform/database";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { zonedInputToIso } from "@event-platform/shared-types";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { OBJECT_STORAGE } from "./events.constants.js";
import type { ObjectStorage, UploadedPoster } from "./object-storage.js";
import { validatePoster } from "./image-upload.js";
import { EventNotificationsService } from "./event-notifications.service.js";

const MAX_RECIPIENTS = 5_000;
const MAX_DAILY_CAMPAIGNS = 3;
const IMAGE_URL = /^\/media\/posters\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/;

@Injectable()
export class MarketingCampaignService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: PrismaClient,
    @Inject(EventNotificationsService) private readonly notifications: EventNotificationsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async preview(organizerId: string, eventId: string) {
    const event = await this.ownedEvent(organizerId, eventId);
    const recipients = await this.notifications.marketingAudience(eventId);
    return { eventId, eventTitle: event.title, eligibleCount: recipients.length, channel: "telegram" as const,
      description: "Покупатели этого события с согласием на анонсы и подключённым Telegram" };
  }

  async createDraft(organizerId: string, eventId: string, input: { message: string; requestKey: string }): Promise<Awaited<ReturnType<MarketingCampaignService["status"]>>> {
    await this.ownedEvent(organizerId, eventId);
    const message = cleanMessage(input.message);
    const existing = await this.db.broadcast.findUnique({ where: { requestKey: input.requestKey }, select: { id: true, organizerId: true, eventId: true, type: true, message: true } });
    if (existing) {
      if (existing.organizerId !== organizerId || existing.eventId !== eventId || existing.type !== "marketing.campaign" || existing.message !== message) throw new ConflictException({ code: "REQUEST_KEY_USED" });
      return this.status(organizerId, eventId, existing.id);
    }
    try {
      const row = await this.db.broadcast.create({ data: { organizerId, eventId, requestKey: input.requestKey, type: "marketing.campaign", message, audience: { kind: "event_buyers_opted_in", channel: "telegram" }, status: "draft" } });
      return this.status(organizerId, eventId, row.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return this.createDraft(organizerId, eventId, input);
      throw error;
    }
  }

  async updateDraft(organizerId: string, eventId: string, campaignId: string, messageInput: string) {
    const campaign = await this.ownedDraft(organizerId, eventId, campaignId);
    const message = cleanMessage(messageInput);
    if (campaign.imageUrl && message.length > 900) throw new BadRequestException({ code: "CAMPAIGN_IMAGE_CAPTION_TOO_LONG" });
    const changed = await this.db.broadcast.updateMany({ where: { id: campaignId, organizerId, eventId, status: "draft" }, data: { message } });
    if (changed.count !== 1) throw new ConflictException({ code: "CAMPAIGN_ALREADY_SENT" });
    return this.status(organizerId, eventId, campaignId);
  }

  async uploadImage(organizerId: string, eventId: string, campaignId: string, file: UploadedPoster | undefined) {
    const campaign = await this.ownedDraft(organizerId, eventId, campaignId);
    if (campaign.message.length > 900) throw new BadRequestException({ code: "CAMPAIGN_IMAGE_CAPTION_TOO_LONG" });
    const image = validatePoster(file);
    const stored = await this.storage.putPoster(image);
    try {
      const changed = await this.db.broadcast.updateMany({ where: { id: campaignId, organizerId, eventId, status: "draft", imageUrl: campaign.imageUrl }, data: { imageUrl: stored.url } });
      if (changed.count !== 1) throw new ConflictException({ code: "CAMPAIGN_CHANGED" });
    } catch (error) { await this.storage.deletePoster(stored.key); throw error; }
    const oldKey = campaign.imageUrl?.match(IMAGE_URL)?.[1];
    if (oldKey) await this.storage.deletePoster(oldKey);
    return this.status(organizerId, eventId, campaignId);
  }

  async send(organizerId: string, eventId: string, campaignId: string) {
    const event = await this.ownedEvent(organizerId, eventId);
    const campaign = await this.db.broadcast.findFirst({ where: { id: campaignId, organizerId, eventId, type: "marketing.campaign" }, select: { status: true, message: true, imageUrl: true } });
    if (!campaign) throw new NotFoundException({ code: "CAMPAIGN_NOT_FOUND" });
    if (campaign.status !== "draft") return this.status(organizerId, eventId, campaignId);
    if (event.status !== "published" || new Date(startIso(event)).getTime() <= Date.now()) throw new ConflictException({ code: "CAMPAIGN_EVENT_NOT_ACTIVE" });
    if (campaign.imageUrl && campaign.message.length > 900) throw new BadRequestException({ code: "CAMPAIGN_IMAGE_CAPTION_TOO_LONG" });
    const recipients = await this.notifications.marketingAudience(eventId);
    if (!recipients.length) throw new ConflictException({ code: "CAMPAIGN_NO_CONSENTED_RECIPIENTS" });
    if (recipients.length > MAX_RECIPIENTS) throw new ConflictException({ code: "CAMPAIGN_AUDIENCE_TOO_LARGE" });
    try {
      await this.db.$transaction(async (tx) => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recent = await tx.auditLog.count({ where: { actorId: organizerId, action: "marketing.campaign_queued", createdAt: { gte: since } } });
        if (recent >= MAX_DAILY_CAMPAIGNS) throw new ConflictException({ code: "CAMPAIGN_DAILY_LIMIT" });
        const changed = await tx.broadcast.updateMany({ where: { id: campaignId, organizerId, eventId, status: "draft" }, data: { status: "queued", audienceCount: recipients.length, recipientCount: recipients.length, audience: { kind: "event_buyers_opted_in", channel: "telegram", frozenAt: new Date().toISOString() } } });
        if (changed.count !== 1) return;
        await tx.notification.createMany({ data: recipients.map((recipient) => ({
          broadcastId: campaignId, recipientKey: `user:${recipient.userId}`, userId: recipient.userId, telegramId: recipient.chatId,
          eventId, channel: "telegram" as const, type: "marketing.campaign", payload: { text: campaign.message, eventId, ...(campaign.imageUrl ? { imageUrl: campaign.imageUrl } : {}) }, nextAttemptAt: new Date(),
        })) });
        await tx.auditLog.create({ data: { actorId: organizerId, action: "marketing.campaign_queued", entityType: "broadcast", entityId: campaignId, meta: { eventId, recipientCount: recipients.length } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new ConflictException({ code: "CAMPAIGN_SEND_CONFLICT", message: "Проверьте состояние кампании и повторите попытку" });
      throw error;
    }
    return this.status(organizerId, eventId, campaignId);
  }

  async list(organizerId: string, eventId: string) {
    await this.ownedEvent(organizerId, eventId);
    const rows = await this.db.broadcast.findMany({ where: { organizerId, eventId, type: "marketing.campaign" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { id: true } });
    return Promise.all(rows.map((row) => this.status(organizerId, eventId, row.id)));
  }

  async status(organizerId: string, eventId: string, campaignId: string) {
    const row = await this.db.broadcast.findFirst({ where: { id: campaignId, organizerId, eventId, type: "marketing.campaign" }, select: { imageUrl: true } });
    if (!row) throw new NotFoundException({ code: "CAMPAIGN_NOT_FOUND" });
    const status = await this.notifications.status(organizerId, eventId, campaignId);
    return { ...status, imageUrl: row.imageUrl };
  }

  private async ownedEvent(organizerId: string, eventId: string) {
    const event = await this.db.event.findFirst({ where: { id: eventId, organizerId }, select: { id: true, title: true, status: true, date: true, time: true, timezone: true } });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND" });
    return event;
  }

  private async ownedDraft(organizerId: string, eventId: string, campaignId: string) {
    await this.ownedEvent(organizerId, eventId);
    const row = await this.db.broadcast.findFirst({ where: { id: campaignId, organizerId, eventId, type: "marketing.campaign" }, select: { message: true, imageUrl: true, status: true } });
    if (!row) throw new NotFoundException({ code: "CAMPAIGN_NOT_FOUND" });
    if (row.status !== "draft") throw new ConflictException({ code: "CAMPAIGN_ALREADY_SENT" });
    return row;
  }
}

function cleanMessage(message: string): string {
  const value = message.trim();
  if (!value || value.length > 2_000) throw new BadRequestException({ code: "CAMPAIGN_MESSAGE_INVALID" });
  return value;
}
function startIso(event: { date: Date; time: Date; timezone: string }): string {
  return zonedInputToIso(`${event.date.toISOString().slice(0, 10)}T${event.time.toISOString().slice(11, 16)}`, event.timezone);
}
