import { hasEventEnded } from "@event-platform/shared-types";
import { ConflictException } from "@nestjs/common";
import { guestEventTiming } from "../tickets/guest-ticket-details.js";

export function assertEventRegistrationOpen(event: Parameters<typeof guestEventTiming>[0], now: Date): void {
  if (hasEventEnded(guestEventTiming(event), now)) {
    throw new ConflictException({ code: "EVENT_ENDED", message: "This event has ended. Registration and ticket sales are closed." });
  }
}
