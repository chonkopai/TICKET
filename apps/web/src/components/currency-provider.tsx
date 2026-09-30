"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { displayMoney, displayWholeKzt, type DisplayCurrency, type ExchangeRates } from "../lib/display-currency";
import { useLocale } from "./locale-provider";
import { INTL_LOCALES } from "../lib/locale";

type CurrencyContextValue = {
  currency: DisplayCurrency;
  rates: ExchangeRates | null;
  setCurrency: (currency: DisplayCurrency) => void;
  formatMoney: (amountMinor: number, sourceCurrency: string) => string;
  formatWholeKzt: (amount: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [currency, setCurrencyState] = useState<DisplayCurrency>("KZT");
  const [rates, setRates] = useState<ExchangeRates | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("ticket:display-currency");
    if (saved === "RUB" || saved === "USD") setCurrencyState(saved);
    let active = true;
    fetch("/api/display-rates").then(async (response) => {
      if (!response.ok) throw new Error("Rates unavailable");
      return response.json() as Promise<ExchangeRates>;
    }).then((value) => {
      if (active && Number.isFinite(value.kztPerRub) && value.kztPerRub > 0 && Number.isFinite(value.kztPerUsd) && value.kztPerUsd > 0) setRates(value);
    }).catch(() => { if (active) { setRates(null); setCurrencyState("KZT"); } });
    return () => { active = false; };
  }, []);

  function setCurrency(next: DisplayCurrency) {
    if (next !== "KZT" && !rates) return;
    setCurrencyState(next);
    window.localStorage.setItem("ticket:display-currency", next);
  }

  return <CurrencyContext.Provider value={{ currency: rates ? currency : "KZT", rates, setCurrency, formatMoney: (amount, source) => displayMoney(amount, source, rates ? currency : "KZT", rates, INTL_LOCALES[locale]), formatWholeKzt: (amount) => displayWholeKzt(amount, rates ? currency : "KZT", rates, INTL_LOCALES[locale]) }}>{children}</CurrencyContext.Provider>;
}

export function useDisplayCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("CurrencyProvider is missing");
  return context;
}
