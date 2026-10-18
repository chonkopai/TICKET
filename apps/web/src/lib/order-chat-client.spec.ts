import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { apiRequest } from "../app/(auth)/_lib/api";
import { saveSession } from "../app/(auth)/_lib/session";
import { orderChatClient } from "./order-chat-client";

const eventId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const requestKey = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { search: "?lang=en" },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    sessionStorage: { getItem: () => null, removeItem: () => undefined },
    dispatchEvent: () => true,
  } });
  saveSession({ user: { id: "chat-user", role: "guest", name: "Test", email: null, phone: null, photoUrl: null, defaultCity: null, telegramId: null, telegramChatId: null }, tokens: { accessToken: "test-access", refreshToken: "test-refresh", accessExpiresInSeconds: 60, refreshExpiresInSeconds: 3600 } });
});
afterEach(() => { mock.restoreAll(); Reflect.deleteProperty(globalThis, "window"); });

for (const [mode, prefix, token] of [
  ["guest", "/me", "test-access"],
  ["organizer", "/api/organizer", "test-access"],
  ["anonymous", "/api/quick", "test-anonymous-access"],
] as const) {
  test(`${mode} can load, send and mark messages read through the deployed proxy routes`, async () => {
    const calls: { path: string; method: string; authorization: string | null; body: unknown; cache: RequestCache | undefined }[] = [];
    mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ path: new URL(String(input), "https://staging.ticketron.live").pathname + new URL(String(input), "https://staging.ticketron.live").search,
        method: init?.method ?? "GET", authorization: new Headers(init?.headers).get("authorization"),
        body: init?.body ? JSON.parse(String(init.body)) : null, cache: init?.cache });
      return new Response(JSON.stringify({ items: [], nextCursor: null }), { headers: { "content-type": "application/json" } });
    });
    const client = orderChatClient(eventId, orderId, mode, token);
    await client.list();
    await client.list(requestKey);
    await client.send("Where is the entrance?", requestKey);
    await client.read();
    const path = `${prefix}/events/${eventId}/orders/${orderId}/chat`;
    assert.deepEqual(calls.map(call => [call.path, call.method]), [
      [path, "GET"], [`${path}?before=${requestKey}`, "GET"], [path, "POST"], [`${path}/read`, "POST"],
    ]);
    assert.ok(calls.every(call => call.authorization === `Bearer ${token}`));
    assert.equal(calls[0]?.cache, "no-store");
    assert.deepEqual(calls[2]?.body, { text: "Where is the entrance?", requestKey });
  });
}

for (const body of ["", "null"]) {
  test(`an order without a refund request accepts ${body ? "JSON null" : "an empty successful response"}`, async () => {
    mock.method(globalThis, "fetch", async () => new Response(body, { status: 200 }));
    assert.equal(await apiRequest(`/api/organizer/events/${eventId}/orders/${orderId}/refund`), null);
  });
}

test("a malformed nonempty response still reports a failure", async () => {
  mock.method(globalThis, "fetch", async () => new Response("invalid", { status: 200 }));
  await assert.rejects(apiRequest(`/api/organizer/events/${eventId}/orders/${orderId}/refund`), SyntaxError);
});
