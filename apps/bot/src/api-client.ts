import type { BotEvent, BotIdentityResponse, BotOrganizerTodayResponse, BotTicketsResponse, BotQuickSessionResponse, PublicEventList } from "@event-platform/shared-types";

export interface BotApiClientOptions {
  apiBaseUrl: string;
  botApiSecret: string;
  fetch?: typeof globalThis.fetch | undefined;
}

export class BotApiClient {
  private readonly request: typeof globalThis.fetch;
  private identityToken: string | null = null;
  private identityExpiresAt = 0;

  constructor(private readonly options: BotApiClientOptions) { this.request = options.fetch ?? globalThis.fetch; }

  async events(page = 1, sort: "recent" | "popular" = "recent", search?: string): Promise<PublicEventList> {
    const url = new URL("/bot/events", this.options.apiBaseUrl);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "6");
    url.searchParams.set("sort", sort);
    if (search?.trim()) url.searchParams.set("search", search.trim());
    return this.json<PublicEventList>(`${url.pathname}${url.search}`);
  }

  async event(id: string): Promise<BotEvent> { return this.json<BotEvent>(`/bot/events/${id}`); }

  async identity(telegramId: number, chatId: number): Promise<BotIdentityResponse> {
    const response = await this.json<BotIdentityResponse>("/bot/identity", { method: "POST", body: { telegramId: String(telegramId), chatId: String(chatId) } });
    this.identityToken = response.token; this.identityExpiresAt = Date.parse(response.expiresAt);
    return response;
  }

  async tickets(telegramId: number, chatId: number): Promise<BotTicketsResponse> {
    try {
      await this.ensureIdentity(telegramId, chatId);
      return this.json<BotTicketsResponse>("/bot/tickets", { token: this.identityToken! });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("BOT_API_404")) throw error;
      return this.json<BotTicketsResponse>("/bot/anonymous-tickets", { headers: { "x-telegram-id": String(telegramId), "x-telegram-chat-id": String(chatId) } });
    }
  }

  async qr(ticketId: string, telegramId: number, chatId: number, anonymous: boolean): Promise<Buffer> {
    const path = anonymous ? `/bot/anonymous-tickets/${ticketId}/qr` : `/bot/tickets/${ticketId}/qr`;
    if (!anonymous) await this.ensureIdentity(telegramId, chatId);
    const response = await this.request(new URL(path, this.options.apiBaseUrl), { headers: anonymous ? { ...this.headers(), "x-telegram-id": String(telegramId), "x-telegram-chat-id": String(chatId) } : this.headers(this.identityToken!) });
    if (!response.ok) throw new Error(`BOT_API_${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async quickSession(name: string, telegramId: number, chatId: number): Promise<BotQuickSessionResponse> {
    return this.json<BotQuickSessionResponse>("/bot/quick-session", { method: "POST", body: { name, telegramId: String(telegramId), chatId: String(chatId) } });
  }

  async setQuickDeliveryMessage(sessionToken: string, telegramId: number, chatId: number, messageId: number): Promise<void> {
    await this.json("/bot/quick-session/message", { method: "POST", body: { sessionToken, telegramId: String(telegramId), chatId: String(chatId), messageId } });
  }

  async quickCheckout(sessionToken: string, key: string, kind: "ticket" | "table", itemId: string): Promise<{ orderId: string; paymentLink?: string | null }> {
    return this.json(`/quick/checkouts/${kind === "ticket" ? "tickets" : "tables"}`, { method: "POST", token: sessionToken, idempotencyKey: key, body: kind === "ticket" ? { ticketTypeId: itemId, quantity: 1, termsAccepted: true } : { tableId: itemId, termsAccepted: true } });
  }

  async quickStatus(accessToken: string) { return this.json<{ orderId: string; status: string; tickets: Array<{ id: string; status: string }>; paymentLink?: string | null }>("/quick/order", { token: accessToken }); }

  async organizerToday(telegramId: number, chatId: number): Promise<BotOrganizerTodayResponse> {
    await this.ensureIdentity(telegramId, chatId);
    return this.json<BotOrganizerTodayResponse>("/bot/organizer/today", { token: this.identityToken! });
  }

  private async ensureIdentity(telegramId: number, chatId: number): Promise<void> {
    if (!this.identityToken || this.identityExpiresAt <= Date.now() + 10_000) await this.identity(telegramId, chatId);
  }

  private async json<T>(path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown; token?: string; idempotencyKey?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { ...this.headers(options.token) };
    if (options.headers) Object.assign(headers, options.headers);
    if (options.body !== undefined) { headers["content-type"] = "application/json"; }
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    const response = await this.request(new URL(path, this.options.apiBaseUrl), { method: options.method ?? "GET", headers, ...(options.body === undefined ? undefined : { body: JSON.stringify(options.body) }) });
    if (!response.ok) throw new Error(`BOT_API_${response.status}`);
    return await response.json() as T;
  }

  private headers(token?: string): Record<string, string> {
    return { "x-bot-api-secret": this.options.botApiSecret, ...(token ? { authorization: `Bearer ${token}` } : {}) };
  }
}

export function isPrivateChat(ctx: { chat: { type?: string } | undefined }): boolean { return ctx.chat?.type === "private"; }
