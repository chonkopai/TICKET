import type { PublicEvent, PublicEventSummary } from "@event-platform/shared-types";
import { describe, expect, it } from "vitest";
import { wrapRichDescription } from "@event-platform/shared-types";

import {
  formatCommandList,
  formatEventDetails,
  formatEventList,
  formatTicketStatus,
  formatWelcome,
} from "./presentation.js";

describe("Telegram presentation", () => {
  it("renders formatted descriptions as readable Telegram text", () => {
    const details = formatEventDetails(eventFixture({ description: wrapRichDescription('<h1>Programme</h1><p><strong>Guests &amp; music</strong></p><ul><li>Doors open</li></ul><p><a href="https://example.com">Details</a></p>') }));
    expect(details).toContain("Programme");
    expect(details).toContain("Guests & music");
    expect(details).toContain("Doors open");
    expect(details).toContain("https://example.com");
    expect(details).not.toContain("<h1>");
    expect(details).not.toContain("data-ticket-rich-text");
  });
  it("uses the same common command list for welcome/help and hides organizer commands from guests", () => {
    const guest = formatWelcome("guest");
    expect(guest).toContain("/events");
    expect(guest).toContain("/search");
    expect(guest).toContain("/my_tickets");
    expect(guest).not.toContain("/today");
    expect(formatCommandList("organizer")).toContain("/today");
  });

  it("separates event summaries without a leading or trailing divider", () => {
    const message = formatEventList([summary("Первое"), summary("Второе")]);
    expect(message).toContain("Первое");
    expect(message).toContain("Второе");
    expect(message).toMatch(/Первое[\s\S]*────────────[\s\S]*Второе/);
    expect(message.startsWith("────────────")).toBe(false);
    expect(message.endsWith("────────────")).toBe(false);
  });

  it("shows full-payment, visible deposit and free prices", () => {
    const event = eventFixture({
      ticketTypes: [
        ticket("Полный билет", "full_payment", 1_000_000, 1_000_000),
        ticket("Депозит", "deposit", 2_000_000, 500_000, 2_000_000),
        ticket("Бесплатный вход", "full_payment", 0, 0),
      ],
    });
    const message = formatEventDetails(event);
    expect(message).toContain("Полная оплата: 10 000 KZT");
    expect(message).toContain("Депозит: 5 000 KZT");
    expect(message).toContain("Полная стоимость: 20 000 KZT");
    expect(message).toContain("Полная оплата: Бесплатно");
  });

  it("does not leak a hidden full deposit price", () => {
    const event = eventFixture({
      ticketTypes: [ticket("Закрытый депозит", "deposit", 3_000_000, 750_000, null)],
    });
    const message = formatEventDetails(event);
    expect(message).toContain("Депозит: 7 500 KZT");
    expect(message).not.toContain("30 000 KZT");
  });

  it("sends assigned seats to the scheme without offering a per-seat table as a whole table", () => {
    const event = eventFixture({ tables: [{ id: crypto.randomUUID(), number: 4, name: "VIP", seats: 2, price: 20_000, deposit: 0, currency: "KZT", description: null, typeLabel: null, shortDescription: null, saleMode: "per_seat", seatsDetail: [], availability: "available", payment: { mode: "full_payment", label: "full_payment", amountDue: 20_000, fullAmount: 20_000, currency: "KZT", depositTerms: null, cancellationTerms: null } }] });
    const message = formatEventDetails(event, true);
    expect(message).toContain("выберите конкретное место");
    expect(message).not.toContain("Стол VIP");
  });

  it("labels cancelled and refunded tickets clearly in Telegram", () => {
    expect(formatTicketStatus("cancelled")).toBe("Отменён");
    expect(formatTicketStatus("refunded")).toBe("Возвращён");
    expect(formatTicketStatus("used")).toBe("Использован");
  });
});

function summary(title: string): PublicEventSummary {
  return {
    id: crypto.randomUUID(), title, category: "music", countryCode: "KZ", city: "Алматы", posterUrl: null, announcement: null, ageRestriction: 0, date: "2026-12-20", time: "19:00",
    timezone: "Asia/Almaty", startsAt: "2026-12-20T13:00:00.000Z", venueName: "Площадка", address: "Алматы",
    paymentMode: "full_payment", paymentLabel: "full_payment", startingAmount: 500_000, startingFullAmount: 500_000, startingCurrency: "KZT", startingUnit: "ticket", startingPrices: [{ amount: 500_000, fullAmount: 500_000, currency: "KZT", unit: "ticket" }], remainingTickets: 10, remainingTables: 0, remainingSeats: 0, saleStatus: "available",
    organizer: { name: "Организатор", photoUrl: null },
  };
}

function eventFixture(overrides: Partial<PublicEvent> = {}): PublicEvent {
  const base: PublicEvent = {
    id: crypto.randomUUID(), title: "Тестовое мероприятие", category: "music", countryCode: "KZ", city: "Алматы", posterUrl: null, announcement: "Анонс", ageRestriction: 0, description: null,
    program: null, rules: null, visitTerms: null, cancellationTerms: null, paymentMode: "full_payment",
    showFullAmountForDeposit: false, depositTerms: null, extraConditions: null, date: "2026-12-20", time: "19:00",
    timezone: "Asia/Almaty", startsAt: "2026-12-20T13:00:00.000Z", venueName: "Площадка", address: "Алматы",
    ticketTypes: [], tables: [], organizer: { name: "Организатор", personName: null, photoUrl: null, contact: null },
  };
  return { ...base, ...overrides };
}

function ticket(name: string, mode: "deposit" | "full_payment", price: number, amountDue: number, fullAmount: number | null = price) {
  return {
    id: crypto.randomUUID(), name, price: mode === "deposit" && fullAmount === null ? null : price, deposit: mode === "deposit" ? amountDue : 0,
    currency: "KZT", description: null, restrictions: null, salesStartAt: null, salesEndAt: null, venueObjectId: null, remaining: 10, status: "active" as const,
    payment: { mode, label: mode, amountDue, fullAmount, currency: "KZT", depositTerms: null, cancellationTerms: null },
  };
}
