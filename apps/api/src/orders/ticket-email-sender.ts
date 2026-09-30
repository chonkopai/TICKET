export interface TicketEmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export interface TicketEmailSender {
  available(): boolean;
  send(message: TicketEmailMessage): Promise<{ id: string }>;
}

export class TicketEmailSendError extends Error {
  constructor(readonly kind: "rate" | "rejected" | "uncertain") { super(kind); }
}

/** Resend accepting an email means queued by the provider, not inbox delivery. */
export class ResendTicketEmailSender implements TicketEmailSender {
  constructor(private readonly apiKey?: string, private readonly from?: string) {}
  available(): boolean { return Boolean(this.apiKey && this.from); }

  async send(message: TicketEmailMessage): Promise<{ id: string }> {
    if (!this.available()) throw new TicketEmailSendError("rejected");
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey },
        body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch { throw new TicketEmailSendError("uncertain"); }
    if (response.status === 429) throw new TicketEmailSendError("rate");
    if (!response.ok) throw new TicketEmailSendError(response.status >= 500 ? "uncertain" : "rejected");
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "id" in body && typeof body.id === "string") return { id: body.id };
    } catch { /* provider response is ambiguous */ }
    throw new TicketEmailSendError("uncertain");
  }
}
