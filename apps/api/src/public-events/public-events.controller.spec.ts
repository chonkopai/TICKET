import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { PublicEventsController } from "./public-events.controller.js";
import type { PublicEventsService } from "./public-events.service.js";

describe("PublicEventsController", () => {
  it("delegates anonymous event reads", async () => {
    const event: { id: string; title: string } = { id: randomUUID(), title: "Открытое событие" };
    const service = { get: vi.fn().mockResolvedValue(event) } as unknown as PublicEventsService;
    const controller = new PublicEventsController(service);
    await expect(controller.get(event.id)).resolves.toBe(event);
    expect(service.get).toHaveBeenCalledWith(event.id);
  });

  it("delegates public event discovery queries", async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [], page: 1, limit: 12, total: 0, hasNext: false }) } as unknown as PublicEventsService;
    const controller = new PublicEventsController(service);
    const query = { page: 1, limit: 12, sort: "recent" as const };
    await expect(controller.list(query)).resolves.toMatchObject({ total: 0 });
    expect(service.list).toHaveBeenCalledWith(query);
  });
});
