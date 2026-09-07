import type { Event } from "@event-platform/database";
import type { OrganizerEvent } from "@event-platform/shared-types";

export function presentEvent(event: Event): OrganizerEvent {
  return {
    id: event.id,
    organizerId: event.organizerId,
    title: event.title,
    category: event.category,
    city: event.city,
    posterUrl: event.posterUrl,
    announcement: event.announcement,
    description: event.description,
    program: event.program,
    rules: event.rules,
    visitTerms: event.visitTerms,
    cancellationTerms: event.cancellationTerms,
    paymentMode: event.paymentMode,
    showFullAmountForDeposit: event.showFullAmountForDeposit,
    depositTerms: event.depositTerms,
    extraConditions: event.extraConditions,
    date: formatDate(event.date),
    time: formatTime(event.time),
    timezone: event.timezone,
    venueName: event.venueName,
    address: event.address,
    status: event.status,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function formatDate(value: Date): string {
  const year = value.getUTCFullYear().toString().padStart(4, "0");
  const month = (value.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = value.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: Date): string {
  const hour = value.getUTCHours().toString().padStart(2, "0");
  const minute = value.getUTCMinutes().toString().padStart(2, "0");
  return `${hour}:${minute}`;
}
