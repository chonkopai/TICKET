import { ru, type RefreshResponse } from "@event-platform/shared-types";

import { clearSession, getSession, saveSession, type BrowserSession } from "./session";
import { authErrorMessage } from "./public-auth";
import { localeFromBrowser } from "../../../lib/locale";
import { EVENTS_COPY } from "../../../lib/events-copy";
import { TICKET_TYPES_COPY } from "../../../lib/ticket-types-copy";

const SESSION_COPY = {
  ru: { required: "Сначала войдите в аккаунт.", expired: "Сессия завершилась. Войдите снова.", logout: "Серверную сессию не удалось закрыть. Вход на этом устройстве завершён." },
  kk: { required: "Алдымен аккаунтқа кіріңіз.", expired: "Сеанс аяқталды. Қайта кіріңіз.", logout: "Сервердегі сеансты жабу мүмкін болмады. Бұл құрылғыдағы кіру аяқталды." },
  en: { required: "Sign in to your account first.", expired: "Your session ended. Sign in again.", logout: "The server session could not be closed. You have been signed out on this device." },
} as const;
const VENUE_ERRORS = {
  ru: ru.venue.errors,
  kk: { notFound: "Зал сызбасы немесе үстел табылмады.", duplicateNumber: "Мұндай нөмірі бар үстел бар.", stateLocked: "Үстел брондалған немесе резервте, оны өзгерту мүмкін емес.", hasHistory: "Резерв немесе бронь тарихы бар нысанды жоюға болмайды.", invalidLayout: "Сызба өлшемдерін және үстелдердің орнын тексеріңіз.", duplicateRowNumber: "Мұндай нөмірі бар қатар бар.", duplicateSeatNumber: "Бұл үстелде немесе қатарда мұндай нөмірі бар орын бар.", structureLocked: "Жарияланғаннан кейін орын нөмірлері мен құрылымын өзгертуге болмайды.", staleRevision: "Сызба басқа терезеде өзгертілді. Соңғы нұсқасын жүктеңіз.", duplicateNoSpace: "Көшірме үшін орын жетпейді. Жоспарда орын босатып, қайталаңыз." },
  en: { notFound: "The hall layout or table was not found.", duplicateNumber: "A table with this number already exists.", stateLocked: "This table is held or booked and cannot be changed now.", hasHistory: "An object with hold or booking history cannot be deleted.", invalidLayout: "Check the layout dimensions and table positions.", duplicateRowNumber: "A row with this number already exists.", duplicateSeatNumber: "A seat with this number already exists in this table or row.", structureLocked: "Seat numbering and structure cannot be changed after publication.", staleRevision: "The layout changed in another window. Load the latest version.", duplicateNoSpace: "There is not enough room for a copy. Free up space on the plan and try again." },
} satisfies Record<"ru" | "kk" | "en", Record<keyof typeof ru.venue.errors, string>>;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
let refreshInFlight: Promise<RefreshResponse["tokens"]> | null = null;

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  if (!session) throw new Error(SESSION_COPY[localeFromBrowser()].required);

  let response = await send(path, session.tokens.accessToken, init);
  if (response.status === 401) {
    const tokens = await refreshSession(session);
    response = await send(path, tokens.accessToken, init);
  }

  if (!response.ok) throw new Error(await errorMessage(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlobRequest(path: string, init: RequestInit = {}): Promise<Blob> {
  const session = getSession();
  if (!session) throw new Error(SESSION_COPY[localeFromBrowser()].required);

  let response = await send(path, session.tokens.accessToken, init);
  if (response.status === 401) {
    const tokens = await refreshSession(session);
    response = await send(path, tokens.accessToken, init);
  }

  if (!response.ok) throw new Error(await errorMessage(response));
  return response.blob();
}

export async function logoutSession(): Promise<void> {
  const session = getSession();
  if (!session) return;
  clearSession();
  const response = await fetch(new URL("/auth/logout", API_URL), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
  });
  if (!response.ok) throw new Error(SESSION_COPY[localeFromBrowser()].logout);
}

export async function refreshSession(session: BrowserSession): Promise<RefreshResponse["tokens"]> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(new URL("/auth/refresh", API_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(SESSION_COPY[localeFromBrowser()].expired);
      const { tokens } = (await response.json()) as RefreshResponse;
      const current = getSession();
      if (!current || current.user.id !== session.user.id) throw new Error(SESSION_COPY[localeFromBrowser()].expired);
      if (current.tokens.refreshToken !== session.tokens.refreshToken) return current.tokens;
      saveSession({ ...current, tokens });
      return tokens;
    }).catch((reason: unknown) => {
      if (getSession()?.tokens.refreshToken === session.tokens.refreshToken) clearSession();
      throw reason;
    }).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function send(path: string, accessToken: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  return fetch(new URL(path, API_URL), { ...init, headers });
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      code?: string;
      message?: string | string[];
      details?: { missingFields?: string[] };
    };
    if (body.code === "EVENT_PUBLISH_VALIDATION_FAILED" && body.details?.missingFields) {
      const fields = body.details.missingFields.map(eventFieldName);
      return `${EVENTS_COPY[localeFromBrowser()].errors.publishMissing}: ${fields.join(", ")}.`;
    }
    if(body.code==="REFUND_POLICY_CHANGED"||body.code==="EVENT_PRESENTATION_CHANGED")return ({ru:"Условия изменились. Обновите страницу и примите текущие условия.",en:"The policy changed. Refresh and accept the current terms.",kk:"Шарттар өзгерді. Парақшаны жаңартып, қазіргі шарттарды қабылдаңыз."})[localeFromBrowser()];
    if(body.code==="REFUNDS_NOT_AVAILABLE")return ({ru:"По условиям покупки денежный возврат не предусмотрен.",en:"The accepted purchase policy does not offer monetary refunds.",kk:"Қабылданған сатып алу шарттары бойынша ақшалай қайтарым қарастырылмаған."})[localeFromBrowser()];
    const authLocalized = authErrorMessage(body.code);
    if (authLocalized) return authLocalized;
    const localized = eventError(body.code);
    if (localized) return localized;
    const ticketTypeLocalized = ticketTypeError(body.code);
    if (ticketTypeLocalized) return ticketTypeLocalized;
    const venueLocalized = venueError(body.code);
    if (venueLocalized) return venueLocalized;
    if (Array.isArray(body.message)) return body.message.join(", ");
    return body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function venueError(code: string | undefined): string | null {
  const copy = VENUE_ERRORS[localeFromBrowser()];
  switch (code) {
    case "VENUE_LAYOUT_NOT_FOUND":
    case "TABLE_NOT_FOUND":
      return copy.notFound;
    case "TABLE_NUMBER_CONFLICT":
      return copy.duplicateNumber;
    case "TABLE_STATE_LOCKED":
      return copy.stateLocked;
    case "TABLE_HAS_HISTORY":
    case "VENUE_LAYOUT_HAS_HISTORY":
      return copy.hasHistory;
    case "VENUE_LAYOUT_INVALID":
    case "VENUE_LAYOUT_TABLE_IDS_INVALID":
    case "VENUE_LAYOUT_ROW_IDS_INVALID":
      return copy.invalidLayout;
    case "ROW_NUMBER_EXISTS":
      return copy.duplicateRowNumber;
    case "SEAT_NUMBER_EXISTS":
      return copy.duplicateSeatNumber;
    case "VENUE_STRUCTURE_DRAFT_ONLY":
    case "ROW_EDIT_DRAFT_ONLY":
      return copy.structureLocked;
    case "VENUE_LAYOUT_STALE_REVISION":
      return copy.staleRevision;
    case "VENUE_DUPLICATE_NO_SPACE":
      return copy.duplicateNoSpace;
    default:
      return null;
  }
}

function ticketTypeError(code: string | undefined): string | null {
  switch (code) {
    case "TICKET_TYPE_NOT_FOUND":
      return TICKET_TYPES_COPY[localeFromBrowser()].errors.notFound;
    case "TICKET_TYPE_INVENTORY_CONFLICT":
      return TICKET_TYPES_COPY[localeFromBrowser()].errors.inventoryConflict;
    case "TICKET_TYPE_HAS_ACTIVITY":
      return TICKET_TYPES_COPY[localeFromBrowser()].errors.hasActivity;
    case "TICKET_TYPE_SALES_WINDOW_INVALID":
      return TICKET_TYPES_COPY[localeFromBrowser()].errors.salesWindowInvalid;
    case "TICKET_TYPE_NAME_CONFLICT":
      return TICKET_TYPES_COPY[localeFromBrowser()].errors.duplicateName;
    case "TICKET_TYPE_UPDATE_EMPTY":
      return TICKET_TYPES_COPY[localeFromBrowser()].errors.updateEmpty;
    default:
      return null;
  }
}

function eventFieldName(field: string): string {
  const fields = EVENTS_COPY[localeFromBrowser()].fields;
  return field in fields
    ? fields[field as keyof typeof fields]
    : field;
}

function eventError(code: string | undefined): string | null {
  switch (code) {
    case "EVENT_NOT_FOUND":
      return EVENTS_COPY[localeFromBrowser()].errors.notFound;
    case "EVENT_INVALID_TRANSITION":
      return EVENTS_COPY[localeFromBrowser()].errors.invalidTransition;
    case "EVENT_DELETE_NOT_ALLOWED":
      return EVENTS_COPY[localeFromBrowser()].errors.deleteNotAllowed;
    case "POSTER_REQUIRED":
      return EVENTS_COPY[localeFromBrowser()].errors.posterRequired;
    case "POSTER_TOO_LARGE":
      return EVENTS_COPY[localeFromBrowser()].errors.posterTooLarge;
    case "POSTER_TYPE_INVALID":
      return EVENTS_COPY[localeFromBrowser()].errors.posterTypeInvalid;
    default:
      return null;
  }
}
