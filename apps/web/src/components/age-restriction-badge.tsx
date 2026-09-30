"use client";

import type { EventAgeRestriction } from "@event-platform/shared-types";
import { useLocale } from "./locale-provider";
import { GUEST_EXTRA } from "../lib/guest-copy";

export function AgeRestrictionBadge({ age, className = "" }: { age: EventAgeRestriction; className?: string }) {
  const copy = GUEST_EXTRA[useLocale()];
  return <span aria-label={`${copy.ageRestriction} ${age}+`} className={`pointer-events-none inline-flex size-9 items-center justify-center rounded-full border border-white/35 bg-white/50 text-xs font-bold text-slate-900 shadow-sm backdrop-blur-sm ${className}`}>{age}+</span>;
}
