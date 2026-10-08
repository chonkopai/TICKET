"use client";
import { createContext, useContext, useId, type ReactNode } from "react";
import type { EventLocale } from "@event-platform/shared-types";

const ValidationContext = createContext<{ fields: ReadonlySet<string>; locale: EventLocale }>({ fields: new Set(), locale: "ru" });
const messages = { ru: "Заполните это поле", en: "Complete this field", kk: "Бұл өрісті толтырыңыз" };
export function CreationValidation({ fields, locale, children }: { fields: ReadonlySet<string>; locale: EventLocale; children: ReactNode }) {
  return <ValidationContext.Provider value={{ fields, locale }}>{children}</ValidationContext.Provider>;
}
export function useCreationValidation(key?: string) {
  const context = useContext(ValidationContext), id = useId();
  const invalid = !!key && context.fields.has(key);
  return {
    invalid,
    wrapper: { "data-creation-field": key, "data-validation-invalid": invalid || undefined },
    control: { "aria-invalid": invalid, "aria-describedby": invalid ? `${id}-error` : undefined },
    error: invalid ? <span id={`${id}-error`} className="creation-field-error">{messages[context.locale]}</span> : null,
  };
}
/** Also marks grouped controls such as ticket mode, media and hall settings. */
export function ValidationField({ field, children, className = "" }: { field: string; children: ReactNode; className?: string }) {
  const validation = useCreationValidation(field);
  return <div {...validation.wrapper} className={`creation-validation-group ${className}`}>{children}{validation.error}</div>;
}
