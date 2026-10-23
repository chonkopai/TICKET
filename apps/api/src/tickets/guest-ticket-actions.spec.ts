import type { PrismaClient } from "@event-platform/database";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketsService } from "./tickets.service.js";
import type { DomainEventsService } from "../domain-events/domain-events.service.js";
import type { WalletPassGenerator } from "../wallet/wallet-pass-generator.js";

function fixture() {
  const event = { id: "event", title: "Concert", sourceLocale: "ru", creationVersion: 1, v2State: "legacy", startsAt: new Date("2030-01-01T15:00:00Z"), date: new Date("2030-01-01"), time: new Date("1970-01-01T20:00:00Z"), timezone: "Asia/Almaty", address: "Venue", organizer: { name: "Organizer", phone: "+77000000000", email: "events@example.test", organizerProfile: { organizationName: "Events", address: "Office", showContactInfo: true } } };
  const ticket = { id: "ticket", ticketTypeId: "type", status: "active", seatLabelSnapshot: "Row 1, seat 2", usedAt: null, createdAt: new Date(), updatedAt: new Date(), ticketType: { id: "type", eventId: "event", name: "Entry", event }, seatAllocation: null, order: { id: "order", buyerUserId: "buyer", paymentStatus: "paid", checkoutSnapshot: null }, qrToken: "isolated-test-token" };
  const findFirst = vi.fn().mockResolvedValue(ticket);
  const db = { ticket: { findFirst } } as unknown as PrismaClient;
  const service = new TicketsService(db, {} as DomainEventsService, { isConfigured: () => false } as WalletPassGenerator);
  return { service, ticket, findFirst };
}

afterEach(() => vi.useRealTimers());

describe("ticket actions preserve ownership and validity", () => {
  it("loads event details and an authorized chat link without leaking order data", async () => {
    const { service, findFirst } = fixture();
    const result = await service.getForUser("buyer", "ticket");
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({ id: "ticket", OR: [{ ownerUserId: "buyer" }, { order: { buyerUserId: "buyer" } }] });
    expect(result.eventDetails).toEqual({ startsAt: "2030-01-01T15:00:00.000Z", endsAt: null, timezone: "Asia/Almaty", address: "Venue", coordinates: null, organizer: { verified:false, name: "Events", phone: "+77000000000", email: "events@example.test", address: "Office" } });
    expect(result.chatPath).toBe("/account/events/event/orders/order/chat");
    expect(result.walletPath).toBeNull();
    expect(result).not.toHaveProperty("qrToken"); expect(result).not.toHaveProperty("order");
  });
  it("withholds buyer chat from a transferred ticket owner", async () => {
    const { service } = fixture();
    expect((await service.getForUser("owner", "ticket")).chatPath).toBeNull();
  });
  it("preserves the event map pin in ticket details", async () => {
    const { service, ticket } = fixture();
    Object.assign(ticket.ticketType.event, { latitude: 43.238, longitude: 76.927 });
    expect((await service.getForUser("buyer", "ticket")).eventDetails?.coordinates).toEqual({ latitude: 43.238, longitude: 76.927 });
  });
  it("rejects unknown tickets and QR requests for returned tickets", async () => {
    const { service, ticket, findFirst } = fixture();
    ticket.status = "refunded";
    await expect(service.renderQrForUser("buyer", "ticket")).rejects.toMatchObject({ response: { code: "TICKET_INVALID_TRANSITION" } });
    findFirst.mockResolvedValue(null);
    await expect(service.getForUser("other", "ticket")).rejects.toMatchObject({ response: { code: "TICKET_NOT_FOUND" } });
  });
  it("allows QR during an overnight event and stops QR and wallet at its exact end", async () => {
    vi.useFakeTimers();
    const { service, ticket } = fixture();
    Object.assign(ticket.ticketType.event, { endsAt: new Date("2030-01-01T21:00:00Z") });
    vi.setSystemTime(new Date("2030-01-01T20:59:59Z"));
    expect((await service.renderQrForUser("buyer", "ticket")).length).toBeGreaterThan(0);
    expect((await service.getForUser("buyer", "ticket")).eventDetails?.endsAt).toBe("2030-01-01T21:00:00.000Z");
    vi.setSystemTime(new Date("2030-01-01T21:00:00Z"));
    await expect(service.renderQrForUser("buyer", "ticket")).rejects.toMatchObject({ response: { code: "EVENT_ENDED" } });
    await expect(service.walletPassForUser("buyer", "ticket")).rejects.toMatchObject({ response: { code: "EVENT_ENDED" } });
    expect(ticket.status).toBe("active");
  });
  it("rejects scanning an unused ended ticket before making admission writes", async () => {
    const { ticket } = fixture();
    Object.assign(ticket.ticketType.event, { endsAt: new Date("2020-01-01T21:00:00Z"), startsAt: new Date("2020-01-01T18:00:00Z") });
    const updateMany = vi.fn();
    const transaction = { $queryRaw: vi.fn().mockResolvedValue([]), staffRefund: { findFirst: vi.fn().mockResolvedValue(null) }, refundRequest: { findUnique: vi.fn().mockResolvedValue(null) }, ticket: { findFirst: vi.fn().mockResolvedValue(ticket), updateMany } };
    const database = { $transaction: (work: (value: typeof transaction) => unknown) => work(transaction) } as unknown as PrismaClient;
    const service = new TicketsService(database, {} as DomainEventsService, {} as WalletPassGenerator);
    await expect(service.useByQrToken("organizer", "test-token")).rejects.toMatchObject({ response: { code: "EVENT_ENDED" } });
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("rejects ended group-pass QR and admission", async () => {
    const { ticket } = fixture();
    Object.assign(ticket.ticketType.event, { endsAt: new Date("2020-01-01T21:00:00Z"), startsAt: new Date("2020-01-01T18:00:00Z") });
    const groupPass = { findFirst: vi.fn().mockResolvedValue({ id: "pass", table: { venueLayout: { event: ticket.ticketType.event } } }) };
    const database = { groupPass, ticket: { findFirst: vi.fn().mockResolvedValue(null) }, $transaction: (work: (value: { groupPass: typeof groupPass }) => unknown) => work({ groupPass }) } as unknown as PrismaClient;
    const service = new TicketsService(database, {} as DomainEventsService, {} as WalletPassGenerator);
    await expect(service.renderGroupPassQrForUser("buyer", "pass")).rejects.toMatchObject({ response: { code: "EVENT_ENDED" } });
    await expect(service.inspectEventScan("organizer", "event", "test-token")).rejects.toMatchObject({ response: { code: "EVENT_ENDED" } });
    await expect(service.useGroupPass("organizer", "test-token", true)).rejects.toMatchObject({ response: { code: "EVENT_ENDED" } });
  });
});
