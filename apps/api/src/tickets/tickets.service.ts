import { randomBytes } from "node:crypto";

import {
  Prisma,
  TicketStatus,
  type PrismaClient,
} from "@event-platform/database";
import type { GuestTicket, OrganizerTicket, TicketStatus as SharedTicketStatus, UseTicketResponse } from "@event-platform/shared-types";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import QRCode from "qrcode";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { WALLET_PASS_GENERATOR } from "../wallet/wallet.constants.js";
import type { WalletPassGenerator } from "../wallet/wallet-pass-generator.js";
import {
  presentTicket,
  presentGuestTicket,
  ticketContextInclude,
  type TicketWithContext,
} from "./tickets.presenter.js";

export const TICKET_TRANSITIONS: Readonly<Record<SharedTicketStatus, readonly SharedTicketStatus[]>> = {
  created: ["pending_payment", "cancelled"],
  pending_payment: ["paid", "cancelled"],
  paid: ["active", "refunded", "cancelled"],
  active: ["used", "refunded", "cancelled"],
  used: [],
  cancelled: [],
  refunded: [],
};

@Injectable()
export class TicketsService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    @Inject(WALLET_PASS_GENERATOR) private readonly wallet: WalletPassGenerator,
  ) {}

  async createForOrder(input: {
    actorId: string;
    ticketTypeId: string;
    orderId: string;
    ownerUserId?: string | null;
  }): Promise<OrganizerTicket> {
    const created = await this.database.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.create({
        data: {
          ticketTypeId: input.ticketTypeId,
          orderId: input.orderId,
          ownerUserId: input.ownerUserId ?? null,
          qrToken: opaqueToken(),
        },
        include: ticketContextInclude,
      });
      await this.recordMutation(transaction, input.actorId, ticket, "ticket.created", {
        currentStatus: TicketStatus.created,
      });
      return ticket;
    });
    return presentTicket(created);
  }

  async get(organizerId: string, id: string): Promise<OrganizerTicket> {
    return presentTicket(await this.findOwned(this.database, organizerId, { id }));
  }

  async getForUser(userId: string, id: string): Promise<GuestTicket> {
    return presentGuestTicket(await this.findForUser(this.database, userId, id));
  }

  /** Internal capability boundary has already authorized this specific order. */
  async assetForAnonymousOrder(orderId: string, id: string, wallet: boolean): Promise<Buffer> {
    const ticket = await this.database.ticket.findFirst({ where: { id, orderId, order: { paymentStatus: "paid" }, status: { in: ["active", "used"] } }, include: ticketContextInclude });
    if (!ticket) throw new NotFoundException({ code: "TICKET_NOT_FOUND" });
    if (wallet) return this.walletPassForTicket(ticket);
    return QRCode.toBuffer(ticket.qrToken, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 320 });
  }

  async renderQrForUser(userId: string, id: string): Promise<Buffer> {
    const ticket = await this.findForUser(this.database, userId, id);
    if (ticket.status === TicketStatus.cancelled || ticket.status === TicketStatus.refunded) {
      throw invalidTransition(ticket.status, "qr");
    }
    return QRCode.toBuffer(ticket.qrToken, {
      type: "png", errorCorrectionLevel: "M", margin: 2, width: 320,
    });
  }

  async walletPassForUser(userId: string, id: string): Promise<Buffer> {
    const ticket = await this.findForUser(this.database, userId, id);
    return this.walletPassForTicket(ticket);
  }

  async transition(
    organizerId: string,
    id: string,
    target: SharedTicketStatus,
  ): Promise<OrganizerTicket> {
    const updated = await this.database.$transaction(async (transaction) => {
      await lockTicket(transaction, id);
      const current = await this.findOwned(transaction, organizerId, { id });
      return this.applyTransition(transaction, organizerId, current, target);
    });
    return presentTicket(updated);
  }

  async useByQrToken(organizerId: string, qrToken: string): Promise<UseTicketResponse> {
    const ticket = await this.database.$transaction(async (transaction) => {
      const initial = await this.findOwned(transaction, organizerId, { qrToken });
      await lockTicket(transaction, initial.id);
      const current = await this.findOwned(transaction, organizerId, { id: initial.id });
      if (current.status === TicketStatus.used) throw alreadyUsed(current.usedAt);
      return this.applyTransition(transaction, organizerId, current, TicketStatus.used);
    });
    return { ticket: presentTicket(ticket) };
  }

  async renderQr(organizerId: string, id: string): Promise<Buffer> {
    const ticket = await this.findOwned(this.database, organizerId, { id });
    if (ticket.status === TicketStatus.cancelled || ticket.status === TicketStatus.refunded) {
      throw invalidTransition(ticket.status, "qr");
    }
    return QRCode.toBuffer(ticket.qrToken, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    });
  }

  async walletPass(organizerId: string, id: string): Promise<Buffer> {
    const ticket = await this.findOwned(this.database, organizerId, { id });
    return this.walletPassForTicket(ticket);
  }

  private async walletPassForTicket(ticket: TicketWithContext): Promise<Buffer> {
    if (ticket.status !== TicketStatus.active) throw invalidTransition(ticket.status, "wallet");
    if (!this.wallet.isConfigured()) {
      throw new ServiceUnavailableException({
        code: "WALLET_NOT_CONFIGURED",
        message: "Apple Wallet credentials are not configured",
      });
    }

    const event = ticket.ticketType.event;
    return this.wallet.generate({
      serialNumber: ticket.appleWalletPassId ?? ticket.id,
      eventTitle: event.title,
      ticketTypeName: ticket.ticketType.name,
      venueName: event.venueName,
      address: event.address,
      eventDate: event.date.toISOString().slice(0, 10),
      eventTime: event.time.toISOString().slice(11, 16),
      timezone: event.timezone,
      qrToken: ticket.qrToken,
    });
  }

  private async applyTransition(
    transaction: Prisma.TransactionClient,
    actorId: string,
    current: TicketWithContext,
    target: SharedTicketStatus,
  ): Promise<TicketWithContext> {
    if (current.status === target) {
      if (target === TicketStatus.used) throw alreadyUsed(current.usedAt);
      throw new ConflictException({
        code: "TICKET_TRANSITION_REPEATED",
        message: "Ticket is already in the requested state",
        details: { status: current.status },
      });
    }
    if (!TICKET_TRANSITIONS[current.status].includes(target)) {
      throw invalidTransition(current.status, target);
    }

    const soldDelta = Number(isSold(target)) - Number(isSold(current.status));
    if (soldDelta > 0) {
      await lockTicketType(transaction, current.ticketTypeId);
      const [ticketType, sold, reserved] = await Promise.all([
        transaction.ticketType.findUniqueOrThrow({ where: { id: current.ticketTypeId } }),
        transaction.ticket.count({
          where: {
            ticketTypeId: current.ticketTypeId,
            status: { in: [TicketStatus.paid, TicketStatus.active, TicketStatus.used] },
          },
        }),
        transaction.ticketReservation.aggregate({
          where: {
            ticketTypeId: current.ticketTypeId,
            status: "active",
            expiresAt: { gt: new Date() },
          },
          _sum: { quantity: true },
        }),
      ]);
      if (ticketType.quantityTotal - sold - (reserved._sum.quantity ?? 0) < 1) {
        throw new ConflictException({
          code: "INSUFFICIENT_INVENTORY",
          message: "Not enough tickets remain",
        });
      }
    }

    const now = new Date();
    const data: Prisma.TicketUpdateManyMutationInput = { status: target };
    if (target === TicketStatus.paid) data.paidAt = now;
    if (target === TicketStatus.active) {
      data.activatedAt = now;
      data.appleWalletPassId = current.appleWalletPassId ?? opaqueToken();
    }
    if (target === TicketStatus.used) data.usedAt = now;
    if (target === TicketStatus.cancelled) data.cancelledAt = now;
    if (target === TicketStatus.refunded) data.refundedAt = now;

    const changed = await transaction.ticket.updateMany({
      where: { id: current.id, status: current.status },
      data,
    });
    if (changed.count !== 1) throw invalidTransition(current.status, target);

    if (soldDelta !== 0) {
      if (soldDelta < 0) await lockTicketType(transaction, current.ticketTypeId);
      await transaction.ticketType.update({
        where: { id: current.ticketTypeId },
        data: { quantitySold: { increment: soldDelta } },
      });
    }

    const updated = await transaction.ticket.findUniqueOrThrow({
      where: { id: current.id },
      include: ticketContextInclude,
    });
    await this.recordMutation(transaction, actorId, updated, `ticket.${target}`, {
      previousStatus: current.status,
      currentStatus: target,
      ...(target === TicketStatus.used ? { usedAt: updated.usedAt!.toISOString() } : {}),
    });
    return updated;
  }

  private async findOwned(
    database: Pick<PrismaClient, "ticket"> | Pick<Prisma.TransactionClient, "ticket">,
    organizerId: string,
    identity: { id: string } | { qrToken: string },
  ): Promise<TicketWithContext> {
    const ticket = await database.ticket.findFirst({
      where: { ...identity, ticketType: { event: { organizerId } } },
      include: ticketContextInclude,
    });
    if (!ticket) {
      throw new NotFoundException({ code: "TICKET_NOT_FOUND", message: "Ticket was not found" });
    }
    return ticket;
  }

  private async findForUser(
    database: Pick<PrismaClient, "ticket">,
    userId: string,
    id: string,
  ): Promise<TicketWithContext> {
    const ticket = await database.ticket.findFirst({
      where: { id, OR: [{ ownerUserId: userId }, { order: { buyerUserId: userId } }] },
      include: ticketContextInclude,
    });
    if (!ticket) throw new NotFoundException({ code: "TICKET_NOT_FOUND", message: "Ticket was not found" });
    return ticket;
  }

  private async recordMutation(
    transaction: Pick<Prisma.TransactionClient, "auditLog" | "outboxEvent">,
    actorId: string,
    ticket: TicketWithContext,
    eventType: string,
    meta: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.domainEvents.append(transaction, {
      eventType,
      aggregateType: "ticket",
      aggregateId: ticket.id,
      payload: {
        eventId: ticket.ticketType.eventId,
        ticketTypeId: ticket.ticketTypeId,
        ...meta,
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId,
        action: eventType,
        entityType: "ticket",
        entityId: ticket.id,
        meta,
      },
    });
  }
}

async function lockTicket(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`ticket:${id}`}, 0))`;
}

async function lockTicketType(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${id}`}, 0))`;
}

function isSold(status: SharedTicketStatus): boolean {
  return status === TicketStatus.paid || status === TicketStatus.active || status === TicketStatus.used;
}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function invalidTransition(current: string, target: string): ConflictException {
  return new ConflictException({
    code: "TICKET_INVALID_TRANSITION",
    message: "Ticket transition is not allowed",
    details: { currentStatus: current, targetStatus: target },
  });
}

function alreadyUsed(usedAt: Date | null): ConflictException {
  return new ConflictException({
    code: "ALREADY_USED",
    message: "Ticket has already been used",
    details: { usedAt: usedAt?.toISOString() ?? null },
  });
}
