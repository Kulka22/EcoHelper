import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const baseURL = process.env.ECOHELPER_BASE_URL || 'http://localhost:5080';
const output = new URL('../artifacts/violation-description/', import.meta.url);
await mkdir(output, { recursive: true });
const types = await (await fetch(`${baseURL}/api/violations/types`)).json();
const cases = [
  { description: 'Во дворе постоянно сжигают мусор. Что делать?', code: 'waste_burning' },
  { description: 'Возле дома появилась большая незаконная свалка отходов. Что делать?', code: 'illegal_dumping' },
  { description: 'Как дела?', status: 422 },
];
const report = { api: [], validationCases: 0, ui: [], errors: [] };
async function resolve(body) {
  return fetch(`${baseURL}/api/violations/resolve-type`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
for (const test of cases) {
  const response = await resolve({ description: test.description });
  const body = await response.json();
  assert.equal(response.status, test.status || 200, JSON.stringify(body));
  if (test.code) assert.equal(body.code, test.code);
  else { assert.equal(body.code, 'violation_type_unknown'); assert.equal(body.recommendations, undefined); }
  report.api.push({ ...test, status: response.status, response: body, passed: true });
  console.log(`PASS live description API: ${test.code || 'unknown -> 422'}`);
}
for (const body of [{}, { description: ' ' }, { description: 'x'.repeat(1501) }, { type: 'invented', description: cases[0].description }]) {
  assert.equal((await resolve(body)).status, 400);
  report.validationCases++;
}
for (const type of types) {
  const response = await resolve({ type: type.code, description: 'Куда сдать батарейки?' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).code, type.code);
}
console.log('PASS 4 validation cases and all 4 explicit type priorities');

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, animations: 'disabled' });
}
async function check(name, run) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  try { await run(page); report.ui.push({ name, passed: true }); console.log(`PASS UI ${name}`); }
  catch (error) { report.ui.push({ name, passed: false, error: error.message }); await screenshot(page, 'failure.png'); throw error; }
  finally { await context.close(); }
}
const next = page => page.locator('#violation-type-form button[type="submit"]').click();
async function open(page, description = cases[0].description) {
  await page.goto('/violations.html');
  await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).waitFor();
  await page.locator('#description').fill(description);
}
const draft = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('ecohelper.violations.v1')));
try {
  await check('Real Gemini description -> location -> SQLite recommendations; back and reload reuse cache', async page => {
    let calls = 0;
    page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/resolve-type')) calls++; });
    await open(page);
    await next(page);
    await page.getByText('Определяем тип нарушения', { exact: true }).waitFor();
    await page.locator('#violation-location-form').waitFor();
    assert.equal((await draft(page)).resolvedTypeCode, 'waste_burning');
    assert.equal((await draft(page)).typeCode, '');
    await page.locator('#region').fill('Москва');
    await page.getByRole('button', { name: 'Назад к описанию' }).click();
    assert.equal(await page.locator('#description').inputValue(), cases[0].description);
    await next(page);
    await page.reload();
    await page.locator('#violation-location-form').waitFor();
    assert.equal(await page.locator('#region').inputValue(), 'Москва');
    await page.getByRole('button', { name: 'Показать рекомендации', exact: true }).click();
    await page.getByRole('heading', { name: 'Росприроднадзор', exact: true }).waitFor();
    assert.match(await page.locator('#results').innerText(), /Держитесь на безопасном расстоянии/);
    assert.equal(calls, 1, 'Repeated Gemini call for unchanged description');
    await screenshot(page, 'description-result.png');
  });

  await check('Ready type has priority and does not request classification', async page => {
    await page.route('**/api/violations/resolve-type', () => { throw new Error('Unexpected classification request'); });
    await open(page, cases[1].description);
    await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).click();
    await next(page);
    await page.locator('#violation-location-form').waitFor();
    assert.equal((await draft(page)).typeCode, 'waste_burning');
    await page.locator('#region').fill('Москва');
    await page.getByRole('button', { name: 'Показать рекомендации', exact: true }).click();
    await page.getByRole('heading', { name: 'Росприроднадзор', exact: true }).waitFor();
  });

  await check('Unknown description shows 422 message, keeps text and offers manual selection', async page => {
    await page.route('**/api/violations/resolve-type', route => route.fulfill({ status: 422, contentType: 'application/problem+json', body: JSON.stringify(report.api[2].response) }));
    await open(page, cases[2].description);
    await next(page);
    await page.getByRole('heading', { name: 'Не удалось определить тип нарушения', exact: true }).waitFor();
    assert.equal(await page.locator('#type-error [data-retry]').count(), 0);
    assert.equal(await page.locator('#description').inputValue(), cases[2].description);
    assert.equal(await page.locator('[data-panel="result"]').isVisible(), false);
    await screenshot(page, 'unknown-description.png');
    await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).click();
    await next(page);
    await page.locator('#violation-location-form').waitFor();
  });

  await check('Provider error can be retried without losing description', async page => {
    let calls = 0;
    await page.route('**/api/violations/resolve-type', route => ++calls === 1
      ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'AI-сервис временно недоступен.' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(types.find(type => type.code === 'waste_burning')) }));
    await open(page);
    await next(page);
    await page.getByText('AI-сервис временно недоступен.', { exact: true }).waitFor();
    assert.equal(await page.locator('#description').inputValue(), cases[0].description);
    await page.getByRole('button', { name: 'Повторить запрос', exact: true }).click();
    await page.locator('#violation-location-form').waitFor();
    assert.equal(calls, 2);
  });

  await check('Editing description after reload invalidates recognized type; manual type remains authoritative', async page => {
    let calls = 0;
    await page.route('**/api/violations/resolve-type', route => {
      const code = ++calls === 1 ? 'waste_burning' : 'illegal_dumping';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(types.find(type => type.code === code)) });
    });
    await open(page);
    await next(page);
    await page.locator('#violation-location-form').waitFor();
    await page.reload();
    await page.locator('#violation-location-form').waitFor();
    await page.getByRole('button', { name: 'Назад к описанию' }).click();
    await page.locator('#description').fill(cases[1].description);
    assert.equal(await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).getAttribute('aria-pressed'), 'false');
    await next(page);
    await page.locator('#violation-location-form').waitFor();
    assert.equal((await draft(page)).resolvedTypeCode, 'illegal_dumping');
    assert.equal(calls, 2);
    await page.getByRole('button', { name: 'Назад к описанию' }).click();
    await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).click();
    await page.locator('#description').fill('Другое описание');
    await next(page);
    await page.locator('#violation-location-form').waitFor();
    assert.equal((await draft(page)).typeCode, 'waste_burning');
    assert.equal(calls, 2);
  });

  await check('Manual choice cancels pending classification and stale response cannot replace it', async page => {
    let release, complete;
    const gate = new Promise(resolve => { release = resolve; });
    const served = new Promise(resolve => { complete = resolve; });
    await page.route('**/api/violations/resolve-type', async route => {
      await gate;
      try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(types.find(type => type.code === 'waste_burning')) }); }
      finally { complete(); }
    });
    await open(page);
    await next(page);
    await page.getByText('Определяем тип нарушения', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Загрязнение водоёма', exact: true }).click();
    await next(page);
    await page.locator('#violation-location-form').waitFor();
    release(); await served;
    assert.equal((await draft(page)).typeCode, 'water_pollution');
    assert.equal((await draft(page)).resolvedTypeCode, '');
  });
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close();
  await writeFile(new URL('results.json', output), JSON.stringify(report, null, 2));
}
console.log(`Passed 3 live description queries, 4 validation cases, 4 ready types and ${report.ui.length} browser checks.`);
