import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

// Real browser + local SQLite API. Gemini responses are intercepted only in this test context.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const baseURL = process.env.ECOHELPER_BASE_URL || 'http://localhost:5080';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
let passed = 0;
const type = code => ({ id: code === 'waste_burning' ? 2 : 3, code, name: code === 'waste_burning' ? 'Сжигание мусора' : 'Загрязнение водоёма' });
const next = page => page.locator('#violation-type-form button[type="submit"]').click();
const backToType = page => page.locator('#violation-location-form [data-go="type"]').click();
const draft = (page, scenario) => page.evaluate(name => JSON.parse(sessionStorage.getItem(`ecohelper.${name}.v1`)), scenario);
async function check(name, run) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try { await run(page); assert.deepEqual(errors, []); passed++; console.log(`PASS ${name}`); }
  finally { await context.close(); }
}
async function openViolation(page, description = 'Сжигают мусор') {
  await page.goto('/violations.html');
  await page.locator('[data-type="waste_burning"]').waitFor();
  await page.locator('#description').fill(description);
}
async function chatHandoff(page, scenario, parameters, existing) {
  await page.goto('/');
  if (existing) await page.evaluate(({ scenario, existing }) => sessionStorage.setItem(`ecohelper.${scenario}.v1`, JSON.stringify(existing)), { scenario, existing });
  await page.route('**/api/chat', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'navigation', message: 'Перейдите в раздел', actions: [{ label: 'Открыть', url: `/${scenario}.html`, parameters }] }) }));
  await page.goto('/assistant.html');
  await page.locator('#ai-question').fill('Открой раздел');
  await page.locator('#chat-form button').click();
  await page.locator('[data-intent] .chat-action').click();
  await page.waitForURL(`**/${scenario}.html`);
  if (scenario === 'violations') await page.locator('[data-type="waste_burning"]').waitFor({ state: 'attached' });
}

try {
  await check('1: manual API uses literal canonical region without morphology or LLM', async page => {
    for (const region of ['Москва', 'город Москва', 'г. Москва']) {
      const response = await page.request.get('/api/violations/recommendations', { params: { type: 'waste_burning', region } });
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).organizations[0].location.region, 'Москва');
    }
    for (const region of ['Москва-река, город Коломна', 'в Москве', 'из Москвы', 'под Москвой']) {
      const response = await page.request.get('/api/violations/recommendations', { params: { type: 'waste_burning', region } });
      assert.equal((await response.json()).match.level, 'none');
    }
  });
  await check('1: manual violation form selects organization for canonical region and retains fields', async page => {
    await openViolation(page);
    await page.locator('[data-type="waste_burning"]').click();
    await next(page);
    await page.locator('#region').fill('Москва');
    await page.locator('#violation-location-form button[type="submit"]').click();
    await page.getByRole('heading', { name: 'Департамент природопользования и охраны окружающей среды города Москвы', exact: true }).waitFor();
    await page.locator('[data-panel="result"] [data-go="location"]').click();
    assert.equal(await page.locator('#region').inputValue(), 'Москва');
  });
  await check('2: inferred type deselects; changed description resolves new type; manual choice bypasses LLM', async page => {
    let calls = 0;
    await page.route('**/api/violations/resolve-type', route => {
      calls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(type(calls === 1 ? 'waste_burning' : 'water_pollution')) });
    });
    await openViolation(page); await next(page);
    await page.locator('#violation-location-form').waitFor(); await backToType(page);
    assert.equal(await page.locator('[data-type="waste_burning"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-type="waste_burning"]').click();
    assert.equal(await page.locator('[data-type="waste_burning"]').getAttribute('aria-pressed'), 'false');
    assert.equal((await draft(page, 'violations')).typeCode, '');
    assert.equal((await draft(page, 'violations')).resolvedTypeCode, '');
    await page.locator('#description').fill('В реку сливают грязную воду'); await next(page);
    await page.locator('#violation-location-form').waitFor();
    assert.match(await page.locator('#violation-context').innerText(), /Загрязнение водоёма/i);
    assert.equal(calls, 2);
    await backToType(page); await page.locator('[data-type="illegal_dumping"]').click(); await next(page);
    await page.locator('#violation-location-form').waitFor();
    assert.equal((await draft(page, 'violations')).typeCode, 'illegal_dumping');
    assert.equal(calls, 2);
  });
  await check('3: recycling handoff updates recognized item and preserves region/district', async page => {
    await chatHandoff(page, 'recycling', { item: 'Батарейки', region: null, district: ' ' }, { screen: 'location', item: 'Бумага', region: 'Республика Татарстан', district: 'Центральный' });
    assert.equal(await page.locator('#item').inputValue(), 'Батарейки');
    assert.equal(await page.locator('#region').inputValue(), 'Республика Татарстан');
    assert.equal(await page.locator('#district').inputValue(), 'Центральный');
  });
  await check('3: fresh chat handoff without region does not invent Moscow', async page => {
    await chatHandoff(page, 'recycling', { item: 'Батарейки', region: null });
    assert.equal(await page.locator('#region').inputValue(), '');
  });
  await check('3: violation handoff preserves description/location while updating type', async page => {
    await chatHandoff(page, 'violations', { violationType: 'waste_burning', region: null }, { screen: 'location', typeCode: 'illegal_dumping', description: 'Свалка возле гаражей', region: 'Москва' });
    assert.equal(await page.locator('#description').inputValue(), 'Свалка возле гаражей');
    assert.equal(await page.locator('#region').inputValue(), 'Москва');
    assert.equal((await draft(page, 'violations')).typeCode, 'waste_burning');
  });
  await check('3: location-only handoff preserves cached inferred type and description', async page => {
    await chatHandoff(page, 'violations', { violationType: null, region: 'Москва' }, { screen: 'type', typeCode: '', description: 'Сжигают мусор', region: '', resolvedTypeCode: 'waste_burning', resolvedDescription: 'Сжигают мусор' });
    assert.equal(await page.locator('#region').inputValue(), 'Москва');
    assert.equal(await page.locator('#description').inputValue(), 'Сжигают мусор');
    assert.equal((await draft(page, 'violations')).resolvedTypeCode, 'waste_burning');
    await page.locator('#violation-location-form').waitFor();
  });
  await check('6: 422 has its own message; unchanged submit/reload does not repeat; edited text works', async page => {
    let calls = 0;
    await page.route('**/api/violations/resolve-type', route => {
      calls++;
      return route.request().postDataJSON().description === 'Как дела?'
        ? route.fulfill({ status: 422, contentType: 'application/problem+json', body: JSON.stringify({ code: 'violation_type_unknown', detail: 'Не удалось определить поддерживаемый тип.' }) })
        : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(type('waste_burning')) });
    });
    await openViolation(page, 'Как дела?'); await next(page);
    await page.getByRole('heading', { name: 'Не удалось определить тип нарушения', exact: true }).waitFor();
    assert.equal(await page.locator('#type-error .error-state, #type-error [data-retry]').count(), 0);
    await next(page); assert.equal(calls, 1);
    await page.reload(); await page.locator('[data-type="waste_burning"]').waitFor();
    await page.locator('#description').fill('  Как дела?  '); await next(page); assert.equal(calls, 1);
    await page.locator('#description').fill('Сжигают мусор'); await next(page);
    await page.locator('#violation-location-form').waitFor(); assert.equal(calls, 2);
  });
  await check('6: manual type works after 422 without another classification', async page => {
    let calls = 0;
    await page.route('**/api/violations/resolve-type', route => { calls++; return route.fulfill({ status: 422, contentType: 'application/problem+json', body: '{}' }); });
    await openViolation(page, 'Как дела?'); await next(page);
    await page.getByRole('heading', { name: 'Не удалось определить тип нарушения', exact: true }).waitFor();
    await page.locator('[data-type="waste_burning"]').click(); await next(page);
    await page.locator('#violation-location-form').waitFor(); assert.equal(calls, 1);
  });
  await check('6: transient API failure still offers retry with the same description', async page => {
    let calls = 0;
    await page.route('**/api/violations/resolve-type', route => ++calls === 1
      ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'AI-сервис временно недоступен.' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(type('waste_burning')) }));
    await openViolation(page); await next(page);
    await page.locator('#type-error [data-retry="classification"]').click();
    await page.locator('#violation-location-form').waitFor(); assert.equal(calls, 2);
    assert.equal(await page.locator('#description').inputValue(), 'Сжигают мусор');
  });
  await check('10: refined item returns SQLite category, preparation and points through the form', async page => {
    await page.goto('/recycling.html'); await page.locator('[data-panel="intro"] [data-go="item"]').click();
    await page.locator('#item').fill('батарейки AA'); await page.locator('#item-form button[type="submit"]').click();
    await page.locator('#region').fill('Москва'); await page.locator('#location-form button[type="submit"]').click();
    await page.locator('#results .point').waitFor(); assert.equal(await page.locator('#results .point').count(), 1);
    assert.match(await page.locator('#results .prep').innerText(), /Батарейки/i);
    await page.locator('[data-panel="result"] [data-go="location"]').click();
    await page.locator('#location-form [data-go="item"]').click();
    await page.locator('#item').fill('батарейки и одежда'); await page.locator('#item-form button[type="submit"]').click();
    await page.locator('#location-form button[type="submit"]').click();
    await page.locator('#results .empty').waitFor(); assert.equal(await page.locator('#results .point').count(), 0);
  });
  console.log(`Passed ${passed} audit regression checks.`);
} finally { await browser.close(); }
