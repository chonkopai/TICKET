import { EVENT_AGE_RESTRICTIONS, hallV3Editor, resolveLocalTime, selectedSaleRows, type EventCreationDraftV2, type EventLocale, type PublicEvent, type PublicEventMedia, type PublicPaymentOption, type PublicTicketType, type PublicVenueLayout, type PublicVenueSeat } from "@event-platform/shared-types";

/** Project unsaved draft data into the same inputs used by the published page. */
export function draftEventPreview(id: string, draft: EventCreationDraftV2, locale: EventLocale, media: PublicEventMedia[], placeholders: { title: string; address: string; invitation: string }): { event: PublicEvent; layout: PublicVenueLayout | null; hasDate: boolean } {
  const content = draft.content[locale];
  let startsAt = "";
  if (draft.schedule.startLocal) try { startsAt = resolveLocalTime(draft.schedule.startLocal, draft.schedule.timezone, draft.schedule.startChoice ?? undefined); } catch { /* Keep incomplete and ambiguous dates as placeholders. */ }
  const payment = (amount: number): PublicPaymentOption => ({ mode: "full_payment", label: "full_payment", amountDue: amount, fullAmount: amount, currency: draft.currency, depositTerms: null, cancellationTerms: content?.refundConditions ?? null });
  const ticket = (row: ReturnType<typeof selectedSaleRows>[number], ticketId = row.id, capacity = "capacity" in row ? row.capacity ?? 0 : 0, venueObjectId: string | null = null): PublicTicketType => ({ id: ticketId, venueObjectId, name: row.content[locale]?.name || (draft.selectedMode === "free" ? placeholders.invitation : "—"), price: row.amount, deposit: 0, currency: draft.currency, description: row.content[locale]?.description ?? null, restrictions: null, salesStartAt: null, salesEndAt: null, remaining: capacity, status: row.active ? "active" : "sold_out", payment: payment(row.amount ?? 0) });
  const event: PublicEvent = {
    id, creationVersion: 2, ...(draft.selectedMode ? { saleMode: draft.selectedMode } : {}), currency: draft.currency,
    contentLocale: locale, sourceLocale: locale, title: content?.title || placeholders.title,
    category: draft.classification.category ?? "other", countryCode: draft.classification.countryCode ?? "", city: draft.classification.city,
    posterUrl: media.find(asset => asset.isCard)?.url ?? null, media, galleryUrls: [],
    description: content?.description ?? null, address: content?.address || placeholders.address,
    program: null, rules: null, visitTerms: null, cancellationTerms: draft.refundsAvailable ? content?.refundConditions ?? null : null,
    paymentMode: "full_payment", showFullAmountForDeposit: false, depositTerms: null, extraConditions: null,
    date: draft.schedule.startLocal?.slice(0, 10) ?? "", time: draft.schedule.startLocal?.slice(11) ?? "", startsAt, timezone: draft.schedule.timezone,
    ageRestriction: EVENT_AGE_RESTRICTIONS.find(age => age === draft.classification.ageRestriction) ?? 0, refundsAvailable: draft.refundsAvailable ?? false,
    ticketTypes: draft.selectedMode === "paid_seated" ? [] : selectedSaleRows(draft).map(row => ticket(row)), tables: [],
    organizer: { name: null, personName: null, photoUrl: null, contact: null },
  };
  const hall = draft.selectedMode === "paid_seated" ? draft.paidSeated : null;
  if (!hall) return { event, layout: null, hasDate: Boolean(startsAt) };
  const editor = hallV3Editor(hall, locale);
  const tariffFor = (object: typeof hall.objects[number]) => {
    const parent = hall.objects.find(parent => parent.id === object.parentId);
    const id = parent?.type.startsWith("table_") && parent.saleMode === "whole_table" ? parent.tariffId : object.tariffId ?? parent?.tariffId;
    return hall.tariffs.find(tariff => tariff.id === id);
  };
  const seats: PublicVenueSeat[] = hall.objects.filter(object => object.type === "seat").map((object, index) => {
    const parent = hall.objects.find(parent => parent.id === object.parentId), tariff = tariffFor(object);
    return { id: object.id, number: object.number, label: String(object.number), sortOrder: index, status: object.locked || parent?.locked ? "disabled" : "available", tableId: parent?.type.startsWith("table_") ? parent.id : null, rowId: parent?.type === "row" ? parent.id : null, ticketTypeId: null, availability: !object.locked && !parent?.locked && tariff?.active ? "available" : "unavailable", tariffName: tariff?.content[locale]?.name ?? null, price: tariff?.amount ?? null, deposit: 0, currency: draft.currency };
  });
  const layout: PublicVenueLayout = { id, eventId: id, layoutJson: { version: 2, room: hall.room, editor, tables: [], rows: [] }, seats, tables: [], rows: [] };
  for (const object of hall.objects) {
    const tariff = tariffFor(object), name = tariff?.content[locale]?.name ?? null, price = tariff?.amount ?? null, children = seats.filter(seat => seat.tableId === object.id || seat.rowId === object.id);
    if (object.type.startsWith("table_")) {
      const saleMode = object.saleMode === "whole_table" ? "whole_table" : "per_seat";
      layout.tables.push({ id: object.id, number: object.number, name, seats: children.length, price, deposit: 0, currency: draft.currency, description: null, typeLabel: name, shortDescription: null, saleMode, status: "available", holdExpiresAt: null, seatRecords: children });
      event.tables.push({ id: object.id, number: object.number, name, seats: children.length, price, deposit: 0, currency: draft.currency, description: null, typeLabel: name, shortDescription: null, saleMode, availability: !object.locked && tariff?.active ? "available" : "unavailable", seatsDetail: children.map(seat => ({ id: seat.id, number: seat.number, label: seat.label, sortOrder: seat.sortOrder, status: seat.availability })), payment: payment(price ?? 0) });
    } else if (object.type === "row") layout.rows.push({ id: object.id, number: object.number, name, typeLabel: name, shortDescription: null, price, deposit: 0, currency: draft.currency, availability: !object.locked && tariff?.active ? "available" : "unavailable", seats: children });
    else if (object.type === "zone" && tariff && !object.locked) event.ticketTypes.push(ticket(tariff, object.id, object.capacity, object.id));
  }
  return { event, layout, hasDate: Boolean(startsAt) };
}
