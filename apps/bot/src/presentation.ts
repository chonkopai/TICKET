import type {
  BotIdentityResponse,
  PublicEvent,
  PublicEventSummary,
  PublicPaymentOption,
} from "@event-platform/shared-types";
import { ru, richDescriptionBody } from "@event-platform/shared-types";
import { convert } from "html-to-text";

export type BotRole = BotIdentityResponse["user"]["role"];

const ticketStatusLabels: Record<string, string> = {
  created: "Создан",
  pending_payment: "Ожидает оплаты",
  paid: "Оплачен",
  active: "Действителен",
  used: "Использован",
  cancelled: "Отменён",
  refunded: "Возвращён",
};

export function formatTicketStatus(status: string): string {
  return ticketStatusLabels[status] ?? status;
}

export function formatWelcome(role: BotRole = "guest"): string {
  return `${ru.bot.welcomeIntro}\n\n${ru.bot.commandsTitle}\n${formatCommandList(role)}`;
}

export function formatHelp(role: BotRole = "guest"): string {
  return `${ru.bot.helpIntro}\n\n${formatCommandList(role)}`;
}

export function formatCommandList(role: BotRole = "guest"): string {
  const commands: string[] = [
    ru.bot.commands.events,
    ru.bot.commands.search,
    ru.bot.commands.tickets,
    ru.bot.commands.help,
  ];
  if (role === "organizer" || role === "admin") {
    commands.push(ru.bot.organizerCommands.today, ru.bot.organizerCommands.notify, ru.bot.organizerCommands.chat);
  }
  return commands.join("\n");
}

export function formatEventList(events: readonly PublicEventSummary[]): string {
  return events.map(formatEventSummary).join(`\n\n${ru.bot.eventSeparator}\n\n`);
}

export function formatEventSummary(event: PublicEventSummary): string {
  const price = event.startingPrices.length > 1
    ? event.startingPrices.map((item) => `${formatStartingPrice(event.paymentMode, item.amount, item.currency)}${item.unit === "table" ? " за стол" : item.unit === "seat" ? " за место" : " за билет"}`).join("\n")
    : event.startingAmount === null
    ? (["sold_out", "sales_ended", "temporarily_unavailable"].includes(event.saleStatus) ? ru.publicEvent.saleStatuses[event.saleStatus] : ru.bot.priceUnavailable)
    : `${formatStartingPrice(event.paymentMode, event.startingAmount, event.startingCurrency)}${event.startingUnit === "table" ? " за стол" : event.startingUnit === "seat" ? " за место" : " за билет"}`;
  return [
    `🎫 ${truncate(event.title, 180)}`,
    `${event.date} ${event.time} (${event.timezone})`,
    `${truncate(event.address, 180)}`,
    price,
  ].join("\n");
}

export function formatEventDetails(event: PublicEvent, hasSeatSelection = false): string {
  const lines = [
    `🎫 ${truncate(event.title, 200)}`,
    `${event.date} ${event.time} (${event.timezone})`,
    `${truncate(event.address, 220)}`,
  ];
  if (event.description) {
    const body = richDescriptionBody(event.description);
    const description = body === null ? event.description : convert(body, {
      wordwrap: false,
      selectors: [{ selector: "h1", options: { uppercase: false } }, { selector: "h2", options: { uppercase: false } }, { selector: "a", options: { hideLinkHrefIfSameAsText: true } }, { selector: "img", format: "skip" }, { selector: "script", format: "skip" }, { selector: "style", format: "skip" }],
    });
    lines.push(`\n${truncate(description, 700)}`);
  }

  if (event.paymentMode === "deposit") return [...lines, "", "Новые продажи приостановлены. Существующие покупки сохраняют первоначальные суммы и условия."].join("\n");

  const options = [
    ...event.ticketTypes.map((ticket) => formatPaymentOption(ticket.name, ticket.payment, ticket.status === "active" && ticket.remaining > 0 ? `${ticket.remaining} ${ru.bot.availableTickets}` : ru.bot.soldOut)),
    ...event.tables.filter((table) => table.saleMode === "whole_table").map((table) => formatPaymentOption(`${ru.bot.tablePrice} ${table.name ?? table.number}`, table.payment, table.availability === "available" ? ru.bot.availableTables : ru.bot.soldOut)),
  ];
  if (hasSeatSelection) options.push("Места по схеме: выберите конкретное место на сайте, затем подтвердите покупку через Telegram.");
  lines.push("", options.length ? options.join("\n\n") : ru.bot.priceUnavailable);
  return lines.join("\n");
}

export function formatPaymentOption(name: string, payment: PublicPaymentOption, availability?: string): string {
  const label = payment.mode === "deposit" ? ru.bot.depositPrice : ru.bot.fullPaymentPrice;
  const lines = [`${name}`, `${label}: ${formatAmount(payment.amountDue, payment.currency)}`];
  if (payment.mode === "deposit" && payment.fullAmount !== null) {
    lines.push(`${ru.bot.fullAmount}: ${formatAmount(payment.fullAmount, payment.currency)}`);
  }
  if (availability) lines.push(`${ru.bot.remainingLabel}: ${availability}`);
  return lines.join("\n");
}

export function formatStartingPrice(mode: "deposit" | "full_payment", amount: number, currency: string | null): string {
  const label = mode === "deposit" ? ru.bot.depositPrice : ru.bot.fullPaymentPrice;
  if (amount === 0) return `${label}: ${ru.bot.free}`;
  return `${label}: ${ru.bot.from} ${formatAmount(amount, currency ?? "KZT")}`;
}

export function formatAmount(amount: number, currency: string): string {
  if (amount === 0) return ru.bot.free;
  const formatted = (amount / 100).toLocaleString("ru-RU").replace(/[\u00a0\u202f]/g, " ");
  return `${formatted} ${currency.trim()}`;
}

function truncate(value: string, max: number): string {
  const normalized = value.trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}
