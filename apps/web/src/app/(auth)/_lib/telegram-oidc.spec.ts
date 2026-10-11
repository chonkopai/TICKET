import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";
import { beginTelegramLogin, cancelTelegramLogin, completeTelegramLogin, pendingTelegramLogin } from "./telegram-oidc";

let storage: Map<string, string>;
const state = "s".repeat(43);
const result = (overrides: Record<string, unknown> = {}) => ({
  state, expiresAt: new Date(Date.now() + 600000).toISOString(),
  authorizationUrl: `https://oauth.telegram.org/auth?state=${state}`, ...overrides,
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  storage = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin: "https://ticket.example", search: "?lang=en" },
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
  } });
});
afterEach(() => { mock.restoreAll(); Reflect.deleteProperty(globalThis, "window"); });

test("start sends only a proof hash and stores the secret before navigation", async () => {
  let input: Record<string, string> | undefined;
  mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => { input = JSON.parse(String(options?.body)); return json(result()); });
  assert.equal(await beginTelegramLogin("en", "/events/1?ticket=2#buy"), result().authorizationUrl);
  const pending = pendingTelegramLogin()!;
  assert.equal(input!.browserProofHash, createHash("sha256").update(pending.browserProof).digest("hex"));
  assert.equal(input!.browserProof, undefined); assert.equal(input!.returnTo, "/events/1?ticket=2#buy");
  assert.equal(pending.locale, "en");
});

test("successful completion binds the browser and safely clears transient credentials", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => json(result()));
  await beginTelegramLogin("en", "/events/1"); const browserProof = pendingTelegramLogin()!.browserProof;
  fetch.mock.mockImplementation(async (_url, options) => {
    assert.deepEqual(JSON.parse(String(options?.body)), { state, code: "provider-code", browserProof });
    return json({ session: { user: { id: "same-user" }, tokens: { accessToken: "session" } }, returnTo: "/events/1?lang=en#buy" });
  });
  const completed = await completeTelegramLogin(`?state=${state}&code=provider-code`);
  assert.equal(completed.returnTo, "/events/1?lang=en#buy"); assert.equal(pendingTelegramLogin(), null);
  assert.equal(storage.size, 0);
});

test("missing proof, duplicate state, and a different browser cannot exchange a code", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => json(result()));
  await assert.rejects(completeTelegramLogin(`?state=${state}&code=code`), /browser/i);
  await beginTelegramLogin("en", "/");
  await assert.rejects(completeTelegramLogin(`?state=${state}&state=${state}&code=code`), /browser/i);
  await assert.rejects(completeTelegramLogin(`?state=${"x".repeat(43)}&code=code`), /browser/i);
  assert.equal(fetch.mock.callCount(), 1);
});

test("user denial is cancellation and offers a fresh attempt", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => json(result()));
  await beginTelegramLogin("en", "/");
  await assert.rejects(completeTelegramLogin(`?state=${state}&error=access_denied`), /canceled/);
  assert.equal(fetch.mock.callCount(), 1); assert.equal(storage.size, 0);
});

test("provider failure clears proof and preserves a localized phone fallback error", async () => {
  mock.method(globalThis, "fetch", async () => json({ code: "TELEGRAM_UNAVAILABLE" }, 503));
  await assert.rejects(beginTelegramLogin("en", "/"), /phone-number/);
  assert.equal(storage.size, 0);
});

test("canceling an in-flight start prevents its late result from navigating", async () => {
  let resolve!: (response: Response) => void;
  mock.method(globalThis, "fetch", () => new Promise<Response>(done => { resolve = done; }));
  const start = beginTelegramLogin("en", "/");
  while (!resolve) await new Promise(done => setImmediate(done));
  cancelTelegramLogin(); resolve(json(result()));
  assert.equal(await start, null); assert.equal(storage.size, 0);
});

test("a stale completion cannot replace a newer login attempt", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => json(result()));
  await beginTelegramLogin("en", "/");
  let resolve!: (response: Response) => void;
  fetch.mock.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  const complete = completeTelegramLogin(`?state=${state}&code=code`);
  cancelTelegramLogin(); resolve(json({ session: {}, returnTo: "/" }));
  await assert.rejects(complete, /invalid|expired/);
});

test("unsafe provider URLs are rejected before redirect", async () => {
  mock.method(globalThis, "fetch", async () => json(result({ authorizationUrl: `https://evil.example/auth?state=${state}` })));
  await assert.rejects(beginTelegramLogin("en", "/"), /invalid/);
});

test("missing browser storage never enables an unbound login", async () => {
  Object.defineProperty(window, "sessionStorage", { get() { throw new Error("storage blocked"); } });
  const fetch = mock.method(globalThis, "fetch", async () => json(result()));
  assert.doesNotThrow(cancelTelegramLogin);
  await assert.rejects(beginTelegramLogin("en", "/"), /storage blocked/);
  assert.equal(fetch.mock.callCount(), 0);
});
