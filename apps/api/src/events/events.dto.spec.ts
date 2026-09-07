import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { CreateEventDto, EventListQueryDto, UpdateEventDto } from "./events.dto.js";

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

describe("event request validation", () => {
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
});
