import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { CreateEventDto, EventListQueryDto, ManagementAnalyticsQueryDto, ManagementOrdersQueryDto, UpdateEventDto } from "./events.dto.js";

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

describe("event request validation", () => {
  it("accepts supported age ratings and rejects unsupported values", async () => {
    await expect(pipe.transform({ ageRestriction: 18 }, { type: "body", metatype: UpdateEventDto })).resolves.toMatchObject({ ageRestriction: 18 });
    await expect(pipe.transform({ ageRestriction: 17 }, { type: "body", metatype: UpdateEventDto })).rejects.toBeInstanceOf(BadRequestException);
  });
  it("rejects organizerId and lifecycle state in a general update", async () => {
    await expect(
      pipe.transform(
        { title: "Новое название", organizerId: "other-user", status: "published" },
        { type: "body", metatype: UpdateEventDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts a date-shaped value so domain validation can reject impossible dates", async () => {
    const result = await pipe.transform(
      {
        title: "Событие",
        category: "other",
        city: "Алматы",
        date: "2027-02-31",
        time: "19:00",
        venueName: "Зал",
        address: "Адрес",
      },
      { type: "body", metatype: CreateEventDto },
    );

    expect(result).toBeInstanceOf(CreateEventDto);
    expect(result.date).toBe("2027-02-31");
  });

  it("bounds organizer list pagination", async () => {
    await expect(
      pipe.transform({ page: "1", limit: "51" }, { type: "query", metatype: EventListQueryDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform({ page: "2", limit: "10" }, { type: "query", metatype: EventListQueryDto }),
    ).resolves.toMatchObject({ page: 2, limit: 10 });
  });

  it("requires a supported category and non-empty city", async () => {
    await expect(
      pipe.transform(
        { title: "Событие", category: "unknown", city: "Алматы", date: "2027-03-21", time: "19:00", venueName: "Зал", address: "Адрес" },
        { type: "body", metatype: CreateEventDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { title: "Событие", category: "music", city: "", date: "2027-03-21", time: "19:00", venueName: "Зал", address: "Адрес" },
        { type: "body", metatype: CreateEventDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires unambiguous analytics instants and a supported bucket", async () => {
    await expect(
      pipe.transform(
        { from: "2026-09-01T00:00:00", to: "2026-09-02T00:00:00Z", bucket: "day" },
        { type: "query", metatype: ManagementAnalyticsQueryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { from: "2026-09-01T00:00:00Z", to: "2026-09-02T00:00:00Z", bucket: "week" },
        { type: "query", metatype: ManagementAnalyticsQueryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { from: "2026-09-01T00:00:00Z", to: "2026-09-02T00:00:00Z", bucket: "day" },
        { type: "query", metatype: ManagementAnalyticsQueryDto },
      ),
    ).resolves.toMatchObject({ bucket: "day" });
  });

  it("bounds and validates organizer order-list filters", async () => {
    await expect(
      pipe.transform(
        { limit: "101", tableId: "not-a-uuid" },
        { type: "query", metatype: ManagementOrdersQueryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { payment: "paid", booking: "confirmed", attendance: "partial", tableId: "550e8400-e29b-41d4-a716-446655440000" },
        { type: "query", metatype: ManagementOrdersQueryDto },
      ),
    ).resolves.toMatchObject({ page: 1, limit: 20, payment: "paid", booking: "confirmed", attendance: "partial" });
  });
});
