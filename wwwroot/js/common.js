const pages = [
  ['home', '/index.html', 'Главная'], ['recycling', '/recycling.html', 'Куда сдать'],
  ['violations', '/violations.html', 'Сообщить о нарушении'], ['assistant', '/assistant.html', 'AI-помощник'],
];
const currentPage = document.body.dataset.page;
document.querySelector('[data-site-header]').innerHTML = `<a class="skip-link" href="#main-content">Перейти к содержимому</a><header class="site-header"><div class="header-inner"><a class="brand" href="/index.html" aria-label="Экопомощник, на главную страницу"><span class="brand-mark" aria-hidden="true">↗</span><span class="brand-name">Экопомощник</span></a><nav class="main-nav" aria-label="Основная навигация">${pages.map(([id, href, label]) => `<a href="${href}"${id === currentPage ? ' class="is-active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav><span class="locale">RU / Экопомощник</span></div></header>`;
document.querySelector('[data-site-footer]').innerHTML = `<footer class="site-footer"><div class="footer-inner"><div><p class="footer-brand">Экопомощник</p><p class="footer-note">Помогаем принимать экологичные решения каждый день.</p></div><div class="footer-contact"><p>Учебный проект</p><p class="footer-note">Демонстрационная версия</p></div></div></footer>`;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}
export function instructionList(instructions) {
  return `<ol class="prep-list">${instructions.map((text, index) => `<li><span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div>${escapeHtml(text)}</div></li>`).join('')}</ol>`;
}
export function externalLink(url, label, className = 'text-link') {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return `<a class="${className}" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} <span aria-hidden="true">↗</span><span class="visually-hidden"> (откроется в новой вкладке)</span></a>`;
  } catch { return ''; }
}
export function loadingMarkup(title, text) {
  return `<div class="loading" role="status"><div class="loading-bar" aria-hidden="true"></div><p class="status-title">${escapeHtml(title)}</p><p class="status-text">${escapeHtml(text)}</p></div>`;
}
export function errorMarkup(error, retryAction) {
  return `<div class="error-state" role="alert"><p class="notice-title">Не удалось загрузить данные</p><h2 class="status-title">Попробуем ещё раз?</h2><p class="status-text">${escapeHtml(error.message || 'Произошла ошибка. Повторите запрос.')}</p><button class="button-secondary" type="button" data-retry="${retryAction}">Повторить запрос</button></div>`;
}
export function emptyMarkup(title, message) {
  return `<div class="empty"><p class="notice-title">Пока без совпадений</p><h2 class="status-title">${escapeHtml(title)}</h2><p class="status-text">${escapeHtml(message)}</p></div>`;
}
export function demoMarkup(isDemoData, points = false) {
  if (!isDemoData) return '';
  return `<p class="demo-notice">${points ? 'Демонстрационная база: пункты, адреса и часы работы — учебные примеры. Не используйте их для планирования поездки.' : 'Демонстрационная база. Уточните компетенцию и порядок обращения на официальном сайте организации. Экопомощник не отправляет обращения.'}</p>`;
}
export function updateSteps(steps, current) {
  const container = document.querySelector('#wizard-steps');
  const index = steps.findIndex(step => step.id === current);
  container.hidden = index < 0;
  container.innerHTML = steps.map(({ id, label }, stepIndex) => {
    const done = stepIndex < index;
    return `<button class="step${done ? ' done' : ''}${stepIndex === index ? ' active' : ''}" type="button" data-go="${id}"${done ? '' : ' disabled'}${stepIndex === index ? ' aria-current="step"' : ''}><span class="step-number" aria-hidden="true">${done ? '✓' : String(stepIndex + 1).padStart(2, '0')}</span><span class="step-label">${label}</span><span class="visually-hidden">${stepIndex === index ? ', текущий шаг' : done ? ', завершён' : ''}</span></button>`;
  }).join('');
}
export function showPanel(name, focus = true) {
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
  if (focus) document.querySelector(`[data-panel="${name}"] h1`)?.focus({ preventScroll: true });
}
export function validateRequired(input, message) {
  input.setCustomValidity(input.value.trim() ? '' : message);
  return input.reportValidity();
}
