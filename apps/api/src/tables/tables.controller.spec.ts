import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { OrganizerTablesController, PublicTablesController } from "./tables.controller.js";
import type { TablesService } from "./tables.service.js";

describe("table controllers", () => {
  it("forwards organizer identity only to management and exposes token-based hold/release", async () => {
    const organizerId = randomUUID();
    const layoutId = randomUUID();
    const tableId = randomUUID();
    const service = {
      create: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn(),
      hold: vi.fn(), release: vi.fn(),
    } as unknown as TablesService;
    const organizer = new OrganizerTablesController(service);
    const publicController = new PublicTablesController(service);
    const principal: AuthenticatedPrincipal = { userId: organizerId, role: "organizer" };
    const create = { number: 1, seats: 4, price: 0, deposit: 0, geometry: { x: 10, y: 10, width: 60, height: 60 } };

    await organizer.create(principal, layoutId, create);
    await organizer.list(principal, layoutId, { page: 1, limit: 20 });
    await organizer.get(principal, tableId);
    await organizer.update(principal, tableId, { name: "VIP" });
    await organizer.delete(principal, tableId);
    await publicController.hold(tableId, "request-12345678");
    await publicController.release(tableId, { holdToken: "opaque-hold-token-value" });

    expect(service.create).toHaveBeenCalledWith(organizerId, layoutId, create);
    expect(service.update).toHaveBeenCalledWith(organizerId, tableId, { name: "VIP" });
    expect(service.hold).toHaveBeenCalledWith(tableId, "request-12345678");
    expect(service.release).toHaveBeenCalledWith(tableId, "opaque-hold-token-value");
    expect("confirm" in publicController).toBe(false);
  });
});
