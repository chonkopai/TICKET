import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";
import { UpdateMeDto } from "./dto.js";

describe("regional account preferences", () => {
  it("persists and presents the country, city, and currency together", async () => {
    const input = { defaultCountry: "RU", defaultCity: "Москва", preferredCurrency: "RUB" as const };
    const update = vi.fn().mockImplementation(async ({ data }) => ({ id: "u", telegramId: null, telegramChatId: null, role: "guest", ...data }));
    const tx = { user: { update }, auditLog: { create: vi.fn() }, outboxEvent: { create: vi.fn() } };
    const service = new AuthService({ $transaction: async (work: (value: unknown) => unknown) => work(tx) } as never, {} as never, {} as never, {} as never);
    await expect(service.updateMe("u", input)).resolves.toMatchObject(input);
    expect(update).toHaveBeenCalledWith({ where: { id: "u" }, data: input });
  });
  it.each([{ defaultCountry: "XX" }, { preferredCurrency: "BAD" }])("rejects unsupported regional values %j", async input => {
    expect(await validate(plainToInstance(UpdateMeDto, input))).not.toHaveLength(0);
  });
  it("accepts All countries with no city", async () => {
    expect(await validate(plainToInstance(UpdateMeDto, { defaultCountry: null, defaultCity: null, preferredCurrency: "USD" }))).toHaveLength(0);
  });
});
