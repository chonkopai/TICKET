import type { PrismaClient } from "@event-platform/database";
import { describe, expect, it, vi } from "vitest";

import { NotFoundException } from "@nestjs/common";

import type { DomainEventsService } from "../domain-events/domain-events.service.js";
import type { ObjectStorage } from "./object-storage.js";
import { EventsService } from "./events.service.js";

describe("EventsService.managementOrderFilterOptions", () => {
  it("authorizes the event owner and returns every event table as a usable filter option", async () => {
    const eventId = "00000000-0000-4000-8000-000000000001";
    const organizerId = "00000000-0000-4000-8000-000000000002";
    const findFirst = vi.fn().mockResolvedValue({ id: eventId });
    const findMany = vi.fn().mockResolvedValue([
      { id: "table-1", number: 1, name: null },
      { id: "table-2", number: 2, name: " VIP " },
    ]);
    const service = createService({ event: { findFirst }, table: { findMany } });

    await expect(service.managementOrderFilterOptions(organizerId, eventId)).resolves.toEqual({
      tables: [
        { id: "table-1", label: "Стол 1" },
        { id: "table-2", label: "VIP" },
      ],
    });

    expect(findFirst).toHaveBeenCalledWith({ where: { id: eventId, organizerId } });
    expect(findMany).toHaveBeenCalledWith({
      where: { venueLayout: { eventId } },
      select: { id: true, number: true, name: true },
      orderBy: [{ number: "asc" }, { id: "asc" }],
    });
  });

  it("does not read table options when the authenticated organizer does not own the event", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn();
    const service = createService({ event: { findFirst }, table: { findMany } });

    await expect(
      service.managementOrderFilterOptions("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findMany).not.toHaveBeenCalled();
  });
});

function createService(database: { event: { findFirst: ReturnType<typeof vi.fn> }; table: { findMany: ReturnType<typeof vi.fn> } }): EventsService {
  return new EventsService(database as unknown as PrismaClient, {} as ObjectStorage, {} as DomainEventsService);
}
