import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Fresh Chrome profile; all organizer APIs are mocked. No real account mutations.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ORGANIZER_TEST_URL || 'http://localhost:3000';
const output = resolve(process.env.ORGANIZER_TEST_OUTPUT || '/private/tmp/ticket-organizer-browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage(); const errors = []; const assertions = []; const requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && /hydration|Invalid regular expression|pattern attribute/.test(message.text())) errors.push(message.text()); });
const user = { id: 'organizer-test', name: 'Bekarys Suyum', email: null, phone: null, photoUrl: null, role: 'organizer', telegramId: null, telegramChatId: null };
let profile = { organizationName: 'TICKET Studio', name: user.name, email: null, phone: null, photoUrl: null, address: null, showContactInfo: false };
const event = (id, title, status = 'published', mode = 'ordinary') => ({ id, displayId: id.toUpperCase(), title, status, date: '2026-11-20', time: '20:00', address: 'Almaty', paymentMode: 'full_payment', posterUrl: null, metrics: { mode, sold: 0, capacity: 10, remaining: 10, settledRevenue: 0, currency: 'KZT', includedSeats: mode === 'whole_table' ? 0 : null } });
let events = [event('concert', 'Evening concert'), event('pub-night', 'Pub night', 'published', 'per_seat')];
events[0].posterUrl = `${base}/test-poster.png`;
let failDashboard = false; let failProfile = false; let failList = false; let failSave = false; let failPhoto = false; let mixed = false; let slowDraft = false;
await context.addInitScript(({ user }) => {
  sessionStorage.setItem('event-platform:session', JSON.stringify({ user, tokens: { accessToken: 'mock', refreshToken: 'mock', accessExpiresInSeconds: 3600, refreshExpiresInSeconds: 3600 } }));
  localStorage.setItem('ticket:theme', 'light');
  localStorage.setItem('ticket:catalog-location', JSON.stringify({ countryCode: 'JP', city: 'Tokyo' }));
}, { user });
await context.route('**/*', async route => {
  const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PATCH,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type' } });
  if (path === '/api/events/locations') return json([{ countryCode: 'JP', cities: ['Tokyo'] }]);
  if (path === '/test-photo.png' || path === '/test-poster.png') return route.fulfill({ contentType: 'image/png', body: await readFile(new URL('../../apps/web/public/auth/community-gathering.png', import.meta.url)) });
  if (!path.startsWith('/me') && !path.startsWith('/api/organizer/events') && !path.startsWith('/auth/')) return route.continue();
  const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : request.postData();
  requests.push({ method: request.method(), path, query: url.search, body });
  if (path === '/me/organizer-profile') {
    if (request.method() === 'PATCH') {
      if (failSave) return json({ message: 'Save failed' }, 500);
      profile = { ...profile, ...body }; return json(profile);
    }
    return failProfile ? json({ message: 'Profile unavailable' }, 500) : json(profile);
  }
  if (path === '/me/organizer-profile/photo') {
    if (failPhoto) return json({ message: 'Upload failed' }, 500);
    profile = { ...profile, photoUrl: `${base}/test-photo.png` }; return json({ photoUrl: profile.photoUrl });
  }
  if (path === '/api/organizer/events/dashboard/summary') return failDashboard ? json({ message: 'Summary unavailable' }, 500) : json({ totalEvents: events.length, publishedEvents: events.filter(e => e.status === 'published').length, draftEvents: events.filter(e => e.status === 'draft').length, completedEvents: events.filter(e => e.status === 'completed').length, cancelledEvents: events.filter(e => e.status === 'cancelled').length, settledRevenue: mixed ? 0 : 125000, currency: mixed ? null : 'KZT', soldAdmissions: 2, totalAdmissions: 20 });
  if (path === '/api/organizer/events') {
    if (failList) return json({ message: 'Events unavailable' }, 500);
    const group = url.searchParams.get('statusGroup');
    const states = { on_sale: ['published'], draft: ['draft'], archive: ['completed', 'cancelled'] }[group];
    let filtered = events.filter(e => !states || states.includes(e.status));
    if (slowDraft && group === 'draft') await new Promise(resolve => setTimeout(resolve, 650));
    if (url.searchParams.get('sort') === 'date_desc') filtered = filtered.toReversed();
    const current = Number(url.searchParams.get('page')); const limit = Number(url.searchParams.get('limit')); const start = (current - 1) * limit;
    return json({ items: filtered.slice(start, start + limit), total: filtered.length, page: current, limit, hasNext: start + limit < filtered.length });
  }
  if (request.method() === 'DELETE') { events = events.filter(e => e.id !== path.split('/').at(-1)); return json({ deleted: true }); }
  if (path.endsWith('/reopen')) { events = events.map(e => e.id === path.split('/').at(-2) ? { ...e, status: 'published' } : e); return json({ published: true }); }
  if (path === '/auth/logout') return json({});
  return json({ message: `Unhandled mock: ${path}` }, 500);
});
const check = (label, condition) => { assert.ok(condition, label); assertions.push(label); };
async function screenshot(name, fullPage = true) {
  await page.evaluate(() => window.scrollTo(0, 0)); await page.mouse.move(0, 0);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage, animations: 'disabled', style: 'nextjs-portal { display:none!important; }' });
}
async function geometry(label) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.querySelectorAll(".organizer-existing-icon")].every(node => node.complete && node.naturalWidth > 0));
  const result = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement); const workspace = getComputedStyle(document.querySelector('.organizer-workspace'));
    return {
      navbar: document.querySelectorAll('header.ticket-navbar').length === 1 && !document.querySelector('.ticket-navbar-account'),
      font: root.fontFamily === workspace.fontFamily,
      tokens: ['bg', 'text', 'primary', 'accent', 'surface', 'raised', 'border', 'muted'].every(name => root.getPropertyValue(`--ticket-${name}`) === workspace.getPropertyValue(`--ticket-${name}`)),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      loadedIcons: [...document.querySelectorAll('.organizer-existing-icon')].every(node => node.complete && node.naturalWidth > 0 && node.getBoundingClientRect().width === node.naturalWidth && node.getBoundingClientRect().height === node.naturalHeight),
    };
  });
  for (const key of ['navbar', 'font', 'tokens', 'loadedIcons']) check(`${label}: ${key}`, result[key]);
  if (result.overflow) console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 10).map(node => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right }))));
  check(`${label}: no horizontal overflow`, !result.overflow);
}
const filter = name => page.getByRole('group', { name: 'Статусы событий' }).getByRole('button', { name, exact: false });
const rows = page.locator('.organizer-event-row');
try {
  await page.goto(`${base}/organizer/events?lang=ru&published=1`); await page.getByRole('heading', { name: 'Evening concert', exact: true }).waitFor();
  check('publication notice and query cleanup', await page.getByText('Событие опубликовано и доступно в панели организатора.', { exact: true }).count() === 1 && !new URL(page.url()).searchParams.has('published'));
  check('four live metrics', await page.locator('.organizer-metric').count() === 4 && await page.locator('.organizer-metric').nth(3).innerText().then(t => t.includes('1') && !t.includes('—')));
  check('API poster fallback and modes', await page.locator('.organizer-poster').count() === 2 && await page.getByText('Продажа по местам', { exact: true }).count() === 1);
  check('preview and management preserve locale', await rows.first().getByRole('link', { name: 'Предпросмотр', exact: true }).getAttribute('href') === '/organizer/events/concert/preview?lang=ru' && await rows.first().getByRole('link', { name: 'Управление', exact: true }).getAttribute('href') === '/organizer/events/concert?lang=ru');
  await geometry('events desktop'); await page.waitForFunction(() => document.querySelector('.organizer-poster img')?.naturalWidth > 0); check('API poster is displayed', await page.locator('.organizer-poster img').count() === 1); await screenshot('events-desktop');
  await page.getByRole('link', { name: 'Профиль организатора', exact: true }).first().click(); await page.getByLabel('Название организации', { exact: true }).waitFor();
  await geometry('profile desktop'); await screenshot('profile-desktop');
  check('hidden contacts are accurately previewed', await page.getByText('Скрыты от гостей', { exact: true }).count() === 1);
  await page.getByLabel('Контактная электронная почта', { exact: true }).fill('contact@example.com');
  await page.getByLabel('Контактный номер телефона', { exact: true }).fill('+77001234567');
  await page.getByLabel('Адрес', { exact: true }).fill('Almaty, Main Street 12');
  await page.getByLabel('Показывать профиль и контакты гостям', { exact: false }).check();
  check('visibility preview reacts before save', profile.showContactInfo === false && await page.getByText('Видны гостям', { exact: true }).count() === 1 && await page.locator('.organizer-public-preview').getByText('contact@example.com', { exact: true }).count() === 1);
  failSave = true; await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await page.getByText('Save failed', { exact: true }).waitFor();
  check('failed save retains edits', await page.getByLabel('Контактная электронная почта', { exact: true }).inputValue() === 'contact@example.com' && !profile.showContactInfo);
  failSave = false; await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await page.getByText('Профиль сохранён.', { exact: true }).waitFor();
  check('save persists contacts and privacy', profile.showContactInfo && profile.phone === '+77001234567');
  check('save only uses organizer contact endpoint', !requests.some(r => /identities|password|verify/.test(r.path)));
  check('session contacts refreshed', await page.evaluate(() => JSON.parse(sessionStorage.getItem('event-platform:session')).user.email) === 'contact@example.com');
  await page.getByLabel('Название организации', { exact: true }).fill('Unsaved organization');
  const upload = page.locator('input[type=file]');
  await upload.setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') }); await page.getByText('Выберите JPEG, PNG или WebP до 5 МБ.', { exact: true }).waitFor();
  check('invalid image rejected without request', !requests.some(r => r.path.endsWith('/photo')));
  failPhoto = true; await upload.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10]) }); await page.getByText('Upload failed', { exact: true }).waitFor();
  failPhoto = false; await upload.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10]) }); await page.getByText('Фото обновлено.', { exact: true }).waitFor();
  check('upload preserves unsaved fields', await page.getByLabel('Название организации', { exact: true }).inputValue() === 'Unsaved organization' && profile.organizationName === 'TICKET Studio');
  check('multipart photo upload is separate', requests.some(r => r.path.endsWith('/photo') && r.body.includes('name="photo"')));
  await page.getByRole('link', { name: 'Отмена', exact: true }).click(); await page.getByRole('heading', { name: 'Evening concert', exact: true }).waitFor();
  check('cancel does not save text or undo uploaded photo', profile.organizationName === 'TICKET Studio' && profile.photoUrl !== null);
  profile.photoUrl = null;
  events = [...events, event('draft', 'Draft event', 'draft'), event('table', 'Table event', 'completed', 'whole_table'), { ...event('deposit', 'Deposit event', 'completed'), paymentMode: 'deposit' }, event('cancelled', 'Cancelled event', 'cancelled'), ...Array.from({ length: 7 }, (_, i) => event(`extra-${i}`, `Extra ${i}`))];
  events[6].title = 'Long event title ' + 'A'.repeat(140);
  events[3].metrics = { ...events[3].metrics, sold: 2, capacity: 0, includedSeats: 12 };
  await page.reload(); await rows.nth(9).waitFor();
  await page.getByRole('button', { name: 'Далее', exact: true }).click(); await page.getByRole('heading', { name: 'Extra 6', exact: true }).waitFor();
  check('pagination requests second page', requests.some(r => r.path === '/api/organizer/events' && r.query.includes('page=2')));
  await filter('Черновики').click(); await page.getByRole('heading', { name: 'Draft event', exact: true }).waitFor();
  check('filter resets pagination and retains draft action', requests.at(-1).query?.includes('page=1') && await page.getByRole('link', { name: 'Продолжить', exact: true }).getAttribute('href') === '/organizer/events/draft/edit?lang=ru');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Удалить черновик', exact: true }).click();
  check('cancel deletion sends no request', !requests.some(r => r.method === 'DELETE'));
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Удалить черновик', exact: true }).click(); await page.getByText('Событий в этом разделе пока нет', { exact: true }).waitFor();
  check('confirmed draft deletion refreshes list', !events.some(e => e.id === 'draft') && requests.some(r => r.method === 'DELETE'));
  await filter('Завершённые и архив').click(); await page.getByRole('heading', { name: 'Table event', exact: true }).waitFor();
  check('whole tables retain included seats and guard zero capacity', await page.getByText('включено мест в проданных столах: 12', { exact: true }).count() === 1 && !await page.locator('.organizer-table').innerText().then(t => /NaN|Infinity|2 из 0/.test(t)));
  check('deposit events cannot reopen', await rows.filter({ has: page.getByRole('heading', { name: 'Deposit event', exact: true }) }).getByRole('button', { name: 'Опубликовать снова', exact: true }).count() === 0);
  await rows.filter({ has: page.getByRole('heading', { name: 'Table event', exact: true }) }).getByRole('button', { name: 'Опубликовать снова', exact: true }).click(); await page.getByRole('heading', { name: 'Table event', exact: true }).waitFor({ state: 'hidden' });
  check('eligible reopen refreshes archive', events.find(e => e.id === 'table').status === 'published');
  await page.getByRole('button', { name: 'Сортировка', exact: true }).click(); await page.getByRole('option', { name: 'По дате: сначала поздние', exact: true }).click(); await page.getByRole('heading', { name: 'Cancelled event', exact: true }).waitFor();
  check('existing sort picker changes query', requests.some(r => r.path === '/api/organizer/events' && r.query.includes('sort=date_desc')));
  events.push(event('draft-late', 'Stale draft', 'draft')); slowDraft = true;
  await filter('Черновики').click(); await page.waitForTimeout(100); await filter('В продаже').click(); await page.getByRole('heading', { name: 'Evening concert', exact: true }).waitFor(); await page.waitForTimeout(750);
  check('late filter response cannot overwrite current list', await page.getByRole('heading', { name: 'Stale draft', exact: true }).count() === 0);
  slowDraft = false; mixed = true; failDashboard = true; await page.reload(); await page.getByText('Summary unavailable', { exact: true }).waitFor();
  check('summary failure does not suppress events/profile', await page.getByRole('heading', { name: 'Evening concert', exact: true }).count() === 1 && await page.locator('.account-sidebar').getByText('TICKET Studio', { exact: true }).count() === 1);
  failDashboard = false; await page.getByRole('button', { name: 'Повторить', exact: true }).click(); await page.getByText('Общий итог недоступен: нет единой валюты.', { exact: true }).waitFor();
  check('mixed currency has no fabricated revenue', await page.locator('.organizer-metric').nth(3).locator('p').innerText() === '—');
  failList = true; await filter('Черновики').click(); await page.getByText('Events unavailable', { exact: true }).waitFor(); failList = false; await page.getByRole('button', { name: 'Повторить', exact: true }).click(); await page.getByRole('heading', { name: 'Stale draft', exact: true }).waitFor();
  check('list retry recovers independently', await rows.count() === 1);
  failProfile = true; await page.goto(`${base}/organizer/profile?lang=ru`); await page.locator('.organizer-content').getByText('Profile unavailable', { exact: true }).waitFor();
  failProfile = false; await page.locator('.organizer-content').getByRole('button', { name: 'Повторить', exact: true }).click(); await page.getByLabel('Название организации', { exact: true }).waitFor();
  check('profile retry recovers', await page.getByLabel('Название организации', { exact: true }).inputValue() === 'TICKET Studio');
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 }); await geometry(`profile ${width}`); await screenshot(`profile-${width}`, false);
    await page.getByRole('link', { name: /^Мои события/ }).first().click(); await page.getByRole('heading', { name: 'Evening concert', exact: true }).waitFor(); await geometry(`events ${width}`); await screenshot(`events-${width}`, false);
    if (width === 390) { await rows.first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/events-mobile-rows.png`, animations: 'disabled', style: 'nextjs-portal { display:none!important; }' }); }
    await page.getByRole('link', { name: 'Профиль организатора', exact: true }).first().click(); await page.getByLabel('Название организации', { exact: true }).waitFor();
  }
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark'); await geometry('profile dark mobile'); await screenshot('profile-dark-mobile', false);
  await page.locator('.organizer-form-section').last().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/profile-mobile-fields.png`, animations: 'disabled', style: 'nextjs-portal { display:none!important; }' });
  await page.getByRole('link', { name: /^Мои события/ }).first().click(); await page.getByRole('heading', { name: 'Evening concert', exact: true }).waitFor(); await geometry('events dark mobile'); await screenshot('events-dark-mobile', false);
  await page.getByRole('button', { name: 'Помощь и поддержка', exact: true }).click(); await page.getByRole('dialog', { name: 'Помощь и поддержка', exact: true }).waitFor(); await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  check('help dialog closes accessibly', !await page.getByRole('dialog').isVisible());
  for (const lang of ['kk', 'en']) {
    await page.goto(`${base}/organizer/events?lang=${lang}`); await page.getByRole('heading', { name: 'Evening concert', exact: true }).waitFor(); await geometry(`events ${lang}`);
    await page.goto(`${base}/organizer/profile?lang=${lang}`); await page.locator('.organizer-form-section').first().waitFor(); await geometry(`profile ${lang}`);
  }
  await page.setViewportSize({ width: 1440, height: 1050 }); await page.evaluate(() => document.documentElement.dataset.theme = 'dark'); await geometry('profile dark desktop'); await screenshot('profile-dark-desktop');
  check('no browser runtime errors', errors.length === 0);
  await writeFile(`${output}/validation.json`, JSON.stringify({ assertions, browserErrors: errors, requests: requests.map(({ method, path, query }) => ({ method, path, query })) }, null, 2));
  console.log(JSON.stringify({ passed: assertions.length, browserErrors: errors, screenshots: output }));
} catch (error) { await screenshot('failure'); throw error; }
finally { await browser.close(); }
