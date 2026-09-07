import { ru, type RefreshResponse } from "@event-platform/shared-types";

import { clearSession, getSession, saveSession } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  if (!session) throw new Error(ru.auth.sessionRequired);

  let response = await send(path, session.tokens.accessToken, init);
  if (response.status === 401) {
    const refresh = await fetch(new URL("/auth/refresh", API_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
    });
    if (!refresh.ok) {
      clearSession();
      throw new Error(ru.auth.sessionExpired);
    }

    const { tokens } = (await refresh.json()) as RefreshResponse;
    saveSession({ ...session, tokens });
    response = await send(path, tokens.accessToken, init);
  }

  if (!response.ok) throw new Error(await errorMessage(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlobRequest(path: string, init: RequestInit = {}): Promise<Blob> {
  const session = getSession();
  if (!session) throw new Error(ru.auth.sessionRequired);

  let response = await send(path, session.tokens.accessToken, init);
  if (response.status === 401) {
    const refresh = await fetch(new URL("/auth/refresh", API_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
    });
    if (!refresh.ok) {
      clearSession();
      throw new Error(ru.auth.sessionExpired);
    }
    const { tokens } = (await refresh.json()) as RefreshResponse;
    saveSession({ ...session, tokens });
    response = await send(path, tokens.accessToken, init);
  }

  if (!response.ok) throw new Error(await errorMessage(response));
  return response.blob();
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
      return `${ru.events.errors.publishMissing}: ${fields.join(", ")}.`;
    }
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
  switch (code) {
    case "VENUE_LAYOUT_NOT_FOUND":
    case "TABLE_NOT_FOUND":
      return ru.venue.errors.notFound;
    case "TABLE_NUMBER_CONFLICT":
      return ru.venue.errors.duplicateNumber;
    case "TABLE_STATE_LOCKED":
      return ru.venue.errors.stateLocked;
    case "TABLE_HAS_HISTORY":
    case "VENUE_LAYOUT_HAS_HISTORY":
      return ru.venue.errors.hasHistory;
    case "VENUE_LAYOUT_INVALID":
    case "VENUE_LAYOUT_TABLE_IDS_INVALID":
      return ru.venue.errors.invalidLayout;
    default:
      return null;
  }
}

function ticketTypeError(code: string | undefined): string | null {
  switch (code) {
    case "TICKET_TYPE_NOT_FOUND":
      return ru.ticketTypes.errors.notFound;
    case "TICKET_TYPE_INVENTORY_CONFLICT":
      return ru.ticketTypes.errors.inventoryConflict;
    case "TICKET_TYPE_HAS_ACTIVITY":
      return ru.ticketTypes.errors.hasActivity;
    case "TICKET_TYPE_SALES_WINDOW_INVALID":
      return ru.ticketTypes.errors.salesWindowInvalid;
    case "TICKET_TYPE_NAME_CONFLICT":
      return ru.ticketTypes.errors.duplicateName;
    case "TICKET_TYPE_UPDATE_EMPTY":
      return ru.ticketTypes.errors.updateEmpty;
    default:
      return null;
  }
}

function eventFieldName(field: string): string {
  return field in ru.events.fields
    ? ru.events.fields[field as keyof typeof ru.events.fields]
    : field;
}

function eventError(code: string | undefined): string | null {
  switch (code) {
    case "EVENT_NOT_FOUND":
      return ru.events.errors.notFound;
    case "EVENT_INVALID_TRANSITION":
      return ru.events.errors.invalidTransition;
    case "EVENT_DELETE_NOT_ALLOWED":
      return ru.events.errors.deleteNotAllowed;
    case "EVENT_POSTER_CONFLICT":
      return ru.events.errors.posterConflict;
    case "POSTER_REQUIRED":
      return ru.events.errors.posterRequired;
    case "POSTER_TOO_LARGE":
      return ru.events.errors.posterTooLarge;
    case "POSTER_TYPE_INVALID":
      return ru.events.errors.posterTypeInvalid;
    case "EVENT_UPDATE_EMPTY":
      return ru.events.errors.updateEmpty;
    case "EVENT_DATE_INVALID":
      return ru.events.errors.dateInvalid;
    case "EVENT_TIME_INVALID":
      return ru.events.errors.timeInvalid;
    case "EVENT_TIMEZONE_INVALID":
      return ru.events.errors.timezoneInvalid;
    default:
      return null;
  }
}
