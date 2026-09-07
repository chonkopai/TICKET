import type {
  BotIdentityResponse,
  PublicEvent,
  PublicEventSummary,
  PublicPaymentOption,
} from "@event-platform/shared-types";
import { ru } from "@event-platform/shared-types";

export type BotRole = BotIdentityResponse["user"]["role"];

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
  const price = event.startingAmount === null
    ? ru.bot.priceUnavailable
    : formatStartingPrice(event.paymentMode, event.startingAmount, event.startingCurrency);
  return [
    `🎫 ${truncate(event.title, 180)}`,
    `${event.date} ${event.time} (${event.timezone})`,
    `${truncate(event.venueName, 120)} · ${truncate(event.address, 180)}`,
    price,
  ].join("\n");
}

export function formatEventDetails(event: PublicEvent): string {
  const lines = [
    `🎫 ${truncate(event.title, 200)}`,
    `${event.date} ${event.time} (${event.timezone})`,
    `${truncate(event.venueName, 120)} · ${truncate(event.address, 220)}`,
  ];
  if (event.announcement) lines.push(`\n${truncate(event.announcement, 500)}`);
  if (event.description) lines.push(`\n${truncate(event.description, 700)}`);

  const options = [
    ...event.ticketTypes.map((ticket) => formatPaymentOption(ticket.name, ticket.payment, ticket.status === "active" && ticket.remaining > 0 ? `${ticket.remaining} ${ru.bot.availableTickets}` : ru.bot.soldOut)),
    ...event.tables.map((table) => formatPaymentOption(`${ru.bot.tablePrice} ${table.name ?? table.number}`, table.payment, table.availability === "available" ? ru.bot.availableTables : ru.bot.soldOut)),
  ];
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
