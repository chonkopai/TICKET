import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { GuestTicketsController, TicketsController } from "./tickets.controller.js";
import type { TicketsService } from "./tickets.service.js";

describe("TicketsController", () => {
  it("scopes reads, QR, Wallet and use actions to the authenticated organizer", async () => {
    const userId = randomUUID();
    const ticketId = randomUUID();
    const principal: AuthenticatedPrincipal = { userId, role: "organizer" };
    const ticket = {
      id: ticketId,
      ticketTypeId: randomUUID(),
      eventId: randomUUID(),
      ticketTypeName: "VIP",
      eventTitle: "Фестиваль",
      status: "active" as const,
      usedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const service = {
      get: vi.fn().mockResolvedValue(ticket),
      renderQr: vi.fn().mockResolvedValue(Buffer.from("png")),
      walletPass: vi.fn().mockResolvedValue(Buffer.from("pkpass")),
      useByQrToken: vi.fn().mockResolvedValue({ ticket: { ...ticket, status: "used" } }),
      inspectEventScan: vi.fn().mockResolvedValue({ kind: "ticket", ticket }),
      useGroupPass: vi.fn().mockResolvedValue({ groupPassId: randomUUID() }),
    } as unknown as TicketsService;
    const controller = new TicketsController(service);
    const qrToken = "a".repeat(43);

    await controller.get(principal, ticketId);
    await controller.qr(principal, ticketId);
    await controller.wallet(principal, ticketId);
    await controller.use(principal, { qrToken });
    await controller.inspectEventScan(principal, ticket.eventId, { token: qrToken });
    await controller.useForEvent(principal, ticket.eventId, { qrToken });
    await controller.useGroupPassForEvent(principal, ticket.eventId, { token: qrToken, confirm: true });

    expect(service.get).toHaveBeenCalledWith(userId, ticketId);
    expect(service.renderQr).toHaveBeenCalledWith(userId, ticketId);
    expect(service.walletPass).toHaveBeenCalledWith(userId, ticketId);
    expect(service.useByQrToken).toHaveBeenCalledWith(userId, qrToken);
    expect(service.inspectEventScan).toHaveBeenCalledWith(userId, ticket.eventId, qrToken);
    expect(service.useByQrToken).toHaveBeenCalledWith(userId, qrToken, ticket.eventId);
    expect(service.useGroupPass).toHaveBeenCalledWith(userId, qrToken, true, ticket.eventId);
  });

  it("delegates guest ticket, QR and Wallet reads through the authenticated owner", async () => {
    const userId = randomUUID();
    const ticketId = randomUUID();
    const service = {
      getForUser: vi.fn().mockResolvedValue({ id: ticketId }),
      renderQrForUser: vi.fn().mockResolvedValue(Buffer.from("png")),
      walletPassForUser: vi.fn().mockResolvedValue(Buffer.from("pkpass")),
    } as unknown as TicketsService;
    const controller = new GuestTicketsController(service);
    const principal: AuthenticatedPrincipal = { userId, role: "guest" };
    await controller.get(principal, ticketId);
    await controller.qr(principal, ticketId);
    await controller.wallet(principal, ticketId);
    expect(service.getForUser).toHaveBeenCalledWith(userId, ticketId, "ru");
    await controller.get(principal, ticketId, "kk");
    expect(service.getForUser).toHaveBeenCalledWith(userId, ticketId, "kk");
    expect(service.renderQrForUser).toHaveBeenCalledWith(userId, ticketId);
    expect(service.walletPassForUser).toHaveBeenCalledWith(userId, ticketId);
  });
});
