"use client";

import type { EventLocale } from "@event-platform/shared-types";
import { useLocale } from "./locale-provider";

const NAME: Record<EventLocale, string> = { ru: "Русский", kk: "Қазақша", en: "English" };
const PREFIX: Record<EventLocale, string> = {
  ru: "Перевод ещё не готов. Показан исходный язык:",
  kk: "Аударма әлі дайын емес. Бастапқы тіл көрсетілген:",
  en: "Translation is not ready. Showing the source language:",
};

export function ContentLanguageNote({ contentLocale }: { contentLocale?: EventLocale | undefined }) {
  const requested = useLocale();
  if (!contentLocale || contentLocale === requested) return null;
  return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
    {PREFIX[requested]} {NAME[contentLocale]}
  </span>;
}
