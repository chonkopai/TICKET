"use client";
import { useLocale } from "./locale-provider";
export function VerifiedOrganizerBadge({
  verified,
}: {
  verified: boolean | undefined;
}) {
  const locale = useLocale();
  if (!verified) return null;
  const label = {
    ru: "Организатор проверен: предоставленные данные рассмотрены командой TICKET",
    kk: "Ұйымдастырушы расталған: деректерді TICKET тобы тексерген",
    en: "Verified organizer: submitted details reviewed by TICKET",
  }[locale];
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className="ml-1 inline-flex h-4 w-4 shrink-0 align-middle items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white"
    >
      ✓
    </span>
  );
}
