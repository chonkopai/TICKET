import { randomUUID } from "node:crypto";

import { OrderType, prisma } from "../src/index.js";
import { seedIds } from "../src/seed-data.js";
import { afterAll, describe, expect, it } from "vitest";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Ticket.qrToken unique constraint", () => {
  it("rejects a duplicate QR token", async () => {
    const order = await prisma.order.create({
      data: {
        type: OrderType.ticket,
        amount: 1_500_000,
        currency: "KZT",
      },
    });
    const qrToken = `qr-test-${randomUUID()}`;

    try {
      await prisma.ticket.create({
        data: {
          ticketTypeId: seedIds.standardTicketType,
          orderId: order.id,
          qrToken,
        },
      });

      await expect(
        prisma.ticket.create({
          data: {
            ticketTypeId: seedIds.standardTicketType,
            orderId: order.id,
            qrToken,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await prisma.order.delete({ where: { id: order.id } });
    }
  });
});
