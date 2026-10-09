import { escapeHtml, instructionList, externalLink, loadingMarkup, errorMarkup, emptyMarkup, demoMarkup, updateSteps, showPanel, validateRequired } from './common.js';
import { getJson } from './api.js';
import { scenarioDraft } from './storage.js';

const draft = scenarioDraft('recycling');
const state = draft.data;
const steps = [{ id: 'item', label: 'Что сдаём' }, { id: 'location', label: 'Где вы' }, { id: 'result', label: 'Результат' }];
const results = document.querySelector('#results');
const popular = document.querySelector('#popular-items');
let pending;
let requestId = 0;
draft.bindInputs();

function go(screen, focus = true) {
  if (!['intro', ...steps.map(step => step.id)].includes(screen)) screen = 'intro';
  if (['location', 'result'].includes(screen) && !state.item.trim()) screen = 'item';
  if (screen === 'result' && !state.city.trim()) screen = 'location';
  pending?.abort();
  requestId++;
  state.screen = screen;
  draft.save();
  updateSteps(steps, screen);
  showPanel(screen, focus);
  document.querySelector('#item-context').textContent = `Ищем пункты для: ${state.item}`;
  document.querySelector('#result-context').textContent = [state.city, state.district].filter(value => value.trim()).join(' · ');
  document.querySelector('#result-title').textContent = `Подходящие варианты для: ${state.item}`;
  if (screen === 'result') loadResults();
}

async function loadCategories() {
  popular.innerHTML = '<span class="popular-label" role="status">Загружаем категории…</span>';
  try {
    const categories = await getJson('/api/recycling/categories');
    popular.innerHTML = `<span class="popular-label">Часто ищут</span>${categories.slice(0, 4).map(category => `<button class="tag" type="button" data-item="${escapeHtml(category.name)}">${escapeHtml(category.name)}</button>`).join('')}`;
  } catch (error) { popular.innerHTML = errorMarkup(error, 'categories'); }
}

async function loadResults() {
  pending?.abort();
  pending = new AbortController();
  const id = ++requestId;
  results.setAttribute('aria-busy', 'true');
  results.innerHTML = loadingMarkup('Ищем подходящие пункты', 'Проверяем категории и условия приёма в выбранном городе.');
  try {
    const data = await getJson('/api/recycling/search', { item: state.item, city: state.city, district: state.district }, { signal: pending.signal });
    if (id !== requestId) return;
    const preparation = data.preparationInstructions.length ? `<aside class="prep"><h2 class="notice-title">Подготовьте${data.category ? `: ${escapeHtml(data.category.name)}` : ''}</h2>${instructionList(data.preparationInstructions)}</aside>` : '';
    const points = data.points.length ? `<section><p class="points-label">Подходящие пункты: ${data.points.length}</p>${data.points.map(point => `<article class="point"><h2 class="point-name">${escapeHtml(point.name)}</h2><p class="point-address">${escapeHtml(point.address)}</p><div class="point-meta"><span class="point-hours">${escapeHtml(point.workingHours)}</span><span class="point-accepts">Принимают: ${escapeHtml(point.acceptedCategories.map(category => category.name).join(', '))}</span></div>${externalLink(point.website, 'Сайт пункта')}</article>`).join('')}</section>` : emptyMarkup('Подходящие пункты не найдены', data.message || 'Попробуйте изменить город, район или предмет.');
    results.innerHTML = demoMarkup(data.isDemoData, true) + (preparation ? `<div class="found-results">${preparation}${points}</div>` : points);
  } catch (error) {
    if (id === requestId && error.name !== 'AbortError') results.innerHTML = errorMarkup(error, 'results');
  } finally { if (id === requestId) results.setAttribute('aria-busy', 'false'); }
}

document.querySelector('#item-form').addEventListener('submit', event => {
  event.preventDefault();
  if (validateRequired(document.querySelector('#item'), 'Укажите предмет.')) go('location');
});
document.querySelector('#location-form').addEventListener('submit', event => {
  event.preventDefault();
  if (validateRequired(document.querySelector('#city'), 'Укажите город.')) go('result');
});
document.querySelector('main').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.go) go(button.dataset.go);
  if (button.dataset.item) {
    state.item = button.dataset.item;
    document.querySelector('#item').value = state.item;
    document.querySelector('#item').setCustomValidity('');
    draft.save();
  }
  if (button.dataset.retry === 'categories') loadCategories();
  if (button.dataset.retry === 'results') loadResults();
  if (button.id === 'new-search') { draft.reset(); go('item'); }
});
go(state.screen, false);
loadCategories();
