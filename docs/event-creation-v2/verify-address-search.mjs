import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { newEventCreationDraft, applyCreationDraftPatch } from '../../packages/shared-types/dist/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ADDRESS_TEST_URL || 'http://localhost:3000';
const output = resolve(process.env.ADDRESS_TEST_OUTPUT || '/private/tmp/ticket-address-browser');
const live = process.env.ADDRESS_LIVE_MAP === '1';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1157, height: 826 } });
const page = await context.newPage(); const errors = [], checks = [], patches = [], providerStatuses = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { const url = new URL(response.url()); if (/yandex/.test(url.hostname) && /search|geocode|suggest/.test(url.pathname + url.hostname)) providerStatuses.push({ service: url.hostname, path: url.pathname, status: response.status() }); });
page.on('response', response => { if (new URL(response.url()).pathname === '/api/address/geocode') providerStatuses.push({ service: 'website geocoder', status: response.status() }); });
page.on('requestfailed', request => {
  const url = new URL(request.url());
  if (/yandex/.test(url.hostname) && /search|geocode|suggest/.test(url.pathname + url.hostname)) {
    providerStatuses.push({ service: url.hostname, path: url.pathname, failure: request.failure()?.errorText });
  }
});
let saved = { id: '00000000-0000-4000-8000-000000000001', revision: 1, state: 'active', aggregate: newEventCreationDraft('00000000-0000-4000-8000-000000000002', 'ru'), owned: false, resultEventId: null, csrfToken: 'test', expiresAt: '2026-12-01T00:00:00Z' };
saved.aggregate.classification.countryCode = 'KZ'; saved.aggregate.classification.city = 'Алматы';
await context.addInitScript(() => { if (!localStorage.getItem('ticket:theme')) localStorage.setItem('ticket:theme', 'light'); localStorage.setItem('ticket:catalog-location', JSON.stringify({ countryCode: 'KZ', city: 'Алматы' })); });
if (!live) await context.addInitScript(() => {
  window.mapRequests = [];
  const place = (city, country = 'KZ', street = 'Абая, 10') => ({ geometry: { getCoordinates: () => [43.25, 76.91] }, getAddressLine: () => `${country === 'KZ' ? 'Казахстан' : 'Россия'}, ${city}, ${street}`, getLocalities: () => [city], getCountryCode: () => country, properties: { get: key => key === 'name' ? street : { GeocoderMetaData: { kind: 'house' } } } });
  const collection = items => ({ geoObjects: { get: index => items[index], getLength: () => items.length } });
  window.ymaps = {
    ready: callback => callback(),
    Map: class {
      constructor(element, state) {
        window.mapState = state; window.mapClick = null; window.mapAlive = true;
        element.innerHTML = '<button type="button" class="test-map-click" style="width:100%;height:100%;background:#ecebf3">Test map</button>';
        element.querySelector('button').onclick = () => window.mapClick?.({ get: () => [43.25, 76.91] });
        this.events = { add: (_name, callback) => { window.mapClick = callback; } };
        this.geoObjects = { removeAll() {}, add() {} };
      }
      destroy() { window.mapAlive = false; }
      setCenter(coords, zoom) { window.mapState = { center: coords, zoom }; return Promise.resolve(); }
      getBounds() { return [[43, 76], [44, 77]]; }
    },
    Placemark: class {},
    geocode: async query => {
      window.mapRequests.push(query);
      if (Array.isArray(query)) {
        if (window.reverseFails) throw new Error('limited');
        if (window.reverseForeign) return collection([place('Москва', 'RU')]);
        return collection([place(window.reverseOther ? 'Астана' : 'Алматы', 'KZ', 'Достык, 15')]);
      }
      if (query.includes('ошибка')) throw new Error('limited');
      if (query.includes('нетадреса')) return collection([]);
      if (query.includes('другой')) return collection(query.includes('Алматы') ? [] : [place('Астана'), place('Москва', 'RU')]);
      if (query.includes('медленно')) { await new Promise(resolve => setTimeout(resolve, 1100)); return collection([place('Алматы', 'KZ', 'Старый адрес')]); }
      return collection([place('Алматы'), place('Астана'), place('Москва', 'RU')]);
    },
  };
});
await context.route('**/*', async route => {
  const url = new URL(route.request().url()), path = url.pathname;
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (!live && path === '/api/address/geocode') {
    const { query } = route.request().postDataJSON();
    const result = await page.evaluate(async query => {
      try {
        const response = await window.ymaps.geocode(query);
        return { places: Array.from({ length: response.geoObjects.getLength() }, (_, index) => {
          const place = response.geoObjects.get(index), coords = place.geometry.getCoordinates();
          return { name: place.properties.get('name'), Point: { pos: `${coords[1]} ${coords[0]}` }, metaDataProperty: { GeocoderMetaData: { kind: 'house', text: place.getAddressLine(), Address: { country_code: place.getCountryCode(), Components: [{ kind: 'locality', name: place.getLocalities()[0] }] } } } };
        }) };
      } catch { return { error: 'mock failure' }; }
    }, query);
    return json(result, result.error ? 502 : 200);
  }
  if (live && /yandex/.test(url.hostname) && /search|geocode|suggest/.test(url.pathname + url.hostname)) {
    const response = await route.fetch(); const body = await response.text();
    const reason = /limited|quota/i.test(body) ? 'limited' : /invalid[^\n]{0,20}(?:key|token)/i.test(body) ? 'invalid credentials' : /unauthor/i.test(body) ? 'unauthorized' : /forbidden/i.test(body) ? 'forbidden' : undefined;
    providerStatuses.push({ service: url.hostname, path: url.pathname, status: response.status(), reason });
    return route.fulfill({ response });
  }
  if (!live && url.hostname === 'suggest-maps.yandex.ru') {
    const query = url.searchParams.get('text');
    if (query.includes('ошибка')) return json({}, 429);
    if (query.includes('медленно')) await new Promise(resolve => setTimeout(resolve, 1100));
    const empty = query.includes('нетадреса') || (query.includes('другой') && query.includes('Алматы'));
    const city = query.includes('другой') ? 'Астана' : 'Алматы';
    const title = query.includes('медленно') ? 'Старый адрес' : 'Абая, 10';
    return json({ results: empty ? [] : Array.from({ length: query.includes('библиотека') ? 6 : 1 }, (_, index) => ({ title: { text: query.includes('библиотека') ? `Библиотека ${index + 1}` : title }, subtitle: { text: city }, tags: ['house'], address: { formatted_address: `Казахстан, ${city}, ${title}${index ? `, ${index}` : ''}`, component: [{ name: city, kind: ['LOCALITY'] }] } })) });
  }
  if (path === '/api/creation-drafts/capabilities') return json({ currencies: [{ code: 'KZT', exponent: 2 }] });
  if (path === `/api/creation-drafts/${saved.id}/media`) return json([]);
  if (path === `/api/creation-drafts/${saved.id}/translations`) return json({ configured: false });
  if (path === '/api/creation-drafts' || path === `/api/creation-drafts/${saved.id}`) {
    if (route.request().method() === 'PATCH') { const body = route.request().postDataJSON(); patches.push(body.patch); saved = { ...saved, revision: saved.revision + 1, aggregate: applyCreationDraftPatch(saved.aggregate, body.patch) }; }
    return json(saved);
  }
  if (path.startsWith('/api/creation-drafts/')) throw new Error(`Unexpected draft request: ${path}`);
  if (path === '/api/events/locations') return json([{ countryCode: 'KZ', cities: ['Алматы', 'Астана'] }]);
  if (path === '/api/display-rates') return json({ base: 'KZT', rates: { KZT: 1 } });
  return route.continue({ headers: { ...route.request().headers(), ...(url.origin === new URL(base).origin ? { 'ngrok-skip-browser-warning': '1' } : {}) } });
});
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
const field = () => page.locator('.creation-address-control input');
const mapButton = () => page.locator('.creation-address-map-button');
try {
  await page.goto(`${base}/events/create?lang=ru`); await field().waitFor();
  await field().scrollIntoViewIfNeeded();
  check('address is a real text input with adjacent map button', await field().getAttribute('role') === 'combobox' && await mapButton().isVisible());
  if (live) {
    await field().fill('Абая 10'); await page.waitForTimeout(4000);
    check('live address suggestions are displayed', await page.locator('.creation-address-option').count() > 0);
    await page.screenshot({ path: `${output}/live-suggestions.png` });
    await mapButton().click();
    await Promise.race([page.locator('.creation-address-map ymaps').first().waitFor({ timeout: 25000 }), page.getByText('Карта пока недоступна.', { exact: false }).first().waitFor({ timeout: 25000 })]);
    await page.screenshot({ path: `${output}/live-map.png` });
    check('duplicate search fields removed', await page.getByRole('dialog').locator('input,textarea,form').count() === 0);
    const map = page.locator('.creation-address-map');
    if (await map.locator('ymaps').count()) {
      await map.click({ position: { x: 180, y: 160 } }); await page.waitForTimeout(5000);
      check('live map click fills the main address', !(await page.getByRole('dialog').isVisible()) && await field().inputValue() !== 'Абая 10');
    }
    await writeFile(`${output}/live.json`, JSON.stringify({ checks, errors, providerStatuses, status: await page.locator('.creation-address-status').allTextContents(), mainAddress: await field().inputValue() }, null, 2));
  } else {
    await field().fill('Абая'); await page.getByRole('option', { name: /Абая, 10/ }).first().waitFor();
    check('city matches appear first; other cities and countries excluded', await page.locator('.creation-address-option').count() === 1 && !(await page.locator('.creation-address-other').count()));
    await page.screenshot({ path: `${output}/city-suggestions.png` });
    await field().press('ArrowDown'); await field().press('Enter');
    check('keyboard choice fills main address', (await field().inputValue()).includes('Алматы, Абая, 10'));
    await field().fill('другой'); await page.locator('.creation-address-other').waitFor();
    check('full-width map action precedes other city results', await page.locator('.creation-address-fallback').isVisible() && await page.locator('.creation-address-option').count() === 1);
    await page.screenshot({ path: `${output}/country-fallback.png` });
    await page.locator('.creation-address-option').click(); await page.waitForTimeout(800);
    check('selecting another city atomically saves address and city', patches.some(patch => patch.classification?.city === 'Астана' && patch.content?.ru?.address.includes('Астана')));
    // Restore the city through its real selector before further tests.
    await page.locator('[data-creation-field="classification.city"] button[role="combobox"]').click(); await page.getByRole('option', { name: 'Алматы', exact: true }).click();
    await field().fill('медленно'); await page.waitForTimeout(500); await field().fill('Абая');
    await page.getByRole('option', { name: /Абая, 10/ }).first().waitFor(); await page.waitForTimeout(1100);
    check('late responses cannot replace the current search', !(await page.locator('.creation-address-option').innerText()).includes('Старый адрес'));
    await field().press('Escape'); check('Escape dismisses autocomplete', await field().getAttribute('aria-expanded') === 'false');
    await field().fill('нетадреса'); await page.locator('.creation-address-fallback').waitFor();
    check('no matches still offers map selection', await page.locator('.creation-address-option').count() === 0);
    await field().fill('ошибка'); await page.getByText('Поиск адресов пока недоступен.', { exact: false }).waitFor();
    check('quota errors are distinct from no matching addresses', await page.locator('.creation-address-fallback').isVisible() && await field().inputValue() === 'ошибка');
    await mapButton().click(); await page.locator('.test-map-click').waitFor();
    check('duplicate modal search and address inputs removed', await page.getByRole('dialog').locator('input,textarea,form').count() === 0);
    check('map opens at selected city', (await page.evaluate(() => window.mapState.center))[0] === 43.25249);
    await page.screenshot({ path: `${output}/map-desktop.png` });
    await page.evaluate(() => { window.reverseFails = true; }); await page.locator('.test-map-click').click(); await page.getByText('Не удалось определить адрес.', { exact: false }).waitFor();
    check('failed reverse lookup keeps editable address and map', await field().inputValue() === 'ошибка' && await page.getByRole('dialog').isVisible());
    await page.evaluate(() => { window.reverseFails = false; window.reverseForeign = true; }); await page.locator('.test-map-click').click(); await page.getByText('Выберите место в указанной стране.', { exact: true }).waitFor();
    check('out-of-country map click cannot change address', await field().inputValue() === 'ошибка');
    await page.evaluate(() => { window.reverseForeign = false; }); await page.locator('.test-map-click').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    check('map click resolves and fills main textbox automatically', await field().inputValue() === 'Казахстан, Алматы, Достык, 15');
    await page.waitForTimeout(800); check('map-selected address is autosaved', saved.aggregate.content.ru.address === 'Казахстан, Алматы, Достык, 15');
    await mapButton().click(); await page.locator('.test-map-click').waitFor(); await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    check('cancel leaves main address unchanged', await field().inputValue() === 'Казахстан, Алматы, Достык, 15');
    await field().fill('a'.repeat(251)); check('address limit prevents invalid autosave', (await field().inputValue()).length <= 250 && await page.getByText('Адрес должен содержать не более 250 символов.', { exact: true }).isVisible());
    await field().fill(''); await page.waitForTimeout(800); check('address can be cleared manually', saved.aggregate.content.ru.address === '');
    for (const width of [1423, 1157, 768, 390]) {
      await page.setViewportSize({ width, height: 826 }); await field().press('Escape');
      await page.locator('.creation-top-panels').scrollIntoViewIfNeeded();
      check(`publication checklist is removed at ${width}px`, await page.locator('.creation-checklist, .creation-checklist-mobile').count() === 0);
      check(`compact controls do not overflow at ${width}px`, await page.locator('.creation-top-panels').evaluate(element => element.scrollWidth <= element.clientWidth));
      await page.screenshot({ path: `${output}/top-panels-${width}.png` });
      await field().scrollIntoViewIfNeeded(); await field().fill(''); await field().fill('Абая'); await page.locator('.creation-address-option').waitFor();
      const bounds = await page.locator('.creation-address-control').boundingBox(); const inputBounds = await field().boundingBox(); const buttonBounds = await mapButton().boundingBox();
      check(`address control fits ${width}px viewport`, bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && inputBounds.width > 90 && buttonBounds.x >= inputBounds.x + inputBounds.width);
      const popup = await page.locator('.creation-address-suggestions').boundingBox(); const footer = await page.locator('.creation-footer').boundingBox();
      check(`suggestions always open below the address at ${width}px`, popup.y >= bounds.y + bounds.height);
      check(`map action uses the matching folded-map icon at ${width}px`, await mapButton().locator('svg').count() === 1);
      check(`suggestions stay above footer at ${width}px`, popup.y >= 0 && popup.y + popup.height <= footer.y + 1);
      check(`focused address field stays above footer at ${width}px`, inputBounds.y + inputBounds.height <= footer.y);
      await page.screenshot({ path: `${output}/suggestions-${width}.png` });
      await field().fill('библиотека'); await page.getByRole('option', { name: 'Библиотека 6', exact: false }).waitFor();
      await field().press('ArrowUp');
      const last = await page.locator('.creation-address-option').last().boundingBox(), list = await page.locator('.creation-address-suggestions').boundingBox(), address = await page.locator('.creation-address-control').boundingBox();
      check(`long suggestion lists scroll below the field at ${width}px`, list.y >= address.y + address.height && last.y >= list.y && last.y + last.height <= list.y + list.height + 1);
      await page.screenshot({ path: `${output}/suggestions-long-${width}.png` });
      await field().press('Escape'); await mapButton().click(); await page.locator('.test-map-click').waitFor();
      const dialog = await page.getByRole('dialog').boundingBox(); check(`map dialog fits ${width}px viewport`, dialog.x >= 0 && dialog.x + dialog.width <= width + 1);
      await page.screenshot({ path: `${output}/map-${width}.png` }); await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    }
    await page.evaluate(() => { localStorage.setItem('ticket:theme', 'dark'); }); await page.reload(); await field().waitFor(); await field().scrollIntoViewIfNeeded(); await field().fill(''); await field().fill('Абая'); await page.locator('.creation-address-option').waitFor();
    await page.screenshot({ path: `${output}/suggestions-dark.png` });
    check('dark theme uses existing site tokens', await page.locator('html').getAttribute('data-theme') === 'dark');
    check('no browser runtime errors', errors.length === 0);
    await writeFile(`${output}/validation.json`, JSON.stringify({ checks, errors, patches }, null, 2));
  }
  console.log(JSON.stringify({ checks: checks.length, errors, output, providerStatuses }));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  const state = await page.evaluate(() => ({ expanded: document.querySelector('.creation-address-control input')?.getAttribute('aria-expanded'), focused: document.activeElement?.outerHTML, popup: document.querySelector('.creation-address-suggestions')?.textContent, mapRequests: window.mapRequests }));
  console.log(JSON.stringify({ checks, state, errors }));
  throw error;
} finally { await browser.close(); }
