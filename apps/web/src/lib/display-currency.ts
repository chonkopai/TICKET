export type DisplayCurrency = "KZT" | "RUB" | "USD";

export type ExchangeRates = {
  asOf: string;
  kztPerRub: number;
  kztPerUsd: number;
};

function formatAmount(value: number, locale: string, fractionDigits: number): string {
  const [whole = "0", fraction] = value.toFixed(fractionDigits).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "").split(".");
  const separator = locale.startsWith("en") ? "," : "\u00a0";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return fraction ? `${grouped}${locale.startsWith("en") ? "." : ","}${fraction}` : grouped;
}

export function displayMoney(amountMinor: number, sourceCurrency: string, displayCurrency: DisplayCurrency, rates: ExchangeRates | null, locale = "ru-KZ"): string {
  const symbol = (currency: string) => currency === "KZT" ? "₸" : currency === "RUB" ? "₽" : currency === "USD" ? "$" : currency;
  const original = () => `${formatAmount(amountMinor / 100, locale, 2)} ${symbol(sourceCurrency)}`;
  if (!Number.isFinite(amountMinor) || amountMinor < 0 || displayCurrency === "KZT" || !rates) return original();
  const sourceRate = sourceCurrency === "KZT" ? 1 : sourceCurrency === "RUB" ? rates.kztPerRub : sourceCurrency === "USD" ? rates.kztPerUsd : null;
  if (sourceRate === null) return original();
  const targetRate = displayCurrency === "RUB" ? rates.kztPerRub : rates.kztPerUsd;
  const increment = displayCurrency === "RUB" ? 10 : 1;
  const converted = amountMinor === 0 ? 0 : Math.ceil((amountMinor / 100 * sourceRate / targetRate - 1e-10) / increment) * increment;
  return `≈ ${formatAmount(converted, locale, 0)} ${symbol(displayCurrency)}`;
}

export function displayWholeKzt(amount: number, displayCurrency: DisplayCurrency, rates: ExchangeRates | null, locale = "ru-KZ"): string {
  return displayMoney(amount * 100, "KZT", displayCurrency, rates, locale);
}
