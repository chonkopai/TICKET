"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { EventLocale } from "@event-platform/shared-types";

const LocaleContext = createContext<EventLocale>("ru");

export function LocaleProvider({ locale, children }: { locale: EventLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): EventLocale {
  return useContext(LocaleContext);
}
