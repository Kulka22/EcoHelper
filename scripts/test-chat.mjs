import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const baseURL = process.env.ECOHELPER_BASE_URL || 'http://localhost:5080';
const output = new URL('../artifacts/chat/', import.meta.url);
await mkdir(output, { recursive: true });
const regression = JSON.parse(await readFile(new URL('../docs/regression-cases.json', import.meta.url), 'utf8'))[0];
const cases = [
  { message: 'Куда сдать батарейки в Москве?', intent: 'find_disposal', url: '/recycling.html' },
  { message: regression.input, intent: regression.expectedIntent, url: regression.expectedDestination },
  { message: 'Где найти раздел для сообщения об экологическом нарушении?', intent: 'navigation', url: '/violations.html' },
  { message: 'Как дела?', intent: 'unknown' },
];
const unknown = 'Я могу помочь только с вопросами об экологии и возможностях Экопомощника.';
const apiChecks = [];
const uiChecks = [];
const errors = [];
const allowed = new Set(['/', '/recycling.html', '/violations.html', '/assistant.html']);
function verify(data, test) {
  assert.equal(data.intent, test.intent);
  assert.equal(data.actions.every(action => allowed.has(action.url)), true);
  if (test.url) assert.equal(data.actions[0].url, test.url);
  if (test.intent === 'find_disposal') {
    assert.equal(data.recycling.category.code, 'batteries');
    assert.equal(data.recycling.city, 'Москва');
    assert.equal(data.recycling.points.length, 1);
    assert.match(data.recycling.preparationInstructions[0], /батарейки/);
  }
  if (test.intent === 'environmental_violation') {
    assert.equal(data.violation.type.code, 'waste_burning');
    assert.ok(data.violation.location === null || data.violation.location.toLowerCase() === 'во дворе');
    assert.equal(data.violation.matchedCity, null);
    assert.equal(data.violation.isGeneralAdvice, true);
    assert.equal(data.violation.organizations.length, 1);
    assert.match(data.violation.recommendations[0], /огня и дыма/);
  }
  if (test.intent === 'unknown') { assert.equal(data.message, unknown); assert.equal(data.actions.length, 0); }
}
async function post(body) { return fetch(`${baseURL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

for (const test of cases) {
  const response = await post({ message: test.message });
  const data = await response.json();
  const record = { message: test.message, expectedIntent: test.intent, status: response.status, response: data };
  apiChecks.push(record);
  try { assert.equal(response.status, 200); verify(data, test); record.passed = true; console.log(`PASS live API: ${test.intent}`); }
  catch (error) { record.passed = false; record.error = error.message; console.log(`FAIL live API: ${test.intent}: ${error.message}`); }
}
for (const body of [{}, { message: null }, { message: '' }, { message: '  ' }, { message: 'x'.repeat(2001) }]) {
  const response = await post(body);
  assert.equal(response.status, 400);
}
console.log('PASS HTTP validation: missing, null, empty, whitespace, oversized message');

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, animations: 'disabled' });
}
async function check(name, run, viewport = { width: 1440, height: 1050 }) {
  const context = await browser.newContext({ baseURL, viewport });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  // The browser should only contact our own server, never Gemini directly.
  page.on('request', request => { if (new URL(request.url()).origin !== new URL(baseURL).origin) errors.push(`External browser request: ${new URL(request.url()).origin}`); });
  try { await run(page); uiChecks.push({ name, passed: true }); console.log(`PASS UI: ${name}`); }
  catch (error) { uiChecks.push({ name, passed: false, error: error.message }); await screenshot(page, `failure-${uiChecks.length}.png`).catch(() => {}); throw error; }
  finally { await context.close(); }
}
async function send(page, message) {
  await page.locator('#ai-question').fill(message);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  return response;
}
try {
  for (const [index, test] of cases.entries()) {
    await check(`Live Gemini: ${test.intent}; rendered answer and navigation`, async page => {
      let release;
      if (index === 0) {
        const gate = new Promise(resolve => { release = resolve; });
        await page.route('**/api/chat', async route => { await gate; await route.continue(); });
      }
      await page.goto('/assistant.html');
      await page.locator('#ai-question').fill(test.message);
      const reply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat');
      await page.getByRole('button', { name: 'Отправить', exact: true }).click();
      if (release) {
        await page.getByText('Анализируем запрос…', { exact: true }).waitFor();
        assert.equal(await page.locator('#ai-question').isDisabled(), true);
        await screenshot(page, 'chat-loading.png');
        release();
      }
      const response = await reply;
      assert.equal(response.status(), 200);
      const data = await response.json();
      verify(data, test);
      const bubble = page.locator(`.assistant-message[data-intent="${test.intent}"]`);
      await bubble.waitFor();
      assert.match(await bubble.innerText(), new RegExp(data.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(await page.locator('.user-message').innerText(), test.message);
      await screenshot(page, `chat-${test.intent}.png`);
      if (test.url) {
        await bubble.getByRole('link').first().click();
        await page.waitForURL(`**${test.url}`);
        if (test.intent === 'find_disposal') {
          await page.locator('#location-form').waitFor();
          assert.equal(await page.locator('#city').inputValue(), 'Москва');
          const draft = JSON.parse(await page.evaluate(() => sessionStorage.getItem('ecohelper.recycling.v1')));
          assert.match(draft.item.toLowerCase(), /батарейки/);
          assert.equal(draft.district, '');
          await page.getByRole('button', { name: 'Вернуться к предмету' }).click();
          assert.match((await page.locator('#item').inputValue()).toLowerCase(), /батарейки/);
        }
        if (test.intent === 'environmental_violation') {
          await page.locator('#violation-location-form').waitFor();
          assert.equal(await page.locator('#location').inputValue(), data.violation.location ?? '');
          const draft = JSON.parse(await page.evaluate(() => sessionStorage.getItem('ecohelper.violations.v1')));
          assert.equal(draft.typeCode, 'waste_burning');
          await page.getByRole('button', { name: 'Назад к описанию' }).click();
          assert.equal(await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).getAttribute('aria-pressed'), 'true');
        }
      }
      await page.goto('/assistant.html');
      assert.equal(await page.locator('.user-message, [data-intent]').count(), 0);
      assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some(key => /chat|assistant/i.test(key))), false);
      assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0);
    });
  }

  await check('API error and retry keep one user message', async page => {
    const fixture = apiChecks.find(result => result.passed && result.expectedIntent === 'find_disposal')?.response;
    assert.ok(fixture, 'Live API response is required for retry fixture');
    let attempts = 0;
    await page.route('**/api/chat', route => ++attempts === 1
      ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'AI-сервис временно недоступен.' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
    await page.goto('/assistant.html');
    await send(page, cases[0].message);
    await page.getByText('AI-сервис временно недоступен.', { exact: true }).waitFor();
    await screenshot(page, 'chat-error.png');
    await page.getByRole('button', { name: 'Повторить запрос', exact: true }).click();
    await page.locator('[data-intent="find_disposal"]').waitFor();
    assert.equal(attempts, 2);
    assert.equal(await page.locator('.user-message').count(), 1);
  });

  await check('Unsafe HTML is text and arbitrary action URLs are not rendered', async page => {
    await page.route('**/api/chat', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'unknown', message: '<img src=x onerror=alert(1)>', actions: [{ label: 'unsafe', url: 'javascript:alert(1)' }, { label: 'external', url: 'https://example.com' }] }) }));
    await page.goto('/assistant.html');
    await send(page, '<img src=x onerror=alert(1)>');
    const bubble = page.locator('[data-intent="unknown"]');
    await bubble.waitFor();
    assert.equal(await page.locator('main img').count(), 0);
    assert.equal(await bubble.getByRole('link').count(), 0);
  });

  await check('Mobile chat fits 320px; current dialogue disappears on reload', async page => {
    const fixture = apiChecks.find(result => result.passed && result.expectedIntent === 'environmental_violation')?.response;
    assert.ok(fixture);
    await page.route('**/api/chat', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
    await page.goto('/assistant.html');
    await send(page, regression.input);
    await page.locator('[data-intent="environmental_violation"]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await screenshot(page, 'chat-mobile.png');
    await page.reload();
    assert.equal(await page.locator('.user-message, [data-intent]').count(), 0);
  }, { width: 320, height: 844 });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(new URL('results.json', output), JSON.stringify({ baseURL, apiChecks, validationCases: 5, uiChecks, errors }, null, 2));
}
assert.equal(apiChecks.every(result => result.passed), true, 'Some live API classification checks failed');
console.log(`Passed ${apiChecks.length} live API queries, 5 validation cases and ${uiChecks.length} UI checks.`);
