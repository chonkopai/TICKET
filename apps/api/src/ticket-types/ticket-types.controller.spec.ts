import { randomUUID } from "node:crypto";

import type { OrganizerTicketType } from "@event-platform/shared-types";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { TicketTypesController } from "./ticket-types.controller.js";
import type { TicketTypesService } from "./ticket-types.service.js";

describe("TicketTypesController", () => {
  it("passes the authenticated organizer to every endpoint", async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    const id = randomUUID();
    const item = sampleTicketType(id, eventId);
    const service = {
      create: vi.fn().mockResolvedValue(item),
      list: vi.fn().mockResolvedValue({ items: [item], page: 1, limit: 20, total: 1, hasNext: false }),
      get: vi.fn().mockResolvedValue(item),
      update: vi.fn().mockResolvedValue(item),
      delete: vi.fn().mockResolvedValue({ deleted: true, id }),
    } as unknown as TicketTypesService;
    const controller = new TicketTypesController(service);
    const principal: AuthenticatedPrincipal = { userId: organizerId, role: "organizer" };
    const create = { name: "VIP", price: 500_000, quantityTotal: 20 };

    await controller.create(principal, eventId, create);
    await controller.list(principal, eventId, { page: 1, limit: 20 });
    await controller.get(principal, id);
    await controller.update(principal, id, { name: "VIP Plus" });
    await controller.delete(principal, id);

    expect(service.create).toHaveBeenCalledWith(organizerId, eventId, create);
    expect(service.list).toHaveBeenCalledWith(organizerId, eventId, { page: 1, limit: 20 });
    expect(service.get).toHaveBeenCalledWith(organizerId, id);
    expect(service.update).toHaveBeenCalledWith(organizerId, id, { name: "VIP Plus" });
    expect(service.delete).toHaveBeenCalledWith(organizerId, id);
  });
});

function sampleTicketType(id: string, eventId: string): OrganizerTicketType {
  const now = new Date().toISOString();
  return {
    id,
    eventId,
    name: "VIP",
    price: 500_000,
    deposit: 0,
    currency: "KZT",
    quantityTotal: 20,
    description: null,
    salesStartAt: null,
    salesEndAt: null,
    restrictions: null,
    status: "draft",
    counters: { total: 20, created: 0, reserved: 0, sold: 0, paid: 0, remaining: 20, refunded: 0, cancelled: 0 },
    createdAt: now,
    updatedAt: now,
  };
}
