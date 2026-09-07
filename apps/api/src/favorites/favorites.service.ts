import type { PrismaClient } from "@event-platform/database";
import type { FavoriteList, FavoriteMutation } from "@event-platform/shared-types";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { PublicEventsService } from "../public-events/public-events.service.js";

@Injectable()
export class FavoritesService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(PublicEventsService) private readonly publicEvents: PublicEventsService,
  ) {}

  async list(userId: string, page: number, limit: number): Promise<FavoriteList> {
    const [rows, total] = await this.database.$transaction([
      this.database.favorite.findMany({
        where: { userId, event: { status: "published" } },
        orderBy: [{ createdAt: "desc" }, { eventId: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: { eventId: true },
      }),
      this.database.favorite.count({ where: { userId, event: { status: "published" } } }),
    ]);
    const items = (await Promise.all(rows.map((row) => this.publicEvents.summary(row.eventId))))
      .filter((summary): summary is NonNullable<typeof summary> => summary !== null);
    return { items, page, limit, total, hasNext: page * limit < total };
  }

  async add(userId: string, eventId: string): Promise<FavoriteMutation> {
    if (!await this.publicEvents.summary(eventId)) throw this.notFound();
    try {
      await this.database.favorite.create({ data: { userId, eventId } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return { eventId, favorited: true };
  }

  async remove(userId: string, eventId: string): Promise<FavoriteMutation> {
    await this.database.favorite.deleteMany({ where: { userId, eventId } });
    return { eventId, favorited: false };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "P2002";
}
