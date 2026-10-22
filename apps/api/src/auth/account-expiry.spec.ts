vi.mock("../orders/automatic-purchase-link.js", () => ({ linkGuestPurchases: vi.fn().mockResolvedValue(0) }));
import type { PrismaClient } from "@event-platform/database";
import { expect, it, vi } from "vitest";
import { AccountService } from "./account.service.js";

it("counts ongoing admissions but excludes ended tickets and group passes", async () => {
  const now = new Date("2030-01-01T20:00:00Z");
  const base = { date: new Date("2030-01-01"), time: new Date("1970-01-01T23:00:00Z"), timezone: "Asia/Almaty", startsAt: new Date("2030-01-01T18:00:00Z") };
  const timings = [new Date(now.getTime() + 1), now, new Date(now.getTime() - 1), null].map(endsAt => ({ ...base, endsAt }));
  const ticketFindMany = vi.fn().mockResolvedValueOnce(timings.map(event => ({ ticketType: { event } }))).mockResolvedValueOnce([{ ticketType: { eventId: "attended" } }, { ticketType: { eventId: "attended" } }]);
  const groupPassFindMany = vi.fn().mockResolvedValue(timings.map(event => ({ table: { venueLayout: { event } } })));
  const database = { ticket: { findMany: ticketFindMany }, groupPass: { findMany: groupPassFindMany }, $transaction: (queries: Promise<unknown>[]) => Promise.all(queries) } as unknown as PrismaClient;
  expect(await new AccountService(database).dashboard("buyer", now)).toEqual({ activeAdmissions: 2, attendedEvents: 1 });
  expect(ticketFindMany.mock.calls[0]?.[0].where.OR).toEqual([{ ownerUserId: "buyer" }, { order: { buyerUserId: "buyer" } }]);
  expect(groupPassFindMany.mock.calls[0]?.[0].where.order.buyerUserId).toBe("buyer");
});
