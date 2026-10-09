import { escapeHtml, instructionList, externalLink, loadingMarkup, errorMarkup, emptyMarkup, demoMarkup, updateSteps, showPanel } from './common.js';
import { getJson } from './api.js';
import { scenarioDraft } from './storage.js';

const draft = scenarioDraft('violations');
const state = draft.data;
const steps = [{ id: 'type', label: 'Что произошло' }, { id: 'location', label: 'Где это' }, { id: 'result', label: 'Рекомендации' }];
const typesContainer = document.querySelector('#violation-types');
const results = document.querySelector('#results');
const typeError = document.querySelector('#type-error');
let types = [];
let pending;
let requestId = 0;
draft.bindInputs();

function selectedType() { return types.find(type => type.code === state.typeCode); }
function renderTypes() {
  typesContainer.innerHTML = types.length ? types.map(type => `<button class="tag${type.code === state.typeCode ? ' is-selected' : ''}" type="button" data-type="${escapeHtml(type.code)}" aria-pressed="${type.code === state.typeCode}">${escapeHtml(type.name)}</button>`).join('') : emptyMarkup('Типы нарушений пока не добавлены', 'Попробуйте загрузить справочник позже.') + '<button class="button-secondary" type="button" data-retry="types">Повторить запрос</button>';
}
function go(screen, focus = true) {
  if (!steps.some(step => step.id === screen)) screen = 'type';
  if (screen !== 'type' && !selectedType()) screen = 'type';
  pending?.abort();
  requestId++;
  state.screen = screen;
  draft.save();
  updateSteps(steps, screen);
  showPanel(screen, focus);
  document.querySelector('#violation-context').textContent = `Проблема: ${selectedType()?.name ?? ''}`;
  document.querySelector('#result-context').textContent = state.location.trim() || 'Местоположение не указано';
  document.querySelector('#result-title').textContent = `Что делать: ${selectedType()?.name ?? ''}`;
  if (screen === 'result') loadResults();
}
async function loadTypes() {
  typesContainer.setAttribute('aria-busy', 'true');
  typesContainer.innerHTML = loadingMarkup('Загружаем типы нарушений', 'Получаем справочник из базы приложения.');
  const restoredScreen = state.screen;
  try {
    types = await getJson('/api/violations/types');
    if (!selectedType()) state.typeCode = '';
    renderTypes();
    go(restoredScreen, false);
  } catch (error) {
    types = [];
    typesContainer.innerHTML = errorMarkup(error, 'types');
    updateSteps(steps, 'type');
    showPanel('type', false);
  } finally { typesContainer.setAttribute('aria-busy', 'false'); }
}
async function loadResults() {
  pending?.abort();
  pending = new AbortController();
  const id = ++requestId;
  results.setAttribute('aria-busy', 'true');
  results.innerHTML = loadingMarkup('Подбираем рекомендации', 'Получаем рекомендации и организации из базы приложения.');
  try {
    const data = await getJson('/api/violations/recommendations', { type: state.typeCode, location: state.location }, { signal: pending.signal });
    if (id !== requestId) return;
    const organizations = data.organizations.length ? `<p class="points-label organization-label">Куда можно обратиться</p>${data.organizations.map(organization => `<article class="point"><h2 class="point-name">${escapeHtml(organization.name)}</h2><p class="point-address">${escapeHtml(organization.description)}</p><div class="point-meta"><span class="point-hours">${escapeHtml(organization.city || 'Общий справочный ресурс')}</span></div>${externalLink(organization.website, 'Подробнее об обращении')}</article>`).join('')}` : emptyMarkup('Организации не найдены', 'В базе пока нет подходящей организации. Рекомендации по ситуации доступны на этой странице.');
    results.innerHTML = demoMarkup(data.isDemoData) + (data.message ? `<p class="advice-note">${escapeHtml(data.message)}</p>` : '') + `<div class="found-results violation-advice"><aside class="prep"><h2 class="notice-title">Желательно зафиксировать</h2>${instructionList(data.whatToRecord)}</aside><section><article class="point"><h2 class="point-name">Что можно сделать</h2>${instructionList(data.recommendations)}</article>${organizations}</section></div>`;
  } catch (error) {
    if (id === requestId && error.name !== 'AbortError') results.innerHTML = errorMarkup(error, 'results');
  } finally { if (id === requestId) results.setAttribute('aria-busy', 'false'); }
}
document.querySelector('#violation-type-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!selectedType()) {
    typeError.hidden = false;
    typeError.textContent = types.length ? 'Выберите готовый тип нарушения. Распознавание описания пока не подключено.' : 'Сначала загрузите список типов нарушений.';
    return;
  }
  typeError.hidden = true;
  go('location');
});
document.querySelector('#violation-location-form').addEventListener('submit', event => { event.preventDefault(); go('result'); });
document.querySelector('main').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.go) go(button.dataset.go);
  if (button.dataset.type) { state.typeCode = button.dataset.type; draft.save(); typeError.hidden = true; renderTypes(); }
  if (button.dataset.retry === 'types') loadTypes();
  if (button.dataset.retry === 'results') loadResults();
  if (button.id === 'new-situation') { draft.reset(); typeError.hidden = true; renderTypes(); go('type'); }
});
updateSteps(steps, 'type');
showPanel('type', false);
loadTypes();
