import { randomUUID } from "node:crypto";

import type { OrganizerEvent } from "@event-platform/shared-types";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { EventsController } from "./events.controller.js";
import type { EventsService } from "./events.service.js";

describe("EventsController", () => {
  it("delegates every endpoint with the authenticated owner id", async () => {
    const event = sampleEvent();
    const publicEvents = { preview: vi.fn().mockResolvedValue({ ...event, status: "draft" }) };
    const events = {
      create: vi.fn().mockResolvedValue(event),
      list: vi.fn().mockResolvedValue({ items: [event], page: 1, limit: 20, total: 1, hasNext: false }),
      get: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockResolvedValue(event),
      publish: vi.fn().mockResolvedValue({ ...event, status: "published" }),
      cancel: vi.fn().mockResolvedValue({ ...event, status: "cancelled" }),
      complete: vi.fn().mockResolvedValue({ ...event, status: "completed" }),
      replacePoster: vi.fn().mockResolvedValue({ ...event, posterUrl: "/media/posters/example.png" }),
      removePoster: vi.fn().mockResolvedValue(event),
      deleteDraft: vi.fn().mockResolvedValue({ deleted: true, id: event.id }),
    } as unknown as EventsService;
    const controller = new EventsController(events, publicEvents as never);
    const principal: AuthenticatedPrincipal = { userId: event.organizerId, role: "organizer" };
    const create = {
      title: event.title,
      category: event.category,
      city: event.city,
      date: event.date,
      time: event.time,
      venueName: event.venueName,
      address: event.address,
    };
    const file = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimetype: "image/png",
      originalname: "poster.png",
      size: 4,
    };

    await controller.create(principal, create);
    await controller.list(principal, { page: 1, limit: 20 });
    await controller.get(principal, event.id);
    await controller.preview(principal, event.id);
    await controller.update(principal, event.id, { title: "Обновлено" });
    await controller.publish(principal, event.id);
    await controller.cancel(principal, event.id);
    await controller.complete(principal, event.id);
    await controller.replacePoster(principal, event.id, file);
    await controller.removePoster(principal, event.id);
    await controller.deleteDraft(principal, event.id);

    expect(events.create).toHaveBeenCalledWith(principal.userId, create);
    expect(events.list).toHaveBeenCalledWith(principal.userId, { page: 1, limit: 20 });
    expect(events.get).toHaveBeenCalledWith(principal.userId, event.id);
    expect(publicEvents.preview).toHaveBeenCalledWith(principal.userId, event.id, expect.any(Date), false);
    expect(events.update).toHaveBeenCalledWith(principal.userId, event.id, { title: "Обновлено" });
    expect(events.publish).toHaveBeenCalledWith(principal.userId, event.id);
    expect(events.cancel).toHaveBeenCalledWith(principal.userId, event.id);
    expect(events.complete).toHaveBeenCalledWith(principal.userId, event.id);
    expect(events.replacePoster).toHaveBeenCalledWith(principal.userId, event.id, file);
    expect(events.removePoster).toHaveBeenCalledWith(principal.userId, event.id);
    expect(events.deleteDraft).toHaveBeenCalledWith(principal.userId, event.id);
  });
});

function sampleEvent(): OrganizerEvent {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    organizerId: randomUUID(),
    title: "Событие",
    category: "other",
    city: "Алматы",
    posterUrl: null,
    announcement: null,
    description: null,
    program: null,
    rules: null,
    visitTerms: null,
    cancellationTerms: null,
    paymentMode: "full_payment",
    showFullAmountForDeposit: false,
    depositTerms: null,
    extraConditions: null,
    date: "2027-03-21",
    time: "19:00",
    timezone: "Asia/Almaty",
    venueName: "Зал",
    address: "Адрес",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}
