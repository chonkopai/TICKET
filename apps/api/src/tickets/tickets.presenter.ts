import { readCheckoutSnapshot } from "@event-platform/shared-types";
import type { Prisma } from "@event-platform/database";
import type { GuestTicket, OrganizerTicket } from "@event-platform/shared-types";

export const ticketContextInclude = {
  ticketType: { include: { event: true } },
  order: { include: { groupPass: true } },
  seatAllocation: { include: { seat: { include: { table: true, row: true } } } },
} satisfies Prisma.TicketInclude;

export type TicketWithContext = Prisma.TicketGetPayload<{ include: typeof ticketContextInclude }>;

export function presentTicket(ticket: TicketWithContext): OrganizerTicket {
  return {
    id: ticket.id,
    ticketTypeId: ticket.ticketTypeId,
    eventId: ticket.ticketType.eventId,
    ticketTypeName: acceptedTicketName(ticket),
    eventTitle: readCheckoutSnapshot(ticket.order?.checkoutSnapshot).eventTitle??ticket.ticketType.event.title,
    seatLabel: ticket.seatLabelSnapshot ?? ticket.seatAllocation?.seat.label ?? null,
    status: ticket.status,
    usedAt: ticket.usedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export function presentGuestTicket(ticket: TicketWithContext): GuestTicket {
  return {
    id: ticket.id,
    eventId: ticket.ticketType.eventId,
    eventTitle: readCheckoutSnapshot(ticket.order?.checkoutSnapshot).eventTitle??ticket.ticketType.event.title,
    seatLabel: ticket.seatLabelSnapshot ?? ticket.seatAllocation?.seat.label ?? null,
    ticketTypeName: acceptedTicketName(ticket),
    status: ticket.status,
    usedAt: ticket.usedAt?.toISOString() ?? null,
    qrPath: `/me/tickets/${ticket.id}/qr`,
    walletPath: `/me/tickets/${ticket.id}/wallet`,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export function acceptedTicketName(ticket:TicketWithContext){const saved=readCheckoutSnapshot(ticket.order?.checkoutSnapshot),item=saved.items?.find(item=>item.id===ticket.ticketTypeId||item.id===ticket.seatAllocation?.seatId||item.id===ticket.seatAllocation?.seat.tableId);return item?.name??ticket.seatAllocation?.seat.table?.typeLabel??ticket.seatAllocation?.seat.row?.typeLabel??ticket.ticketType.name;}
