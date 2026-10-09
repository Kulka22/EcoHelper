import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Playwright is a development-only test tool; the website itself needs no Node.js packages.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const baseURL = process.env.ECOHELPER_BASE_URL || 'http://localhost:5080';
const output = new URL('../artifacts/ui/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const checks = [];
const scriptErrors = [];
const chatRequests = [];

async function check(name, run, viewport = { width: 1440, height: 1050 }) {
  const context = await browser.newContext({ baseURL, viewport });
  const page = await context.newPage();
  page.on('pageerror', error => scriptErrors.push({ check: name, error: error.message }));
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/chat') chatRequests.push(request.url()); });
  try {
    await run(page, context);
    checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
    await screenshot(page, `failure-${checks.length}.png`).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

async function visible(locator) { await locator.waitFor({ state: 'visible' }); }
async function clickSubmit(page, form) { await page.locator(form).getByRole('button', { name: /Продолжить|Показать/ }).click(); }
async function recyclingLocation(page, item = 'Стеклянная банка') {
  await page.goto('/recycling.html');
  await page.getByRole('button', { name: 'Начать поиск' }).click();
  await page.getByLabel('Что вы хотите сдать?').fill(item);
  await clickSubmit(page, '#item-form');
}
async function violationLocation(page) {
  await page.goto('/violations.html');
  await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).click();
  await clickSubmit(page, '#violation-type-form');
}
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, animations: 'disabled' });
}

try {
  await check('Navigation between all four pages; local fonts load', async page => {
    await page.goto('/');
    await screenshot(page, 'home-desktop.png');
    for (const [label, path] of [['Куда сдать', '/recycling.html'], ['Сообщить о нарушении', '/violations.html'], ['AI-помощник', '/assistant.html'], ['Главная', '/index.html']]) {
      const navigation = page.getByRole('navigation', { name: 'Основная навигация' });
      await navigation.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(`**${path}`);
      assert.equal(await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: label, exact: true }).getAttribute('aria-current'), 'page');
    }
    assert.equal(await page.evaluate(() => document.fonts.check('500 24px "Playfair Display"')), true);
    const externalRequests = [];
    page.on('request', request => { if (new URL(request.url()).origin !== new URL(baseURL).origin) externalRequests.push(request.url()); });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(externalRequests, []);
  });

  await check('Recycling: full real API scenario and loading state', async page => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/recycling/search?**', async route => { await gate; await route.continue(); });
    await recyclingLocation(page);
    await page.getByLabel('Город', { exact: true }).fill('Москва');
    await page.getByLabel('Район (необязательно)').fill('Дорогомилово');
    await clickSubmit(page, '#location-form');
    await visible(page.getByText('Ищем подходящие пункты', { exact: true }));
    release();
    await visible(page.getByRole('heading', { name: 'Учебный пункт «Раздельный сбор»', exact: true }));
    assert.match(await page.locator('#results').innerText(), /Освободите стеклянную тару/);
    assert.match(await page.locator('#results').innerText(), /Принимают:.*Стекло/);
    assert.equal(await page.locator('.point-distance').count(), 0);
    await screenshot(page, 'recycling-results.png');
  });

  await check('Recycling draft survives back, refresh and navigation; new search clears it', async page => {
    await recyclingLocation(page, 'Батарейки');
    await page.getByLabel('Город', { exact: true }).fill('Москва');
    await page.getByLabel('Район (необязательно)').fill('Арбат');
    await page.getByRole('button', { name: 'Вернуться к предмету' }).click();
    assert.equal(await page.locator('#item').inputValue(), 'Батарейки');
    await clickSubmit(page, '#item-form');
    assert.equal(await page.locator('#district').inputValue(), 'Арбат');
    await page.reload();
    await visible(page.locator('#location-form'));
    assert.equal(await page.locator('#district').inputValue(), 'Арбат');
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Главная', exact: true }).click();
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Куда сдать', exact: true }).click();
    await visible(page.locator('#location-form'));
    assert.equal(await page.locator('#district').inputValue(), 'Арбат');
    await clickSubmit(page, '#location-form');
    await visible(page.getByRole('heading', { name: 'Учебный пункт «Батарейки и техника»' }));
    await page.getByRole('button', { name: 'Назад к местоположению' }).click();
    assert.equal(await page.locator('#district').inputValue(), 'Арбат');
    await clickSubmit(page, '#location-form');
    await visible(page.locator('#results .point'));
    await page.getByRole('button', { name: 'Искать другой предмет' }).click();
    assert.equal(await page.locator('#item').inputValue(), '');
    assert.equal(await page.locator('#district').inputValue(), '');
    assert.equal(JSON.parse(await page.evaluate(() => sessionStorage.getItem('ecohelper.recycling.v1'))).item, '');
  });

  await check('Empty recycling results preserve category preparation', async page => {
    await recyclingLocation(page);
    await page.getByLabel('Город', { exact: true }).fill('Казань');
    await clickSubmit(page, '#location-form');
    await visible(page.getByRole('heading', { name: 'Подходящие пункты не найдены' }));
    assert.match(await page.locator('#results').innerText(), /Освободите стеклянную тару/);
    await screenshot(page, 'recycling-empty.png');
  });

  await check('Unknown item is escaped and returns empty results', async page => {
    await recyclingLocation(page, '<img src=x onerror=alert(1)>');
    await clickSubmit(page, '#location-form');
    await visible(page.getByRole('heading', { name: 'Подходящие пункты не найдены' }));
    assert.equal(await page.locator('main img').count(), 0);
    assert.match(await page.locator('#result-title').innerText(), /<img src=x/);
  });

  await check('Recycling HTTP error and retry without losing data', async page => {
    let attempt = 0;
    await page.route('**/api/recycling/search?**', route => ++attempt === 1
      ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Сервис временно недоступен.' }) }) : route.continue());
    await recyclingLocation(page, 'Батарейки');
    await clickSubmit(page, '#location-form');
    await visible(page.getByText('Сервис временно недоступен.', { exact: true }));
    await screenshot(page, 'recycling-error.png');
    await page.locator('#results').getByRole('button', { name: 'Повторить запрос' }).click();
    await visible(page.getByRole('heading', { name: 'Учебный пункт «Батарейки и техника»' }));
    assert.equal(attempt, 2);
  });

  await check('Category catalogue error can be retried', async page => {
    await page.route('**/api/recycling/categories', route => route.abort('failed'));
    await page.goto('/recycling.html');
    await page.getByRole('button', { name: 'Начать поиск' }).click();
    await visible(page.locator('#popular-items .error-state'));
    await page.unroute('**/api/recycling/categories');
    await page.locator('#popular-items').getByRole('button', { name: 'Повторить запрос' }).click();
    await page.locator('#popular-items').getByRole('button', { name: 'Батарейки', exact: true }).click();
    assert.equal(await page.locator('#item').inputValue(), 'Батарейки');
  });

  await check('Violations: description retained when selecting type; full real API scenario', async page => {
    await page.goto('/violations.html');
    await page.getByLabel('Описание', { exact: false }).fill('Во дворе постоянно сжигают мусор. Что делать?');
    await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).click();
    assert.equal(await page.locator('#description').inputValue(), 'Во дворе постоянно сжигают мусор. Что делать?');
    await clickSubmit(page, '#violation-type-form');
    await page.getByLabel('Местоположение').fill('Москва, район Арбат');
    await page.getByRole('button', { name: 'Назад к описанию' }).click();
    assert.equal(await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#description').inputValue(), /сжигают мусор/);
    await clickSubmit(page, '#violation-type-form');
    assert.equal(await page.locator('#location').inputValue(), 'Москва, район Арбат');
    await clickSubmit(page, '#violation-location-form');
    await visible(page.getByRole('heading', { name: 'Департамент природопользования и охраны окружающей среды города Москвы', exact: true }));
    assert.match(await page.locator('#results').innerText(), /Держитесь на безопасном расстоянии/);
    assert.equal(await page.getByRole('link', { name: /Подробнее об обращении/ }).count(), 2);
    await screenshot(page, 'violations-results.png');
    await page.reload();
    await visible(page.locator('[data-panel="result"]'));
    await visible(page.getByRole('heading', { name: 'Росприроднадзор', exact: true }));
    await page.getByRole('button', { name: 'Назад к местоположению' }).click();
    assert.equal(await page.locator('#location').inputValue(), 'Москва, район Арбат');
  });

  await check('Violations without location return general advice', async page => {
    await violationLocation(page);
    await clickSubmit(page, '#violation-location-form');
    await visible(page.getByRole('heading', { name: 'Росприроднадзор', exact: true }));
    assert.match(await page.locator('#results').innerText(), /Местоположение не указано/);
    assert.equal(await page.getByRole('link', { name: /Подробнее об обращении/ }).count(), 1);
  });

  await check('Description alone asks for a ready type without calling LLM', async page => {
    await page.goto('/violations.html');
    await page.getByRole('button', { name: 'Сжигание мусора', exact: true }).waitFor();
    await page.locator('#description').fill('Во дворе постоянно сжигают мусор. Что делать?');
    await clickSubmit(page, '#violation-type-form');
    await visible(page.locator('#type-error'));
    assert.match(await page.locator('#type-error').innerText(), /Выберите готовый тип/);
    assert.match(await page.locator('#description').inputValue(), /сжигают мусор/);
  });

  await check('Violations network error and retry', async page => {
    await page.route('**/api/violations/recommendations?**', route => route.abort('failed'));
    await violationLocation(page);
    await clickSubmit(page, '#violation-location-form');
    await visible(page.locator('#results .error-state'));
    assert.match(await page.locator('#results').innerText(), /Не удалось связаться с сервером/);
    await page.unroute('**/api/violations/recommendations?**');
    await page.locator('#results').getByRole('button', { name: 'Повторить запрос' }).click();
    await visible(page.getByRole('heading', { name: 'Росприроднадзор', exact: true }));
  });

  await check('Violation catalogue: error, retry and empty state', async page => {
    let attempt = 0;
    await page.route('**/api/violations/types', route => {
      attempt++;
      if (attempt === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      if (attempt === 2) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.continue();
    });
    await page.goto('/violations.html');
    await visible(page.locator('#violation-types .error-state'));
    await page.locator('#description').fill('Сохранить описание при повторе');
    await page.locator('#violation-types').getByRole('button', { name: 'Повторить запрос' }).click();
    await visible(page.getByRole('heading', { name: 'Типы нарушений пока не добавлены' }));
    await page.locator('#violation-types').getByRole('button', { name: 'Повторить запрос' }).click();
    await visible(page.getByRole('button', { name: 'Сжигание мусора', exact: true }));
    assert.equal(await page.locator('#description').inputValue(), 'Сохранить описание при повторе');
  });

  await check('AI page is ready; no request before submitting a message', async page => {
    await page.goto('/assistant.html');
    await visible(page.getByRole('heading', { name: 'Чем могу помочь?' }));
    assert.equal(await page.locator('#ai-question').isDisabled(), false);
    assert.equal(await page.getByRole('button', { name: 'Отправить' }).isDisabled(), false);
    await screenshot(page, 'assistant-desktop.png');
  });

  await check('Mobile pages have no horizontal document overflow', async page => {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of ['/index.html', '/recycling.html', '/violations.html', '/assistant.html']) {
        await page.goto(path);
        await visible(page.getByRole('navigation', { name: 'Основная навигация' }));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Overflow on ${path} at ${width}px`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await recyclingLocation(page);
    await clickSubmit(page, '#location-form');
    await visible(page.getByRole('heading', { name: 'Учебный пункт «Раздельный сбор»', exact: true }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await screenshot(page, 'recycling-mobile.png');
  }, { width: 390, height: 844 });

  assert.deepEqual(scriptErrors, [], 'Uncaught JavaScript errors');
  assert.deepEqual(chatRequests, [], 'Unexpected AI requests');
} finally {
  await browser.close();
  await writeFile(new URL('results.json', output), JSON.stringify({ baseURL, checks, scriptErrors, chatRequests }, null, 2));
}
console.log(`Passed ${checks.length} UI checks; no uncaught JavaScript errors or /api/chat requests.`);
