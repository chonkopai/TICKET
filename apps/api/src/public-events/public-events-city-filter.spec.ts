import type { PrismaClient } from "@event-platform/database";
import { describe, expect, it, vi } from "vitest";
import type { TablesService } from "../tables/tables.service.js";
import type { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import { PublicEventsService } from "./public-events.service.js";

describe("catalog city filtering", () => {
  it.each(["Алматы", "Almaty"])("matches published city spellings for %s", async city => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([]);
    const database = { event: { count, findMany } } as unknown as PrismaClient;
    const service = new PublicEventsService(database, {} as TicketTypesService, {} as TablesService);
    await service.list({ page: 1, limit: 12, sort: "recent", countryCode: "KZ", city });
    const expected = {
      status: "published", countryCode: "KZ",
      AND: [{ OR: [
        { city: { contains: "Алматы", mode: "insensitive" } },
        { city: { contains: "Almaty", mode: "insensitive" } },
      ] }],
    };
    expect(count).toHaveBeenCalledWith({ where: expected });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expected }));
  });
});
