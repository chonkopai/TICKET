import type { TicketType } from "@event-platform/database";
import type { OrganizerTicketType, TicketTypeCounters } from "@event-platform/shared-types";

export function presentTicketType(
  ticketType: TicketType,
  counters: TicketTypeCounters,
): OrganizerTicketType {
  return {
    id: ticketType.id,
    eventId: ticketType.eventId,
    name: ticketType.name,
    price: ticketType.price,
    deposit: ticketType.deposit,
    currency: ticketType.currency.trim(),
    quantityTotal: ticketType.quantityTotal,
    description: ticketType.description,
    salesStartAt: ticketType.salesStartAt?.toISOString() ?? null,
    salesEndAt: ticketType.salesEndAt?.toISOString() ?? null,
    restrictions: ticketType.restrictions,
    status: ticketType.status,
    counters,
    createdAt: ticketType.createdAt.toISOString(),
    updatedAt: ticketType.updatedAt.toISOString(),
  };
}
