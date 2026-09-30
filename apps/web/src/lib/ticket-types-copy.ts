import { ru, type EventLocale } from "@event-platform/shared-types";

type Widen<T> = T extends string ? string : T extends readonly unknown[] ? { [K in keyof T]: Widen<T[K]> } : T extends object ? { [K in keyof T]: Widen<T[K]> } : T;
type TicketTypesCopy = Widen<typeof ru.ticketTypes>;

export const TICKET_TYPES_COPY: Record<EventLocale, TicketTypesCopy> = {
  ru: ru.ticketTypes,
  kk: {
    title: "Билет түрлері", description: "Бұл іс-шараның бағасын, шектерін және сату мерзімін баптаңыз.", create: "Билет түрін қосу", empty: "Билет түрлері әлі жасалмаған.", edit: "Өңдеу", close: "Пішінді жабу", saved: "Билет түрі сақталды.", deleted: "Билет түрі жойылды.", deleteConfirm: "Бұл билет түрін жоясыз ба?", loadFailed: "Билет түрлерін жүктеу мүмкін болмады.", saveFailed: "Билет түрін сақтау мүмкін болмады.", actionFailed: "Билет түріне қатысты әрекетті орындау мүмкін болмады.", moneyHint: "Құн тиынмен көрсетіледі. Мысалы, 500000 = 5 000 KZT.", timezoneHint: "Сату мерзімі іс-шараның уақыт белдеуінде көрсетіледі:",
    fields: { name: "Атауы", price: "Құны, тиын", deposit: "Депозит, тиын", currency: "Валюта", quantityTotal: "Саны", description: "Сипаттама", salesStartAt: "Сату басталуы", salesEndAt: "Сату аяқталуы", restrictions: "Шектеулер", status: "Күйі" },
    counters: { total: "Барлығы", created: "Жасалды", reserved: "Резервте", sold: "Сатылды", paid: "Төленді", remaining: "Қалды", refunded: "Қайтарылды", cancelled: "Бас тартылды" },
    statuses: { draft: "Нобай", active: "Сатылымда", paused: "Тоқтатылған", sold_out: "Сатылып кетті" },
    errors: { notFound: "Билет түрі табылмады.", inventoryConflict: "Саны сатылған немесе брондалған билеттерден аз.", hasActivity: "Сатылған немесе брондалған билет түрін жоюға болмайды.", salesWindowInvalid: "Сату аяқталуы басталуынан кейін болуы керек.", duplicateName: "Мұндай атаулы билет түрі бар.", updateEmpty: "Кемінде бір өрісті өзгертіңіз." },
  },
  en: {
    title: "Ticket types", description: "Set prices, limits, and sales periods for this event.", create: "Add ticket type", empty: "No ticket types yet.", edit: "Edit", close: "Close form", saved: "Ticket type saved.", deleted: "Ticket type deleted.", deleteConfirm: "Delete this ticket type?", loadFailed: "Could not load ticket types.", saveFailed: "Could not save the ticket type.", actionFailed: "Could not complete the ticket type action.", moneyHint: "Enter amounts in tiyn. For example, 500000 = 5,000 KZT.", timezoneHint: "Sales periods use the event time zone:",
    fields: { name: "Name", price: "Price, tiyn", deposit: "Deposit, tiyn", currency: "Currency", quantityTotal: "Quantity", description: "Description", salesStartAt: "Sales start", salesEndAt: "Sales end", restrictions: "Restrictions", status: "Status" },
    counters: { total: "Total", created: "Created", reserved: "Reserved", sold: "Sold", paid: "Paid", remaining: "Remaining", refunded: "Refunded", cancelled: "Cancelled" },
    statuses: { draft: "Draft", active: "On sale", paused: "Paused", sold_out: "Sold out" },
    errors: { notFound: "Ticket type not found.", inventoryConflict: "Quantity is below the number already sold or reserved.", hasActivity: "A ticket type with sales or reservations cannot be deleted.", salesWindowInvalid: "Sales must end after they start.", duplicateName: "A ticket type with this name already exists.", updateEmpty: "Change at least one field." },
  },
};
