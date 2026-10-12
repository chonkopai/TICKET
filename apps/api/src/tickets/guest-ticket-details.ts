import { zonedInputToIso, type GuestOrganizerContact } from "@event-platform/shared-types";

export const guestEventTimingSelect = { startsAt: true, endsAt: true, date: true, time: true, timezone: true } as const;

export function guestEventTiming(event: { startsAt?: Date | null; endsAt?: Date | null; date: Date; time: Date; timezone: string }) {
  return {
    startsAt: event.startsAt?.toISOString() ?? zonedInputToIso(`${event.date.toISOString().slice(0, 10)}T${event.time.toISOString().slice(11, 16)}`, event.timezone),
    endsAt: event.endsAt?.toISOString() ?? null,
  };
}

export const guestOrganizerSelect = {
  name: true, phone: true, email: true,
  organizerProfile: { select: { organizationName: true, address: true, showContactInfo: true } },
} as const;

export function guestOrganizerContact(organizer: {
  name: string | null; phone: string | null; email: string | null;
  organizerProfile: { organizationName: string | null; address: string | null; showContactInfo: boolean } | null;
}): GuestOrganizerContact {
  const profile = organizer.organizerProfile;
  return {
    name: profile?.organizationName ?? organizer.name,
    phone: profile?.showContactInfo ? organizer.phone : null,
    email: profile?.showContactInfo ? organizer.email : null,
    address: profile?.showContactInfo ? profile.address : null,
  };
}

export function guestOrderChatPath(userId: string, eventId: string, order: { id: string; buyerUserId: string | null; paymentStatus: string } | null): string | null {
  return order?.buyerUserId === userId && ["paid", "refunded", "cancelled"].includes(order.paymentStatus)
    ? `/account/events/${eventId}/orders/${order.id}/chat` : null;
}
