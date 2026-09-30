"use client";

import type { EventAgeRestriction } from "@event-platform/shared-types";
import { useLocale } from "./locale-provider";
import { GUEST_EXTRA } from "../lib/guest-copy";

export function AgeRestrictionBadge({ age, className = "" }: { age: EventAgeRestriction; className?: string }) {
  const copy = GUEST_EXTRA[useLocale()];
  return <span aria-label={`${copy.ageRestriction} ${age}+`} className={`pointer-events-none inline-flex size-9 items-center justify-center text-sm font-bold text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)] ${className}`}>{age}+</span>;
}
