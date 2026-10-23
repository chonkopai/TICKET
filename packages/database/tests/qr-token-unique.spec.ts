import { randomUUID } from "node:crypto";
import { OrderType, prisma } from "../src/index.js";
import { afterAll, describe, expect, it } from "vitest";
const run = process.env.DATABASE_TESTS === "true";
if (run) {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/^\/(ticket_admin_test.*|event_platform_v2_(fresh|legacy)_\d+)$/.test(
      url.pathname,
    )
  )
    throw new Error(
      "QR database tests require a named disposable local database",
    );
}
afterAll(async () => {
  await prisma.$disconnect();
});
(run ? describe : describe.skip)("Ticket.qrToken unique constraint", () => {
  it("rejects a duplicate QR token without requiring a development seed", async () => {
    const user = await prisma.user.create({ data: { role: "organizer" } }),
      event = await prisma.event.create({
        data: {
          organizerId: user.id,
          title: "Disposable QR fixture",
          date: new Date("2030-01-01"),
          time: new Date("1970-01-01T19:00Z"),
          address: "Test",
          status: "published",
        },
      }),
      type = await prisma.ticketType.create({
        data: {
          eventId: event.id,
          name: "Entry",
          price: 1000,
          currency: "KZT",
          quantityTotal: 10,
        },
      }),
      order = await prisma.order.create({
        data: { type: OrderType.ticket, amount: 1000, currency: "KZT" },
      }),
      qrToken = `qr-test-${randomUUID()}`;
    try {
      await prisma.ticket.create({
        data: { ticketTypeId: type.id, orderId: order.id, qrToken },
      });
      await expect(
        prisma.ticket.create({
          data: { ticketTypeId: type.id, orderId: order.id, qrToken },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await prisma.order.delete({ where: { id: order.id } });
      await prisma.event.delete({ where: { id: event.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
