import { randomBytes } from "node:crypto";

import {
  GroupPassStatus,
  Prisma,
  TicketStatus,
  type PrismaClient,
} from "@event-platform/database";
import type { EventLocale, EventScanPreview, GuestTicket, OrganizerTicket, TicketStatus as SharedTicketStatus, UseGroupPassResponse, UseTicketResponse } from "@event-platform/shared-types";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import QRCode from "qrcode";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { eventContent, eventContentHash } from "../events/event-translation-content.js";
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

  async getForUser(userId: string, id: string, locale: EventLocale = "ru"): Promise<GuestTicket> {
    const ticket = await this.findForUser(this.database, userId, id);
    const event = ticket.ticketType.event;
    const sourceLocale = event.sourceLocale as EventLocale;
    const candidate = sourceLocale === locale ? null : await this.database.eventTranslation.findUnique({ where: { eventId_locale: { eventId: event.id, locale } } });
    const translation = candidate && (candidate.origin === "manual" || candidate.sourceHash === eventContentHash(eventContent(event))) ? candidate : null;
    return {
      ...presentGuestTicket(ticket),
      eventTitle: translation?.title ?? event.title,
      contentLocale: translation ? locale : sourceLocale,
      sourceLocale,
      walletPath: ticket.status === TicketStatus.active && this.wallet.isConfigured() ? `/me/tickets/${ticket.id}/wallet` : null,
    };
  }

  walletAvailable(): boolean { return this.wallet.isConfigured(); }

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

  async renderGroupPassQrForUser(userId: string, id: string): Promise<Buffer> {
    const pass = await this.database.groupPass.findFirst({ where: { id, order: { buyerUserId: userId, paymentStatus: "paid" }, status: { in: [GroupPassStatus.active, GroupPassStatus.used] } } });
    if (!pass) throw new NotFoundException({ code: "GROUP_PASS_NOT_FOUND", message: "Group pass was not found" });
    return QRCode.toBuffer(pass.token, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 320 });
  }

  /** Caller must first validate a purchase-scoped delivery capability. */
  async assetGroupPassForOrder(orderId: string, id: string): Promise<Buffer> {
    const pass = await this.database.groupPass.findFirst({ where: { id, orderId, order: { paymentStatus: "paid" }, status: { in: [GroupPassStatus.active, GroupPassStatus.used] } } });
    if (!pass) throw new NotFoundException({ code: "GROUP_PASS_NOT_FOUND" });
    return QRCode.toBuffer(pass.token, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 320 });
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

  async inspectEventScan(organizerId: string, eventId: string, token: string): Promise<EventScanPreview> {
    const ticket = await this.database.ticket.findFirst({
      where: { qrToken: token, ticketType: { event: { id: eventId, organizerId } } },
      include: ticketContextInclude,
    });
    if (ticket) return { kind: "ticket", ticket: presentTicket(ticket) };
    const pass = await this.database.groupPass.findFirst({
      where: { token, table: { venueLayout: { event: { id: eventId, organizerId } } } },
      select: { id: true, tableId: true, status: true, totalSeats: true, table: { select: { number: true } }, order: { select: { paymentStatus: true, tickets: { select: { status: true, seatAllocation: { select: { seat: { select: { tableId: true } } } } } } } } },
    });
    if (!pass) throw new NotFoundException({ code: "SCAN_NOT_FOUND", message: "Code was not found for this event" });
    const tableTickets = pass.order.tickets.filter((item) => item.seatAllocation?.seat.tableId === pass.tableId);
    const admitted = tableTickets.filter((item) => item.status === TicketStatus.used).length;
    return {
      kind: "group_pass", groupPassId: pass.id, tableLabel: `Стол ${pass.table.number}`,
      totalSeats: pass.totalSeats, admitted,
      remaining: tableTickets.filter((item) => item.status === TicketStatus.active).length,
      status: pass.order.paymentStatus === "paid" ? pass.status : "cancelled",
    };
  }

  async useByQrToken(organizerId: string, qrToken: string, eventId?: string): Promise<UseTicketResponse> {
    const ticket = await this.database.$transaction(async (transaction) => {
      const initial = await this.findOwned(transaction, organizerId, { qrToken }, eventId);
      await lockOrder(transaction, initial.orderId);
      await ensureNotRefunding(transaction, initial.orderId);
      const belongsToPass = initial.order.groupPass?.tableId === initial.seatAllocation?.seat.tableId;
      if (belongsToPass && initial.order.groupPass) await lockGroupPass(transaction, initial.order.groupPass.id);
      await lockTicket(transaction, initial.id);
      const current = await this.findOwned(transaction, organizerId, { id: initial.id }, eventId);
      if (current.status === TicketStatus.used) throw alreadyUsed(current.usedAt);
      const updated = await this.applyTransition(transaction, organizerId, current, TicketStatus.used);
      await transaction.seatAllocation.updateMany({ where: { ticketId: current.id, status: "active" }, data: { status: "consumed", consumedAt: new Date() } });
      if (belongsToPass && initial.order.groupPass) {
        const remaining = await transaction.ticket.count({ where: { orderId: current.orderId, status: TicketStatus.active, seatAllocation: { seat: { tableId: initial.order.groupPass.tableId } } } });
        if (remaining === 0) await transaction.groupPass.update({ where: { id: initial.order.groupPass.id }, data: { status: GroupPassStatus.used, usedAt: new Date() } });
      }
      return updated;
    });
    return { ticket: presentTicket(ticket) };
  }

  async useGroupPass(organizerId: string, token: string, confirm: boolean, eventId?: string): Promise<UseGroupPassResponse> {
    if (!confirm) throw new ConflictException({ code: "GROUP_CONFIRM_REQUIRED", message: "Confirm group admission before scanning this pass" });
    return this.database.$transaction(async (transaction) => {
      const initial = await transaction.groupPass.findFirst({
        where: { token, table: { venueLayout: { event: { organizerId, ...(eventId ? { id: eventId } : {}) } } } },
        include: { order: { include: { tickets: { include: { seatAllocation: { include: { seat: true } } } } } } },
      });
      if (!initial) throw new NotFoundException({ code: "GROUP_PASS_NOT_FOUND", message: "Group pass was not found" });
      await lockOrder(transaction, initial.orderId);
      await ensureNotRefunding(transaction, initial.orderId);
      await lockGroupPass(transaction, initial.id);
      const pass = await transaction.groupPass.findUniqueOrThrow({
        where: { id: initial.id },
        include: { order: { include: { tickets: { include: { seatAllocation: { include: { seat: true } } } } } } },
      });
      if (pass.status === GroupPassStatus.cancelled || pass.order.paymentStatus !== "paid") {
        throw new ConflictException({ code: "GROUP_PASS_NOT_ACTIVE", message: "This group pass is not active" });
      }
      const tickets = pass.order.tickets.filter((ticket) => ticket.seatAllocation?.seat.tableId === pass.tableId).sort((a, b) => a.id.localeCompare(b.id));
      for (const ticket of tickets) await lockTicket(transaction, ticket.id);
      const current = await transaction.ticket.findMany({ where: { orderId: pass.orderId, seatAllocation: { seat: { tableId: pass.tableId } } }, orderBy: { id: "asc" } });
      const eligible = current.filter((ticket) => ticket.status === TicketStatus.active);
      if (!eligible.length) {
        throw new ConflictException({ code: "ALREADY_USED", message: "All seats in this group pass have already been admitted", details: { groupPassId: pass.id, admitted: current.filter((ticket) => ticket.status === TicketStatus.used).length, remaining: 0 } });
      }
      const now = new Date();
      await transaction.ticket.updateMany({ where: { id: { in: eligible.map((ticket) => ticket.id) }, status: TicketStatus.active }, data: { status: TicketStatus.used, usedAt: now } });
      await transaction.seatAllocation.updateMany({ where: { orderId: pass.orderId, seat: { tableId: pass.tableId }, status: "active" }, data: { status: "consumed", consumedAt: now } });
      await transaction.groupPass.update({ where: { id: pass.id }, data: { status: GroupPassStatus.used, usedAt: now } });
      await this.domainEvents.append(transaction, {
        eventType: "group_pass.used",
        aggregateType: "group_pass",
        aggregateId: pass.id,
        payload: { organizerId, orderId: pass.orderId, ticketIds: eligible.map((ticket) => ticket.id), admitted: eligible.length },
      });
      await transaction.auditLog.create({ data: { actorId: organizerId, action: "group_pass.used", entityType: "group_pass", entityId: pass.id, meta: { orderId: pass.orderId, ticketIds: eligible.map((ticket) => ticket.id), admitted: eligible.length } } });
      return {
        groupPassId: pass.id,
        tableId: pass.tableId,
        totalSeats: pass.totalSeats,
        admitted: eligible.length,
        remaining: 0,
        status: "used",
        ticketIds: eligible.map((ticket) => ticket.id),
      };
    });
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
      ticketTypeName: ticket.seatAllocation?.seat.table?.typeLabel ?? ticket.seatAllocation?.seat.row?.typeLabel ?? ticket.ticketType.name,
      seatLabel: ticket.seatLabelSnapshot ?? ticket.seatAllocation?.seat.label ?? null,
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
    let internalAdmission = false;
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
      internalAdmission = ticketType.isInternal;
      if (!internalAdmission && ticketType.quantityTotal - sold - (reserved._sum.quantity ?? 0) < 1) {
        throw new ConflictException({
          code: "INSUFFICIENT_INVENTORY",
          message: "Not enough tickets remain",
        });
      }
    }
    if (soldDelta < 0) {
      const ticketType = await transaction.ticketType.findUniqueOrThrow({ where: { id: current.ticketTypeId }, select: { isInternal: true } });
      internalAdmission = ticketType.isInternal;
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

    if (soldDelta !== 0 && !internalAdmission) {
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
    eventId?: string,
  ): Promise<TicketWithContext> {
    const ticket = await database.ticket.findFirst({
      where: { ...identity, ticketType: { event: { organizerId, ...(eventId ? { id: eventId } : {}) } } },
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

async function lockOrder(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`order:${id}`}, 0))`;
}

async function ensureNotRefunding(transaction: Prisma.TransactionClient, orderId: string): Promise<void> {
  const refund = await transaction.refundRequest.findUnique({ where: { orderId }, select: { status: true } });
  if (refund && refund.status !== "failed") throw new ConflictException({ code: "REFUND_IN_PROGRESS", message: "This order is being refunded" });
}

async function lockGroupPass(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`group-pass:${id}`}, 0))`;
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
