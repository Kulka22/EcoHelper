import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Live Gemini checks of canonical region/settlement/district; requires User Secrets on the server.
const baseURL = process.env.ECOHELPER_BASE_URL || 'http://localhost:5080';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const lo = { region: 'Ленинградская область', settlement: 'Всеволожск', district: 'Всеволожский' };
const cases = [
  ['Куда сдать батарейки в Москве?', 'find_disposal', { region: 'Москва', settlement: null, district: null }],
  ['Я из Москвы. Куда сдать батарейки?', 'find_disposal', { region: 'Москва', settlement: null, district: null }],
  ['Под Москвой хочу сдать батарейки. Где есть пункты?', 'find_disposal', { region: 'Москва', settlement: null, district: null }],
  ['Куда сдать батарейки в Санкт-Петербурге, Петроградский район?', 'find_disposal', { region: 'Санкт-Петербург', settlement: null, district: 'Петроградский' }],
  ['Куда сдать батарейки в Ленинградской области, во Всеволожске, Всеволожский район?', 'find_disposal', lo],
  ['Куда сдать батарейки в Казани?', 'find_disposal', { region: null, settlement: 'Казань', district: null }],
  ['В реку Москва в Коломне сливают грязную воду. Что делать?', 'environmental_violation', { region: null, settlement: 'Коломна', district: null }],
];
const records = [];
function verify(data, intent, location) {
  assert.equal(data.intent, intent);
  for (const field of ['region', 'settlement', 'district']) assert.equal(data.actions[0].parameters[field], location[field]);
  const facts = intent === 'find_disposal' ? data.recycling : data.violation;
  if (!location.region) { assert.equal(facts, null); assert.match(data.message, /регион/); }
  else { assert.deepEqual(facts.location, location); assert.notEqual(facts.match.level, 'none'); }
}
async function post(message) {
  const response = await fetch(`${baseURL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
  const data = await response.json();
  records.push({ message, status: response.status, response: data });
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
let browser;
try {
  for (const [message, intent, location] of cases) {
    verify(await post(message), intent, location);
    console.log(`PASS live API: ${message} -> ${JSON.stringify(location)}`);
  }
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  for (const scenario of ['recycling', 'violations']) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      const message = scenario === 'recycling' ? cases[4][0] : 'В Ленинградской области во Всеволожске, Всеволожский район, во дворе постоянно сжигают мусор. Что делать?';
      const intent = scenario === 'recycling' ? 'find_disposal' : 'environmental_violation';
      await page.goto('/assistant.html'); await page.locator('#ai-question').fill(message);
      const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/chat');
      await page.locator('#chat-form button').click();
      const reply = await response; const data = await reply.json();
      records.push({ message, ui: scenario, status: reply.status(), response: data });
      assert.equal(reply.status(), 200, JSON.stringify(data)); verify(data, intent, lo);
      await page.locator(`[data-intent="${intent}"] .chat-action`).click();
      const form = scenario === 'recycling' ? '#location-form' : '#violation-location-form';
      await page.locator(form).waitFor();
      for (const field of ['region', 'settlement', 'district']) assert.equal(await page.locator(`#${field}`).inputValue(), lo[field]);
      await page.locator(`${form} button[type="submit"]`).click();
      await page.getByRole('heading', { name: scenario === 'recycling' ? 'Учебный пункт «Всеволожск»' : 'Учебная организация «Всеволожск»', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      console.log(`PASS live UI -> ${scenario}: Gemini parameters, draft and SQLite result`);
    } finally { await context.close(); }
  }
  console.log('Passed 7 live API and 2 live browser canonical-location checks.');
} finally {
  if (browser) await browser.close();
  await mkdir(new URL('../artifacts/canonical-location/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/canonical-location/results.json', import.meta.url), JSON.stringify(records, null, 2));
}
