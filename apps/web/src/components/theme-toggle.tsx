"use client";

import { useLocale } from "./locale-provider";
import { useTheme } from "./theme-provider";

const copy = {
  ru: { dark: "Включить тёмную тему", light: "Включить светлую тему" },
  en: { dark: "Switch to dark theme", light: "Switch to light theme" },
  kk: { dark: "Қараңғы тақырыпқа ауысу", light: "Жарық тақырыпқа ауысу" },
};

export function ThemeToggle({ onHero = false }: { onHero?: boolean }) {
  const { theme, toggle } = useTheme(), locale = useLocale();
  const label = theme === "dark" ? copy[locale].light : copy[locale].dark;
  return <button type="button" className={`ticket-theme-toggle ${onHero ? "ticket-theme-toggle-on-hero" : ""}`} aria-label={label} title={label} aria-pressed={theme === "dark"} onClick={toggle}>
    <svg aria-hidden="true" className="ticket-theme-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 13.1A9 9 0 0 1 10.9 3.2 9 9 0 1 0 20.8 13.1Z" /></svg>
    <svg aria-hidden="true" className="ticket-theme-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
  </button>;
}
