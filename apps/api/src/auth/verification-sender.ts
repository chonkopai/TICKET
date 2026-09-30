import { ServiceUnavailableException } from "@nestjs/common";

import type { ContactMethod } from "./contact-identity.js";

export interface VerificationMessage {
  method: ContactMethod;
  target: string;
  code: string;
  idempotencyKey: string;
}

export interface VerificationSender {
  available(method: ContactMethod): boolean;
  send(message: VerificationMessage): Promise<void>;
}

/** Provider acceptance is not a guarantee of inbox delivery. */
export class ResendVerificationSender implements VerificationSender {
  constructor(private readonly apiKey?: string, private readonly from?: string) {}

  available(method: ContactMethod): boolean {
    return method === "email" && Boolean(this.apiKey && this.from);
  }

  async send(message: VerificationMessage): Promise<void> {
    if (!this.available(message.method)) throw new ServiceUnavailableException({ code: "VERIFICATION_PROVIDER_UNAVAILABLE" });
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.target],
          subject: "Код подтверждения TICKET",
          text: `Код подтверждения TICKET: ${message.code}. Он действует 5 минут. Если вы не запрашивали код, просто проигнорируйте письмо.`,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Resend rejected the email");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string") throw new Error("Resend response missing email ID");
    } catch {
      // Never expose provider payloads, email addresses, credentials, or OTPs.
      throw new ServiceUnavailableException({ code: "VERIFICATION_SEND_FAILED" });
    }
  }
}
