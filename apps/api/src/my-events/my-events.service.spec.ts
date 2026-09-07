import { randomUUID } from "node:crypto";

import { prisma } from "@event-platform/database";
import { zonedInputToIso } from "@event-platform/shared-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MyEventsService } from "./my-events.service.js";

const userId = randomUUID();
const otherUserId = randomUUID();
const eventIds = [randomUUID(), randomUUID(), randomUUID()];
const orderIds: string[] = [];
const service = new MyEventsService(prisma);

beforeAll(async () => {
  const telegramBase = BigInt(Date.now()) * 100_000n;
  await prisma.user.createMany({
    data: [
      { id: userId, telegramId: telegramBase + 601n, name: "Гость" },
      { id: otherUserId, telegramId: telegramBase + 602n, name: "Другой гость" },
    ],
  });

  await prisma.event.createMany({ data: [
    eventData(eventIds[0]!, "Предстоящий вечер", "2027-01-01", "18:00:00"),
    eventData(eventIds[1]!, "Прошедший вечер", "2026-01-01", "18:00:00"),
    eventData(eventIds[2]!, "Граница полуночи", "2026-06-02", "00:15:00"),
  ] });

  const upcomingType = await prisma.ticketType.create({ data: ticketTypeData(eventIds[0]!, "Вход") });
  const pastType = await prisma.ticketType.create({ data: ticketTypeData(eventIds[1]!, "Вход") });
  const boundaryType = await prisma.ticketType.create({ data: ticketTypeData(eventIds[2]!, "Вход") });
  await createTicket(upcomingType.id, userId, "active");
  await createTicket(pastType.id, userId, "used");
  await createTicket(boundaryType.id, userId, "active");

  const layout = await prisma.venueLayout.create({
    data: {
      eventId: eventIds[0]!, templateName: "Тестовый зал",
      layoutJson: { version: 1, canvas: { width: 500, height: 500 }, tables: [] },
    },
  });
  const table = await prisma.table.create({
    data: { venueLayoutId: layout.id, number: 1, name: "Стол у сцены", seats: 4, price: 100_000, deposit: 50_000, currency: "KZT" },
  });
  const tableOrder = await prisma.order.create({ data: { type: "table", buyerUserId: userId, amount: 100_000, currency: "KZT", paymentStatus: "paid" } });
  orderIds.push(tableOrder.id);
  await prisma.booking.create({ data: { tableId: table.id, orderId: tableOrder.id, status: "confirmed" } });
  await prisma.deposit.create({ data: { eventId: eventIds[0]!, orderId: tableOrder.id, amount: 50_000, currency: "KZT", terms: "Депозит засчитывается в заказ", status: "paid" } });
});

afterAll(async () => {
  if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.$disconnect();
});

describe("MyEventsService", () => {
  it("joins owned tickets/bookings, separates tabs, and derives participation states", async () => {
    const upcoming = await service.list(userId, "upcoming", 1, 20, new Date("2026-06-01T00:00:00.000Z"));
    expect(upcoming.total).toBe(2);
    expect(upcoming.items.map((item) => item.title)).toEqual(["Граница полуночи", "Предстоящий вечер"]);
    expect(upcoming.items.find((item) => item.title === "Предстоящий вечер")).toMatchObject({
      participationStatus: "registered",
      bookings: [{ status: "confirmed", deposit: { amount: 50_000, status: "paid" } }],
    });

    const past = await service.list(userId, "past", 1, 20, new Date("2026-06-03T00:00:00.000Z"));
    expect(past.total).toBe(2);
    expect(past.items.find((item) => item.title === "Прошедший вечер")).toMatchObject({ participationStatus: "attended" });
    expect(past.items.find((item) => item.title === "Прошедший вечер")?.tickets[0]).toMatchObject({ status: "used", participationStatus: "attended" });
  });

  it("uses the event timezone at the exact start boundary and isolates users", async () => {
    const startsAt = zonedInputToIso("2026-06-02T00:15", "Asia/Almaty");
    const before = await service.list(userId, "upcoming", 1, 20, new Date(new Date(startsAt).getTime() - 1));
    expect(before.items.some((item) => item.id === eventIds[2])).toBe(true);
    const atStart = await service.list(userId, "past", 1, 20, new Date(startsAt));
    expect(atStart.total).toBe(2);
    expect(atStart.items.some((item) => item.id === eventIds[2])).toBe(true);
    expect((await service.list(otherUserId, "upcoming", 1, 20, new Date("2026-06-01T00:00:00.000Z"))).total).toBe(0);
  });

  it("paginates with a bounded response", async () => {
    const page = await service.list(userId, "upcoming", 1, 1, new Date("2026-06-01T00:00:00.000Z"));
    expect(page.items).toHaveLength(1);
    expect(page.limit).toBe(1);
    expect(page.hasNext).toBe(true);
  });
});

function eventData(id: string, title: string, date: string, time: string) {
  return { id, organizerId: userId, title, date: new Date(`${date}T00:00:00.000Z`), time: new Date(`1970-01-01T${time}.000Z`), timezone: "Asia/Almaty", venueName: "Зал", address: "Алматы", status: "published" as const };
}

function ticketTypeData(eventId: string, name: string) {
  return { eventId, name, price: 100_000, currency: "KZT", quantityTotal: 10, status: "active" as const };
}

async function createTicket(ticketTypeId: string, ownerUserId: string, status: "active" | "used"): Promise<void> {
  const order = await prisma.order.create({ data: { type: "ticket", buyerUserId: ownerUserId, amount: 100_000, currency: "KZT", paymentStatus: "paid" } });
  orderIds.push(order.id);
  await prisma.ticket.create({ data: { ticketTypeId, orderId: order.id, ownerUserId, qrToken: `guest-test-${randomUUID()}`, status, paidAt: new Date(), activatedAt: new Date(), usedAt: status === "used" ? new Date() : null } });
}
