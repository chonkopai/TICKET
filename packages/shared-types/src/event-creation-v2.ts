import { z } from "zod";
import { COUNTRY_CODES } from "./countries.js";
import { EVENT_AGE_RESTRICTIONS, EVENT_CATEGORIES, EVENT_LOCALES, type EventLocale } from "./events.js";
import { hallEditorSchema, hallObjectSchema } from "./hall-editor.js";

export const EVENT_TEXT_LIMITS = {
  title: 100, description: 10_000, address: 250,
  refundConditions: 2_000, ticketName: 60, ticketDescription: 300, caption: 160, city: 80,
} as const;
const segmenter = new Intl.Segmenter("ru", { granularity: "grapheme" });
export function graphemeLength(value: string): number {
  let count = 0;
  for (const _ of segmenter.segment(value)) count++;
  return count;
}
export function limitedText(maximum: number) {
  // An independent byte/code-unit bound prevents adversarial combining-mark payloads.
  return z.string().max(maximum * 64).refine(value => graphemeLength(value) <= maximum, `Maximum ${maximum} graphemes`);
}
export const eventLocaleSchema = z.enum(EVENT_LOCALES);
export const eventSaleModeSchema = z.enum(["free", "paid_general", "paid_seated"]);
export type EventSaleMode=z.infer<typeof eventSaleModeSchema>;
export const MINOR_AMOUNT_MAX = 2_147_483_647; // Existing PostgreSQL Int charge columns.
export const minorAmountSchema = z.number().int().min(0).max(MINOR_AMOUNT_MAX);
export const currencyCapabilitySchema = z.object({ code: z.string().regex(/^[A-Z]{3}$/), exponent: z.number().int().min(0).max(3) }).strict();
export type CurrencyCapability = z.infer<typeof currencyCapabilitySchema>;
export function parseMinorAmount(text: string, currency: CurrencyCapability): number {
  currencyCapabilitySchema.parse(currency);
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2]?.length ?? 0) > currency.exponent || (currency.exponent === 0 && match[2])) throw new RangeError("MONEY_DECIMAL_INVALID");
  const value = BigInt(match[1]!) * 10n ** BigInt(currency.exponent) + BigInt((match[2] ?? "").padEnd(currency.exponent, "0") || "0");
  if (value > BigInt(MINOR_AMOUNT_MAX)) throw new RangeError("MONEY_TOTAL_OVERFLOW");
  return Number(value);
}
export function checkedOrderTotal(lines: readonly { unitAmount: number; quantity: number; currency: string }[], currency: string): number {
  let result = 0n;
  for (const line of lines) {
    minorAmountSchema.parse(line.unitAmount);
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.currency !== currency) throw new RangeError("MONEY_LINE_INVALID");
    result += BigInt(line.unitAmount) * BigInt(line.quantity);
    if (result > BigInt(MINOR_AMOUNT_MAX)) throw new RangeError("MONEY_TOTAL_OVERFLOW");
  }
  return Number(result);
}
export const currencyChangeSchema = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), acknowledgeRelabel: z.literal(true) }).strict();

const localized = <T extends z.ZodType>(schema: T) => z.object({ ru: schema.optional(), en: schema.optional(), kk: schema.optional() }).strict();
export const eventContentV2Schema = z.object({
  title: limitedText(100).optional(), description: limitedText(10_000).optional(),
  address: limitedText(250).optional(), refundConditions: limitedText(2_000).optional(),
}).strict();
export const saleContentV2Schema = z.object({ name: limitedText(60).optional(), description: limitedText(300).optional() }).strict();
export const translationFieldMetadataSchema = z.object({
  origin: z.enum(["source", "manual", "machine", "legacy"]), sourceHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  reviewed: z.boolean(), stale: z.boolean(), revision: z.number().int().nonnegative(),
}).strict();
export const cropSchema = z.object({ focalX: z.number().min(0).max(1), focalY: z.number().min(0).max(1), zoom: z.number().min(1).max(5) }).strict();
export const mediaCropsSchema = z.object({ card: cropSchema, featured: cropSchema, backgroundDesktop: cropSchema, backgroundMobile: cropSchema }).strict();
export const DEFAULT_MEDIA_CROP = { focalX: 0.5, focalY: 0.5, zoom: 1 } as const;
export type MediaCrop = z.infer<typeof cropSchema>;
/** Old published records contain role crops; new records store one crop. */
export function readMediaCrop(value: unknown, legacyRole: "card" | "backgroundDesktop" = "card"): MediaCrop {
  const single = cropSchema.safeParse(value);
  if (single.success) return single.data;
  const legacy = mediaCropsSchema.safeParse(value);
  return legacy.success ? legacy.data[legacyRole] : { ...DEFAULT_MEDIA_CROP };
}
export function assetMediaCrop(media: { assetCrops?: Record<string, MediaCrop> }, id: string): MediaCrop {
  return media.assetCrops?.[id] ?? { ...DEFAULT_MEDIA_CROP };
}
/** Keeps the existing public response shape compatible while all roles agree. */
export function mediaRoleCrops(crop: MediaCrop): z.infer<typeof mediaCropsSchema> {
  return { card: crop, featured: crop, backgroundDesktop: crop, backgroundMobile: crop };
}
export function mediaFrame(width: number, height: number, frameWidth: number, frameHeight: number, crop: z.infer<typeof cropSchema>) {
  cropSchema.parse(crop);
  if (![width, height, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0)) throw new RangeError("MEDIA_DIMENSIONS_INVALID");
  const scale = Math.max(frameWidth / width, frameHeight / height) * crop.zoom;
  const renderedWidth = width * scale, renderedHeight = height * scale;
  return { width: renderedWidth, height: renderedHeight,
    x: Math.max(frameWidth - renderedWidth, Math.min(0, frameWidth / 2 - crop.focalX * renderedWidth)),
    y: Math.max(frameHeight - renderedHeight, Math.min(0, frameHeight / 2 - crop.focalY * renderedHeight)) };
}
/** Canonicalize the focal point to the actual bounded position in a 16:9 frame. */
export function boundedMediaCrop(width: number, height: number, crop: MediaCrop): MediaCrop {
  const frame = mediaFrame(width, height, 16, 9, crop);
  return { focalX: (8 - frame.x) / frame.width, focalY: (4.5 - frame.y) / frame.height, zoom: crop.zoom };
}
/** Drag deltas are fractions of the preview size, independent of screen size. */
export function panMediaCrop(width: number, height: number, crop: MediaCrop, dx: number, dy: number): MediaCrop {
  const frame = mediaFrame(width, height, 16, 9, crop);
  const x = Math.max(16 - frame.width, Math.min(0, frame.x + dx * 16));
  const y = Math.max(9 - frame.height, Math.min(0, frame.y + dy * 9));
  return { focalX: (8 - x) / frame.width, focalY: (4.5 - y) / frame.height, zoom: crop.zoom };
}
export const DEFAULT_DRAFT_MEDIA_LIMITS = { imageBytes: 10 * 1024 ** 2, videoBytes: 100 * 1024 ** 2, videoSeconds: 60, draftBytes: 250 * 1024 ** 2, uploads: 5 } as const;
export const DRAFT_LIFETIMES = { anonymousSeconds: 30 * 86400, ownedSeconds: 90 * 86400, intentSeconds: 15 * 60, recoveryGraceSeconds: 7 * 86400 } as const;
export const draftApiErrorSchema = z.object({
  code: z.enum(["DRAFT_NOT_FOUND", "DRAFT_EXPIRED", "DRAFT_CAPABILITY_REVOKED", "DRAFT_ORIGIN_INVALID", "DRAFT_CSRF_INVALID", "DRAFT_REVISION_CONFLICT", "DRAFT_VALIDATION_FAILED", "DRAFT_QUOTA_EXCEEDED", "MEDIA_OWNER_MISMATCH", "MEDIA_NOT_READY", "PUBLISH_INTENT_STALE", "PUBLISH_INTENT_EXPIRED", "ORGANIZER_APPROVAL_REQUIRED", "TRANSLATION_NOT_CONFIGURED", "TRANSLATION_REVISION_CONFLICT"]),
  currentRevision: z.number().int().nonnegative().optional(), fields: z.array(z.object({ path: z.string(), code: z.string() })).optional(),
}).strict();

const formatters = new Map<string, Intl.DateTimeFormat>();
function zonedFields(value: number, timezone: string) {
  if (!/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(timezone)) throw new RangeError("SCHEDULE_TIMEZONE_INVALID");
  let formatter = formatters.get(timezone);
  if (!formatter) {
    try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); }
    catch { throw new RangeError("SCHEDULE_TIMEZONE_INVALID"); }
    if (formatters.size < 100) formatters.set(timezone, formatter);
  }
  return Object.fromEntries(formatter.formatToParts(new Date(value)).map(part => [part.type, part.value]));
}
function localMillis(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) < 1900 || Number(match[1]) > 9999) throw new RangeError("SCHEDULE_LOCAL_INVALID");
  const result = Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!, +match[4]!, +match[5]!);
  if (new Date(result).toISOString().slice(0, 16) !== value) throw new RangeError("SCHEDULE_LOCAL_INVALID");
  return result;
}
export function localTimeCandidates(value: string, timezone: string): string[] {
  const desired = localMillis(value), offsets = new Set<number>();
  for (let hours = -72; hours <= 72; hours += 3) {
    const sample = desired + hours * 3600_000, fields = zonedFields(sample, timezone);
    offsets.add(Date.UTC(+fields.year!, +fields.month! - 1, +fields.day!, +fields.hour!, +fields.minute!, +fields.second!) - sample);
  }
  return [...offsets].map(offset => desired - offset).filter(candidate => {
    const p = zonedFields(candidate, timezone);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === value && p.second === "00";
  }).sort((a, b) => a - b).map(candidate => new Date(candidate).toISOString());
}
export function resolveLocalTime(value: string, timezone: string, choice?: "earlier" | "later"): string {
  const candidates = localTimeCandidates(value, timezone);
  if (!candidates.length) throw new RangeError("SCHEDULE_TIME_NONEXISTENT");
  if (candidates.length > 1 && !choice) throw new RangeError("SCHEDULE_TIME_AMBIGUOUS");
  return choice === "later" ? candidates.at(-1)! : candidates[0]!;
}
export const draftScheduleSchema = z.object({
  startLocal: z.string().max(16).nullable(), endLocal: z.string().max(16).nullable(), timezone: z.string().max(64),
  startChoice: z.enum(["earlier", "later"]).nullable(), endChoice: z.enum(["earlier", "later"]).nullable(),
}).strict();
export function resolveSchedule(schedule: z.infer<typeof draftScheduleSchema>) {
  if (!schedule.startLocal || !schedule.endLocal) throw new RangeError("SCHEDULE_REQUIRED");
  const startsAt = resolveLocalTime(schedule.startLocal, schedule.timezone, schedule.startChoice ?? undefined);
  const endsAt = resolveLocalTime(schedule.endLocal, schedule.timezone, schedule.endChoice ?? undefined);
  if (endsAt <= startsAt) throw new RangeError("SCHEDULE_END_NOT_AFTER_START");
  return { startsAt, endsAt, timezone: schedule.timezone };
}

const uuid = z.string().uuid();
const capacity = z.number().int().min(1).max(1_000_000);
const saleRow = z.object({ id: uuid, active: z.boolean(), amount: minorAmountSchema.nullable(), capacity: capacity.nullable(), content: localized(saleContentV2Schema) }).strict();
// Draft hall geometry carries IDs and shared geometry only. Text lives on stable tariffs.
export const hallGeometryObjectV3Schema = hallObjectSchema.omit({ name: true, description: true, deposit: true, price: true }).extend({annotation:limitedText(120).optional()});
const geometryObject=hallGeometryObjectV3Schema;
const hallTariff = saleRow.omit({ capacity: true }).extend({color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()});
export const draftHallV3Schema = z.object({
  version: z.literal(3), room: z.object({ widthM: z.number().positive().max(200), heightM: z.number().positive().max(200) }).strict(),
  objects: z.array(geometryObject).max(3000), tariffs: z.array(hallTariff).max(100),
}).strict().superRefine((hall, ctx) => {
  const ids = hall.objects.map(item => item.id), tariffs = hall.tariffs.map(item => item.id);
  if (new Set(ids).size !== ids.length || new Set(tariffs).size !== tariffs.length) ctx.addIssue({ code: "custom", message: "Duplicate hall identifiers" });
  for (const object of hall.objects) {
    if (object.tariffId && !tariffs.includes(object.tariffId)) ctx.addIssue({ code: "custom", message: "Unknown tariff identifier" });
    if (object.parentId && !hall.objects.some(parent => parent.id === object.parentId && parent.type !== "seat")) ctx.addIssue({ code: "custom", message: "Unknown hall parent" });
  }
  const geometry = hallEditorSchema.safeParse({ version: 1, objects: hall.objects.map(({annotation:_annotation,...object}) => ({ ...object, name: "", description: "", deposit: 0, price: null })),
    tariffs: hall.tariffs.map(tariff => ({ id: tariff.id, name: "tariff", color: "#6320ee", price: tariff.amount ?? 0 })) });
  if (!geometry.success) for (const issue of geometry.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export const eventCreationDraftSchema = z.object({
  version: z.literal(2), sourceLocale: eventLocaleSchema, selectedMode: eventSaleModeSchema.nullable(), currency: z.string().regex(/^[A-Z]{3}$/),
  step: z.enum(["tickets", "details"]), content: localized(eventContentV2Schema),
  metadata: localized(z.record(z.string().max(200), translationFieldMetadataSchema)),
  classification: z.object({ category: z.enum(EVENT_CATEGORIES).nullable(), countryCode: z.enum(COUNTRY_CODES).nullable(), city: limitedText(80), ageRestriction: z.union(EVENT_AGE_RESTRICTIONS.map(value => z.literal(value)) as [z.ZodLiteral<0>, ...z.ZodLiteral<number>[]]).nullable() }).strict(),
  coordinates: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().nullable(),
  schedule: draftScheduleSchema, refundsAvailable: z.boolean().nullable(),
  free: saleRow, paidGeneral: z.array(saleRow).max(100), paidSeated: draftHallV3Schema.nullable(),
  media: z.object({ slots: z.array(uuid.nullable()).length(5), cardAssetId: uuid.nullable(), backgroundAssetId: uuid.nullable(), crops: mediaCropsSchema, assetCrops: z.record(uuid, cropSchema).default({}), captions: z.record(uuid, localized(limitedText(160))) }).strict(),
}).strict().superRefine((draft, ctx) => {
  const saleIds=[draft.free.id,...draft.paidGeneral.map(row=>row.id),...(draft.paidSeated?.tariffs.map(row=>row.id)??[])];
  if(new Set(saleIds).size!==saleIds.length)ctx.addIssue({code:"custom",message:"Sale identifiers must be unique across draft modes"});
  const slots = draft.media.slots.filter(id => id !== null);
  if (new Set(slots).size !== slots.length) ctx.addIssue({ code: "custom", path: ["media", "slots"], message: "Each upload occupies one slot" });
  if (new Set(draft.paidGeneral.map(row => row.id)).size !== draft.paidGeneral.length) ctx.addIssue({ code: "custom", path: ["paidGeneral"], message: "Duplicate ticket identifiers" });
  for (const role of ["cardAssetId", "backgroundAssetId"] as const) if (draft.media[role] && !slots.includes(draft.media[role]!)) ctx.addIssue({ code: "custom", path: ["media", role], message: "Role must reference a saved slot" });
  if (Object.keys(draft.media.captions).some(id => !slots.includes(id))) ctx.addIssue({ code: "custom", path: ["media", "captions"], message: "Caption must reference a saved slot" });
  if (Object.keys(draft.media.assetCrops).some(id => !slots.includes(id))) ctx.addIssue({ code: "custom", path: ["media", "assetCrops"], message: "Crop must reference a saved slot" });
});
export type EventCreationDraftV2 = z.infer<typeof eventCreationDraftSchema>;
export function newEventCreationDraft(freeTicketId: string, sourceLocale: EventLocale = "ru"): EventCreationDraftV2 {
  return eventCreationDraftSchema.parse({ version: 2, sourceLocale, selectedMode: null, currency: "KZT", step: "tickets", content: {}, metadata: {},
    classification: { category: null, countryCode: null, city: "", ageRestriction: null }, coordinates: null,
    schedule: { startLocal: null, endLocal: null, timezone: "Asia/Almaty", startChoice: null, endChoice: null }, refundsAvailable: null,
    free: { id: freeTicketId, active: true, amount: 0, capacity: null, content: {} }, paidGeneral: [], paidSeated: null,
    media: { slots: [null, null, null, null, null], cardAssetId: null, backgroundAssetId: null,
      crops: { card: DEFAULT_MEDIA_CROP, featured: DEFAULT_MEDIA_CROP, backgroundDesktop: DEFAULT_MEDIA_CROP, backgroundMobile: DEFAULT_MEDIA_CROP }, captions: {} } });
}
export interface PublishAssetV2 { id: string; draftId: string; kind: "image" | "video"; state: "uploading" | "processing" | "ready" | "failed"; bytes: number; width: number | null; height: number | null; durationSeconds: number | null }
export interface PublishValidationContext { draftId: string; currencies: readonly CurrencyCapability[]; assets: readonly PublishAssetV2[]; limits?: { imageBytes: number; videoBytes: number; videoSeconds: number; draftBytes: number } }
export function selectedSaleRows(draft: EventCreationDraftV2) {
  if (draft.selectedMode === "free") return [draft.free];
  if (draft.selectedMode === "paid_general") return draft.paidGeneral.filter(row => row.active);
  const tariffIds = new Set(draft.paidSeated?.objects.filter(object => !object.locked && (object.type==="seat" || (object.type==="zone" && object.capacity>0))).flatMap(object => {
    const parent = draft.paidSeated?.objects.find(parent => parent.id === object.parentId);
    const wholeTable=parent?.type.startsWith("table_")&&parent.saleMode==="whole_table";
    const id = wholeTable?parent?.tariffId:object.tariffId ?? parent?.tariffId;
    return id ? [id] : [];
  }));
  return draft.paidSeated?.tariffs.filter(row => row.active && tariffIds.has(row.id)) ?? [];
}
export function localeComplete(draft: EventCreationDraftV2, locale: EventLocale): boolean {
  const fields = ["title", "description", "address"] as const;
  if (fields.some(field => !draft.content[locale]?.[field]?.trim() || draft.metadata[locale]?.[field]?.stale)) return false;
  if (draft.refundsAvailable && draft.selectedMode !== "free" && (!draft.content[locale]?.refundConditions?.trim() || draft.metadata[locale]?.refundConditions?.stale)) return false;
  return selectedSaleRows(draft).every(row => !!row.content[locale]?.name?.trim() && !draft.metadata[locale]?.[`sale.${row.id}.name`]?.stale);
}
export function selectContentLocale(draft: EventCreationDraftV2, requested: EventLocale) {
  const locale = localeComplete(draft, requested) ? requested : draft.sourceLocale;
  return { locale, fallback: locale !== requested, complete: localeComplete(draft, locale) };
}
export function publishReadyDraftSchema(context: PublishValidationContext) {
  return eventCreationDraftSchema.superRefine((draft, ctx) => {
    const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, message: code });
    if (!draft.selectedMode) issue(["selectedMode"], "SALE_MODE_REQUIRED");
    if (!context.currencies.some(currency => currency.code === draft.currency)) issue(["currency"], "CURRENCY_UNSUPPORTED");
    if (!localeComplete(draft, draft.sourceLocale)) issue(["content", draft.sourceLocale], "SOURCE_LOCALE_INCOMPLETE");
    for (const field of ["category", "countryCode", "ageRestriction"] as const) if (draft.classification[field] === null) issue(["classification", field], "CLASSIFICATION_REQUIRED");
    if (!draft.classification.city.trim()) issue(["classification", "city"], "CITY_REQUIRED");
    if (draft.selectedMode!=="free" && draft.refundsAvailable === null) issue(["refundsAvailable"], "REFUND_CHOICE_REQUIRED");
    try { resolveSchedule(draft.schedule); } catch (error) { issue(["schedule"], (error as Error).message); }
    const rows = selectedSaleRows(draft);
    if (!rows.length) issue(["selectedMode"], "SALE_RESOURCE_REQUIRED");
    if (draft.selectedMode === "paid_seated" && !draft.paidSeated?.objects.some(object => !object.locked && (object.type === "seat" || (object.type === "zone" && object.capacity > 0)))) issue(["paidSeated"], "HALL_CAPACITY_REQUIRED");
    if (draft.selectedMode === "paid_seated") for (const object of draft.paidSeated?.objects ?? []) {
      if (!["seat", "zone"].includes(object.type) || object.locked) continue;
      const parent = draft.paidSeated?.objects.find(parent => parent.id === object.parentId);
      const tariffId = object.tariffId ?? parent?.tariffId;
      if (!tariffId || !rows.some(row => row.id === tariffId)) issue(["paidSeated", object.id], "HALL_TARIFF_REQUIRED");
      if (object.type === "zone" && object.capacity <= 0) issue(["paidSeated", object.id], "CAPACITY_REQUIRED");
    }
    if (draft.selectedMode === "free" && !draft.free.active) issue(["free", "active"], "FREE_RESOURCE_INACTIVE");
    if (draft.selectedMode === "free" && draft.free.amount !== 0) issue(["free", "amount"], "FREE_PRICE_MUST_BE_ZERO");
    if (draft.selectedMode && draft.selectedMode !== "free" && !rows.some(row => row.amount !== null && row.amount > 0)) issue(["sale"], "POSITIVE_PRICE_REQUIRED");
    for (const row of rows) {
      if ("capacity" in row && row.capacity === null) issue(["sale", row.id, "capacity"], "CAPACITY_REQUIRED");
      if (row.amount === null) issue(["sale", row.id, "amount"], "PRICE_REQUIRED");
    }
    if (!draft.media.cardAssetId) issue(["media", "cardAssetId"], "CARD_IMAGE_REQUIRED");
    if (!draft.media.backgroundAssetId) issue(["media", "backgroundAssetId"], "BACKGROUND_REQUIRED");
    const limits = context.limits ?? DEFAULT_DRAFT_MEDIA_LIMITS;
    let bytes = 0;
    for (const id of draft.media.slots.filter(id => id !== null)) {
      const asset = context.assets.find(item => item.id === id);
      if (!asset || asset.draftId !== context.draftId) { issue(["media", id], "MEDIA_OWNER_MISMATCH"); continue; }
      bytes += asset.bytes;
      if (asset.state !== "ready") issue(["media", id], "MEDIA_NOT_READY");
      if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > (asset.kind === "image" ? limits.imageBytes : limits.videoBytes)) issue(["media", id], "MEDIA_SIZE_INVALID");
      if (!asset.width || !asset.height || !Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) || asset.width <= 0 || asset.height <= 0) issue(["media", id], "MEDIA_DIMENSIONS_INVALID");
      if (asset.kind === "video" && (!asset.durationSeconds || asset.durationSeconds <= 0 || asset.durationSeconds > limits.videoSeconds || !Number.isFinite(asset.durationSeconds))) issue(["media", id], "MEDIA_DURATION_INVALID");
      if (id === draft.media.cardAssetId && asset.kind !== "image") issue(["media", "cardAssetId"], "CARD_MUST_BE_IMAGE");
    }
    if (bytes > limits.draftBytes) issue(["media"], "DRAFT_MEDIA_QUOTA_EXCEEDED");
  }).transform(draft => ({ ...draft, resolvedSchedule: resolveSchedule(draft.schedule) }));
}
export type PublishReadyDraftV2 = z.infer<ReturnType<typeof publishReadyDraftSchema>>;

const snapshotItem = z.object({ resourceId: uuid, kind: z.enum(["ticket", "seat", "table"]), name: z.string(), quantity: z.number().int().positive(), unitAmount: minorAmountSchema }).strict();
export const purchaseSnapshotV2Schema = z.object({
  version: z.literal(2), eventId: uuid, sourceLocale: eventLocaleSchema, contentLocale: eventLocaleSchema,
  title: z.string(), venueName: z.string().optional(), address: z.string(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime().nullable(), timezone: z.string(),
  saleMode: eventSaleModeSchema, amount: minorAmountSchema, currency: z.string().regex(/^[A-Z]{3}$/), acceptedAt: z.iso.datetime(),
  refund: z.object({ available: z.boolean(), conditions: z.string().nullable(), revision: z.number().int().positive(), locale: eventLocaleSchema, freeCancellation: z.boolean() }).strict(),
  items: z.array(snapshotItem).min(1),
  selection:z.object({kind:z.enum(["ticket","table","cart"]),seatIds:z.array(uuid).optional(),seatLabels:z.array(z.string()).optional(),groupPass:z.boolean().optional()}).strict().optional(),
}).strict().superRefine((snapshot, ctx) => {
  try {
    if (checkedOrderTotal(snapshot.items.map(item => ({ unitAmount: item.unitAmount, quantity: item.quantity, currency: snapshot.currency })), snapshot.currency) !== snapshot.amount) ctx.addIssue({ code: "custom", path: ["amount"], message: "SNAPSHOT_TOTAL_MISMATCH" });
  } catch { ctx.addIssue({ code: "custom", path: ["amount"], message: "MONEY_TOTAL_OVERFLOW" }); }
  if (snapshot.saleMode === "free" && (snapshot.amount !== 0 || !snapshot.refund.freeCancellation)) ctx.addIssue({ code: "custom", message: "FREE_SNAPSHOT_INVALID" });
  if (snapshot.refund.available && snapshot.saleMode !== "free" && !snapshot.refund.conditions?.trim()) ctx.addIssue({ code: "custom", message: "REFUND_CONDITIONS_REQUIRED" });
});
export type PurchaseSnapshotV2=z.infer<typeof purchaseSnapshotV2Schema>;
export const refundSnapshotV2Schema = z.object({ version: z.literal(2), orderId: uuid, paymentId: uuid.nullable(), amount: minorAmountSchema, currency: z.string().regex(/^[A-Z]{3}$/), acceptedPolicyRevision: z.number().int().positive(), reason: z.string(), exceptional: z.boolean() }).strict();
export function parseHistoricalPurchaseSnapshot(value: unknown): { version: 2; snapshot: z.infer<typeof purchaseSnapshotV2Schema> } | { version: 1; raw: unknown } {
  if (value && typeof value === "object" && "version" in value) {
    if (value.version !== 2) throw new RangeError("SNAPSHOT_VERSION_UNSUPPORTED");
    return { version: 2, snapshot: purchaseSnapshotV2Schema.parse(value) };
  }
  // Preserve missing/partial/deposit legacy JSON exactly; never fabricate new accepted terms.
  return { version: 1, raw: value };
}
