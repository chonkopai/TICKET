import { publishReadyDraftSchema, selectedSaleRows, type EventCreationDraftV2, type PublishValidationContext } from "@event-platform/shared-types";

export const CREATION_SECTIONS = ["media", "information", "schedule", "tickets"] as const;
export type CreationSection = typeof CREATION_SECTIONS[number];

/** Checklist and publish button use the same validation as the API. */
export function creationReadiness(draft: EventCreationDraftV2, context: PublishValidationContext) {
  const result = publishReadyDraftSchema(context).safeParse(draft);
  const complete: Record<CreationSection, boolean> = { media: true, information: true, schedule: true, tickets: true };
  const hasText = (key: "title" | "summary" | "description" | "venueName" | "address" | "refundConditions") => !!draft.content[draft.sourceLocale]?.[key]?.trim() && !draft.metadata[draft.sourceLocale]?.[key]?.stale;
  if (!result.success) for (const issue of result.error.issues) {
    const [root, field] = issue.path;
    if (root === "media") complete.media = false;
    else if (root === "schedule") complete.schedule = false;
    else if (root === "classification") complete[field === "category" || field === "ageRestriction" ? "information" : "schedule"] = false;
    else if (root === "content") {
      if (!(["title", "summary", "description"] as const).every(hasText)) complete.information = false;
      if (!(["venueName", "address"] as const).every(hasText)) complete.schedule = false;
      if (draft.refundsAvailable && draft.selectedMode !== "free" && !hasText("refundConditions")) complete.tickets = false;
      if (selectedSaleRows(draft).some(row => !row.content[draft.sourceLocale]?.name?.trim() || draft.metadata[draft.sourceLocale]?.[`sale.${row.id}.name`]?.stale)) complete.tickets = false;
    } else complete.tickets = false;
  }
  return { valid: result.success, complete, completed: CREATION_SECTIONS.filter(key => complete[key]).length };
}
