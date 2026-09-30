import { localeFromBrowser } from "../../lib/locale";
import { QUICK_COPY, QUICK_EXTRA } from "../../lib/quick-copy";

export async function quickRequest<T>(path: string, token?: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(`/api/quick/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", referrerPolicy: "no-referrer",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null;
    if (["SEAT_UNAVAILABLE", "SEAT_SALES_WINDOW_CLOSED", "INSUFFICIENT_INVENTORY", "TABLE_UNAVAILABLE"].includes(body?.code ?? "")) {
      throw new Error(QUICK_EXTRA[localeFromBrowser()].seatSelectionChanged);
    }
    throw new Error(QUICK_COPY[localeFromBrowser()].error);
  }
  return response.json() as Promise<T>;
}
