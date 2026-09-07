/** Server-only fixture: simulate the signed development gateway, never a browser endpoint. */
import { loadApiEnv } from "@event-platform/config";
import { prisma } from "@event-platform/database";
import { randomUUID } from "node:crypto";
import { DevelopmentPaymentProvider } from "../booking/payment-provider.js";

const env = loadApiEnv();
const [orderId, eventType = "payment.succeeded"] = process.argv.slice(2);
if (env.NODE_ENV === "production" || env.PAYMENT_PROVIDER_NAME !== "mock") throw new Error("Signed development callbacks are disabled in this environment");
if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId) || !["payment.succeeded", "payment.failed", "payment.expired"].includes(eventType)) throw new Error("Usage: tsx src/payments/dev-callback.ts <order-id> [payment.succeeded|payment.failed|payment.expired]");
if (!env.PAYMENT_PROVIDER_WEBHOOK_SECRET || env.PAYMENT_PROVIDER_WEBHOOK_SECRET.length < 32) throw new Error("Configure a private development webhook secret");
try {
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId, provider: "mock" }, orderBy: { createdAt: "desc" } });
  if (!payment.providerPaymentId) throw new Error("Create or retry the payment link first");
  const signed = DevelopmentPaymentProvider.signWebhook({ eventId: randomUUID(), eventType, providerPaymentId: payment.providerPaymentId, orderId, amount: payment.amount, currency: payment.currency.trim() }, env.PAYMENT_PROVIDER_WEBHOOK_SECRET);
  const response = await fetch(`http://localhost:${env.API_PORT}/payments/webhooks/mock`, {
    method: "POST", headers: { ...signed.headers, "content-type": "application/json" }, body: new Uint8Array(signed.rawBody),
  });
  if (!response.ok) throw new Error(`Development callback rejected (HTTP ${response.status})`);
  console.log(`Development ${eventType} callback accepted for ${orderId}.`);
} finally { await prisma.$disconnect(); }
