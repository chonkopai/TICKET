import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  BookingStatus,
  EventPaymentMode,
  EventStatus,
  OrderType,
  PaymentStatus,
  Prisma,
  SeatAllocationStatus,
  SeatStatus,
  TableSaleMode,
  TableHoldStatus,
  TableStatus,
  TicketReservationStatus,
  TicketStatus,
  TicketTypeStatus,
  type PrismaClient,
} from "@event-platform/database";
import {
  venueLayoutSchemaAny,
  type BookingOptions,
  type CancellationResponse,
  type CancellationTermsResponse,
  type CheckoutResponse,
  type ManagementHoldPreview,
  type ManagementHoldRelease,
  type CheckoutSnapshot,
  type CreateTableCheckoutRequest,
  type CreateSeatCheckoutRequest,
  type CreateTicketCheckoutRequest,
  type CreateCartCheckoutRequest,
  type CheckoutEmailChoice,
} from "@event-platform/shared-types";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { lockTable, TablesService } from "../tables/tables.service.js";
import { TicketTypesService } from "../ticket-types/ticket-types.service.js";
import {
  BOOKING_CLOCK,
  BOOKING_CONFIG,
  type BookingClock,
  type BookingConfig,
} from "./booking.constants.js";
import { PaymentService } from "../payments/payment.service.js";
import { CheckoutEmailService } from "./checkout-email.service.js";
import { normalizeContact } from "../auth/contact-identity.js";
import type { NormalizedPaymentWebhook } from "./payment-provider.js";

const TICKET_CHECKOUT = "checkout.ticket";
const TABLE_CHECKOUT = "checkout.table";
const SEAT_CHECKOUT = "checkout.seats";
const CART_CHECKOUT = "checkout.cart";
const TICKET_CANCEL = "cancel.ticket";
const BOOKING_CANCEL = "cancel.booking";

/** Internal only: the anonymous boundary owns authorization, idempotency and the transaction. */
export interface AnonymousCheckoutContext {
  transaction: Prisma.TransactionClient;
  guestContact: Prisma.InputJsonObject;
  sessionId: string;
  verifiedEmail: string | null;
}

@Injectable()
export class BookingService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(TicketTypesService) private readonly ticketTypes: TicketTypesService,
    @Inject(TablesService) private readonly tables: TablesService,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    @Inject(BOOKING_CONFIG) private readonly config: BookingConfig,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(PaymentService) private readonly paymentLinks: PaymentService,
    @Inject(CheckoutEmailService) private readonly checkoutEmail?: CheckoutEmailService,
  ) {}

  async checkoutCart(userId: string, rawKey: string | undefined, input: CreateCartCheckoutRequest, anonymous?: AnonymousCheckoutContext, sessionFamilyId?: string): Promise<CheckoutResponse> {
    const key = idempotencyKey(rawKey);
    const fingerprint = checkoutFingerprint(input);
    const tickets = input.tickets ?? [];
    const seatIds = input.seatIds ?? [];
    if (!Array.isArray(tickets) || !Array.isArray(seatIds) || (!tickets.length && !seatIds.length && !input.tableId)
      || tickets.length > 10 || seatIds.length > 10 || tickets.reduce((sum, item) => sum + item.quantity, seatIds.length) > 10
      || new Set(tickets.map((item) => item.ticketTypeId)).size !== tickets.length || new Set(seatIds).size !== seatIds.length
      || tickets.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) {
      throw new BadRequestException({ code: "CART_SELECTION_INVALID", message: "Choose up to 10 distinct tickets and seats, with at most one whole table" });
    }
    const prior = anonymous ? null : await this.replayed(userId, CART_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
    if (prior) {
      if (prior.paymentLink) return prior;
      const link = await this.paymentLinks.createLink(userId, prior.orderId, `checkout-${key}`);
      return { ...prior, paymentLink: link.paymentLink };
    }
    try {
      const create = async (transaction: Prisma.TransactionClient): Promise<CheckoutResponse> => {
        const replay = anonymous ? null : await claim(transaction, userId, CART_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
        if (replay) return replay;
        const event = await transaction.event.findFirst({ where: { id: input.eventId, status: EventStatus.published } });
        if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
        const now = this.clock.now();
        const configuredExpiry = new Date(now.getTime() + this.config.checkoutTtlSeconds * 1_000);
        const types = tickets.length ? await transaction.ticketType.findMany({ where: { id: { in: tickets.map((item) => item.ticketTypeId) }, eventId: event.id, isInternal: false, seats: { none: {} }, status: TicketTypeStatus.active } }) : [];
        if (types.length !== tickets.length || types.some((type) => (type.salesStartAt && type.salesStartAt > now) || (type.salesEndAt && type.salesEndAt <= now))) throw new ConflictException({ code: "TICKET_UNAVAILABLE", message: "A selected ticket is unavailable" });
        const seats = seatIds.length ? await transaction.seat.findMany({ where: { id: { in: seatIds } }, include: {
          ticketType: true, table: { select: { number: true, saleMode: true, venueLayoutId: true } }, row: { select: { number: true, venueLayoutId: true } },
          allocations: { where: { status: { in: [SeatAllocationStatus.active, SeatAllocationStatus.consumed] } }, select: { id: true } },
        } }) : [];
        if (seats.length !== seatIds.length || seats.some((seat) => seat.status !== SeatStatus.available || seat.allocations.length || !seat.ticketType || seat.ticketType.eventId !== event.id || seat.ticketType.status !== TicketTypeStatus.active || (seat.table && (seat.table.saleMode !== TableSaleMode.per_seat || seat.table.venueLayoutId !== seat.venueLayoutId)) || (seat.row && seat.row.venueLayoutId !== seat.venueLayoutId))) throw new ConflictException({ code: "SEAT_UNAVAILABLE", message: "A selected seat is unavailable" });
        for (const id of [...seatIds].sort()) await lockSeat(transaction, id);
        if (seatIds.length) {
          const locked = await transaction.seat.findMany({ where: { id: { in: seatIds } }, include: { allocations: { where: { status: { in: [SeatAllocationStatus.active, SeatAllocationStatus.consumed] } }, select: { id: true } } } });
          if (locked.some((seat) => seat.status !== SeatStatus.available || seat.allocations.length)) throw new ConflictException({ code: "SEAT_UNAVAILABLE", message: "A selected seat is unavailable" });
        }
        if (seats.some((seat) => (seat.ticketType!.salesStartAt && seat.ticketType!.salesStartAt > now) || (seat.ticketType!.salesEndAt && seat.ticketType!.salesEndAt <= now))) throw new ConflictException({ code: "SEAT_SALES_WINDOW_CLOSED", message: "Selected seats are not currently on sale" });
        const table = input.tableId ? await transaction.table.findFirst({ where: { id: input.tableId, venueLayout: { eventId: event.id } }, include: { seatRecords: { orderBy: { sortOrder: "asc" } } } }) : null;
        if (input.tableId && (!table || table.saleMode !== TableSaleMode.whole_table)) throw new ConflictException({ code: "TABLE_UNAVAILABLE", message: "Selected table is unavailable" });
        const currencies = [...types.map((type) => type.currency.trim()), ...seats.map((seat) => seat.ticketType!.currency.trim()), ...(table ? [table.currency.trim()] : [])];
        const currency = currencies[0]!;
        if (currencies.some((value) => value !== currency)) throw new ConflictException({ code: "CART_CURRENCY_MISMATCH", message: "All selections must use the same currency" });
        const full = tickets.reduce((sum, item) => sum + types.find((type) => type.id === item.ticketTypeId)!.price * item.quantity, 0)
          + seats.reduce((sum, seat) => sum + seat.ticketType!.price, 0) + (table?.price ?? 0);
        const due = event.paymentMode === EventPaymentMode.deposit
          ? tickets.reduce((sum, item) => sum + types.find((type) => type.id === item.ticketTypeId)!.deposit * item.quantity, 0) + seats.reduce((sum, seat) => sum + seat.ticketType!.deposit, 0) + (table?.deposit ?? 0)
          : full;
        if (event.paymentMode === EventPaymentMode.deposit && (due <= 0 || types.some((type) => type.deposit <= 0) || seats.some((seat) => seat.ticketType!.deposit <= 0) || (table && table.deposit <= 0))) throw new ConflictException({ code: "DEPOSIT_NOT_CONFIGURED", message: "A positive deposit is required for every selection" });
        const orderId = randomUUID();
        let hold: Awaited<ReturnType<TablesService["holdInTransaction"]>> | null = null;
        let includedSeats: Awaited<ReturnType<typeof ensureWholeTableSeats>> = [];
        if (table) {
          const holdKey = `checkout-${createHash("sha256").update(`${userId}:${key}`).digest("hex")}`;
          hold = await this.tables.holdInTransaction(transaction, table.id, holdKey, now);
          includedSeats = await ensureWholeTableSeats(transaction, table.id, table.venueLayoutId, table.seats, table.seatRecords);
        }
        const expiresAt = hold && hold.expiresAt < configuredExpiry ? hold.expiresAt : configuredExpiry;
        const fullAmount = event.paymentMode === EventPaymentMode.deposit && !event.showFullAmountForDeposit ? null : full;
        const itemLabels = [
          ...tickets.map((item) => ({ kind: "ticket" as const, id: item.ticketTypeId, name: types.find((type) => type.id === item.ticketTypeId)!.name, quantity: item.quantity, amountDue: (event.paymentMode === EventPaymentMode.deposit ? types.find((type) => type.id === item.ticketTypeId)!.deposit : types.find((type) => type.id === item.ticketTypeId)!.price) * item.quantity })),
          ...seats.map((seat) => ({ kind: "seat" as const, id: seat.id, name: seat.label, quantity: 1, amountDue: event.paymentMode === EventPaymentMode.deposit ? seat.ticketType!.deposit : seat.ticketType!.price })),
          ...(table ? [{ kind: "table" as const, id: table.id, name: table.name ?? `Стол №${table.number}`, quantity: 1, amountDue: event.paymentMode === EventPaymentMode.deposit ? table.deposit : table.price }] : []),
        ];
        const snapshot: CheckoutSnapshot = { eventId: event.id, eventTitle: event.title, eventDate: event.date.toISOString().slice(0, 10), eventTime: event.time.toISOString().slice(11, 16), eventTimezone: event.timezone, venueName: event.venueName, itemId: itemLabels[0]!.id, itemName: itemLabels.map((item) => item.name).join(", "), itemKind: "cart", quantity: itemLabels.reduce((sum, item) => sum + item.quantity, 0), paymentMode: event.paymentMode, paymentLabel: event.paymentMode, unitFullAmount: full, fullAmount, amountDue: due, currency, cancellationTerms: event.cancellationTerms, depositTerms: event.depositTerms, items: itemLabels,
          seatIds: [...seatIds, ...includedSeats.map((seat) => seat.id)], groupPass: Boolean(table) };
        const deliveryEmail = await this.resolveEmail(transaction, userId, input.emailDelivery, sessionFamilyId, anonymous);
        await transaction.order.create({ data: { id: orderId, type: OrderType.ticket, buyerUserId: anonymous ? null : userId, ...(anonymous ? { guestContact: anonymous.guestContact } : {}), amount: due, currency, checkoutSnapshot: json(snapshot), termsAcceptedAt: now, expiresAt, emailDeliveryAddress: deliveryEmail, emailDeliveryRequestedAt: deliveryEmail ? now : null } });
        const ticketIds: string[] = [];
        for (const item of tickets) {
          await this.ticketTypes.reserveInTransaction(transaction, item.ticketTypeId, item.quantity, expiresAt, orderId, now);
          for (let index = 0; index < item.quantity; index++) {
            const ticket = await transaction.ticket.create({ data: { ticketTypeId: item.ticketTypeId, orderId, ownerUserId: anonymous ? null : userId, qrToken: randomBytes(32).toString("base64url"), status: TicketStatus.pending_payment } });
            ticketIds.push(ticket.id);
          }
        }
        for (const seat of seats) {
          const label = seat.table ? `Стол ${seat.table.number} · Место ${seat.number}` : `Ряд ${seat.row?.number ?? ""} · Место ${seat.number}`;
          const ticket = await transaction.ticket.create({ data: { ticketTypeId: seat.ticketType!.id, orderId, ownerUserId: anonymous ? null : userId, qrToken: randomBytes(32).toString("base64url"), seatLabelSnapshot: label, status: TicketStatus.pending_payment } });
          ticketIds.push(ticket.id);
          await transaction.seatAllocation.create({ data: { seatId: seat.id, orderId, ticketId: ticket.id } });
        }
        let bookingId: string | null = null;
        let groupPassId: string | null = null;
        if (table && hold) {
          const booking = await transaction.booking.create({ data: { tableId: table.id, orderId, tableHoldId: hold.id, ...(anonymous ? { guestContact: anonymous.guestContact } : {}) } });
          bookingId = booking.id;
          const admissionType = await ensureAdmissionTicketType(transaction, event.id, table.id, currency);
          for (const seat of includedSeats) {
            const ticket = await transaction.ticket.create({ data: { ticketTypeId: admissionType.id, orderId, ownerUserId: anonymous ? null : userId, qrToken: randomBytes(32).toString("base64url"), seatLabelSnapshot: `Стол ${table.number} · Место ${seat.number}`, status: TicketStatus.pending_payment } });
            ticketIds.push(ticket.id);
            await transaction.seatAllocation.create({ data: { seatId: seat.id, orderId, ticketId: ticket.id } });
          }
          const pass = await transaction.groupPass.create({ data: { orderId, tableId: table.id, token: randomBytes(32).toString("base64url"), totalSeats: includedSeats.length } });
          groupPassId = pass.id;
        }
        if (event.paymentMode === EventPaymentMode.deposit) await transaction.deposit.create({ data: { eventId: event.id, orderId, amount: due, currency, terms: requiredDepositTerms(event.depositTerms) } });
        const response: CheckoutResponse = { orderId, kind: "cart", paymentMode: event.paymentMode, paymentLabel: event.paymentMode, amountDue: due, fullAmount, currency, paymentLink: "", expiresAt: expiresAt.toISOString(), ticketIds, bookingId, emailDelivery: deliveryEmail ? { address: deliveryEmail, status: "pending_payment" } : null, ...(groupPassId ? { groupPassId, groupPassQrPath: `/me/group-passes/${groupPassId}/qr` } : {}) };
        await this.domainEvents.append(transaction, { eventType: "checkout.cart_created", aggregateType: "order", aggregateId: orderId, payload: { userId: anonymous ? null : userId, eventId: event.id, items: itemLabels, amountDue: due } });
        if (!anonymous) await saveResponse(transaction, userId, CART_CHECKOUT, key, orderId, response);
        return response;
      };
      const response = anonymous ? await create(anonymous.transaction) : await this.database.$transaction(create, { timeout: 15_000 });
      if (anonymous) return response;
      const link = await this.paymentLinks.createLink(userId, response.orderId, `checkout-${key}`);
      if (response.amountDue === 0) await this.settleSucceeded(response.orderId);
      const finalResponse = { ...response, paymentLink: link.paymentLink };
      await this.database.idempotencyRecord.update({ where: { userId_operation_key: { userId, operation: CART_CHECKOUT, key } }, data: { response: json(finalResponse) } });
      return finalResponse;
    } catch (error) {
      if (anonymous) throw error;
      return this.resolveRace(error, userId, CART_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
    }
  }

  async checkoutTickets(
    userId: string,
    rawKey: string | undefined,
    input: CreateTicketCheckoutRequest,
    anonymous?: AnonymousCheckoutContext,
    sessionFamilyId?: string,
  ): Promise<CheckoutResponse> {
    const key = idempotencyKey(rawKey);
    const fingerprint = checkoutFingerprint(input);
    const prior = anonymous ? null : await this.replayed(userId, TICKET_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
    if (prior) {
      if (prior.paymentLink) return prior;
      const link = await this.paymentLinks.createLink(userId, prior.orderId, `checkout-${key}`);
      return { ...prior, paymentLink: link.paymentLink };
    }

    try {
      const create = async (transaction: Prisma.TransactionClient) => {
        const replay = anonymous ? null : await claim(transaction, userId, TICKET_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
        if (replay) return replay;

        const ticketType = await transaction.ticketType.findFirst({
          where: { id: input.ticketTypeId, seats: { none: {} }, status: TicketTypeStatus.active, event: { status: EventStatus.published } },
          include: { event: true },
        });
        if (!ticketType) throw new NotFoundException({ code: "TICKET_TYPE_NOT_FOUND", message: "Ticket type was not found" });

        const now = this.clock.now();
        const expiresAt = new Date(now.getTime() + this.config.checkoutTtlSeconds * 1_000);
        const amounts = paymentAmounts(ticketType.event, ticketType.price, ticketType.deposit, input.quantity);
        const snapshot: CheckoutSnapshot = {
          eventId: ticketType.eventId,
          eventTitle: ticketType.event.title,
          eventDate: ticketType.event.date.toISOString().slice(0, 10),
          eventTime: ticketType.event.time.toISOString().slice(11, 16),
          eventTimezone: ticketType.event.timezone,
          venueName: ticketType.event.venueName,
          itemId: ticketType.id,
          itemName: ticketType.name,
          itemKind: "ticket",
          quantity: input.quantity,
          paymentMode: ticketType.event.paymentMode,
          paymentLabel: ticketType.event.paymentMode,
          unitFullAmount: ticketType.price,
          fullAmount: amounts.fullAmount,
          amountDue: amounts.amountDue,
          currency: ticketType.currency.trim(),
          cancellationTerms: ticketType.event.cancellationTerms,
          depositTerms: ticketType.event.depositTerms,
        };
        const orderId = randomUUID();
        const deliveryEmail = await this.resolveEmail(transaction, userId, input.emailDelivery, sessionFamilyId, anonymous);
        await transaction.order.create({
          data: {
            id: orderId,
            type: OrderType.ticket,
            buyerUserId: anonymous ? null : userId,
            ...(anonymous ? { guestContact: anonymous.guestContact } : {}),
            amount: amounts.amountDue,
            currency: snapshot.currency,
            checkoutSnapshot: json(snapshot),
            emailDeliveryAddress: deliveryEmail,
            emailDeliveryRequestedAt: deliveryEmail ? now : null,
            termsAcceptedAt: now,
            expiresAt,
          },
        });
        await this.ticketTypes.reserveInTransaction(transaction, ticketType.id, input.quantity, expiresAt, orderId, now);
        const tickets: Array<{ id: string }> = [];
        for (let index = 0; index < input.quantity; index += 1) {
          tickets.push(await transaction.ticket.create({
            data: {
              ticketTypeId: ticketType.id,
              orderId,
              ownerUserId: anonymous ? null : userId,
              qrToken: randomBytes(32).toString("base64url"),
              status: TicketStatus.pending_payment,
            },
            select: { id: true },
          }));
        }
        if (ticketType.event.paymentMode === EventPaymentMode.deposit) {
          await transaction.deposit.create({
            data: {
              eventId: ticketType.eventId,
              orderId,
              amount: amounts.amountDue,
              currency: snapshot.currency,
              terms: requiredDepositTerms(ticketType.event.depositTerms),
            },
          });
        }
        const response: CheckoutResponse = {
          orderId,
          kind: "ticket",
          paymentMode: snapshot.paymentMode,
          paymentLabel: snapshot.paymentLabel,
          amountDue: snapshot.amountDue,
          fullAmount: snapshot.fullAmount,
          currency: snapshot.currency,
          paymentLink: "",
          expiresAt: expiresAt.toISOString(),
          ticketIds: tickets.map(({ id }) => id),
          bookingId: null,
          emailDelivery: deliveryEmail ? { address: deliveryEmail, status: "pending_payment" } : null,
        };
        await this.domainEvents.append(transaction, {
          eventType: "checkout.ticket_created",
          aggregateType: "order",
          aggregateId: orderId,
          payload: { userId: anonymous ? null : userId, ...(anonymous ? { anonymousSessionId: userId } : {}), eventId: ticketType.eventId, ticketTypeId: ticketType.id, quantity: input.quantity, amountDue: amounts.amountDue },
        });
        if (!anonymous) await saveResponse(transaction, userId, TICKET_CHECKOUT, key, orderId, response);
        return response;
      };
      const response = anonymous ? await create(anonymous.transaction) : await this.database.$transaction(create, { timeout: 15_000 });
      if (anonymous) return response;
      const linked = await this.paymentLinks.createLink(userId, response.orderId, `checkout-${key}`);
      if (response.amountDue === 0) await this.settleSucceeded(response.orderId);
      const finalResponse = { ...response, paymentLink: linked.paymentLink };
      await this.database.idempotencyRecord.update({ where: { userId_operation_key: { userId, operation: TICKET_CHECKOUT, key } }, data: { response: json(finalResponse) } });
      return finalResponse;
    } catch (error) {
      return this.resolveRace(error, userId, TICKET_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
    }
  }

  async checkoutTable(
    userId: string,
    rawKey: string | undefined,
    input: CreateTableCheckoutRequest,
    anonymous?: AnonymousCheckoutContext,
    sessionFamilyId?: string,
  ): Promise<CheckoutResponse> {
    const key = idempotencyKey(rawKey);
    const fingerprint = checkoutFingerprint(input);
    const prior = anonymous ? null : await this.replayed(userId, TABLE_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
    if (prior) {
      if (prior.paymentLink) return prior;
      const link = await this.paymentLinks.createLink(userId, prior.orderId, `checkout-${key}`);
      return { ...prior, paymentLink: link.paymentLink };
    }
    try {
      const create = async (transaction: Prisma.TransactionClient) => {
        const replay = anonymous ? null : await claim(transaction, userId, TABLE_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
        if (replay) return replay;
        const table = await transaction.table.findFirst({
          where: { id: input.tableId, venueLayout: { event: { status: EventStatus.published } } },
          include: { seatRecords: { orderBy: { sortOrder: "asc" } }, venueLayout: { include: { event: true } } },
        });
        const event = table?.venueLayout.event;
        if (!table || !event) throw new NotFoundException({ code: "TABLE_NOT_FOUND", message: "Table was not found" });
        if (table.saleMode === TableSaleMode.per_seat) throw new ConflictException({ code: "TABLE_REQUIRES_SEAT_SELECTION", message: "Select individual seats for this table" });

        const now = this.clock.now();
        const configuredExpiry = new Date(now.getTime() + this.config.checkoutTtlSeconds * 1_000);
        const holdKey = `checkout-${createHash("sha256").update(`${userId}:${key}`).digest("hex")}`;
        const hold = await this.tables.holdInTransaction(transaction, table.id, holdKey, now);
        const includedSeats = await ensureWholeTableSeats(transaction, table.id, table.venueLayoutId, table.seats, table.seatRecords);
        const expiresAt = hold.expiresAt < configuredExpiry ? hold.expiresAt : configuredExpiry;
        const amounts = paymentAmounts(event, table.price, table.deposit, 1);
        const snapshot: CheckoutSnapshot = {
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.date.toISOString().slice(0, 10),
          eventTime: event.time.toISOString().slice(11, 16),
          eventTimezone: event.timezone,
          venueName: event.venueName,
          itemId: table.id,
          itemName: table.name ?? `Стол №${table.number}`,
          itemKind: "table",
          quantity: 1,
          paymentMode: event.paymentMode,
          paymentLabel: event.paymentMode,
          unitFullAmount: table.price,
          fullAmount: amounts.fullAmount,
          amountDue: amounts.amountDue,
          currency: table.currency.trim(),
          cancellationTerms: event.cancellationTerms,
          depositTerms: event.depositTerms,
          seatIds: includedSeats.map((seat) => seat.id),
          seatLabels: includedSeats.map((seat) => `Стол ${table.number} · Место ${seat.number}`),
          seatAssignments: includedSeats.map((seat) => ({ seatId: seat.id, seatNumber: seat.number, parentKind: "table", parentNumber: table.number, displayLabel: `Стол ${table.number} · Место ${seat.number}` })),
          groupPass: true,
        };
        const orderId = randomUUID();
        const deliveryEmail = await this.resolveEmail(transaction, userId, input.emailDelivery, sessionFamilyId, anonymous);
        await transaction.order.create({
          data: {
            id: orderId,
            type: OrderType.table,
            buyerUserId: anonymous ? null : userId,
            ...(anonymous ? { guestContact: anonymous.guestContact } : {}),
            amount: amounts.amountDue,
            currency: snapshot.currency,
            checkoutSnapshot: json(snapshot),
            emailDeliveryAddress: deliveryEmail,
            emailDeliveryRequestedAt: deliveryEmail ? now : null,
            termsAcceptedAt: now,
            expiresAt,
          },
        });
        const booking = await transaction.booking.create({
          data: { tableId: table.id, orderId, tableHoldId: hold.id, ...(anonymous ? { guestContact: anonymous.guestContact } : {}) },
        });
        const admissionType = await ensureAdmissionTicketType(transaction, event.id, table.id, table.currency.trim());
        const individualTicketIds: string[] = [];
        for (const seat of includedSeats) {
          const ticket = await transaction.ticket.create({ data: { ticketTypeId: admissionType.id, orderId, ownerUserId: anonymous ? null : userId, qrToken: randomBytes(32).toString("base64url"), seatLabelSnapshot: `Стол ${table.number} · Место ${seat.number}`, status: TicketStatus.pending_payment } });
          individualTicketIds.push(ticket.id);
          await transaction.seatAllocation.create({ data: { seatId: seat.id, orderId, ticketId: ticket.id } });
        }
        const groupPass = await transaction.groupPass.create({ data: { orderId, tableId: table.id, token: randomBytes(32).toString("base64url"), totalSeats: includedSeats.length } });
        if (event.paymentMode === EventPaymentMode.deposit) {
          await transaction.deposit.create({
            data: { eventId: event.id, orderId, amount: amounts.amountDue, currency: snapshot.currency, terms: requiredDepositTerms(event.depositTerms) },
          });
        }
        const response: CheckoutResponse = {
          orderId,
          kind: "table",
          paymentMode: snapshot.paymentMode,
          paymentLabel: snapshot.paymentLabel,
          amountDue: snapshot.amountDue,
          fullAmount: snapshot.fullAmount,
          currency: snapshot.currency,
          paymentLink: "",
          expiresAt: expiresAt.toISOString(),
          ticketIds: individualTicketIds,
          bookingId: booking.id,
          groupPassId: groupPass.id,
          groupPassQrPath: `/me/group-passes/${groupPass.id}/qr`,
          emailDelivery: deliveryEmail ? { address: deliveryEmail, status: "pending_payment" } : null,
        };
        await this.domainEvents.append(transaction, {
          eventType: "checkout.table_created",
          aggregateType: "order",
          aggregateId: orderId,
          payload: { userId: anonymous ? null : userId, ...(anonymous ? { anonymousSessionId: userId } : {}), eventId: event.id, tableId: table.id, bookingId: booking.id, ticketIds: individualTicketIds, groupPassId: groupPass.id, amountDue: amounts.amountDue },
        });
        if (!anonymous) await saveResponse(transaction, userId, TABLE_CHECKOUT, key, orderId, response);
        return response;
      };
      const response = anonymous ? await create(anonymous.transaction) : await this.database.$transaction(create, { timeout: 15_000 });
      if (anonymous) return response;
      const linked = await this.paymentLinks.createLink(userId, response.orderId, `checkout-${key}`);
      if (response.amountDue === 0) await this.settleSucceeded(response.orderId);
      const finalResponse = { ...response, paymentLink: linked.paymentLink };
      await this.database.idempotencyRecord.update({ where: { userId_operation_key: { userId, operation: TABLE_CHECKOUT, key } }, data: { response: json(finalResponse) } });
      return finalResponse;
    } catch (error) {
      return this.resolveRace(error, userId, TABLE_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
    }
  }

  async checkoutSeats(
    userId: string,
    rawKey: string | undefined,
    input: CreateSeatCheckoutRequest,
    anonymous?: AnonymousCheckoutContext,
    sessionFamilyId?: string,
  ): Promise<CheckoutResponse> {
    const key = idempotencyKey(rawKey);
    const fingerprint = checkoutFingerprint(input);
    const prior = anonymous ? null : await this.replayed(userId, SEAT_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
    if (prior) {
      if (prior.paymentLink) return prior;
      const link = await this.paymentLinks.createLink(userId, prior.orderId, `checkout-${key}`);
      return { ...prior, paymentLink: link.paymentLink };
    }
    const seatIds = [...new Set(input.seatIds)];
    if (seatIds.length < 1 || seatIds.length > 10 || seatIds.length !== input.seatIds.length) {
      throw new BadRequestException({ code: "SEAT_SELECTION_INVALID", message: "Choose between 1 and 10 different seats" });
    }
    try {
      const create = async (transaction: Prisma.TransactionClient) => {
        const replay = anonymous ? null : await claim(transaction, userId, SEAT_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
        if (replay) return replay;
        const seats = await transaction.seat.findMany({
          where: { id: { in: seatIds } },
          include: {
            ticketType: { include: { event: true } },
            table: { select: { id: true, number: true, saleMode: true, venueLayoutId: true } },
            row: { select: { id: true, number: true, venueLayoutId: true } },
            allocations: { where: { status: { in: [SeatAllocationStatus.active, SeatAllocationStatus.consumed] } }, select: { id: true } },
          },
        });
        if (seats.length !== seatIds.length || seats.some((seat) => seat.status !== SeatStatus.available || !seat.ticketType || seat.ticketType.status !== TicketTypeStatus.active)) {
          throw new ConflictException({ code: "SEAT_UNAVAILABLE", message: "One or more selected seats are unavailable" });
        }
        if (seats.some((seat) => seat.table && seat.table.saleMode !== TableSaleMode.per_seat)) {
          throw new ConflictException({ code: "SEAT_SALE_MODE_INVALID", message: "This table is sold as a whole" });
        }
        const event = seats[0]!.ticketType!.event;
        if (event.status !== EventStatus.published || seats.some((seat) => seat.ticketType!.eventId !== event.id || seat.allocations.length > 0 || (seat.table && seat.table.venueLayoutId !== seat.venueLayoutId) || (seat.row && seat.row.venueLayoutId !== seat.venueLayoutId))) {
          throw new ConflictException({ code: "SEAT_UNAVAILABLE", message: "One or more selected seats are unavailable" });
        }
        for (const id of [...seatIds].sort()) await lockSeat(transaction, id);
        const locked = await transaction.seat.findMany({ where: { id: { in: seatIds } }, include: { allocations: { where: { status: { in: [SeatAllocationStatus.active, SeatAllocationStatus.consumed] } }, select: { id: true } } } });
        if (locked.some((seat) => seat.status !== SeatStatus.available || seat.allocations.length > 0)) throw new ConflictException({ code: "SEAT_UNAVAILABLE", message: "One or more selected seats are unavailable" });
        const now = this.clock.now();
        if (seats.some((seat) => (seat.ticketType!.salesStartAt && seat.ticketType!.salesStartAt > now) || (seat.ticketType!.salesEndAt && seat.ticketType!.salesEndAt <= now))) {
          throw new ConflictException({ code: "SEAT_SALES_WINDOW_CLOSED", message: "Selected seats are not currently on sale" });
        }
        const expiresAt = new Date(now.getTime() + this.config.checkoutTtlSeconds * 1_000);
        const currency = seats[0]!.ticketType!.currency.trim();
        if (seats.some((seat) => seat.ticketType!.currency.trim() !== currency)) throw new ConflictException({ code: "SEAT_CURRENCY_MISMATCH", message: "Selected seats use different currencies" });
        const fullAmount = seats.reduce((sum, seat) => sum + seat.ticketType!.price, 0);
        const amountDue = event.paymentMode === EventPaymentMode.deposit ? seats.reduce((sum, seat) => sum + seat.ticketType!.deposit, 0) : fullAmount;
        if (event.paymentMode === EventPaymentMode.deposit && amountDue <= 0) throw new ConflictException({ code: "DEPOSIT_NOT_CONFIGURED", message: "A positive deposit is required" });
        const seatAssignments = seats.map((seat) => seat.table
          ? { seatId: seat.id, seatNumber: seat.number, parentKind: "table" as const, parentNumber: seat.table.number, displayLabel: `Стол ${seat.table.number} · Место ${seat.number}` }
          : { seatId: seat.id, seatNumber: seat.number, parentKind: "row" as const, parentNumber: seat.row!.number, displayLabel: `Ряд ${seat.row!.number} · Место ${seat.number}` });
        const snapshot: CheckoutSnapshot = {
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.date.toISOString().slice(0, 10),
          eventTime: event.time.toISOString().slice(11, 16),
          eventTimezone: event.timezone,
          venueName: event.venueName,
          itemId: seatIds[0]!,
          itemName: `${seats.length} мест`,
          itemKind: "ticket",
          quantity: seats.length,
          paymentMode: event.paymentMode,
          paymentLabel: event.paymentMode,
          unitFullAmount: seats.length === 1 ? seats[0]!.ticketType!.price : fullAmount,
          fullAmount: event.paymentMode === EventPaymentMode.deposit && !event.showFullAmountForDeposit ? null : fullAmount,
          amountDue,
          currency,
          cancellationTerms: event.cancellationTerms,
          depositTerms: event.depositTerms,
          seatIds,
          seatLabels: seatAssignments.map(({ displayLabel }) => displayLabel),
          seatAssignments,
        };
        const orderId = randomUUID();
        const deliveryEmail = await this.resolveEmail(transaction, userId, input.emailDelivery, sessionFamilyId, anonymous);
        await transaction.order.create({ data: { id: orderId, type: OrderType.ticket, buyerUserId: anonymous ? null : userId, ...(anonymous ? { guestContact: anonymous.guestContact } : {}), amount: amountDue, currency, checkoutSnapshot: json(snapshot), termsAcceptedAt: now, expiresAt, emailDeliveryAddress: deliveryEmail, emailDeliveryRequestedAt: deliveryEmail ? now : null } });
        const ticketIds: string[] = [];
        for (const seat of seats) {
          const displayLabel = seatAssignments.find(({ seatId }) => seatId === seat.id)!.displayLabel;
          const ticket = await transaction.ticket.create({ data: { ticketTypeId: seat.ticketType!.id, orderId, ownerUserId: anonymous ? null : userId, qrToken: randomBytes(32).toString("base64url"), seatLabelSnapshot: displayLabel, status: TicketStatus.pending_payment } });
          ticketIds.push(ticket.id);
          await transaction.seatAllocation.create({ data: { seatId: seat.id, orderId, ticketId: ticket.id } });
        }
        if (event.paymentMode === EventPaymentMode.deposit) await transaction.deposit.create({ data: { eventId: event.id, orderId, amount: amountDue, currency, terms: requiredDepositTerms(event.depositTerms) } });
        const result: CheckoutResponse = { orderId, kind: "ticket", paymentMode: snapshot.paymentMode, paymentLabel: snapshot.paymentLabel, amountDue, fullAmount: snapshot.fullAmount, currency, paymentLink: "", expiresAt: expiresAt.toISOString(), ticketIds, bookingId: null, emailDelivery: deliveryEmail ? { address: deliveryEmail, status: "pending_payment" } : null };
        await this.domainEvents.append(transaction, { eventType: "checkout.seats_created", aggregateType: "order", aggregateId: orderId, payload: { userId: anonymous ? null : userId, ...(anonymous ? { anonymousSessionId: userId } : {}), eventId: event.id, seatIds, amountDue } });
        if (!anonymous) await saveResponse(transaction, userId, SEAT_CHECKOUT, key, orderId, result);
        return result;
      };
      const response = anonymous ? await create(anonymous.transaction) : await this.database.$transaction(create, { timeout: 15_000 });
      if (anonymous) return response;
      const link = await this.paymentLinks.createLink(userId, response.orderId, `checkout-${key}`);
      if (response.amountDue === 0) await this.settleSucceeded(response.orderId);
      const finalResponse = { ...response, paymentLink: link.paymentLink };
      await this.database.idempotencyRecord.update({ where: { userId_operation_key: { userId, operation: SEAT_CHECKOUT, key } }, data: { response: json(finalResponse) } });
      return finalResponse;
    } catch (error) {
      if (anonymous) throw error;
      return this.resolveRace(error, userId, SEAT_CHECKOUT, key, fingerprint, Boolean(input.emailDelivery));
    }
  }

  async options(_userId: string, eventId: string): Promise<BookingOptions> {
    const event = await this.database.event.findFirst({
      where: { id: eventId, status: EventStatus.published },
      include: { venueLayout: true },
    });
    if (!event) throw new NotFoundException({ code: "EVENT_NOT_FOUND", message: "Event was not found" });
    if (event.venueLayout) await this.tables.expireLayoutHolds(event.venueLayout.id);
    const parsed = event.venueLayout ? venueLayoutSchemaAny.safeParse(event.venueLayout.layoutJson) : null;
    return {
      eventId,
      paymentMode: event.paymentMode,
      showFullAmountForDeposit: event.showFullAmountForDeposit,
      depositTerms: event.depositTerms,
      cancellationTerms: event.cancellationTerms,
      layout: parsed?.success ? parsed.data as BookingOptions["layout"] : null,
    };
  }

  async settleSucceeded(orderId: string): Promise<void> {
    await this.database.$transaction((transaction) => this.settleSucceededInTransaction(transaction, orderId), { timeout: 15_000 });
  }

  async settleFailed(orderId: string, reason: "failed" | "expired" = "failed"): Promise<void> {
    await this.database.$transaction((transaction) => this.failOrderInTransaction(transaction, orderId, reason), { timeout: 15_000 });
  }

  async organizerHoldPreview(organizerId: string, eventId: string, orderId: string): Promise<ManagementHoldPreview> {
    const order = await ownedHoldOrder(this.database, organizerId, eventId, orderId);
    return presentHoldPreview(order, this.clock.now());
  }

  async organizerReleaseHold(organizerId: string, eventId: string, orderId: string): Promise<ManagementHoldRelease> {
    return this.database.$transaction(async (transaction) => {
      await lockOrder(transaction, orderId);
      const order = await ownedHoldOrder(transaction, organizerId, eventId, orderId);
      const prior = await transaction.auditLog.findFirst({ where: { entityType: "order", entityId: orderId, action: "checkout.hold_released" }, select: { id: true } });
      if (prior) return { orderId, released: true, alreadyReleased: true };
      const preview = presentHoldPreview(order, this.clock.now());
      if (!preview.eligible) throw new ConflictException({ code: "HOLD_NOT_RELEASABLE", message: `Hold cannot be released: ${preview.reason}` });
      await this.failOrderInTransaction(transaction, orderId, "released");
      await transaction.auditLog.create({ data: { actorId: organizerId, action: "checkout.hold_released", entityType: "order", entityId: orderId, meta: { eventId, resourceLabels: preview.resourceLabels } } });
      return { orderId, released: true, alreadyReleased: false };
    }, { timeout: 15_000 });
  }

  async settleSucceededInTransaction(transaction: Prisma.TransactionClient, orderId: string): Promise<void> {
    await lockOrder(transaction, orderId);
    const order = await transaction.order.findUnique({ where: { id: orderId }, include: { tickets: true, reservations: true, booking: { include: { tableHold: true } }, deposit: true } });
    if (!order) throw orderNotFound();
    if (order.paymentStatus === PaymentStatus.paid) return;
    if (order.paymentStatus !== PaymentStatus.pending || (order.expiresAt && order.expiresAt <= this.clock.now())) throw new ConflictException({ code: "CHECKOUT_NOT_PAYABLE", message: "Checkout is no longer payable" });
    if (order.type === OrderType.ticket) {
      const byType = new Map<string, number>();
      for (const ticket of order.tickets) byType.set(ticket.ticketTypeId, (byType.get(ticket.ticketTypeId) ?? 0) + 1);
      for (const [ticketTypeId, quantity] of byType) {
        await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${ticketTypeId}`}, 0))`;
        const ticketType = await transaction.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId }, select: { isInternal: true } });
        if (!ticketType.isInternal) await transaction.ticketType.update({ where: { id: ticketTypeId }, data: { quantitySold: { increment: quantity } } });
      }
      await transaction.ticket.updateMany({ where: { orderId, status: TicketStatus.pending_payment }, data: { status: TicketStatus.active, paidAt: this.clock.now(), activatedAt: this.clock.now() } });
      await transaction.ticketReservation.updateMany({ where: { orderId, status: TicketReservationStatus.active }, data: { status: TicketReservationStatus.consumed } });
      await transaction.seatAllocation.updateMany({ where: { orderId, status: SeatAllocationStatus.active }, data: { status: SeatAllocationStatus.consumed, consumedAt: this.clock.now() } });
    }
    if (order.booking?.tableHold) {
      await this.tables.confirmInTransaction(transaction, order.booking.tableId, order.booking.tableHold.token, orderId, order.buyerUserId);
      await transaction.ticket.updateMany({ where: { orderId, status: TicketStatus.pending_payment }, data: { status: TicketStatus.active, paidAt: this.clock.now(), activatedAt: this.clock.now() } });
      await transaction.seatAllocation.updateMany({ where: { orderId, status: SeatAllocationStatus.active }, data: { status: SeatAllocationStatus.consumed, consumedAt: this.clock.now() } });
    }
    await transaction.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.paid } });
    await transaction.deposit.updateMany({ where: { orderId }, data: { status: PaymentStatus.paid, paidAt: this.clock.now() } });
    await this.domainEvents.append(transaction, { eventType: "checkout.paid", aggregateType: "order", aggregateId: orderId, payload: { paymentMode: snapshot(order.checkoutSnapshot).paymentMode } });
    if (order.emailDeliveryAddress) await this.domainEvents.append(transaction, { eventType: "ticket.email_requested", aggregateType: "order", aggregateId: orderId, payload: {} });
  }

  async handlePaymentWebhook(webhook: NormalizedPaymentWebhook): Promise<{ accepted: true; duplicate: boolean; reviewRequired: boolean }> {
    try {
      return await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`webhook:${webhook.provider}:${webhook.eventId}`}, 0))`;
      const existing = await transaction.webhookEvent.findUnique({ where: { provider_providerEventId: { provider: webhook.provider, providerEventId: webhook.eventId } } });
      if (existing) {
        if (existing.payloadHash !== webhook.payloadHash) throw new ConflictException({ code: "PAYMENT_EVENT_CONFLICT", message: "Webhook event payload conflicts with an earlier event" });
        if (existing.status !== "processing") return { accepted: true as const, duplicate: true, reviewRequired: existing.status === "ignored" };
      }
      const claim = existing ?? await transaction.webhookEvent.create({ data: { provider: webhook.provider, providerEventId: webhook.eventId, eventType: webhook.eventType, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { metadata: webhook.metadata as Prisma.InputJsonObject } : {}) } });
      const payment = await transaction.payment.findFirst({ where: { provider: webhook.provider, providerPaymentId: webhook.providerPaymentId }, include: { order: { include: { booking: { include: { tableHold: true } } } } } });
      if (!payment) throw new NotFoundException({ code: "PAYMENT_NOT_FOUND", message: "Payment attempt was not found" });
      if (webhook.orderId && webhook.orderId !== payment.orderId) throw new ConflictException({ code: "PAYMENT_ORDER_MISMATCH", message: "Payment does not belong to this order" });
      if (payment.amount !== webhook.amount || payment.currency.trim().toUpperCase() !== webhook.currency.trim().toUpperCase()) throw new ConflictException({ code: "PAYMENT_AMOUNT_MISMATCH", message: "Payment amount or currency does not match" });
      await transaction.webhookEvent.update({ where: { id: claim.id }, data: { paymentId: payment.id, orderId: payment.orderId } });
      await lockOrder(transaction, payment.orderId);
      const order = await transaction.order.findUnique({ where: { id: payment.orderId }, include: { booking: { include: { tableHold: true } } } });
      if (!order) throw orderNotFound();
      if (webhook.eventType === "payment.succeeded") {
        if (order.paymentStatus === PaymentStatus.paid) {
          await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.paid, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { rawWebhook: webhook.metadata as Prisma.InputJsonObject } : {}), webhookReceivedAt: this.clock.now() } });
          await transaction.webhookEvent.update({ where: { id: claim.id }, data: { status: "processed", processedAt: this.clock.now() } });
          return { accepted: true as const, duplicate: false, reviewRequired: false };
        }
        let reviewRequired = false;
        const eligible = order.paymentStatus === PaymentStatus.pending && (!order.expiresAt || order.expiresAt > this.clock.now()) && (!order.booking || (order.booking.status === BookingStatus.pending && order.booking.tableHold?.status === TableHoldStatus.active));
        if (eligible) {
          await this.settleSucceededInTransaction(transaction, order.id);
          await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.paid, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { rawWebhook: webhook.metadata as Prisma.InputJsonObject } : {}), webhookReceivedAt: this.clock.now() } });
          await this.domainEvents.append(transaction, { eventType: "payment.succeeded", aggregateType: "payment", aggregateId: payment.id, payload: { orderId: order.id, provider: webhook.provider, eventId: webhook.eventId } });
          await transaction.auditLog.create({ data: { actorId: order.buyerUserId, action: "payment.succeeded", entityType: "payment", entityId: payment.id, meta: { orderId: order.id, eventId: webhook.eventId } } });
        } else {
          reviewRequired = true;
          if (order.paymentStatus === PaymentStatus.pending && order.expiresAt && order.expiresAt <= this.clock.now()) {
            await this.failOrderInTransaction(transaction, order.id, "expired");
          }
          await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.paid, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { rawWebhook: webhook.metadata as Prisma.InputJsonObject } : {}), webhookReceivedAt: this.clock.now() } });
          const review = await transaction.outboxEvent.findFirst({ where: { eventType: "payment.review_required", aggregateId: order.id } });
          if (!review) {
            await this.domainEvents.append(transaction, { eventType: "payment.review_required", aggregateType: "order", aggregateId: order.id, payload: { provider: webhook.provider, providerPaymentId: webhook.providerPaymentId, reason: "late_or_released_order" } });
            await transaction.auditLog.create({ data: { actorId: order.buyerUserId, action: "payment.review_required", entityType: "order", entityId: order.id, meta: { provider: webhook.provider, eventId: webhook.eventId } } });
          }
        }
        await transaction.webhookEvent.update({ where: { id: claim.id }, data: { status: reviewRequired ? "ignored" : "processed", processedAt: this.clock.now() } });
        return { accepted: true as const, duplicate: false, reviewRequired };
      }
      if (order.paymentStatus !== PaymentStatus.paid && order.paymentStatus === PaymentStatus.pending) await this.failOrderInTransaction(transaction, order.id, webhook.eventType === "payment.expired" ? "expired" : "failed");
      const latestOrder = await transaction.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } });
      if (latestOrder?.paymentStatus === PaymentStatus.paid) {
        await transaction.webhookEvent.update({ where: { id: claim.id }, data: { status: "ignored", processedAt: this.clock.now() } });
        return { accepted: true as const, duplicate: false, reviewRequired: false };
      }
      await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.failed, payloadHash: webhook.payloadHash, ...(webhook.metadata ? { rawWebhook: webhook.metadata as Prisma.InputJsonObject } : {}), webhookReceivedAt: this.clock.now() } });
      await this.domainEvents.append(transaction, { eventType: "payment.failed", aggregateType: "payment", aggregateId: payment.id, payload: { orderId: order.id, provider: webhook.provider, eventId: webhook.eventId } });
      await transaction.auditLog.create({ data: { actorId: order.buyerUserId, action: "payment.failed", entityType: "payment", entityId: payment.id, meta: { orderId: order.id, eventId: webhook.eventId } } });
      await transaction.webhookEvent.update({ where: { id: claim.id }, data: { status: "processed", processedAt: this.clock.now() } });
      return { accepted: true as const, duplicate: false, reviewRequired: false };
      }, { timeout: 15_000 });
    } catch (error) {
      if (isUniqueError(error)) {
        const existing = await this.database.webhookEvent.findUnique({ where: { provider_providerEventId: { provider: webhook.provider, providerEventId: webhook.eventId } } });
        if (existing?.payloadHash === webhook.payloadHash && existing.status !== "processing") return { accepted: true, duplicate: true, reviewRequired: existing.status === "ignored" };
      }
      throw error;
    }
  }

  async expireDueCheckouts(limit: number): Promise<number> {
    const due = await this.database.order.findMany({
      where: { paymentStatus: PaymentStatus.pending, expiresAt: { lte: this.clock.now() } },
      select: { id: true },
      orderBy: { expiresAt: "asc" },
      take: Math.max(1, Math.min(limit, 500)),
    });
    for (const order of due) await this.settleFailed(order.id, "expired");
    return due.length;
  }

  async ticketCancellationTerms(userId: string, id: string): Promise<CancellationTermsResponse> {
    const ticket = await this.database.ticket.findFirst({ where: { id, order: { buyerUserId: userId } }, include: { order: true } });
    if (!ticket) throw resourceNotFound("TICKET_NOT_FOUND");
    if (snapshot(ticket.order.checkoutSnapshot).itemKind === "cart") throw new ConflictException({ code: "CART_CANCELLATION_REQUIRES_ORDER_REFUND", message: "For a combined purchase, contact the organizer to refund the whole order" });
    await this.expireIfDue(ticket.order);
    return cancellationTerms(id, ticket.status, ticket.order);
  }

  async bookingCancellationTerms(userId: string, id: string): Promise<CancellationTermsResponse> {
    const booking = await this.database.booking.findFirst({ where: { id, order: { buyerUserId: userId } }, include: { order: true } });
    if (!booking) throw resourceNotFound("BOOKING_NOT_FOUND");
    if (snapshot(booking.order.checkoutSnapshot).itemKind === "cart") throw new ConflictException({ code: "CART_CANCELLATION_REQUIRES_ORDER_REFUND", message: "For a combined purchase, contact the organizer to refund the whole order" });
    await this.expireIfDue(booking.order);
    return cancellationTerms(id, booking.status, booking.order);
  }

  async cancelTicket(userId: string, id: string, rawKey: string | undefined): Promise<CancellationResponse> {
    const key = idempotencyKey(rawKey);
    const prior = await this.replayedCancellation(userId, TICKET_CANCEL, key);
    if (prior) return prior;
    try {
      return await this.database.$transaction(async (transaction) => {
        const replay = await claimCancellation(transaction, userId, TICKET_CANCEL, key);
        if (replay) return replay;
        const current = await transaction.ticket.findFirst({ where: { id, order: { buyerUserId: userId } }, include: { order: true, seatAllocation: true } });
        if (!current) throw resourceNotFound("TICKET_NOT_FOUND");
        if (snapshot(current.order.checkoutSnapshot).itemKind === "cart") throw new ConflictException({ code: "CART_CANCELLATION_REQUIRES_ORDER_REFUND", message: "For a combined purchase, contact the organizer to refund the whole order" });
        if (current.seatAllocation) throw new ConflictException({ code: "TABLE_CHILD_TICKET_CANCEL", message: "Cancel the whole table booking instead of an individual table seat" });
        await lockOrder(transaction, current.orderId);
        if (current.status === TicketStatus.used || current.status === TicketStatus.refunded) {
          throw cancellationNotAllowed("TICKET_CANCELLATION_NOT_ALLOWED");
        }
        const refundPending = current.order.paymentStatus === PaymentStatus.paid;
        if (current.status !== TicketStatus.cancelled) {
          const sold = current.status === TicketStatus.paid || current.status === TicketStatus.active;
          await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ticket-type:${current.ticketTypeId}`}, 0))`;
          await transaction.ticket.update({ where: { id }, data: { status: TicketStatus.cancelled, cancelledAt: this.clock.now() } });
          if (sold) await transaction.ticketType.update({ where: { id: current.ticketTypeId }, data: { quantitySold: { decrement: 1 } } });
          if (current.order.paymentStatus === PaymentStatus.pending) {
            const reservation = await transaction.ticketReservation.findFirst({ where: { orderId: current.orderId, status: TicketReservationStatus.active } });
            if (reservation) {
              await transaction.ticketReservation.update({ where: { id: reservation.id }, data: reservation.quantity > 1 ? { quantity: { decrement: 1 } } : { status: TicketReservationStatus.released } });
            }
            const remaining = await transaction.ticket.count({ where: { orderId: current.orderId, status: { not: TicketStatus.cancelled } } });
            if (remaining === 0) {
              await transaction.order.update({ where: { id: current.orderId }, data: { paymentStatus: PaymentStatus.cancelled } });
              await transaction.deposit.updateMany({ where: { orderId: current.orderId }, data: { status: PaymentStatus.cancelled } });
            }
          }
          await this.recordCancellation(transaction, userId, "ticket", id, refundPending, current.orderId);
        }
        const response = { resourceId: id, cancelled: true as const, refundPending };
        await saveResponse(transaction, userId, TICKET_CANCEL, key, id, response);
        return response;
      });
    } catch (error) {
      return this.resolveCancellationRace(error, userId, TICKET_CANCEL, key);
    }
  }

  async cancelBooking(userId: string, id: string, rawKey: string | undefined): Promise<CancellationResponse> {
    const key = idempotencyKey(rawKey);
    const prior = await this.replayedCancellation(userId, BOOKING_CANCEL, key);
    if (prior) return prior;
    try {
      return await this.database.$transaction(async (transaction) => {
        const replay = await claimCancellation(transaction, userId, BOOKING_CANCEL, key);
        if (replay) return replay;
        const booking = await transaction.booking.findFirst({ where: { id, order: { buyerUserId: userId } }, include: { order: { include: { tickets: true } }, tableHold: true } });
        if (!booking) throw resourceNotFound("BOOKING_NOT_FOUND");
        if (snapshot(booking.order.checkoutSnapshot).itemKind === "cart") throw new ConflictException({ code: "CART_CANCELLATION_REQUIRES_ORDER_REFUND", message: "For a combined purchase, contact the organizer to refund the whole order" });
        await lockOrder(transaction, booking.orderId);
        await lockTable(transaction, booking.tableId);
        if (booking.status === BookingStatus.expired) throw cancellationNotAllowed("BOOKING_CANCELLATION_NOT_ALLOWED");
        const refundPending = booking.order.paymentStatus === PaymentStatus.paid;
        if (booking.status !== BookingStatus.cancelled) {
          await transaction.booking.update({ where: { id }, data: { status: BookingStatus.cancelled } });
          if (booking.tableHold?.status === TableHoldStatus.active) {
            await transaction.tableHold.update({ where: { id: booking.tableHold.id }, data: { status: TableHoldStatus.released } });
          }
          await transaction.table.updateMany({
            where: { id: booking.tableId, status: { in: [TableStatus.held, TableStatus.booked] } },
            data: { status: TableStatus.available, holdToken: null, holdRequestKey: null, holdExpiresAt: null },
          });
          await transaction.seatAllocation.updateMany({ where: { orderId: booking.orderId, status: { in: [SeatAllocationStatus.active, SeatAllocationStatus.consumed] } }, data: { status: SeatAllocationStatus.released, releasedAt: this.clock.now() } });
          await transaction.ticket.updateMany({ where: { orderId: booking.orderId, status: { in: [TicketStatus.pending_payment, TicketStatus.paid, TicketStatus.active] } }, data: { status: TicketStatus.cancelled, cancelledAt: this.clock.now() } });
          await transaction.groupPass.updateMany({ where: { orderId: booking.orderId, status: "active" }, data: { status: "cancelled" } });
          if (booking.order.paymentStatus === PaymentStatus.pending) {
            await transaction.order.update({ where: { id: booking.orderId }, data: { paymentStatus: PaymentStatus.cancelled } });
            await transaction.deposit.updateMany({ where: { orderId: booking.orderId }, data: { status: PaymentStatus.cancelled } });
          }
          await this.recordCancellation(transaction, userId, "booking", id, refundPending, booking.orderId);
        }
        const response = { resourceId: id, cancelled: true as const, refundPending };
        await saveResponse(transaction, userId, BOOKING_CANCEL, key, id, response);
        return response;
      }, { timeout: 15_000 });
    } catch (error) {
      return this.resolveCancellationRace(error, userId, BOOKING_CANCEL, key);
    }
  }

  async failOrderInTransaction(transaction: Prisma.TransactionClient, orderId: string, reason: "failed" | "expired" | "released"): Promise<void> {
    await lockOrder(transaction, orderId);
    const order = await transaction.order.findUnique({ where: { id: orderId }, include: { booking: { include: { tableHold: true } } } });
    if (!order || order.paymentStatus !== PaymentStatus.pending) return;
    await transaction.ticketReservation.updateMany({ where: { orderId, status: TicketReservationStatus.active }, data: { status: TicketReservationStatus.released } });
    await transaction.seatAllocation.updateMany({ where: { orderId, status: SeatAllocationStatus.active }, data: { status: SeatAllocationStatus.released, releasedAt: this.clock.now() } });
    await transaction.ticket.updateMany({ where: { orderId, status: TicketStatus.pending_payment }, data: { status: TicketStatus.cancelled, cancelledAt: this.clock.now() } });
    await transaction.groupPass.updateMany({ where: { orderId, status: "active" }, data: { status: "cancelled" } });
    if (order.booking?.tableHold?.status === TableHoldStatus.active) {
      await lockTable(transaction, order.booking.tableId);
      await transaction.booking.update({ where: { id: order.booking.id }, data: { status: reason === "released" ? BookingStatus.cancelled : BookingStatus.expired } });
      await transaction.tableHold.update({ where: { id: order.booking.tableHold.id }, data: { status: reason === "released" ? TableHoldStatus.released : TableHoldStatus.expired } });
      await transaction.table.updateMany({
        where: { id: order.booking.tableId, holdToken: order.booking.tableHold.token, status: TableStatus.held },
        data: { status: TableStatus.available, holdToken: null, holdRequestKey: null, holdExpiresAt: null },
      });
    }
    const paymentStatus = reason === "failed" ? PaymentStatus.failed : PaymentStatus.cancelled;
    await transaction.order.update({ where: { id: orderId }, data: { paymentStatus } });
    await transaction.deposit.updateMany({ where: { orderId }, data: { status: paymentStatus } });
    await this.domainEvents.append(transaction, {
      eventType: `checkout.${reason}`,
      aggregateType: "order",
      aggregateId: orderId,
      payload: { reason },
    });
  }

  private async recordCancellation(transaction: Prisma.TransactionClient, userId: string, kind: "ticket" | "booking", id: string, refundPending: boolean, orderId: string): Promise<void> {
    await this.domainEvents.append(transaction, {
      eventType: `${kind}.cancelled`,
      aggregateType: kind,
      aggregateId: id,
      payload: { userId, orderId, refundPending },
    });
    if (refundPending) {
      await this.domainEvents.append(transaction, {
        eventType: "refund.requested",
        aggregateType: "order",
        aggregateId: orderId,
        payload: { resourceType: kind, resourceId: id },
      });
    }
    await transaction.auditLog.create({
      data: { actorId: userId, action: `${kind}.cancelled`, entityType: kind, entityId: id, meta: { orderId, refundPending } },
    });
  }

  private async expireIfDue(order: { id: string; paymentStatus: PaymentStatus; expiresAt: Date | null }): Promise<void> {
    if (order.paymentStatus === PaymentStatus.pending && order.expiresAt && order.expiresAt <= this.clock.now()) {
      await this.settleFailed(order.id, "expired");
    }
  }

  private async resolveEmail(transaction: Prisma.TransactionClient, userId: string, choice: CheckoutEmailChoice | undefined, sessionFamilyId?: string, anonymous?: AnonymousCheckoutContext): Promise<string | null> {
    if (!choice) return null;
    if (!this.checkoutEmail) throw new ConflictException({ code: "CHECKOUT_EMAIL_UNAVAILABLE" });
    return this.checkoutEmail.resolve(transaction, userId, choice, sessionFamilyId, anonymous ? { id: anonymous.sessionId, verifiedEmail: anonymous.verifiedEmail } : undefined);
  }

  private async replayed(userId: string, operation: string, key: string, fingerprint: string, requestedEmail: boolean): Promise<CheckoutResponse | null> {
    const row = await this.database.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
    if (row && (row.requestHash ? row.requestHash !== fingerprint : requestedEmail)) throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
    return row?.response ? checkoutResponse(row.response) : null;
  }

  private async replayedCancellation(userId: string, operation: string, key: string): Promise<CancellationResponse | null> {
    const row = await this.database.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
    return row?.response ? cancellationResponse(row.response) : null;
  }

  private async resolveRace(error: unknown, userId: string, operation: string, key: string, fingerprint: string, requestedEmail: boolean): Promise<CheckoutResponse> {
    if (isUniqueError(error)) {
      const prior = await this.replayed(userId, operation, key, fingerprint, requestedEmail);
      if (prior) {
        if (prior.paymentLink) return prior;
        const linked = await this.paymentLinks.createLink(userId, prior.orderId, `checkout-${key}`);
        const response = { ...prior, paymentLink: linked.paymentLink };
        await this.database.idempotencyRecord.update({ where: { userId_operation_key: { userId, operation, key } }, data: { response: json(response) } });
        return response;
      }
    }
    throw error;
  }

  private async resolveCancellationRace(error: unknown, userId: string, operation: string, key: string): Promise<CancellationResponse> {
    if (isUniqueError(error)) {
      const prior = await this.replayedCancellation(userId, operation, key);
      if (prior) return prior;
    }
    throw error;
  }
}

const holdOrderSelect = {
  id: true, paymentStatus: true, expiresAt: true,
  payments: { select: { status: true } },
  booking: { select: { status: true, table: { select: { number: true, name: true, venueLayout: { select: { eventId: true } } } }, tableHold: { select: { status: true, expiresAt: true } } } },
  tickets: { select: { ticketType: { select: { eventId: true } } } },
  reservations: { select: { status: true, expiresAt: true, quantity: true, ticketType: { select: { eventId: true, name: true } } } },
  seatAllocations: { select: { status: true, seat: { select: { label: true, venueLayout: { select: { eventId: true } } } } } },
} satisfies Prisma.OrderSelect;

type HoldOrder = Prisma.OrderGetPayload<{ select: typeof holdOrderSelect }>;

async function ownedHoldOrder(database: Pick<Prisma.TransactionClient, "event" | "order">, organizerId: string, eventId: string, orderId: string): Promise<HoldOrder> {
  const event = await database.event.findFirst({ where: { id: eventId, organizerId }, select: { id: true } });
  if (!event) throw orderNotFound();
  const order = await database.order.findUnique({ where: { id: orderId }, select: holdOrderSelect });
  if (!order) throw orderNotFound();
  const memberships = [
    ...order.tickets.map((ticket) => ticket.ticketType.eventId),
    ...order.reservations.map((reservation) => reservation.ticketType.eventId),
    ...order.seatAllocations.map((allocation) => allocation.seat.venueLayout.eventId),
    ...(order.booking ? [order.booking.table.venueLayout.eventId] : []),
  ];
  if (!memberships.length || memberships.some((id) => id !== eventId)) throw orderNotFound();
  return order;
}

function presentHoldPreview(order: HoldOrder, now: Date): ManagementHoldPreview {
  const resourceLabels = [
    ...(order.booking ? [`Стол ${order.booking.table.number}${order.booking.table.name ? ` · ${order.booking.table.name}` : ""}`] : []),
    ...order.reservations.filter((reservation) => reservation.status === TicketReservationStatus.active).map((reservation) => `${reservation.ticketType.name} · ${reservation.quantity} мест`),
    ...order.seatAllocations.filter((allocation) => allocation.status === SeatAllocationStatus.active).map((allocation) => allocation.seat.label),
  ];
  const expiries = [order.expiresAt, order.booking?.tableHold?.expiresAt, ...order.reservations.filter((reservation) => reservation.status === TicketReservationStatus.active).map((reservation) => reservation.expiresAt)].filter((value): value is Date => value instanceof Date);
  const expiresAt = expiries.length ? new Date(Math.min(...expiries.map((value) => value.getTime()))).toISOString() : null;
  const hasActiveHold = Boolean(order.booking?.tableHold?.status === TableHoldStatus.active || order.reservations.some((reservation) => reservation.status === TicketReservationStatus.active) || order.seatAllocations.some((allocation) => allocation.status === SeatAllocationStatus.active));
  const reason: ManagementHoldPreview["reason"] = order.payments.some((payment) => payment.status === PaymentStatus.paid) ? "payment_received"
    : order.paymentStatus !== PaymentStatus.pending ? order.paymentStatus === PaymentStatus.cancelled ? "released" : "not_pending"
    : expiresAt && new Date(expiresAt) <= now ? "expired"
    : hasActiveHold ? "active" : "no_active_hold";
  return { orderId: order.id, eligible: reason === "active", reason, expiresAt, resourceLabels };
}

function paymentAmounts(
  event: { paymentMode: EventPaymentMode; showFullAmountForDeposit: boolean; depositTerms: string | null },
  unitFullAmount: number,
  unitDeposit: number,
  quantity: number,
): { amountDue: number; fullAmount: number | null } {
  const full = unitFullAmount * quantity;
  if (event.paymentMode === EventPaymentMode.full_payment) return { amountDue: full, fullAmount: full };
  if (unitDeposit <= 0) throw new ConflictException({ code: "DEPOSIT_AMOUNT_REQUIRED", message: "This item has no valid deposit amount" });
  requiredDepositTerms(event.depositTerms);
  return { amountDue: unitDeposit * quantity, fullAmount: event.showFullAmountForDeposit ? full : null };
}

function requiredDepositTerms(value: string | null): string {
  if (!value?.trim()) throw new ConflictException({ code: "DEPOSIT_TERMS_REQUIRED", message: "Deposit terms are not configured" });
  return value;
}

async function claim(transaction: Prisma.TransactionClient, userId: string, operation: string, key: string, fingerprint: string, requestedEmail: boolean): Promise<CheckoutResponse | null> {
  const prior = await transaction.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
  if (prior && (prior.requestHash ? prior.requestHash !== fingerprint : requestedEmail)) throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
  if (prior?.response) return checkoutResponse(prior.response);
  if (prior) throw new ConflictException({ code: "IDEMPOTENCY_IN_PROGRESS", message: "An identical request is still processing" });
  await transaction.idempotencyRecord.create({ data: { userId, operation, key, requestHash: fingerprint } });
  return null;
}

function checkoutFingerprint(input: CreateCartCheckoutRequest | CreateSeatCheckoutRequest | CreateTableCheckoutRequest | CreateTicketCheckoutRequest): string {
  const emailDelivery = input.emailDelivery ? { address: normalizeContact("email", input.emailDelivery.address) } : null;
  return createHash("sha256").update(JSON.stringify({ ...input, emailDelivery })).digest("hex");
}

async function claimCancellation(transaction: Prisma.TransactionClient, userId: string, operation: string, key: string): Promise<CancellationResponse | null> {
  const prior = await transaction.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
  if (prior?.response) return cancellationResponse(prior.response);
  if (prior) throw new ConflictException({ code: "IDEMPOTENCY_IN_PROGRESS", message: "An identical request is still processing" });
  await transaction.idempotencyRecord.create({ data: { userId, operation, key } });
  return null;
}

async function saveResponse(transaction: Prisma.TransactionClient, userId: string, operation: string, key: string, resourceId: string, response: CheckoutResponse | CancellationResponse): Promise<void> {
  await transaction.idempotencyRecord.update({
    where: { userId_operation_key: { userId, operation, key } },
    data: { resourceId, response: json(response) },
  });
}

function cancellationTerms(resourceId: string, status: string, order: { amount: number; currency: string; paymentStatus: PaymentStatus; checkoutSnapshot: Prisma.JsonValue }): CancellationTermsResponse {
  const data = snapshot(order.checkoutSnapshot);
  return {
    resourceId,
    status,
    cancellationTerms: data.cancellationTerms,
    paymentMode: data.paymentMode,
    amountPaid: order.paymentStatus === PaymentStatus.paid ? order.amount : 0,
    currency: order.currency.trim(),
  };
}

function snapshot(value: Prisma.JsonValue): CheckoutSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConflictException({ code: "CHECKOUT_SNAPSHOT_INVALID", message: "Checkout snapshot is unavailable" });
  return value as unknown as CheckoutSnapshot;
}

function checkoutResponse(value: Prisma.JsonValue): CheckoutResponse { return value as unknown as CheckoutResponse; }
function cancellationResponse(value: Prisma.JsonValue): CancellationResponse { return value as unknown as CancellationResponse; }
function json(value: object): Prisma.InputJsonObject { return value as unknown as Prisma.InputJsonObject; }
function isUniqueError(error: unknown): boolean { return (error as { code?: string }).code === "P2002"; }

function idempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new BadRequestException({ code: "IDEMPOTENCY_KEY_INVALID", message: "Idempotency-Key must contain 8-128 safe characters" });
  }
  return key;
}

async function lockOrder(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order:${id}`}, 0))`;
}

async function lockSeat(transaction: Prisma.TransactionClient, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`seat:${id}`}, 0))`;
}

type SeatRow = { id: string; number: number; label: string; sortOrder: number };

/** Materialises legacy table capacity into relational seats once, preserving old tables as whole-table inventory. */
async function ensureWholeTableSeats(
  transaction: Prisma.TransactionClient,
  tableId: string,
  venueLayoutId: string,
  capacity: number,
  existing: SeatRow[],
): Promise<SeatRow[]> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new ConflictException({ code: "TABLE_SEAT_COUNT_INVALID", message: "This table has no configured seats" });
  }
  const seats = [...existing].sort((a, b) => a.sortOrder - b.sortOrder);
  if (seats.length >= capacity) return seats.slice(0, capacity);
  const created: SeatRow[] = [];
  for (let index = seats.length; index < capacity; index += 1) {
    created.push(await transaction.seat.create({
      data: {
        venueLayoutId,
        tableId,
        number: index + 1,
        label: String(index + 1),
        sortOrder: index,
      },
      select: { id: true, number: true, label: true, sortOrder: true },
    }));
  }
  return [...seats, ...created];
}

/** Internal admission type keeps individual table tickets in the common ticket system without public sale. */
async function ensureAdmissionTicketType(
  transaction: Prisma.TransactionClient,
  eventId: string,
  tableId: string,
  currency: string,
): Promise<{ id: string }> {
  const name = `__table_admission:${tableId}`;
  const existing = await transaction.ticketType.findFirst({ where: { eventId, name, isInternal: true }, select: { id: true } });
  if (existing) return existing;
  try {
    return await transaction.ticketType.create({
      data: {
        eventId,
        name,
        price: 0,
        deposit: 0,
        currency,
        quantityTotal: 1_000_000_000,
        status: TicketTypeStatus.active,
        isInternal: true,
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    const raced = await transaction.ticketType.findFirst({ where: { eventId, name, isInternal: true }, select: { id: true } });
    if (raced) return raced;
    throw error;
  }
}

function orderNotFound(): NotFoundException { return resourceNotFound("ORDER_NOT_FOUND"); }
function resourceNotFound(code: string): NotFoundException { return new NotFoundException({ code, message: "Resource was not found" }); }
function cancellationNotAllowed(code: string): ConflictException { return new ConflictException({ code, message: "Cancellation is not allowed in the current state" }); }
