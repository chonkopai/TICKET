import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { MyEventsController } from "./my-events.controller.js";
import type { MyEventsService } from "./my-events.service.js";

describe("MyEventsController", () => {
  it("passes the authenticated user and bounded query to the service", async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [], status: "upcoming", page: 1, limit: 20, total: 0, hasNext: false }) } as unknown as MyEventsService;
    const controller = new MyEventsController(service);
    const principal: AuthenticatedPrincipal = { userId: randomUUID(), role: "guest" };
    const query = { status: "upcoming" as const, page: 1, limit: 20 };
    await expect(controller.list(principal, query)).resolves.toMatchObject({ items: [], status: "upcoming" });
    expect(service.list).toHaveBeenCalledWith(principal.userId, "upcoming", 1, 20);
  });
});
