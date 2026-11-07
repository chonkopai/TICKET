import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Run against a development server with a fresh browser profile and mocked account APIs.
// PLAYWRIGHT_MODULE may point to the bundled Playwright package; no real account is used.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.ACCOUNT_TEST_URL || "http://localhost:3000";
const output = resolve(process.env.ACCOUNT_TEST_OUTPUT || "/private/tmp/ticket-account-browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(error.message));
const user = { id: "account-design-test", name: "Bekarys Suyum", role: "organizer", photoUrl: null, email: null, phone: null, defaultCity: null, telegramId: null, telegramChatId: null };
let preferences = { transactionalTicketDelivery: true, eventReminders: true, marketingAnnouncements: false };
let methods = { email: { linked: true, address: "bekasuyum@gmail.com", verifiedAt: "2026-10-01T00:00:00Z" }, phone: { linked: false, number: null, verifiedAt: null }, telegram: { linked: false, id: null }, google: { linked: false, email: null }, passwordSet: false };
let failInbox = true; let failPreference = false; let failDashboard = false; let populated = false;
const requests = []; const assertions = [];
await context.addInitScript(({ user }) => {
  sessionStorage.setItem("event-platform:session", JSON.stringify({ user, tokens: { accessToken: "design-test", refreshToken: "design-test", accessExpiresInSeconds: 3600, refreshExpiresInSeconds: 3600 } }));
  localStorage.setItem("ticket:theme", "light");
  localStorage.setItem("ticket:catalog-location", JSON.stringify({ countryCode: "JP", city: "Tokyo" }));
}, { user });
await context.route("**/*", async route => {
  const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
  const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data) });
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-allow-headers": "authorization,content-type" } });
  if (path === "/api/events/locations") return json([{ countryCode: "JP", cities: ["Tokyo"] }, { countryCode: "KZ", cities: ["Алматы"] }]);
  if (!path.startsWith("/me") && !path.startsWith("/auth/")) return route.continue();
  requests.push({ method: request.method(), path, query: url.search, body: request.postDataJSON() });
  if (path === "/me") { if (request.method() === "PATCH") Object.assign(user, request.postDataJSON()); return json(user); }
  if (path === "/me/dashboard") return failDashboard ? json({ message: "Metrics unavailable" }, 500) : json({ activeAdmissions: 0, attendedEvents: 0 });
  if (path === "/me/events") return json({ items: [], total: populated && url.searchParams.get("status") === "past" ? 7 : 0, status: url.searchParams.get("status"), page: Number(url.searchParams.get("page")), limit: Number(url.searchParams.get("limit")), hasNext: false });
  if (path === "/me/orders") return json({ items: populated ? [{ id: "order-test", eventId: "event-test", eventTitle: "Test concert", itemSummary: "2 tickets", status: "paid", type: "ticket", amount: 150000, currency: "KZT", receiptUrl: null, createdAt: "2026-10-01T12:00:00Z" }] : [], total: populated ? 1 : 0, page: 1, limit: Number(url.searchParams.get("limit")), hasNext: false });
  if (path === "/me/identities") return json(methods);
  if (path === "/me/notification-preferences") { if (request.method() === "PATCH") { await new Promise(resolve => setTimeout(resolve, 200)); if (failPreference) return json({ message: "Save failed" }, 500); Object.assign(preferences, request.postDataJSON()); } return json(preferences); }
  if (path === "/me/notifications") return failInbox ? json({ message: "Internal server error" }, 500) : json({ items: populated ? [{ id: "notification-test", eventId: "event-test", eventTitle: "Test concert", text: "Your ticket is ready", createdAt: "2026-10-01T12:00:00Z", readAt: null, type: "ticket.delivered" }] : [], total: populated ? 1 : 0, page: 1, limit: 10, unreadCount: populated ? 1 : 0, hasNext: false });
  if (path.endsWith("/read")) return json({ readAt: "2026-10-07T00:00:00Z" });
  if (path.endsWith("/request-code")) return json({ challengeId: "test-challenge", retryAfterSeconds: 30, expiresAt: "2026-10-07T00:10:00Z" });
  if (path.endsWith("/verify-code")) return json({ grant: "test-grant", expiresAt: "2026-10-07T00:10:00Z" });
  if (path.endsWith("/complete")) { methods = { ...methods, passwordSet: true }; return json(methods); }
  if (path === "/me/password/change" || path === "/auth/logout") return json({ changed: true });
  return json({ message: `Unhandled test request ${path}` }, 500);
});
const check = (label, value) => { assert.ok(value, label); assertions.push(label); };
async function screenshot(name, fullPage = true) {
  await page.evaluate(() => window.scrollTo(0,0));
  await page.mouse.move(0,0);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
}
async function geometry(label) {
  await page.evaluate(() => document.fonts.ready);
  const language = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const workspace = getComputedStyle(document.querySelector('.account-workspace'));
    return {
      navbar: document.querySelectorAll('header.ticket-navbar').length === 1 && !document.querySelector('.ticket-navbar-account'),
      font: root.fontFamily === workspace.fontFamily,
      tokens: ['bg','surface','raised','text','muted','border','primary','primary-hover','accent','accent-soft','danger-soft'].every(name => root.getPropertyValue(`--ticket-${name}`).trim() === workspace.getPropertyValue(`--ticket-${name}`).trim()),
      icons: [...document.querySelectorAll('.account-icon')].every(node => node.tagName.toLowerCase() === 'svg' && node.getAttribute('stroke') === 'currentColor' && node.getAttribute('viewBox') === '0 0 24 24'),
      titleWeight: getComputedStyle(document.querySelector('.account-heading h1')).fontWeight,
    };
  });
  check(`${label}: original shared navbar`, language.navbar);
  check(`${label}: inherited site font`, language.font);
  check(`${label}: shared site palette`, language.tokens);
  check(`${label}: site SVG icon style`, language.icons);
  check(`${label}: existing bold heading style`, language.titleWeight === '700');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) console.log(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(node => node.getBoundingClientRect().right > window.innerWidth + 1).slice(0,12).map(node => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right }))));
  check(`${label}: no horizontal overflow`, !overflow);
}
try {
  await page.goto(`${base}/account?lang=ru`); await page.getByText("Пока нет предстоящих событий", { exact: true }).waitFor();
  await geometry("tickets desktop"); await screenshot("tickets-desktop");
  check("orders preview loads on tickets", requests.some(r => r.path === "/me/orders" && r.query.includes("limit=3")));
  await page.getByRole("link", { name: "Данные и настройки", exact: true }).click(); await page.getByText("bekasuyum@gmail.com", { exact: true }).first().waitFor();
  check("section navigation updates URL", new URL(page.url()).searchParams.get("tab") === "profile");
  await page.setViewportSize({ width: 1440, height: 1084 }); await geometry("settings desktop"); await screenshot("settings-desktop");
  await page.getByLabel("Контактный email", { exact: true }).fill("contact@example.com"); await page.getByRole("button", { name: "Сохранить изменения" }).click(); await page.getByText("Личные данные сохранены", { exact: true }).waitFor();
  check("contact save does not mutate login identity", methods.email.address === "bekasuyum@gmail.com" && user.email === "contact@example.com");
  await page.getByRole("button", { name: "Подключить телефон", exact: true }).click(); check("SMS remains disabled", await page.locator('.account-verification button[type="submit"]').isDisabled());
  await page.getByRole("button", { name: "Email", exact: true }).click(); await page.getByLabel("Адрес электронной почты", { exact: true }).fill("another@example.com"); await page.getByRole("button", { name: "Получить код" }).click(); await page.getByLabel("Код подтверждения", { exact: true }).fill("123456"); check("resend cooldown", await page.getByRole("button", { name: /Новый код через/ }).isDisabled());
  await page.getByRole("button", { name: "Подтвердить код" }).click(); await page.getByLabel("Задайте пароль для Email и телефона").fill("test-password-123"); await page.getByRole("button", { name: "Подключить", exact: true }).click(); await page.getByText("Способ входа подключён.", { exact: true }).waitFor();
  check("email verification and completion stay functional", requests.some(r => r.path.endsWith("/complete") && r.body.grant === "test-grant"));
  user.email = null;
  await page.getByRole("link", { name: "Telegram и уведомления", exact: true }).click(); await page.reload(); await page.getByRole("heading", { name: "Не удалось загрузить уведомления" }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 }); await geometry("notifications desktop"); await screenshot("notifications-desktop");
  const reminders = page.getByRole("switch", { name: "Напоминания о событиях", exact: true });
  check("inbox error does not hide saved preferences", await reminders.getAttribute("aria-checked") === "true");
  failPreference = true; await reminders.click(); await page.getByText(/Не удалось сохранить настройки/).waitFor(); check("failed preference restores value", await reminders.getAttribute("aria-checked") === "true");
  failPreference = false; await reminders.click(); await page.waitForFunction(() => !document.querySelector('[role="switch"]').disabled); check("successful preference persists", preferences.eventReminders === false);
  failInbox = false; await page.getByRole("button", { name: "Повторить попытку", exact: true }).click(); await page.getByText("Уведомлений пока нет", { exact: true }).waitFor();
  check("inbox retry recovers", await page.getByRole("heading", { name: "Не удалось загрузить уведомления" }).count() === 0);
  populated = true; await page.getByLabel("Только непрочитанные", { exact: true }).check(); await page.getByText("Your ticket is ready").waitFor(); await page.getByRole("button", { name: "Прочитано", exact: true }).click(); check("mark-read request", requests.some(r => r.path.endsWith("/notification-test/read")));
  for (const width of [1024, 768, 390]) { await page.setViewportSize({ width, height: 900 }); await geometry(`notifications ${width}`); await screenshot(`notifications-${width}`, false); }
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; }); await geometry("notifications dark mobile"); await screenshot("notifications-dark-mobile", false);
  await page.getByRole("link", { name: "Билеты и заказы", exact: true }).click(); await page.getByText("Test concert", { exact: true }).waitFor(); check("populated orders retain organizer chat", await page.getByRole("link", { name: "Написать организатору" }).count() === 1);
  await page.getByRole("button", { name: /Прошедшие/ }).click(); await page.waitForFunction(() => [...document.querySelectorAll('.account-ticket-tabs button')].some(button => button.textContent.includes('Прошедшие') && button.textContent.includes('7'))); check("past total uses event total", await page.getByRole("button", { name: /Прошедшие/ }).innerText().then(text => text.includes("7")));
  await geometry("tickets dark mobile");
  await page.getByRole("link", { name: "Данные и настройки", exact: true }).click(); await page.getByText("Контакты ≠ способ входа", { exact: true }).waitFor(); await geometry("settings dark mobile");
  await page.goBack(); check("browser history restores account section", new URL(page.url()).searchParams.get("tab") === "tickets");
  await page.getByRole("button", { name: "Помощь и поддержка", exact: true }).click(); await page.getByRole("dialog", { name: "Помощь и поддержка", exact: true }).waitFor(); await page.getByRole("button", { name: "Открыть историю оплат", exact: true }).click(); check("help opens working order history", new URL(page.url()).searchParams.get("tab") === "payments");
  await page.getByRole("link", { name: "Билеты и заказы", exact: true }).click();
  failDashboard = true; await page.reload(); await page.getByText("Metrics unavailable", { exact: true }).waitFor(); check("metrics failure does not hide profile or orders", await page.locator(".account-sidebar").getByText("Bekarys Suyum", { exact: true }).count() === 1 && await page.getByText("Test concert", { exact: true }).count() === 1);
  for (const lang of ["kk", "en"]) { await page.goto(`${base}/account?tab=profile&lang=${lang}`); await page.locator(".account-contact-guidance").waitFor(); await geometry(`settings ${lang} mobile`); }
  check("no browser runtime errors", errors.length === 0);
  await writeFile(`${output}/validation.json`, JSON.stringify({ assertions, browserErrors: errors, requests: requests.map(({ method, path, query }) => ({ method, path, query })) }, null, 2));
  console.log(JSON.stringify({ passed: assertions.length, screenshots: output, browserErrors: errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally { await browser.close(); }
