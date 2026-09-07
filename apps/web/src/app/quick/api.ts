import { quickRu } from "@event-platform/shared-types";

export async function quickRequest<T>(path: string, token?: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(`/api/quick/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", referrerPolicy: "no-referrer",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(quickRu.error);
  return response.json() as Promise<T>;
}
