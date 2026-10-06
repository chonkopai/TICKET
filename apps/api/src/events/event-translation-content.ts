import { createHash } from "node:crypto";
import type { Event } from "@event-platform/database";
import type { EventLocalizedContent } from "@event-platform/shared-types";

export const TRANSLATABLE_EVENT_FIELDS = [
  "title", "address", "description", "program",
  "rules", "visitTerms", "cancellationTerms", "depositTerms", "extraConditions",
] as const satisfies readonly (keyof EventLocalizedContent)[];

export function eventContent(event: Event): EventLocalizedContent {
  return Object.fromEntries(TRANSLATABLE_EVENT_FIELDS.map((field) => [field, event[field]])) as unknown as EventLocalizedContent;
}

export function eventContentHash(content: EventLocalizedContent): string {
  return createHash("sha256")
    .update(JSON.stringify(TRANSLATABLE_EVENT_FIELDS.map((field) => content[field])))
    .digest("hex");
}
