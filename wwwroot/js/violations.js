import { escapeHtml, instructionList, externalLink, loadingMarkup, errorMarkup, emptyMarkup, demoMarkup, updateSteps, showPanel, validateRequired } from './common.js';
import { getJson, postJson } from './api.js';
import { scenarioDraft } from './storage.js';

const draft = scenarioDraft('violations');
const state = draft.data;
const steps = [{ id: 'type', label: 'Что произошло' }, { id: 'location', label: 'Где это' }, { id: 'result', label: 'Рекомендации' }];
const typesContainer = document.querySelector('#violation-types');
const results = document.querySelector('#results');
const typeError = document.querySelector('#type-error');
const continueButton = document.querySelector('#violation-type-form button[type="submit"]');
let types = [];
let pending;
let requestId = 0;
let classification;
let classificationId = 0;
draft.bindInputs();

function selectedType() {
  const code = state.typeCode || (state.resolvedDescription === state.description.trim() ? state.resolvedTypeCode : '');
  return types.find(type => type.code === code);
}
function renderTypes() {
  const chosen = selectedType()?.code;
  typesContainer.innerHTML = types.length ? types.map(type => `<button class="tag${type.code === chosen ? ' is-selected' : ''}" type="button" data-type="${escapeHtml(type.code)}" aria-pressed="${type.code === chosen}">${escapeHtml(type.name)}</button>`).join('') : emptyMarkup('Типы нарушений пока не добавлены', 'Попробуйте загрузить справочник позже.') + '<button class="button-secondary" type="button" data-retry="types">Повторить запрос</button>';
}
function cancelClassification() {
  classification?.abort();
  classificationId++;
  continueButton.disabled = false;
}
function showUnresolvedType() {
  typeError.hidden = false;
  typeError.innerHTML = '<div class="empty" role="status"><h2 class="status-title">Не удалось определить тип нарушения</h2><p class="status-text">Уточните описание или выберите готовый тип нарушения.</p></div>';
}
function go(screen, focus = true) {
  if (!steps.some(step => step.id === screen)) screen = 'type';
  if (screen !== 'type' && !selectedType()) screen = 'type';
  if (screen === 'result' && !state.region.trim()) screen = 'location';
  cancelClassification();
  pending?.abort();
  requestId++;
  state.screen = screen;
  draft.save();
  updateSteps(steps, screen);
  showPanel(screen, focus);
  document.querySelector('#violation-context').textContent = `Проблема: ${selectedType()?.name ?? ''}`;
  document.querySelector('#result-context').textContent = [state.region, state.settlement, state.district].filter(value => value.trim()).join(' · ');
  const legacy = document.querySelector('#legacy-location');
  legacy.hidden = !state.legacyLocation;
  legacy.textContent = `Ранее указанное местоположение: ${state.legacyLocation}. Перенесите нужные сведения в поля выше.`;
  document.querySelector('#result-title').textContent = `Что делать: ${selectedType()?.name ?? ''}`;
  if (screen === 'result') loadResults();
}
async function loadTypes() {
  typesContainer.setAttribute('aria-busy', 'true');
  typesContainer.innerHTML = loadingMarkup('Загружаем типы нарушений', 'Получаем справочник из базы приложения.');
  const restoredScreen = state.screen;
  try {
    types = await getJson('/api/violations/types');
    if (!types.some(type => type.code === state.typeCode)) state.typeCode = '';
    if (!types.some(type => type.code === state.resolvedTypeCode)) { state.resolvedTypeCode = ''; state.resolvedDescription = ''; }
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
    const data = await getJson('/api/violations/recommendations', { type: selectedType().code, region: state.region, settlement: state.settlement, district: state.district }, { signal: pending.signal });
    if (id !== requestId) return;
    const organizations = data.organizations.length ? `<p class="points-label organization-label">Куда можно обратиться</p>${data.organizations.map(organization => `<article class="point"><h2 class="point-name">${escapeHtml(organization.name)}</h2><p class="point-address">${escapeHtml(organization.description)}</p><div class="point-meta"><span class="point-hours">${escapeHtml(organization.location ? [organization.location.region, organization.location.settlement, organization.location.district].filter(Boolean).join(' · ') : 'Общий справочный ресурс')}</span></div>${externalLink(organization.website, 'Подробнее об обращении')}</article>`).join('')}` : emptyMarkup('Организации не найдены', 'В базе пока нет подходящей организации. Рекомендации по ситуации доступны на этой странице.');
    results.innerHTML = demoMarkup(data.isDemoData) + (data.message ? `<p class="advice-note">${escapeHtml(data.message)}</p>` : '') + `<div class="found-results violation-advice"><aside class="prep"><h2 class="notice-title">Желательно зафиксировать</h2>${instructionList(data.whatToRecord)}</aside><section><article class="point"><h2 class="point-name">Что можно сделать</h2>${instructionList(data.recommendations)}</article>${organizations}</section></div>`;
  } catch (error) {
    if (id === requestId && error.name !== 'AbortError') results.innerHTML = errorMarkup(error, 'results');
  } finally { if (id === requestId) results.setAttribute('aria-busy', 'false'); }
}
async function continueFromType() {
  if (continueButton.disabled) return;
  typeError.hidden = true;
  if (selectedType()) { go('location'); return; }
  if (!types.length || !state.description.trim()) {
    typeError.hidden = false;
    typeError.textContent = types.length ? 'Выберите тип нарушения или опишите ситуацию.' : 'Сначала загрузите список типов нарушений.';
    return;
  }
  if (state.unresolvedDescription === state.description.trim()) { showUnresolvedType(); return; }
  classification = new AbortController();
  const id = ++classificationId;
  const description = state.description.trim();
  continueButton.disabled = true;
  typeError.hidden = false;
  typeError.innerHTML = loadingMarkup('Определяем тип нарушения', 'Анализируем описание; рекомендации будут получены из базы сервиса.');
  try {
    const type = await postJson('/api/violations/resolve-type', { description }, { signal: classification.signal });
    if (id !== classificationId) return;
    if (!types.some(known => known.code === type.code)) throw new Error('Получен неизвестный тип нарушения. Выберите готовый тип.');
    state.resolvedTypeCode = type.code;
    state.resolvedDescription = description;
    state.unresolvedDescription = '';
    draft.save();
    renderTypes();
    typeError.hidden = true;
    go('location');
  } catch (error) {
    if (id === classificationId && error.name !== 'AbortError') {
      if (error.status === 422) {
        state.unresolvedDescription = description;
        draft.save();
        showUnresolvedType();
      } else typeError.innerHTML = errorMarkup(error, 'classification');
    }
  } finally { if (id === classificationId) continueButton.disabled = false; }
}
document.querySelector('#violation-type-form').addEventListener('submit', event => {
  event.preventDefault();
  continueFromType();
});
document.querySelector('#description').addEventListener('input', () => {
  cancelClassification();
  typeError.hidden = true;
  if (types.length) renderTypes();
});
document.querySelector('#violation-location-form').addEventListener('submit', event => { event.preventDefault(); if (validateRequired(document.querySelector('#region'), 'Укажите регион.')) go('result'); });
document.querySelector('main').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.go) go(button.dataset.go);
  if (button.dataset.type) {
    cancelClassification();
    state.typeCode = selectedType()?.code === button.dataset.type ? '' : button.dataset.type;
    state.resolvedTypeCode = ''; state.resolvedDescription = '';
    draft.save(); typeError.hidden = true; renderTypes();
  }
  if (button.dataset.retry === 'types') loadTypes();
  if (button.dataset.retry === 'results') loadResults();
  if (button.dataset.retry === 'classification') continueFromType();
  if (button.id === 'new-situation') { draft.reset(); typeError.hidden = true; renderTypes(); go('type'); }
});
updateSteps(steps, 'type');
showPanel('type', false);
loadTypes();
