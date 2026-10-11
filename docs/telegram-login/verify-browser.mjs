import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Mocked provider acceptance, never real Telegram approval or live account credentials.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TELEGRAM_TEST_URL || "http://localhost:3000";
const output = resolve(process.env.TELEGRAM_TEST_OUTPUT || "/private/tmp/ticket-telegram-browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(20000);
const errors = []; const assertions = []; const attempts = new Map();
let mode = "disabled"; let sequence = 0; let completions = 0; let starts = 0; let fallbackLogins = 0;
const session = { user: { id: "telegram-browser-test", telegramId: "42", telegramChatId: null, role: "guest", name: "Telegram Test", photoUrl: null, phone: null, email: null, defaultCity: null }, tokens: { accessToken: "mock-access", refreshToken: "mock-refresh", accessExpiresInSeconds: 900, refreshExpiresInSeconds: 2592000 } };
page.on("pageerror", error => errors.push(error.message));
await context.route("**/*", async route => {
  const request = route.request(); const url = new URL(request.url());
  const headers = { "access-control-allow-origin": request.headers().origin || "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization" };
  const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(data) });
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
  if (url.pathname === "/js/telegram-widget.js") return route.fulfill({ contentType: "text/javascript", body: `(() => { const target = document.currentScript; const callback = target.dataset.onauth; const button = document.createElement('button'); button.textContent = 'Mock Telegram phone sign-in'; button.onclick = () => new Function('user', callback)({id:42,first_name:'Telegram Test',auth_date:1,hash:'mock'}); target.after(button); })();` });
  if (url.pathname === "/auth/telegram/widget") { fallbackLogins++; return json(session); }
  if (url.pathname === "/auth/telegram/oidc/start") {
    starts++;
    if (mode === "disabled") return json({ code: "TELEGRAM_UNAVAILABLE" }, 503);
    const input = request.postDataJSON();
    assert.match(input.browserProofHash, /^[a-f0-9]{64}$/); assert.equal(input.browserProof, undefined);
    const state = `${++sequence}`.padStart(43, "s"); attempts.set(state, input);
    return json({ state, authorizationUrl: `https://oauth.telegram.org/auth?state=${state}`, expiresAt: new Date(Date.now() + 600000).toISOString() });
  }
  if (url.origin === "https://oauth.telegram.org" && url.pathname === "/auth") {
    const callback = new URL("/login/telegram/callback", base);
    callback.searchParams.set("state", url.searchParams.get("state"));
    if (mode === "canceled") callback.searchParams.set("error", "access_denied");
    else callback.searchParams.set("code", "mock-code");
    return route.fulfill({ contentType: "text/html", body: `<script>location.replace(${JSON.stringify(callback.toString())})</script>` });
  }
  if (url.pathname === "/auth/telegram/oidc/complete") {
    completions++;
    const input = request.postDataJSON(); const attempt = attempts.get(input.state);
    assert.equal(createHash("sha256").update(input.browserProof).digest("hex"), attempt.browserProofHash);
    assert.equal(input.code, "mock-code");
    const destination = new URL(attempt.returnTo, base); destination.searchParams.set("lang", attempt.locale);
    return json({ session, returnTo: destination.pathname + destination.search + destination.hash });
  }
  if (url.pathname === "/me") return json(session.user);
  if (url.pathname.startsWith("/me/")) return json([]);
  return route.continue();
});
const login = (locale = "en") => `${base}/login?lang=${locale}&returnTo=${encodeURIComponent("/favorites#tickets")}`;
try {
  await page.goto(login(), { waitUntil: "networkidle" });
  await page.screenshot({ path: `${output}/desktop-login.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue with Telegram", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "phone-number" }).waitFor();
  const abandonedCallback = await page.locator("script[data-telegram-login]").getAttribute("data-onauth");
  await page.getByRole("button", { name: "Mock Telegram phone sign-in" }).click();
  await page.waitForURL("**/favorites?lang=en#tickets");
  await page.evaluate(callback => new Function("user", callback)({ id: 42 }), abandonedCallback);
  assert.equal(fallbackLogins, 1);
  assert.equal((await page.evaluate(() => JSON.parse(sessionStorage.getItem("event-platform:session")))).user.id, session.user.id);
  assertions.push("Disabled OIDC keeps phone fallback usable and returns to the original page.");

  mode = "enabled";
  await page.goto(login(), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue with Telegram", exact: true }).click();
  await page.waitForURL("**/favorites?lang=en#tickets");
  assert.equal(completions, 1);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("event-platform:telegram-login-attempt")), null);
  assertions.push("Approval redirect traverses the real callback page, completes once, saves the session, restores locale/hash, and clears proof.");

  mode = "canceled";
  await page.goto(login(), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue with Telegram", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "canceled" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("state"), false);
  assert.equal(new URL(page.url()).searchParams.has("error"), false);
  await page.screenshot({ path: `${output}/canceled-approval.png`, fullPage: true });
  await page.getByRole("link", { name: "Sign in to Telegram with a phone number", exact: true }).click();
  await page.getByRole("button", { name: "Mock Telegram phone sign-in" }).click();
  await page.waitForURL("**/favorites?lang=en#tickets");
  assert.equal(completions, 1);
  assertions.push("User denial does not exchange a code; the callback offers a working phone fallback.");

  await page.goto(`${base}/login/telegram/callback?state=foreign&code=private`, { waitUntil: "networkidle" });
  await page.getByRole("alert").filter({ hasText: "browser" }).waitFor(); assert.equal(completions, 1);
  assert.equal(new URL(page.url()).searchParams.has("code"), false);
  assertions.push("Missing browser proof cannot exchange a code, and callback query data is removed.");

  mode = "disabled";
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [locale, label] of [["kk", "Telegram арқылы жалғастыру"], ["ru", "Продолжить с Telegram"]]) {
    await page.goto(login(locale), { waitUntil: "networkidle" });
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Mock Telegram phone sign-in" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/mobile-${locale}.png`, fullPage: true });
  }
  assertions.push("Russian and Kazakh fallback states fit a 390px mobile viewport.");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => { localStorage.setItem("ticket:theme", "dark"); });
  await page.goto(login(), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign in to Telegram with a phone number", exact: true }).click();
  await page.getByRole("button", { name: "Mock Telegram phone sign-in" }).waitFor();
  await page.screenshot({ path: `${output}/mobile-dark.png`, fullPage: true });

  const response = await context.request.get(`${base}/login/telegram/callback?code=private&state=private`, { maxRedirects: 0 });
  assert.equal(response.status(), 200); assert.equal(response.headers()["referrer-policy"], "no-referrer");
  // Next development mode deliberately overrides Cache-Control; production must use no-store.
  assert.match(response.headers()["cache-control"], process.env.TELEGRAM_TEST_PRODUCTION === "true" ? /no-store/ : /no-store|no-cache/);
  const html = await response.text();
  for (const alternate of html.matchAll(/<link[^>]+rel="alternate"[^>]*>/g)) assert.doesNotMatch(alternate[0], /code=|state=/);
  assertions.push(`Callback is served without a locale redirect, has no-referrer and Cache-Control=${response.headers()["cache-control"]}, and metadata does not expose code/state.`);
  assert.deepEqual(errors, []);
  const report = { provider: "mocked; no live Telegram approval asserted", assertions, starts, completions, fallbackLogins, errors };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("Browser check failed at:", page.url());
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
