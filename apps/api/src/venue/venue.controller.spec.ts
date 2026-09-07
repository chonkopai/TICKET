import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { VenueController } from "./venue.controller.js";
import type { VenueService } from "./venue.service.js";

describe("VenueController", () => {
  it("passes the authenticated owner through all layout and template operations", async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    const layoutId = randomUUID();
    const templateId = randomUUID();
    const service = {
      createForEvent: vi.fn(), getForEvent: vi.fn(), applyTemplate: vi.fn(), listTemplates: vi.fn(),
      saveTemplate: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn(),
    } as unknown as VenueService;
    const controller = new VenueController(service);
    const principal: AuthenticatedPrincipal = { userId: organizerId, role: "organizer" };

    await controller.createEventLayout(principal, eventId, {});
    await controller.getEventLayout(principal, eventId);
    await controller.applyTemplate(principal, eventId, { templateId });
    await controller.listTemplates(principal, { page: 1, limit: 20 });
    await controller.saveTemplate(principal, layoutId, { name: "Схема" });
    await controller.get(principal, layoutId);
    await controller.update(principal, layoutId, { templateName: "Новая" });
    await controller.delete(principal, layoutId);

    expect(service.createForEvent).toHaveBeenCalledWith(organizerId, eventId, {});
    expect(service.applyTemplate).toHaveBeenCalledWith(organizerId, eventId, templateId);
    expect(service.saveTemplate).toHaveBeenCalledWith(organizerId, layoutId, "Схема");
    expect(service.delete).toHaveBeenCalledWith(organizerId, layoutId);
  });
});
