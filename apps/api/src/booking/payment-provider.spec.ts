import { describe, expect, it } from "vitest";
import { configuredPaymentCurrencies, DevelopmentPaymentProvider } from "./payment-provider.js";

describe("demo currency capabilities", () => {
  it("supports dollars, rubles and tenge with two minor-unit digits, preserving existing euro drafts", () => {
    const provider = new DevelopmentPaymentProvider("http://localhost:3000");
    expect(provider.supportedCurrencies).toEqual(expect.arrayContaining(["USD", "RUB", "KZT", "EUR"].map(code => ({ code, exponent: 2 }))));
    expect(configuredPaymentCurrencies({ PAYMENT_PROVIDER_NAME: "mock", NODE_ENV: "development" })).toEqual(provider.supportedCurrencies);
  });
  it("keeps mock currency capabilities unavailable for production without demo mode", () => {
    expect(configuredPaymentCurrencies({ PAYMENT_PROVIDER_NAME: "mock", NODE_ENV: "production", DEMO_MODE: false })).toEqual([]);
    expect(configuredPaymentCurrencies({ PAYMENT_PROVIDER_NAME: "unconfigured", NODE_ENV: "development" })).toEqual([]);
    expect(configuredPaymentCurrencies({ PAYMENT_PROVIDER_NAME: "mock", NODE_ENV: "production", DEMO_MODE: true })).toContainEqual({ code: "RUB", exponent: 2 });
  });
  it("retains RUB amounts and currency in signed development payment callbacks", () => {
    const now = new Date("2031-01-01T00:00:00Z"), secret = "currency-test-secret";
    const provider = new DevelopmentPaymentProvider("http://localhost:3000", secret);
    const signed = DevelopmentPaymentProvider.signWebhook({ eventId: "rub-test", eventType: "payment.succeeded", providerPaymentId: "rub-payment", amount: 12345, currency: "RUB" }, secret, Math.floor(now.getTime() / 1000));
    expect(provider.verifyWebhook({ rawBody: signed.rawBody, headers: signed.headers, now })).toMatchObject({ amount: 12345, currency: "RUB" });
  });
});
