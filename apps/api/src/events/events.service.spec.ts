import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { presentEvent } from "./events.presenter.js";
import { validatePoster } from "./image-upload.js";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { EventsService } from "./events.service.js";
import type { ObjectStorage, PutPosterInput, UploadedPoster } from "./object-storage.js";

const organizerA = randomUUID();
const organizerB = randomUUID();
const eventIds: string[] = [];
const managementOrderIds: string[] = [];

afterEach(() => vi.useRealTimers());

class MemoryStorage implements ObjectStorage {
  readonly stored: string[] = [];
  readonly deleted: string[] = [];

  async putPoster(input: PutPosterInput): Promise<{ key: string; url: string }> {
    const key = `${randomUUID()}.${input.extension}`;
    this.stored.push(key);
    return { key, url: `/media/posters/${key}` };
  }

  async readPoster(): Promise<{ body: Buffer; contentType: string }> {
    return { body: Buffer.alloc(0), contentType: "image/png" };
  }

  async deletePoster(key: string): Promise<void> {
    this.deleted.push(key);
  }
}

class ToggleDomainEvents extends DomainEventsService {
  fail = false;

  override append(...parameters: Parameters<DomainEventsService["append"]>): Promise<unknown> {
    if (this.fail) return Promise.reject(new Error("simulated outbox failure"));
    return super.append(...parameters);
  }
}

beforeAll(async () => {
  const telegramBase = BigInt(Date.now()) * 10_000n;
  await prisma.user.createMany({
    data: [
      { id: organizerA, telegramId: telegramBase + 301n, role: "organizer", name: "Организатор A" },
      { id: organizerB, telegramId: telegramBase + 302n, role: "organizer", name: "Организатор B" },
    ],
  });
});

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: managementOrderIds } } });
  await prisma.event.deleteMany({ where: { organizerId: { in: [organizerA, organizerB] } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: eventIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [organizerA, organizerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [organizerA, organizerB] } } });
  await prisma.$disconnect();
});

describe("EventsService", () => {
  it("groups individually priced row seats into one row with sold-seat totals", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const event = await createLegacyFixture(organizerA, completeInput());
    eventIds.push(event.id);
    const layout = await prisma.venueLayout.create({ data: { eventId: event.id, templateName: "Ряды", layoutJson: {} } });
    const row = await prisma.venueRow.create({ data: { venueLayoutId: layout.id, number: 1, name: "Партер A", price: 20_000, currency: "KZT" } });
    const first = await prisma.ticketType.create({ data: { eventId: event.id, name: "Место 1", price: 20_000, currency: "KZT", quantityTotal: 1, status: "active" } });
    const second = await prisma.ticketType.create({ data: { eventId: event.id, name: "Место 2", price: 20_000, currency: "KZT", quantityTotal: 1, status: "active" } });
    const seat = await prisma.seat.create({ data: { venueLayoutId: layout.id, rowId: row.id, number: 1, label: "1", sortOrder: 1, ticketTypeId: first.id } });
    await prisma.seat.create({ data: { venueLayoutId: layout.id, rowId: row.id, number: 2, label: "2", sortOrder: 2, ticketTypeId: second.id } });
    const order = await prisma.order.create({ data: { type: "ticket", amount: 20_000, currency: "KZT", paymentStatus: "paid" } });
    managementOrderIds.push(order.id);
    const ticket = await prisma.ticket.create({ data: { ticketTypeId: first.id, orderId: order.id, qrToken: randomUUID(), status: "active", paidAt: new Date() } });
    await prisma.seatAllocation.create({ data: { seatId: seat.id, orderId: order.id, ticketId: ticket.id, status: "consumed" } });
    const groups = (await service.managementSummary(organizerA, event.id)).inventory.saleGroups;
    expect(groups).toEqual([expect.objectContaining({ id: `row:${row.id}`, name: "Партер A", unit: "seats", configured: 2, sold: 1, buyable: 1, ticketTypeIds: expect.arrayContaining([first.id, second.id]) })]);
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.event.delete({ where: { id: event.id } });
  });

  it("preserves owner-scoped historical reads, pagination and draft deletion", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const created = await createLegacyFixture(organizerA, completeInput()); eventIds.push(created.id);
    await expect(service.get(organizerA, created.id)).resolves.toEqual(created);
    await expect(service.get(organizerB, created.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.list(organizerA, {page:1,limit:50})).items.map(row=>row.id)).toContain(created.id);
    await expect(service.deleteDraft(organizerB, created.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDraft(organizerA, created.id)).resolves.toEqual({deleted:true,id:created.id});
    await expect(mutationCounts(created.id)).resolves.toEqual({outbox:1,audit:1});
  });

  it("preserves completion/reopening and never reopens a cancelled historical event", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const cancelled = await createLegacyFixture(organizerA, completeInput()); eventIds.push(cancelled.id);
    await prisma.event.update({where:{id:cancelled.id},data:{status:"published"}});
    await service.cancel(organizerA,cancelled.id);
    await expect(service.reopen(organizerA,cancelled.id)).rejects.toBeInstanceOf(ConflictException);
    const completed = await createLegacyFixture(organizerA, completeInput()); eventIds.push(completed.id);
    await prisma.event.update({where:{id:completed.id},data:{status:"published"}});
    await service.complete(organizerA,completed.id);
    await expect(service.reopen(organizerA,completed.id)).resolves.toMatchObject({status:"published"});
    await expect(mutationCounts(completed.id)).resolves.toEqual({outbox:2,audit:2});
  });

  it("rolls back a lifecycle change when outbox persistence fails", async () => {
    const domain = new ToggleDomainEvents(); const service = new EventsService(prisma,new MemoryStorage(),domain);
    const event = await createLegacyFixture(organizerA,completeInput()); eventIds.push(event.id);
    await prisma.event.update({where:{id:event.id},data:{status:"published"}}); domain.fail=true;
    await expect(service.cancel(organizerA,event.id)).rejects.toThrow("simulated outbox failure");
    expect((await service.get(organizerA,event.id)).status).toBe("published");
    await expect(mutationCounts(event.id)).resolves.toEqual({outbox:0,audit:0});
  });

  it("retains MIME validation for campaign and organizer-photo uploads", () => {
    expect(()=>validatePoster({...pngPoster(),mimetype:"image/jpeg"})).toThrow(BadRequestException);
  });

  it("returns server-side inventory and paid revenue metrics for organizer workspaces", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const event = await createLegacyFixture(organizerA, completeInput());
    eventIds.push(event.id);
    const ticketType = await prisma.ticketType.create({ data: { eventId: event.id, name: "Workspace", price: 250_000, currency: "KZT", quantityTotal: 10, quantitySold: 2, status: "active" } });
    const order = await prisma.order.create({ data: { type: "ticket", buyerUserId: organizerA, amount: 500_000, currency: "KZT", paymentStatus: "paid", checkoutSnapshot: { eventId: event.id, eventTitle: event.title, itemName: ticketType.name, quantity: 2 } } });
    await prisma.ticket.create({ data: { ticketTypeId: ticketType.id, orderId: order.id, ownerUserId: organizerA, qrToken: randomUUID(), status: "active" } });

    try {
      const list = await service.list(organizerA, { page: 1, limit: 50, statusGroup: "all", sort: "updated_desc" });
      expect(list.items.find(({ id }) => id === event.id)?.metrics).toMatchObject({ mode: "ordinary", sold: 2, capacity: 10, remaining: 8, settledRevenue: 500_000, currency: "KZT" });
      const dashboard = await service.dashboard(organizerA);
      expect(dashboard.currency).toBe("KZT");
      expect(dashboard.settledRevenue).toBeGreaterThanOrEqual(500_000);
    } finally {
      await prisma.order.delete({ where: { id: order.id } });
    }
  });

  it("returns an owner-scoped management snapshot without double-counting mixed inventory", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T10:30:00.000Z"));
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const event = await createLegacyFixture(organizerA, completeInput());
    eventIds.push(event.id);
    const future = new Date(Date.now() + 60_000);
    const orderIds: string[] = [];

    try {
      const ordinary = await prisma.ticketType.create({ data: { eventId: event.id, name: "Обычный", price: 25_000, currency: "KZT", quantityTotal: 10, quantitySold: 2, status: "active" } });
      const seatType = await prisma.ticketType.create({ data: { eventId: event.id, name: "Ряд A", price: 20_000, currency: "KZT", quantityTotal: 2, status: "active" } });
      const layout = await prisma.venueLayout.create({ data: { eventId: event.id, templateName: "test", layoutJson: {} } });
      const soldSeat = await prisma.seat.create({ data: { venueLayoutId: layout.id, number: 1, label: "A-1", sortOrder: 1, ticketTypeId: seatType.id } });
      const heldSeat = await prisma.seat.create({ data: { venueLayoutId: layout.id, number: 2, label: "A-2", sortOrder: 2, ticketTypeId: seatType.id } });
      await prisma.seat.create({ data: { venueLayoutId: layout.id, number: 3, label: "A-3", sortOrder: 3, ticketTypeId: seatType.id, status: "disabled" } });
      const table = await prisma.table.create({ data: { venueLayoutId: layout.id, number: 1, seats: 4, price: 80_000, deposit: 0, currency: "KZT", saleMode: "whole_table", status: "booked" } });
      const heldRequestKey = randomUUID();
      const heldToken = randomUUID();
      const heldTable = await prisma.table.create({ data: { venueLayoutId: layout.id, number: 2, seats: 6, price: 90_000, deposit: 0, currency: "KZT", saleMode: "whole_table", status: "held", holdRequestKey: heldRequestKey, holdToken: heldToken, holdExpiresAt: future } });
      await prisma.tableHold.create({ data: { tableId: heldTable.id, requestKey: heldRequestKey, token: heldToken, expiresAt: future } });
      const expiredRequestKey = randomUUID();
      const expiredToken = randomUUID();
      const expiredAt = new Date(Date.now() - 60_000);
      await prisma.table.create({ data: { venueLayoutId: layout.id, number: 3, seats: 5, price: 70_000, deposit: 0, currency: "KZT", saleMode: "whole_table", status: "held", holdRequestKey: expiredRequestKey, holdToken: expiredToken, holdExpiresAt: expiredAt } });
      await prisma.table.create({ data: { venueLayoutId: layout.id, number: 4, seats: 3, price: 50_000, deposit: 0, currency: "KZT", saleMode: "whole_table", status: "unavailable" } });

      const ordinaryOrder = await prisma.order.create({ data: { type: "ticket", amount: 50_000, currency: "KZT", paymentStatus: "paid" } });
      orderIds.push(ordinaryOrder.id);
      await prisma.ticket.createMany({ data: [
        { ticketTypeId: ordinary.id, orderId: ordinaryOrder.id, qrToken: randomUUID(), status: "active", paidAt: new Date() },
        { ticketTypeId: ordinary.id, orderId: ordinaryOrder.id, qrToken: randomUUID(), status: "active", paidAt: new Date() },
      ] });
      await prisma.ticketReservation.create({ data: { ticketTypeId: ordinary.id, token: randomUUID(), quantity: 1, expiresAt: future } });

      const seatOrder = await prisma.order.create({ data: { type: "ticket", amount: 20_000, currency: "KZT", paymentStatus: "paid" } });
      orderIds.push(seatOrder.id);
      const seatTicket = await prisma.ticket.create({ data: { ticketTypeId: seatType.id, orderId: seatOrder.id, qrToken: randomUUID(), status: "active", paidAt: new Date() } });
      await prisma.seatAllocation.create({ data: { seatId: soldSeat.id, orderId: seatOrder.id, ticketId: seatTicket.id, status: "consumed", consumedAt: new Date() } });
      const heldSeatOrder = await prisma.order.create({ data: { type: "ticket", amount: 20_000, currency: "KZT", paymentStatus: "pending", expiresAt: future, guestContact: { name: "Гость", channel: "telegram" } } });
      orderIds.push(heldSeatOrder.id);
      await prisma.seatAllocation.create({ data: { seatId: heldSeat.id, orderId: heldSeatOrder.id, status: "active" } });

      const tableOrder = await prisma.order.create({ data: { type: "table", amount: 80_000, currency: "KZT", paymentStatus: "paid" } });
      orderIds.push(tableOrder.id);
      await prisma.booking.create({ data: { tableId: table.id, orderId: tableOrder.id, status: "confirmed" } });
      await prisma.groupPass.create({ data: { tableId: table.id, orderId: tableOrder.id, token: randomUUID(), totalSeats: 4, status: "active" } });
      const depositOrder = await prisma.order.create({ data: { type: "deposit", amount: 10_000, currency: "KZT", paymentStatus: "paid" } });
      orderIds.push(depositOrder.id);
      await prisma.deposit.create({ data: { eventId: event.id, orderId: depositOrder.id, amount: 10_000, currency: "KZT", terms: "test", status: "paid", paidAt: new Date() } });
      await prisma.outboxEvent.create({ data: { eventType: "refund.requested", aggregateType: "order", aggregateId: ordinaryOrder.id, payload: {} } });

      const readOnlyOrderIds = [...orderIds];
      const stateBeforeReads = await managementReadState(event.id, readOnlyOrderIds);

      const summary = await service.managementSummary(organizerA, event.id);
      expect(summary.event.salesModes).toEqual(["ordinary", "per_seat", "whole_table"]);
      expect(summary.inventory).toMatchObject({
        configuredAdmissionCapacity: 30,
        buyableAdmissions: 12,
        heldAdmissions: 8,
        soldAdmissions: 7,
        seats: { configured: 2, sold: 1, held: 1, buyable: 0, disabled: 1 },
        wholeTables: { configured: 4, sold: 1, held: 1, buyable: 1 },
      });
      expect(summary.inventory.ticketTypes).toContainEqual(expect.objectContaining({ id: ordinary.id, price: 25_000, currency: "KZT" }));
      expect(summary.inventory.ticketTypes).toContainEqual(expect.objectContaining({ id: seatType.id, price: 20_000, configured: 2, sold: 1, held: 1, buyable: 0 }));
      expect(summary.inventory.saleGroups).toContainEqual(expect.objectContaining({ id: `table:${table.id}`, name: "Стол 1", unit: "tables", configured: 1, sold: 1, buyable: 0 }));
      expect(summary.inventory.saleGroups).toContainEqual(expect.objectContaining({ id: `table:${heldTable.id}`, unit: "tables", configured: 1, held: 1, sold: 0 }));
      expect(summary.money.grossReceived).toEqual([{ currency: "KZT", amount: 160_000 }]);
      expect(summary.money.depositsReceived).toEqual([{ currency: "KZT", amount: 10_000 }]);
      expect(summary.money.grossReceived![0]!.amount - summary.money.depositsReceived![0]!.amount).toBe(150_000);
      expect(summary.money.completedRefunds).toEqual([]);
      expect(summary.money.netReceived).toEqual([{ currency: "KZT", amount: 160_000 }]);
      expect(summary.cancellations.refundRequests).toBe(1);
      const analytics = await service.managementAnalytics(organizerA, event.id, {
        from: new Date(Date.now() - 60_000).toISOString(),
        to: new Date(Date.now() + 60_000).toISOString(),
        bucket: "hour",
      });
      expect(analytics.timezone).toBe("Asia/Almaty");
      expect(analytics.buckets.length).toBeGreaterThan(0);
      expect(analytics.buckets.reduce((sum, bucket) => sum + (bucket.soldAdmissions ?? 0), 0)).toBe(3);
      expect(analytics.totals.grossReceived).toEqual([{ currency: "KZT", amount: 80_000 }]);
      expect(analytics.unavailable).toContain("settlement_time");
      expect(analytics.unavailable).not.toContain("completed_refund_money");
      expect(analytics.unavailable).toContain("per_type_revenue");
      const orderList = await service.managementOrders(organizerA, event.id, { page: 1, limit: 20, payment: "all", booking: "all", attendance: "all" });
      expect(orderList.total).toBe(5);
      expect(orderList.statusCounts).toMatchObject({ all: 5, paid: 4, pending: 1 });
      await expect(service.managementOrders(organizerA, event.id, { page: 1, limit: 20, payment: "paid", booking: "all", attendance: "all" })).resolves.toMatchObject({ total: 4 });
      const orderDetail = await service.managementOrderDetail(organizerA, event.id, ordinaryOrder.id);
      expect(orderDetail).toMatchObject({ eventId: event.id, id: ordinaryOrder.id, resources: { ticketCount: 2 }, buyer: { kind: "unknown" } });
      expect(JSON.stringify(orderDetail)).not.toMatch(/qrToken|paymentLink|rawWebhook|holdToken/);
      await prisma.order.update({ where: { id: heldSeatOrder.id }, data: { guestContact: { name: "=ФОРМУЛА, тест", channel: "telegram" } } });
      const ordersCsv = await service.managementOrdersExport(organizerA, event.id, { page: 1, limit: 20, payment: "all", booking: "all", attendance: "all" });
      expect(ordersCsv.startsWith("\uFEFFЗаказ")).toBe(true);
      expect(ordersCsv).toContain("'=ФОРМУЛА, тест");
      expect(ordersCsv.split("\r\n").filter(Boolean)).toHaveLength(6);
      expect(ordersCsv.split("\r\n").filter(Boolean).length - 1).toBe(orderList.total);
      const analyticsCsv = await service.managementAnalyticsExport(organizerA, event.id, { from: new Date(Date.now() - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), bucket: "hour" });
      expect(analyticsCsv).toContain("Период");
      expect(analyticsCsv).toContain("timezone=Asia/Almaty");
      expect(analyticsCsv).toContain("unavailable=settlement_time");
      expect(csvMetricTotal(analyticsCsv, "Итого", "KZT", 4)).toBe(analytics.totals.grossReceived?.[0]?.amount);
      expect(csvMetricTotal(analyticsCsv, "Объём продаж", "", 8)).toBe(analytics.buckets.reduce((sum, bucket) => sum + (bucket.soldAdmissions ?? 0), 0));
      const otherEvent = await createLegacyFixture(organizerA, { ...completeInput(), title: "Другое событие" });
      eventIds.push(otherEvent.id);
      const otherType = await prisma.ticketType.create({ data: { eventId: otherEvent.id, name: "Другая категория", price: 1_000, currency: "KZT", quantityTotal: 1, quantitySold: 1, status: "active" } });
      const otherOrder = await prisma.order.create({ data: { type: "ticket", amount: 1_000, currency: "KZT", paymentStatus: "paid" } });
      orderIds.push(otherOrder.id);
      await prisma.ticket.create({ data: { ticketTypeId: otherType.id, orderId: otherOrder.id, qrToken: randomUUID(), status: "active", paidAt: new Date() } });
      await expect(service.managementOrderDetail(organizerA, event.id, otherOrder.id)).rejects.toBeInstanceOf(NotFoundException);
      await Promise.all([
        expect(service.managementSummary(organizerB, event.id)).rejects.toBeInstanceOf(NotFoundException),
        expect(service.managementAnalytics(organizerB, event.id, { from: new Date(Date.now() - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), bucket: "hour" })).rejects.toBeInstanceOf(NotFoundException),
        expect(service.managementOrders(organizerB, event.id, { page: 1, limit: 20, payment: "all", booking: "all", attendance: "all" })).rejects.toBeInstanceOf(NotFoundException),
        expect(service.managementOrdersExport(organizerB, event.id, { page: 1, limit: 20, payment: "all", booking: "all", attendance: "all" })).rejects.toBeInstanceOf(NotFoundException),
        expect(service.managementAnalyticsExport(organizerB, event.id, { from: new Date(Date.now() - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), bucket: "hour" })).rejects.toBeInstanceOf(NotFoundException),
        expect(service.managementOrderDetail(organizerB, event.id, ordinaryOrder.id)).rejects.toBeInstanceOf(NotFoundException),
      ]);
      expect(await managementReadState(event.id, readOnlyOrderIds)).toEqual(stateBeforeReads);
    } finally {
      await prisma.outboxEvent.deleteMany({ where: { aggregateType: "order", aggregateId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  });

  it("keeps analytics inside its exact range and retains provable sales after a refund", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const event = await createLegacyFixture(organizerA, completeInput());
    eventIds.push(event.id);
    const ticketType = await prisma.ticketType.create({ data: { eventId: event.id, name: "Диапазон", price: 10_000, currency: "KZT", quantityTotal: 10, status: "active" } });
    const dollarType = await prisma.ticketType.create({ data: { eventId: event.id, name: "USD", price: 50, currency: "USD", quantityTotal: 10, status: "active" } });
    const from = new Date("2027-05-01T10:30:00.000Z");
    const to = new Date("2027-05-01T11:30:00.000Z");

    const createTicketOrder = async (paidAt: Date, paymentStatus: "paid" | "refunded", currency = "KZT", ticketTypeId = ticketType.id) => {
      const order = await prisma.order.create({ data: { type: "ticket", amount: currency === "KZT" ? 10_000 : 50, currency, paymentStatus } });
      managementOrderIds.push(order.id);
      await prisma.ticket.create({ data: { ticketTypeId, orderId: order.id, qrToken: randomUUID(), status: paymentStatus === "refunded" ? "refunded" : "active", paidAt, ...(paymentStatus === "refunded" ? { refundedAt: new Date("2027-05-02T00:00:00.000Z") } : {}) } });
    };

    await createTicketOrder(new Date("2027-05-01T10:29:59.999Z"), "paid");
    await createTicketOrder(from, "paid");
    await createTicketOrder(new Date("2027-05-01T11:00:00.000Z"), "refunded");
    await createTicketOrder(new Date("2027-05-01T11:15:00.000Z"), "paid", "USD", dollarType.id);
    await createTicketOrder(to, "paid");

    const summary = await service.managementSummary(organizerA, event.id);
    expect(summary.money.grossReceived).toEqual([{ currency: "KZT", amount: 40_000 }, { currency: "USD", amount: 50 }]);
    expect(summary.money.completedRefunds).toBeNull();
    expect(summary.money.netReceived).toBeNull();

    const analytics = await service.managementAnalytics(organizerA, event.id, { from: from.toISOString(), to: to.toISOString(), bucket: "hour" });
    expect(analytics.totals.grossReceived).toEqual([{ currency: "KZT", amount: 20_000 }, { currency: "USD", amount: 50 }]);
    expect(analytics.buckets.reduce((total, bucket) => total + (bucket.soldAdmissions ?? 0), 0)).toBe(3);
    expect(analytics.unavailable).not.toContain("settlement_time");

    const csv = await service.managementAnalyticsExport(organizerA, event.id, { from: from.toISOString(), to: to.toISOString(), bucket: "hour" });
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines.filter((line) => line.includes("Объём продаж"))).toHaveLength(analytics.buckets.length);
    expect(lines.filter((line) => line.includes("Итого")).every((line) => line.endsWith(",,"))).toBe(true);
  });

  it("filters individual table seats, paginates rows, and exports every matching order", async () => {
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const event = await createLegacyFixture(organizerA, completeInput());
    eventIds.push(event.id);
    const layout = await prisma.venueLayout.create({ data: { eventId: event.id, templateName: "test", layoutJson: {} } });
    const table = await prisma.table.create({ data: { venueLayoutId: layout.id, number: 8, name: "Балкон", seats: 3, price: 8_000, deposit: 0, currency: "KZT", saleMode: "per_seat" } });
    const ticketType = await prisma.ticketType.create({ data: { eventId: event.id, name: "Балкон, место", price: 8_000, currency: "KZT", quantityTotal: 3, status: "active" } });
    const seats = await Promise.all([1, 2, 3].map((number) => prisma.seat.create({ data: { venueLayoutId: layout.id, tableId: table.id, number, label: `B-${number}`, sortOrder: number, ticketTypeId: ticketType.id } })));
    for (const seat of seats) {
      const order = await prisma.order.create({ data: { type: "ticket", amount: 8_000, currency: "KZT", paymentStatus: "paid" } });
      managementOrderIds.push(order.id);
      const ticket = await prisma.ticket.create({ data: { ticketTypeId: ticketType.id, orderId: order.id, qrToken: randomUUID(), status: "active", paidAt: new Date() } });
      await prisma.seatAllocation.create({ data: { seatId: seat.id, orderId: order.id, ticketId: ticket.id, status: "consumed", consumedAt: new Date() } });
    }

    const firstPage = await service.managementOrders(organizerA, event.id, { page: 1, limit: 1, payment: "all", booking: "all", attendance: "all", tableId: table.id });
    const secondPage = await service.managementOrders(organizerA, event.id, { page: 2, limit: 1, payment: "all", booking: "all", attendance: "all", tableId: table.id });
    expect(firstPage).toMatchObject({ total: 3, hasNext: true, items: [{ booking: { tableId: table.id, tableLabel: "Балкон" } }] });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);

    const csv = await service.managementOrdersExport(organizerA, event.id, { page: 1, limit: 1, payment: "all", booking: "all", attendance: "all", tableId: table.id });
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4);
    expect(csv).toContain("Балкон");
  });

  it("returns explicit zero-capacity data and creates event-timezone buckets across daylight saving", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-14T12:00:00.000Z"));
    const service = new EventsService(prisma, new MemoryStorage(), new DomainEventsService());
    const event = await createLegacyFixture(organizerA, {
      ...completeInput(),
      title: "Пустое событие",
      timezone: "America/New_York",
      date: "2027-03-20",
    });
    eventIds.push(event.id);

    const summary = await service.managementSummary(organizerA, event.id);
    expect(summary.inventory).toMatchObject({
      configuredAdmissionCapacity: 0,
      buyableAdmissions: 0,
      heldAdmissions: 0,
      soldAdmissions: 0,
      wholeTables: { configured: 0, held: 0, sold: 0, buyable: 0 },
    });
    expect(summary.money.grossReceived).toEqual([]);

    const report = await service.managementAnalytics(organizerA, event.id, {
      from: "2027-03-13T05:00:00.000Z",
      to: "2027-03-16T04:00:00.000Z",
      bucket: "day",
    });
    expect(report.buckets.map(({ label }) => label)).toEqual(["2027-03-13", "2027-03-14", "2027-03-15"]);
    expect(report.buckets.map(({ startsAt }) => startsAt)).toEqual([
      "2027-03-13T05:00:00.000Z",
      "2027-03-14T05:00:00.000Z",
      "2027-03-15T04:00:00.000Z",
    ]);
    expect(report.totals.grossReceived).toEqual([]);
    expect(report.buckets.every((bucket) => bucket.soldAdmissions === 0 && bucket.issuedTickets === 0)).toBe(true);
  });
});

async function managementReadState(eventId: string, orderIds: string[]) {
  const [event, orders, reservations, allocations, holds, tickets] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { status: true, updatedAt: true } }),
    prisma.order.findMany({ where: { id: { in: orderIds } }, orderBy: { id: "asc" }, select: { id: true, paymentStatus: true, expiresAt: true } }),
    prisma.ticketReservation.findMany({ where: { ticketType: { eventId } }, orderBy: { id: "asc" }, select: { id: true, status: true, expiresAt: true } }),
    prisma.seatAllocation.findMany({ where: { seat: { venueLayout: { eventId } } }, orderBy: { id: "asc" }, select: { id: true, status: true, releasedAt: true, consumedAt: true } }),
    prisma.tableHold.findMany({ where: { table: { venueLayout: { eventId } } }, orderBy: { id: "asc" }, select: { id: true, status: true, expiresAt: true } }),
    prisma.ticket.findMany({ where: { ticketType: { eventId } }, orderBy: { id: "asc" }, select: { id: true, status: true, usedAt: true, cancelledAt: true, refundedAt: true } }),
  ]);
  return { event, orders, reservations, allocations, holds, tickets };
}

function csvMetricTotal(csv: string, type: string, currency: string, column: number): number {
  return csv.split("\r\n").slice(1).filter(Boolean).reduce((total, line) => {
    const cells = line.split(",");
    if (cells[2] !== type || (currency && cells[3] !== currency)) return total;
    return total + Number(cells[column] || 0);
  }, 0);
}

function completeInput() {
  return {
    title: "Весенний фестиваль",
    category: "festival" as const,
    city: "Алматы",
    date: "2027-03-21",
    time: "19:30",
    timezone: "Asia/Almaty",
    venueName: "Большой зал",
    address: "проспект Абая, 10",
    announcement: "Один вечер музыки и новых знакомств.",
    description: "Полное описание мероприятия.",
    program: "19:30 — открытие; 20:00 — концерт.",
    rules: "Вход по билету.",
    visitTerms: "Необходимо иметь документ.",
    cancellationTerms: "Возврат доступен до начала мероприятия.",
    paymentMode: "full_payment" as const,
    showFullAmountForDeposit: false,
    depositTerms: null,
    extraConditions: "18+",
  };
}

function pngPoster(): UploadedPoster {
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    buffer,
    mimetype: "image/png",
    originalname: "poster.png",
    size: buffer.byteLength,
  };
}

async function mutationCounts(id: string): Promise<{ outbox: number; audit: number }> {
  const [outbox, audit] = await Promise.all([
    prisma.outboxEvent.count({ where: { aggregateId: id, aggregateType: "event" } }),
    prisma.auditLog.count({ where: { entityId: id, entityType: "event" } }),
  ]);
  return { outbox, audit };
}

// Historical read fixtures are explicitly stored outside every current write endpoint.
async function createLegacyFixture(organizerId: string, input: ReturnType<typeof completeInput>) {
 const {date,time,...content}=input; return presentEvent(await prisma.event.create({data:{...content,organizerId,date:new Date(date+"T00:00:00Z"),time:new Date("1970-01-01T"+time+":00Z")}}));
}
