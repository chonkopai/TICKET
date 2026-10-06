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
      dashboard: vi.fn().mockResolvedValue({ totalEvents: 1 }),
      managementSummary: vi.fn().mockResolvedValue({ event: { id: event.id } }),
      managementAnalytics: vi.fn().mockResolvedValue({ eventId: event.id, buckets: [] }),
      managementAnalyticsExport: vi.fn().mockResolvedValue("analytics-csv"),
      managementOrders: vi.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, hasNext: false }),
      managementOrderFilterOptions: vi.fn().mockResolvedValue({ tables: [] }),
      managementOrdersExport: vi.fn().mockResolvedValue("orders-csv"),
      managementOrderDetail: vi.fn().mockResolvedValue({ id: randomUUID(), eventId: event.id }),
      get: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockResolvedValue(event),
      publish: vi.fn().mockResolvedValue({ ...event, status: "published" }),
      reopen: vi.fn().mockResolvedValue({ ...event, status: "published" }),
      cancel: vi.fn().mockResolvedValue({ ...event, status: "cancelled" }),
      complete: vi.fn().mockResolvedValue({ ...event, status: "completed" }),
      replacePoster: vi.fn().mockResolvedValue({ ...event, posterUrl: "/media/posters/example.png" }),
      removePoster: vi.fn().mockResolvedValue(event),
      deleteDraft: vi.fn().mockResolvedValue({ deleted: true, id: event.id }),
    } as unknown as EventsService;
    const controller = new EventsController(events, publicEvents as never);
    const principal: AuthenticatedPrincipal = { userId: event.organizerId, role: "organizer" };
    const analyticsQuery = { from: "2027-01-01T00:00:00Z", to: "2027-01-02T00:00:00Z", bucket: "day" as const };
    const ordersQuery = { page: 1, limit: 20, payment: "all" as const, booking: "all" as const, attendance: "all" as const };
    const orderId = randomUUID();
    const analyticsResponse = { setHeader: vi.fn(), type: vi.fn(), send: vi.fn() };
    const ordersResponse = { setHeader: vi.fn(), type: vi.fn(), send: vi.fn() };

    await controller.list(principal, { page: 1, limit: 20 });
    await controller.dashboard(principal);
    await controller.managementSummary(principal, event.id);
    await controller.managementAnalytics(principal, event.id, analyticsQuery);
    await controller.managementAnalyticsExport(principal, event.id, analyticsQuery, analyticsResponse);
    await controller.managementOrders(principal, event.id, ordersQuery);
    await controller.managementOrderFilterOptions(principal, event.id);
    await controller.managementOrdersExport(principal, event.id, ordersQuery, ordersResponse);
    await controller.managementOrderDetail(principal, event.id, orderId);
    await controller.get(principal, event.id);
    await controller.preview(principal, event.id);
    await controller.reopen(principal, event.id);
    await controller.cancel(principal, event.id);
    await controller.complete(principal, event.id);
    await controller.deleteDraft(principal, event.id);

    expect(events.list).toHaveBeenCalledWith(principal.userId, { page: 1, limit: 20 });
    expect(events.dashboard).toHaveBeenCalledWith(principal.userId);
    expect(events.managementSummary).toHaveBeenCalledWith(principal.userId, event.id);
    expect(events.managementAnalytics).toHaveBeenCalledWith(principal.userId, event.id, analyticsQuery);
    expect(events.managementAnalyticsExport).toHaveBeenCalledWith(principal.userId, event.id, analyticsQuery);
    expect(events.managementOrders).toHaveBeenCalledWith(principal.userId, event.id, ordersQuery);
    expect(events.managementOrderFilterOptions).toHaveBeenCalledWith(principal.userId, event.id);
    expect(events.managementOrdersExport).toHaveBeenCalledWith(principal.userId, event.id, ordersQuery);
    expect(events.managementOrderDetail).toHaveBeenCalledWith(principal.userId, event.id, orderId);
    expect(analyticsResponse.send).toHaveBeenCalledWith("analytics-csv");
    expect(ordersResponse.send).toHaveBeenCalledWith("orders-csv");
    expect(events.get).toHaveBeenCalledWith(principal.userId, event.id);
    expect(publicEvents.preview).toHaveBeenCalledWith(principal.userId, event.id, expect.any(Date), false, undefined);
    expect(events.reopen).toHaveBeenCalledWith(principal.userId, event.id);
    expect(events.cancel).toHaveBeenCalledWith(principal.userId, event.id);
    expect(events.complete).toHaveBeenCalledWith(principal.userId, event.id);
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
    countryCode: "KZ",
    city: "Алматы",
    posterUrl: null,
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
    ageRestriction: 0,
    address: "Адрес",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}
