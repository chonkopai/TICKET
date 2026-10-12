import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { refreshSession } from "./api";
import { clearSession, getSession, saveSession, type BrowserSession } from "./session";

const fixture = (): BrowserSession => ({ user: { id: "test-user", role: "guest", name: "Test", email: null, phone: null, photoUrl: null, defaultCity: null, telegramId: null, telegramChatId: null }, tokens: { accessToken: "test-access", refreshToken: "test-refresh", accessExpiresInSeconds: 60, refreshExpiresInSeconds: 3600 } });
const renewed = { ...fixture().tokens, accessToken: "test-next-access", refreshToken: "test-next-refresh" };
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
beforeEach(() => {
  const shared = new Map<string, string>(), events = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "?lang=en" }, localStorage: { getItem: (key: string) => shared.get(key) ?? null, setItem: (key: string, value: string) => shared.set(key, value) }, sessionStorage: { getItem: () => null, removeItem: () => undefined }, dispatchEvent: events.dispatchEvent.bind(events) } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: async (_name: string, run: () => unknown) => run() } } });
  saveSession(fixture());
});
afterEach(() => { mock.restoreAll(); Reflect.deleteProperty(globalThis, "window"); if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else Reflect.deleteProperty(globalThis, "navigator"); });
const json = (tokens: unknown, status = 200) => new Response(JSON.stringify({ tokens }), { status, headers: { "content-type": "application/json" } });

test("concurrent requests within a tab rotate the shared session only once", async () => {
  const request = mock.method(globalThis, "fetch", async () => json(renewed));
  const results = await Promise.all([refreshSession(fixture()), refreshSession(fixture())]);
  assert.equal(request.mock.callCount(), 1); assert.deepEqual(results, [renewed, renewed]); assert.deepEqual(getSession()?.tokens, renewed);
});
test("a tab waiting for the browser lock reuses another tab's newly rotated tokens", async () => {
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: async (name: string, run: () => unknown) => { assert.equal(name, "event-platform:session-refresh"); await waiting; return run(); } } } });
  const request = mock.method(globalThis, "fetch", async () => { throw new Error("Must not rotate twice"); });
  const pending = refreshSession(fixture()); saveSession({ ...fixture(), tokens: renewed }); release();
  assert.deepEqual(await pending, renewed); assert.equal(request.mock.callCount(), 0);
});
test("a stale failed response does not sign out a session refreshed by another tab", async () => {
  mock.method(globalThis, "fetch", async () => { saveSession({ ...fixture(), tokens: renewed }); return json(null, 401); });
  assert.deepEqual(await refreshSession(fixture()), renewed); assert.deepEqual(getSession()?.tokens, renewed);
});
test("signing out during renewal cannot restore the logged-out session", async () => {
  mock.method(globalThis, "fetch", async () => { clearSession(); return json(renewed); });
  await assert.rejects(refreshSession(fixture()), /session ended/i); assert.equal(getSession(), null);
});
test("a rejected current refresh signs out all tabs while an account change is retained", async () => {
  mock.method(globalThis, "fetch", async () => json(null, 401));
  await assert.rejects(refreshSession(fixture()), /session ended/i); assert.equal(getSession(), null);
  saveSession({ ...fixture(), user: { ...fixture().user, id: "other-user" } });
  await assert.rejects(refreshSession(fixture()), /session ended/i); assert.equal(getSession()?.user.id, "other-user");
});
