import { localTimeCandidates, publishReadyDraftSchema, selectedSaleRows, type EventCreationDraftV2, type PublishValidationContext } from "@event-platform/shared-types";

export const CREATION_SECTIONS = ["media", "information", "schedule", "tickets"] as const;
export type CreationSection = typeof CREATION_SECTIONS[number];

/** Checklist and publish button use the same validation as the API. */
export function creationReadiness(draft: EventCreationDraftV2, context: PublishValidationContext) {
  const result = publishReadyDraftSchema(context).safeParse(draft);
  const complete: Record<CreationSection, boolean> = { media: true, information: true, schedule: true, tickets: true };
  const fields = new Set<string>();
  const hasText = (key: "title" | "description" | "address" | "refundConditions") => !!draft.content[draft.sourceLocale]?.[key]?.trim() && !draft.metadata[draft.sourceLocale]?.[key]?.stale;
  if (!result.success) for (const issue of result.error.issues) {
    const [root, field] = issue.path;
    if (root === "content") {
      for (const key of ["title", "description", "address"] as const) if (!hasText(key)) fields.add(`content.${key}`);
      if (draft.refundsAvailable && draft.selectedMode !== "free" && !hasText("refundConditions")) fields.add("content.refundConditions");
      for (const row of selectedSaleRows(draft)) if (!row.content[draft.sourceLocale]?.name?.trim() || draft.metadata[draft.sourceLocale]?.[`sale.${row.id}.name`]?.stale) fields.add(draft.selectedMode === "paid_seated" ? "paidSeated" : `sale.${row.id}.name`);
    } else if (root === "schedule") {
      if (field) fields.add(`schedule.${String(field)}`);
      else {
        let partial = false;
        for (const side of ["start", "end"] as const) {
          const [date, time] = (draft.schedule[`${side}Local`] ?? "").split("T");
          if (!date) { fields.add(`schedule.${side}Date`); partial = true; }
          if (!time) { fields.add(`schedule.${side}Time`); partial = true; }
          if (date && time) try {
            const candidates = localTimeCandidates(`${date}T${time}`, draft.schedule.timezone);
            if (!candidates.length) { fields.add(`schedule.${side}Time`); partial = true; }
            else if (candidates.length > 1 && !draft.schedule[`${side}Choice`]) { fields.add(`schedule.${side}Choice`); partial = true; }
          } catch { fields.add("schedule.timezone"); partial = true; }
        }
        if (!partial) { fields.add("schedule.endDate"); fields.add("schedule.endTime"); }
      }
    } else if (root === "sale") {
      if (draft.selectedMode === "paid_seated") fields.add("paidSeated");
      else if (field) fields.add(`sale.${String(field)}.${String(issue.path[2])}`);
      else for (const row of selectedSaleRows(draft)) fields.add(`sale.${row.id}.amount`);
    } else if (root === "free") fields.add(`sale.${draft.free.id}.${field === "amount" ? "amount" : "capacity"}`);
    else if (root === "media" || root === "paidSeated") fields.add(String(root));
    else fields.add(issue.path.map(String).join("."));
    if (root === "media") complete.media = false;
    else if (root === "schedule") complete.schedule = false;
    else if (root === "classification") complete[field === "category" || field === "ageRestriction" ? "information" : "schedule"] = false;
    else if (root === "content") {
      if (!(["title",  "description"] as const).every(hasText)) complete.information = false;
      if (!([ "address"] as const).every(hasText)) complete.schedule = false;
      if (draft.refundsAvailable && draft.selectedMode !== "free" && !hasText("refundConditions")) complete.tickets = false;
      if (selectedSaleRows(draft).some(row => !row.content[draft.sourceLocale]?.name?.trim() || draft.metadata[draft.sourceLocale]?.[`sale.${row.id}.name`]?.stale)) complete.tickets = false;
    } else complete.tickets = false;
  }
  return { valid: result.success, complete, fields, completed: CREATION_SECTIONS.filter(key => complete[key]).length };
}
