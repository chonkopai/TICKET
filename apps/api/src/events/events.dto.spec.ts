import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { EventListQueryDto, ManagementAnalyticsQueryDto, ManagementOrdersQueryDto } from "./events.dto.js";

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

describe("event request validation", () => {
  it("bounds organizer list pagination", async () => {
    await expect(
      pipe.transform({ page: "1", limit: "51" }, { type: "query", metatype: EventListQueryDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform({ page: "2", limit: "10" }, { type: "query", metatype: EventListQueryDto }),
    ).resolves.toMatchObject({ page: 2, limit: 10 });
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
