import { hasEventEnded, type EventLocale, type GuestEvent } from "@event-platform/shared-types";
import { GUEST_COPY } from "./guest-copy";
import { TICKET_ACTIONS_COPY } from "./ticket-actions-copy";

type TicketParticipation = Pick<GuestEvent["tickets"][number], "status" | "participationStatus">;
type EventParticipation = Pick<GuestEvent, "eventStatus" | "participationStatus"> & Partial<Pick<GuestEvent, "startsAt" | "endsAt">> & {
  tickets: TicketParticipation[];
  bookings: Array<Pick<GuestEvent["bookings"][number], "status">>;
};

export function guestTicketParticipationLabel(ticket: TicketParticipation, locale: EventLocale, ended = false): string {
  return ticket.status === "cancelled" || ticket.status === "refunded"
    ? TICKET_ACTIONS_COPY[locale].statuses.refunded
    : ticket.participationStatus !== "attended" && ticket.status !== "used" && (ended || ticket.participationStatus === "no_show")
      ? TICKET_ACTIONS_COPY[locale].unavailableStatus : GUEST_COPY[locale].states[ticket.participationStatus];
}

export function guestEventParticipationLabel(event: EventParticipation, locale: EventLocale, ended = hasEventEnded(event)): string {
  if (event.eventStatus === "cancelled") return GUEST_COPY[locale].states.cancelled;
  const allReturned = event.tickets.length > 0
    && event.tickets.every(ticket => ticket.status === "cancelled" || ticket.status === "refunded")
    && !event.bookings.some(booking => booking.status === "pending" || booking.status === "confirmed");
  if (allReturned) return TICKET_ACTIONS_COPY[locale].statuses.refunded;
  const currentTickets = event.tickets.filter(ticket => ticket.status !== "cancelled" && ticket.status !== "refunded");
  if (currentTickets.length) {
    const participation = currentTickets.some(ticket => ticket.participationStatus === "attended") ? "attended"
      : currentTickets.some(ticket => ticket.participationStatus === "no_show") ? "no_show" : "registered";
    if (participation !== "attended" && (ended || participation === "no_show")) return TICKET_ACTIONS_COPY[locale].unavailableStatus;
    return GUEST_COPY[locale].states[participation];
  }
  if (event.bookings.some(booking => booking.status === "pending" || booking.status === "confirmed")) return ended ? TICKET_ACTIONS_COPY[locale].unavailableStatus : GUEST_COPY[locale].states.registered;
  return GUEST_COPY[locale].states[event.participationStatus];
}
