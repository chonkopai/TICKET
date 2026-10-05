"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isTheme, THEME_STORAGE_KEY, type Theme } from "../lib/theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const explicit = useRef(false);
  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    try { explicit.current = isTheme(localStorage.getItem(THEME_STORAGE_KEY)); } catch { /* Session-only choice. */ }
    const initial = document.documentElement.dataset.theme;
    apply(isTheme(initial) ? initial : system.matches ? "dark" : "light");
    const followSystem = () => { if (!explicit.current) apply(system.matches ? "dark" : "light"); };
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      explicit.current = isTheme(event.newValue);
      apply(isTheme(event.newValue) ? event.newValue : system.matches ? "dark" : "light");
    };
    system.addEventListener("change", followSystem);
    window.addEventListener("storage", sync);
    return () => { system.removeEventListener("change", followSystem); window.removeEventListener("storage", sync); };
  }, []);
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    explicit.current = true;
    apply(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Keep the selection for this session. */ }
  }
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
