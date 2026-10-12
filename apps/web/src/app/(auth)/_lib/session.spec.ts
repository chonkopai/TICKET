import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { BrowserSession } from "./session";
import { clearSession, getSession, saveSession, subscribeSession, updateSessionUser } from "./session";

const key = "event-platform:session";
const fixture = (): BrowserSession => ({ user: { id: "test-user", role: "guest", name: "Test", email: null, phone: null, photoUrl: null, defaultCity: null, telegramId: null, telegramChatId: null }, tokens: { accessToken: "test-access", refreshToken: "test-refresh", accessExpiresInSeconds: 60, refreshExpiresInSeconds: 3600 } });
let shared: Map<string, string>;
let legacy: Map<string, string>;
let events: EventTarget;
const storage = (values: Map<string, string>) => ({ getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value); }, removeItem: (name: string) => { values.delete(name); } });
beforeEach(() => {
  shared = new Map(); legacy = new Map(); events = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage(shared), sessionStorage: storage(legacy), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) } });
});
afterEach(() => { Reflect.deleteProperty(globalThis, "window"); });

test("an existing tab login migrates and is available with empty storage in a new tab", () => {
  legacy.set(key, JSON.stringify(fixture()));
  assert.deepEqual(getSession(), fixture()); assert.equal(legacy.has(key), false);
  Object.defineProperty(window, "sessionStorage", { value: storage(new Map()) });
  assert.deepEqual(getSession(), fixture());
});
test("sign-out prevents stale legacy tabs from restoring the old login", () => {
  saveSession(fixture()); clearSession(); legacy.set(key, JSON.stringify(fixture()));
  assert.equal(getSession(), null); assert.equal(shared.get(key), "null"); assert.equal(legacy.has(key), false);
});
test("user updates retain shared tokens and notify the current tab", () => {
  let count = 0; const unsubscribe = subscribeSession(() => count++);
  saveSession(fixture()); updateSessionUser({ ...fixture().user, role: "organizer" });
  assert.equal(getSession()?.user.role, "organizer"); assert.deepEqual(getSession()?.tokens, fixture().tokens); assert.equal(count, 2);
  unsubscribe(); clearSession(); assert.equal(count, 2);
});
test("subscribers react to cross-tab sign-in, sign-out and storage clearing", () => {
  const states: Array<string | null> = []; const unsubscribe = subscribeSession(() => states.push(getSession()?.user.id ?? null));
  const changed = (name: string | null) => { const event = new Event("storage"); Object.defineProperty(event, "key", { value: name }); events.dispatchEvent(event); };
  shared.set(key, JSON.stringify(fixture())); changed(key); changed("unrelated");
  shared.set(key, "null"); changed(key); shared.clear(); changed(null);
  assert.deepEqual(states, ["test-user", null, null]); unsubscribe();
});
test("malformed shared sessions never fall back to a stale legacy login", () => {
  for (const value of ["{broken", "{}", '{"user":null}', '{"tokens":{}}']) {
    shared.set(key, value); legacy.set(key, JSON.stringify(fixture())); assert.equal(getSession(), null); assert.equal(legacy.has(key), false);
  }
});
test("restricted shared storage retains the existing tab session", () => {
  Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  legacy.set(key, JSON.stringify(fixture())); assert.deepEqual(getSession(), fixture());
  saveSession(fixture()); assert.deepEqual(getSession(), fixture()); clearSession(); assert.equal(getSession(), null);
});
