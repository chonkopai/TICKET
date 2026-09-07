import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type PaymentWebhookType = "payment.succeeded" | "payment.failed" | "payment.expired";

export interface PaymentLinkRequest {
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  providerRequestKey?: string;
  anonymous?: boolean;
}

export interface PaymentLinkResult { url: string; providerId: string }

export interface NormalizedPaymentWebhook {
  provider: string;
  eventId: string;
  eventType: PaymentWebhookType;
  providerPaymentId: string;
  orderId?: string;
  amount: number;
  currency: string;
  occurredAt: Date;
  payloadHash: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentLink(input: PaymentLinkRequest): Promise<PaymentLinkResult>;
  verifyWebhook(input: { rawBody: Buffer; headers: Record<string, string | undefined>; now?: Date }): NormalizedPaymentWebhook;
}

/** Signed local adapter. The signing helper is for server-side fixtures/tests only. */
export class DevelopmentPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  constructor(
    private readonly webOrigin: string,
    private readonly webhookSecret = process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET || "development-webhook-secret",
    private readonly toleranceSeconds = 300,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async createPaymentLink(input: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const requestKey = input.providerRequestKey ?? `order:${input.orderId}`;
    const providerId = `dev-${createHash("sha256").update(requestKey).digest("hex").slice(0, 32)}`;
    const url = new URL(input.anonymous ? "/quick/status" : "/payment/status", this.webOrigin);
    url.searchParams.set("order", input.orderId);
    url.searchParams.set("payment", providerId);
    return { url: url.toString(), providerId };
  }

  verifyWebhook(input: { rawBody: Buffer; headers: Record<string, string | undefined>; now?: Date }): NormalizedPaymentWebhook {
    const signature = getHeader(input.headers, "x-payment-signature");
    if (!signature) throw webhookError("PAYMENT_SIGNATURE_INVALID", "Payment signature is missing");
    const values = Object.fromEntries(signature.split(",").map((part) => {
      const at = part.indexOf("=");
      return at > 0 ? [part.slice(0, at).trim(), part.slice(at + 1).trim()] : [part.trim(), ""];
    }));
    const timestamp = Number(values.t);
    const supplied = values.v1;
    if (!Number.isInteger(timestamp) || !supplied || !/^[a-f0-9]{64}$/i.test(supplied)) {
      throw webhookError("PAYMENT_SIGNATURE_INVALID", "Payment signature is malformed");
    }
    const now = input.now ?? this.clock();
    if (Math.abs(now.getTime() / 1_000 - timestamp) > this.toleranceSeconds) {
      throw webhookError("PAYMENT_SIGNATURE_STALE", "Payment signature is stale");
    }
    const expected = createHmac("sha256", this.webhookSecret).update(`${timestamp}.`).update(input.rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const suppliedBuffer = Buffer.from(supplied, "hex");
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw webhookError("PAYMENT_SIGNATURE_INVALID", "Payment signature is invalid");
    }
    let value: unknown;
    try { value = JSON.parse(input.rawBody.toString("utf8")); } catch { throw webhookError("PAYMENT_PAYLOAD_INVALID", "Payment payload is not valid JSON"); }
    if (!isRecord(value)) throw webhookError("PAYMENT_PAYLOAD_INVALID", "Payment payload is invalid");
    if (!isWebhookType(value.eventType) || !nonEmpty(value.eventId) || !nonEmpty(value.providerPaymentId) ||
      !Number.isSafeInteger(value.amount) || (value.amount as number) < 0 || !nonEmpty(value.currency) ||
      (value.occurredAt !== undefined && (typeof value.occurredAt !== "string" || Number.isNaN(Date.parse(value.occurredAt))))) {
      throw webhookError("PAYMENT_PAYLOAD_INVALID", "Payment payload fields are invalid");
    }
    const normalized: NormalizedPaymentWebhook = {
      provider: this.name,
      eventId: value.eventId,
      eventType: value.eventType,
      providerPaymentId: value.providerPaymentId,
      amount: value.amount as number,
      currency: (value.currency as string).trim().toUpperCase(),
      occurredAt: value.occurredAt ? new Date(value.occurredAt as string) : now,
      payloadHash: createHash("sha256").update(input.rawBody).digest("hex"),
    };
    const orderId = nonEmpty(value.orderId) ? value.orderId : undefined;
    const metadata = redact(value.metadata);
    if (orderId) normalized.orderId = orderId;
    if (metadata) normalized.metadata = metadata;
    return normalized;
  }

  static signWebhook(payload: Record<string, unknown>, secret: string, timestamp = Math.floor(Date.now() / 1_000)): { rawBody: Buffer; headers: Record<string, string> } {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
    return { rawBody, headers: { "x-payment-signature": `t=${timestamp},v1=${digest}` } };
  }
}

function getHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 256; }
function isWebhookType(value: unknown): value is PaymentWebhookType { return value === "payment.succeeded" || value === "payment.failed" || value === "payment.expired"; }
function redact(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(["source", "attempt", "reason"].flatMap((key) => typeof value[key] === "string" || typeof value[key] === "number" ? [[key, value[key]]] : []));
}
export function webhookError(code: string, message: string): Error & { code: string } { const error = new Error(message) as Error & { code: string }; error.code = code; return error; }
