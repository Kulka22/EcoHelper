import { postJson } from './api.js';
import { errorMarkup, instructionList, escapeHtml, validateRequired } from './common.js';
import { scenarioDraft } from './storage.js';

const form = document.querySelector('#chat-form');
const question = document.querySelector('#ai-question');
const dialogue = document.querySelector('#chat-dialogue');
const submit = form.querySelector('button');
const allowedPages = new Set(['/', '/recycling.html', '/violations.html', '/assistant.html']);
let busy = false;

function bubble(className, text) {
  const element = document.createElement('div');
  element.className = `chat-message ${className}`;
  if (text) { const p = document.createElement('p'); p.textContent = text; element.append(p); }
  dialogue.append(element);
  return element;
}

function details(title, content) {
  return `<div class="chat-details"><h2 class="chat-detail-title">${escapeHtml(title)}</h2>${content}</div>`;
}

function renderReply(slot, data) {
  slot.replaceChildren();
  slot.className = 'chat-message assistant-message';
  slot.dataset.intent = data.intent;
  const text = document.createElement('p');
  text.textContent = data.message;
  slot.append(text);
  const facts = document.createElement('div');
  if (data.recycling) {
    const result = data.recycling;
    if (result.preparationInstructions.length) facts.innerHTML += details('Как подготовить', instructionList(result.preparationInstructions));
    if (result.points.length) facts.innerHTML += details('Пункты из базы', `<ul class="chat-facts">${result.points.map(point => `<li><strong>${escapeHtml(point.name)}</strong><br>${escapeHtml(point.address)}<br>${escapeHtml(point.workingHours)}</li>`).join('')}</ul>`);
    if (result.isDemoData) facts.innerHTML += '<p class="advice-note">Пункты, адреса и часы работы — учебные примеры. Не используйте их для планирования поездки.</p>';
  }
  if (data.violation) {
    const result = data.violation;
    facts.innerHTML += details('Что можно сделать', instructionList(result.recommendations));
    facts.innerHTML += details('Желательно зафиксировать', instructionList(result.whatToRecord));
    if (result.organizations.length) facts.innerHTML += details('Куда можно обратиться', `<ul class="chat-facts">${result.organizations.map(organization => `<li>${escapeHtml(organization.name)}</li>`).join('')}</ul>`);
    if (result.message) facts.innerHTML += `<p class="advice-note">${escapeHtml(result.message)}</p>`;
    if (result.isDemoData) facts.innerHTML += '<p class="advice-note">Демонстрационная база. Уточните компетенцию и порядок обращения на официальном сайте организации. Сервис не отправляет обращения.</p>';
  }
  slot.append(facts);
  const actions = document.createElement('div');
  actions.className = 'assistant-links';
  for (const action of data.actions) {
    if (!allowedPages.has(action.url)) continue;
    const link = document.createElement('a');
    link.className = 'chat-action';
    link.href = action.url;
    link.textContent = `${action.label} →`;
    link.addEventListener('click', () => transferParameters(action.url, action.parameters));
    actions.append(link);
  }
  slot.append(actions);
}

function transferParameters(url, parameters) {
  if (!parameters || !Object.values(parameters).some(value => typeof value === 'string' && value.trim())) return;
  const recognized = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  if (url === '/recycling.html') {
    if (!['item', 'region', 'settlement', 'district'].some(field => recognized(parameters[field]) !== null)) return;
    const draft = scenarioDraft('recycling');
    for (const field of ['item', 'region', 'settlement', 'district']) {
      const value = recognized(parameters[field]);
      if (value !== null) draft.data[field] = value;
    }
    draft.data.screen = draft.data.item.trim() ? 'location' : 'item';
    draft.save();
  }
  if (url === '/violations.html') {
    const type = recognized(parameters.violationType);
    if (type === null && !['region', 'settlement', 'district'].some(field => recognized(parameters[field]) !== null)) return;
    const draft = scenarioDraft('violations');
    if (type !== null) {
      draft.data.typeCode = type;
      draft.data.resolvedTypeCode = ''; draft.data.resolvedDescription = '';
    }
    for (const field of ['region', 'settlement', 'district']) {
      const value = recognized(parameters[field]);
      if (value !== null) draft.data[field] = value;
    }
    const chosen = draft.data.typeCode || (draft.data.resolvedDescription === draft.data.description.trim() ? draft.data.resolvedTypeCode : '');
    draft.data.screen = chosen ? 'location' : 'type';
    draft.save();
  }
}

async function send(message, slot) {
  if (busy) return;
  if (!slot) { bubble('user-message', message); slot = bubble('assistant-message'); }
  busy = true;
  question.disabled = true;
  submit.disabled = true;
  slot.removeAttribute('data-intent');
  slot.setAttribute('aria-busy', 'true');
  slot.innerHTML = '<div class="chat-loading" role="status"><span></span><span></span><span></span><p>Анализируем запрос…</p></div>';
  slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  try {
    const data = await postJson('/api/chat', { message });
    renderReply(slot, data);
  } catch (error) {
    slot.innerHTML = errorMarkup(error, 'chat');
    slot.querySelector('[data-retry="chat"]').addEventListener('click', () => send(message, slot));
  } finally {
    slot.setAttribute('aria-busy', 'false');
    busy = false;
    question.disabled = false;
    submit.disabled = false;
    question.focus({ preventScroll: true });
  }
}

question.addEventListener('input', () => question.setCustomValidity(''));
form.addEventListener('submit', event => {
  event.preventDefault();
  if (busy || !validateRequired(question, 'Введите сообщение.')) return;
  const message = question.value.trim();
  question.value = '';
  send(message);
});
