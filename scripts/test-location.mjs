import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The real local API/SQLite are used; only the handoff fixture replaces Gemini.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const baseURL = process.env.ECOHELPER_BASE_URL || 'http://localhost:5080';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const checks = [];
await mkdir(new URL('../artifacts/location/', import.meta.url), { recursive: true });
const full = { region: 'Ленинградская область', settlement: 'Всеволожск', district: 'Всеволожский район' };
const config = {
  recycling: { form: '#location-form', api: '/api/recycling/search', params: { item: 'батарейки AA' } },
  violations: { form: '#violation-location-form', api: '/api/violations/recommendations', params: { type: 'waste_burning' } },
};
async function check(name, run) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try { await run(page); assert.deepEqual(errors, []); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); throw error; }
  finally { await context.close(); }
}
async function open(page, scenario) {
  await page.goto(`/${scenario}.html`);
  if (scenario === 'recycling') {
    await page.locator('[data-panel="intro"] [data-go="item"]').click();
    await page.locator('#item').fill('батарейки AA');
    await page.locator('#item-form button[type="submit"]').click();
  } else {
    await page.locator('#description').fill('Описание сохраняется');
    await page.locator('[data-type="waste_burning"]').click();
    await page.locator('#violation-type-form button[type="submit"]').click();
  }
}
async function fill(page, location) { for (const field of ['region', 'settlement', 'district']) await page.locator(`#${field}`).fill(location[field] || ''); }
async function assertFields(page, location) { for (const field of ['region', 'settlement', 'district']) assert.equal(await page.locator(`#${field}`).inputValue(), location[field] || ''); }
async function result(page, scenario) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === config[scenario].api);
  await page.locator(`${config[scenario].form} button[type="submit"]`).click();
  const reply = await response; assert.equal(reply.status(), 200);
  await page.locator('#results [role="status"]').waitFor({ state: 'hidden' });
  return reply.json();
}
try {
  await check('Both API scenarios use identical fallback tiers, optional fields and mandatory region', async page => {
    const cases = [
      [full, 'region_settlement_district', 1, false],
      [{ ...full, district: 'Гатчинский' }, 'region_settlement', 1, true],
      [{ ...full, settlement: 'Нет такого города' }, 'region_district', 2, true],
      [{ ...full, settlement: 'Нет такого города', district: 'Нет такого района' }, 'region', 3, true],
      [{ region: full.region, settlement: full.settlement }, 'region_settlement', 1, false],
      [{ region: full.region, district: full.district }, 'region_district', 2, false],
      [{ region: full.region }, 'region', 3, false],
      [{ region: 'Неизвестный регион', settlement: full.settlement, district: full.district }, 'none', 0, false],
    ];
    for (const [scenario, c] of Object.entries(config)) {
      for (const [location, level, count, fallback] of cases) {
        const response = await page.request.get(c.api, { params: { ...c.params, ...location } });
        assert.equal(response.status(), 200);
        const data = await response.json();
        assert.equal(data.match.level, level); assert.equal(data.match.isFallback, fallback);
        const items = scenario === 'recycling' ? data.points : data.organizations.filter(o => o.location);
        assert.equal(items.length, count);
        assert.ok(items.every(item => item.location.region === location.region));
        if (fallback) assert.match(data.message, /Точных совпадений нет/);
        if (scenario === 'violations') assert.ok(data.recommendations.length > 0);
      }
      for (const params of [c.params, { ...c.params, region: '   ' }]) assert.equal((await page.request.get(c.api, { params })).status(), 400);
    }
  });
  for (const scenario of Object.keys(config)) {
    await check(`${scenario}: three fields, region validation, back/reload/navigation preserve draft, no LLM`, async page => {
      const aiCalls = [];
      page.on('request', r => { if (/\/api\/(chat|violations\/resolve-type)$/.test(new URL(r.url()).pathname)) aiCalls.push(r.url()); });
      await open(page, scenario);
      const form = page.locator(config[scenario].form);
      assert.equal(await form.locator('input').count(), 3);
      assert.equal(await form.getByLabel('Регион', { exact: true }).getAttribute('required'), '');
      assert.equal(await form.getByLabel('Населённый пункт (необязательно)').getAttribute('required'), null);
      assert.equal(await form.getByLabel('Район (необязательно)').getAttribute('required'), null);
      await form.locator('button[type="submit"]').click();
      assert.equal(await page.locator('#region').evaluate(e => e.validity.valueMissing), true);
      assert.equal(await form.isVisible(), true);
      await fill(page, full);
      await page.screenshot({ path: fileURLToPath(new URL(`../artifacts/location/${scenario}-fields.png`, import.meta.url)), fullPage: true });
      await form.locator('[data-go]').click();
      await page.locator(scenario === 'recycling' ? '#item-form button[type="submit"]' : '#violation-type-form button[type="submit"]').click();
      await assertFields(page, full);
      await page.reload(); await form.waitFor(); await assertFields(page, full);
      await page.goto('/assistant.html'); await page.goto(`/${scenario}.html`); await form.waitFor(); await assertFields(page, full);
      const data = await result(page, scenario);
      assert.deepEqual(data.location, full); assert.equal(data.match.level, 'region_settlement_district');
      await page.locator('#results .point').first().waitFor();
      assert.match(await page.locator('#results').innerText(), /Всеволожск/);
      await page.locator('[data-panel="result"] [data-go="location"]').click(); await assertFields(page, full);
      assert.deepEqual(aiCalls, []);
    });
    await check(`${scenario}: Moscow/SPb optional settlement and visible region fallback`, async page => {
      await open(page, scenario);
      for (const location of [{ region: 'Москва', district: 'район Арбат' }, { region: 'Санкт-Петербург', district: 'Петроградский район' }, { ...full, settlement: 'Неизвестный', district: 'Неизвестный' }]) {
        await fill(page, location); const data = await result(page, scenario);
        await page.locator('#results .point').first().waitFor();
        assert.equal(data.location.settlement, location.settlement || null);
        assert.equal(data.match.level, location.region === full.region ? 'region' : scenario === 'violations' && location.region === 'Москва' ? 'region' : 'region_district');
        if (location.region === full.region) assert.match(await page.locator('#results').innerText(), /по всему указанному региону/);
        await page.locator('[data-panel="result"] [data-go="location"]').click();
      }
      await page.setViewportSize({ width: 320, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    });
    await check(`${scenario}: API error/retry and unknown region retain all fields`, async page => {
      let calls = 0;
      await page.route(`**${config[scenario].api}?**`, route => ++calls === 1 ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Проверка временной ошибки' }) }) : route.continue());
      await open(page, scenario); await fill(page, full);
      await page.locator(`${config[scenario].form} button[type="submit"]`).click();
      await page.locator('#results [data-retry]').click(); await page.locator('#results .point').first().waitFor();
      assert.equal(calls, 2);
      await page.locator('[data-panel="result"] [data-go="location"]').click(); await assertFields(page, full);
      await fill(page, { ...full, region: 'Неизвестный регион' }); const data = await result(page, scenario);
      assert.equal(data.match.level, 'none');
      if (scenario === 'recycling') await page.locator('#results .empty').waitFor();
      else { assert.equal(data.isGeneralAdvice, true); assert.ok(data.organizations.every(o => o.location === null)); }
    });
    await check(`${scenario}: AI handoff updates all three recognized parameters, preserves description`, async page => {
      await page.goto('/');
      await page.evaluate(scenario => sessionStorage.setItem(`ecohelper.${scenario}.v1`, JSON.stringify({ screen: 'type', typeCode: 'illegal_dumping', description: 'Сохранённое описание' })), scenario);
      await page.route('**/api/chat', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'navigation', message: 'Перейдите в раздел', actions: [{ label: 'Открыть', url: `/${scenario}.html`, parameters: { ...full, item: 'Батарейки', violationType: 'waste_burning' } }] }) }));
      await page.goto('/assistant.html'); await page.locator('#ai-question').fill('Открой раздел'); await page.locator('#chat-form button').click();
      await page.locator('[data-intent] .chat-action').click(); await page.locator(config[scenario].form).waitFor(); await assertFields(page, full);
      if (scenario === 'violations') assert.equal(await page.locator('#description').inputValue(), 'Сохранённое описание');
    });
  }
  await check('Legacy recycling city migrates without guessing region; old violation address remains visible', async page => {
    await page.goto('/');
    for (const city of ['Москва', 'Всеволожск']) {
      await page.evaluate(city => sessionStorage.setItem('ecohelper.recycling.v1', JSON.stringify({ screen: 'location', item: 'Батарейки', city, district: 'Арбат' })), city);
      await page.goto('/recycling.html'); await page.locator('#location-form').waitFor();
      await assertFields(page, { region: city === 'Москва' ? city : '', settlement: city === 'Москва' ? '' : city, district: 'Арбат' });
    }
    await page.evaluate(() => sessionStorage.setItem('ecohelper.violations.v1', JSON.stringify({ screen: 'result', typeCode: 'waste_burning', description: 'Старый черновик', location: 'В Москве, у дома 10' })));
    await page.goto('/violations.html'); await page.locator('#violation-location-form').waitFor();
    await assertFields(page, {}); assert.match(await page.locator('#legacy-location').innerText(), /В Москве, у дома 10/);
    assert.equal(await page.locator('#description').inputValue(), 'Старый черновик');
  });
} finally {
  await browser.close();
  await mkdir(new URL('../artifacts/location/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/location/results.json', import.meta.url), JSON.stringify({ baseURL, checks }, null, 2));
}
console.log(`Passed ${checks.length} location API/browser checks.`);
