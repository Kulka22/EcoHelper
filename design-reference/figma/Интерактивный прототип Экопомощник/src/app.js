import './index.css'

const app = document.querySelector('#app')
const popularItems = ['Стеклянная банка', 'Одежда', 'Батарейки', 'Пластиковые крышки']
const knownItems = ['стеклянная банка', 'батарейки']
const points = [
  ['Экоцентр «Собиратор»', 'Кутузовский проспект, 36, стр. 3', '1,2 км', 'Сегодня до 21:00', 'Стекло, металл, бумага'],
  ['Контейнер «Раздельный сбор»', 'ул. 1812 года, 2', '1,8 км', 'Круглосуточно', 'Стеклянные бутылки и банки'],
]
const violationTypes = ['Незаконная свалка', 'Сжигание мусора', 'Загрязнение водоёма', 'Незаконная вырубка деревьев']

const state = {
  view: 'home',
  screen: 'intro',
  item: 'Стеклянная банка',
  city: 'Москва',
  district: 'Дорогомилово',
  violationScreen: 'type',
  violation: '',
  violationDescription: '',
  violationLocation: '',
  aiMessages: [
    { role: 'assistant', text: 'Здравствуйте! Я помогу разобраться с вопросами об экологии и возможностях Экопомощника.' },
  ],
}

function header() {
  return `<header class="site-header"><div class="header-inner">
    <a class="brand" href="#home" data-view="home" aria-label="Экопомощник, на главную страницу"><span class="brand-mark">↗</span><span class="brand-name">Экопомощник</span></a>
    <nav class="main-nav" aria-label="Основная навигация">
      <button type="button" data-view="home" class="${state.view === 'home' ? 'is-active' : ''}">Главная</button>
      <button type="button" data-view="guide" class="${state.view === 'guide' ? 'is-active' : ''}">Куда сдать</button>
      <button type="button" data-view="violation" class="${state.view === 'violation' ? 'is-active' : ''}">Сообщить о нарушении</button>
      <button type="button" data-view="ai" class="${state.view === 'ai' ? 'is-active' : ''}">AI-помощник</button>
    </nav>
    <span class="locale">RU / Москва</span>
  </div></header>`
}

function home() {
  return `<main class="page home-page"><section class="home-hero">
    <p class="eyebrow">Экопомощник</p><h1 class="display">Экопомощник</h1><p class="lead">Помогаем найти место для сдачи ненужных вещей, разобраться с экологическим нарушением и получить помощь через AI-помощника.</p><div class="home-links"><button class="text-link" type="button" data-view="guide">Куда сдать&nbsp; →</button><button class="text-link" type="button" data-view="violation">Сообщить о нарушении&nbsp; →</button><button class="text-link" type="button" data-view="ai">Спросить AI-помощника&nbsp; →</button></div>
  </section><section class="how-it-works" aria-labelledby="how-title"><p class="eyebrow">Как работает сервис</p><h2 class="faq-title" id="how-title">Три простых шага</h2><ol class="how-steps"><li><span>01</span><strong>Выберите задачу</strong></li><li><span>02</span><strong>Укажите необходимые данные</strong></li><li><span>03</span><strong>Получите информацию</strong></li></ol></section>
  <section class="faq" aria-labelledby="faq-title"><p class="eyebrow">Частые вопросы</p><h2 class="faq-title" id="faq-title">Ответы на важное</h2>
    <details open><summary>Для чего нужен Экопомощник?</summary><p>Чтобы быстро сориентироваться в экологической ситуации и выбрать следующий понятный шаг.</p></details>
    <details><summary>Как найти пункт приёма?</summary><p>Откройте раздел «Куда сдать», укажите предмет и ваше местоположение — сервис покажет подходящие варианты.</p></details>
    <details><summary>Какие вопросы можно задать AI-помощнику?</summary><p>Он помогает разобраться с возможностями Экопомощника и направляет в подходящий раздел.</p></details>
  </section></main>`
}

function steps() {
  const index = ['item', 'location', 'result'].indexOf(state.screen)
  return `<div class="steps" aria-label="Этапы поиска">${[['01', 'Что сдаём', 'item'], ['02', 'Где вы', 'location'], ['03', 'Результат', 'result']].map(([number, label, screen], i) =>
    `<button class="step ${index === i ? 'active' : ''} ${index > i ? 'done' : ''}" type="button" data-screen="${screen}" ${index > i ? '' : 'disabled'}><span class="step-number">${index > i ? '✓' : number}</span><span class="step-label">${label}</span></button>`).join('')}</div>`
}

function guideIntro() {
  return `<main class="page"><div class="guide-intro"><section class="guide-copy"><p class="eyebrow">Сервис для осознанного города</p><h1 class="display">Найдём, куда сдать <span class="display-accent">вещь</span> с пользой</h1><p class="lead">Подскажем, как подготовить предмет и где его примут рядом с вами.</p><button class="button" type="button" data-screen="item">Начать поиск&nbsp; →</button></section>
  <aside class="info-block"><div class="info-panel"><p class="eyebrow">Маленький шаг</p><p class="info-title">У вещей всегда есть следующий маршрут.</p><p class="info-text">Выбирайте повторное использование, переработку или правильную утилизацию.</p></div><p class="info-caption">Сервис подсказывает проверенные способы расстаться с вещами без вреда для города.</p></aside></div></main>`
}

function itemScreen() {
  return `<main class="page">${steps()}<form class="form-screen" id="item-form"><label class="form-title" for="item">Что вы хотите сдать?</label><p class="form-hint">Например: одежда, банка, старый телефон или батарейки.</p><div class="input-row"><input id="item" value="${escape(state.item)}" placeholder="Введите название предмета" autofocus><button class="button" type="submit">Продолжить&nbsp; →</button></div><div class="popular"><span class="popular-label">Часто ищут</span>${popularItems.map(item => `<button class="tag" type="button" data-item="${item}">${item}</button>`).join('')}</div></form></main>`
}

function locationScreen() {
  return `<main class="page">${steps()}<form class="form-screen" id="location-form"><p class="search-context">Ищем пункты для: ${escape(state.item)}</p><h1 class="form-title">Где вы находитесь?</h1><div class="input-group"><label><span class="field-label">Город</span><input id="city" value="${escape(state.city)}" autofocus></label><label><span class="field-label">Район (необязательно)</span><input id="district" value="${escape(state.district)}" placeholder="Например, Арбат"></label></div><div class="form-actions"><button class="button-secondary" type="button" data-screen="item">← Вернуться к предмету</button><button class="button" type="submit">Показать пункты</button></div></form></main>`
}

function resultsScreen() {
  return `<main class="page">${steps()}<section class="result-screen"><p class="search-context">${escape(state.city)}${state.district ? ` · ${escape(state.district)}` : ''}</p><h1 class="result-title">Подходящие варианты для: ${escape(state.item)}</h1><div class="results" id="results"><div class="loading"><div class="loading-bar"></div><p class="status-title">Ищем подходящие пункты</p><p class="status-text">Сверяем условия приёма в выбранном районе.</p></div></div><div class="result-actions"><button class="button-secondary" type="button" data-screen="location">← Назад к местоположению</button><button class="text-link" type="button" data-screen="item">Искать другой предмет</button></div></section></main>`
}

function foundResults() {
  return `<div class="found-results"><aside class="prep"><p class="notice-title">Подготовьте</p><ol class="prep-list"><li><span>01</span>Проверьте, что предмет чистый и сухой.</li><li><span>02</span>Снимите детали, которые могут принимать отдельно.</li><li><span>03</span>Уточните условия приёма перед визитом.</li></ol></aside><section><p class="points-label">Подходящие пункты поблизости</p>${points.map(([name, address, distance, hours, accepts]) => `<article class="point"><div class="point-heading"><div><h2 class="point-name">${name}</h2><p class="point-address">${address}</p></div><span class="point-distance">${distance}</span></div><div class="point-meta"><span class="point-hours">${hours}</span><span class="point-accepts">${accepts}</span></div></article>`).join('')}</section></div>`
}

function emptyResults() {
  return `<div class="empty"><p class="notice-title">Пока без совпадений</p><p class="status-title">Подходящие пункты не найдены</p><p class="status-text">Для «${escape(state.item)}» пока нет демонстрационных пунктов в этой выдаче. Попробуйте изменить район или выбрать другой предмет.</p></div>`
}

function violationSteps() {
  const index = ['type', 'location', 'result'].indexOf(state.violationScreen)
  return `<div class="steps" aria-label="Этапы сообщения о нарушении">${[['01', 'Что произошло', 'type'], ['02', 'Где это', 'location'], ['03', 'Рекомендации', 'result']].map(([number, label, screen], i) =>
    `<button class="step ${index === i ? 'active' : ''} ${index > i ? 'done' : ''}" type="button" data-violation-screen="${screen}" ${index > i ? '' : 'disabled'}><span class="step-number">${index > i ? '✓' : number}</span><span class="step-label">${label}</span></button>`).join('')}</div>`
}

function violationTypeScreen() {
  return `<main class="page">${violationSteps()}<form class="form-screen" id="violation-type-form"><h1 class="form-title">Что произошло?</h1><p class="form-hint">Выберите подходящий тип или кратко опишите ситуацию своими словами.</p><div class="violation-types">${violationTypes.map(type => `<button class="tag ${state.violation === type ? 'is-selected' : ''}" type="button" data-violation-type="${type}">${type}</button>`).join('')}</div><label class="description-field" for="violation-description"><span class="field-label">Описание <span>(необязательно)</span></span><textarea id="violation-description" placeholder="Например: мусор регулярно сжигают рядом с домом">${escape(state.violationDescription)}</textarea></label><div class="form-actions"><button class="button" type="submit">Продолжить&nbsp; →</button></div></form></main>`
}

function violationLocationScreen() {
  return `<main class="page">${violationSteps()}<form class="form-screen" id="violation-location-form"><p class="search-context">Проблема: ${escape(state.violation)}</p><h1 class="form-title">Где это происходит?</h1><p class="form-hint">Укажите адрес, ориентир или район — это поможет выбрать правильную службу.</p><label class="location-field" for="violation-location"><span class="field-label">Местоположение <span>(необязательно)</span></span><input id="violation-location" value="${escape(state.violationLocation)}" placeholder="Например, Москва, район Дорогомилово"></label><div class="form-actions"><button class="button-secondary" type="button" data-violation-screen="type">← Назад к описанию</button><button class="button" type="submit">Показать рекомендации</button></div></form></main>`
}

function violationAdvice() {
  const description = state.violationDescription.trim()
  if (description && !violationTypes.includes(state.violation)) return null
  const hasLocation = Boolean(state.violationLocation.trim())
  const serviceName = hasLocation ? `Природоохранная служба — ${escape(state.violationLocation)}` : 'Природоохранная служба вашего региона'
  const serviceDescription = hasLocation
    ? 'Передайте описание нарушения и известные детали о месте в профильную службу для этого местоположения.'
    : 'Укажите местоположение, чтобы сервис мог подобрать конкретную организацию для вашего региона.'
  return `<div class="found-results violation-advice"><aside class="prep"><p class="notice-title">Желательно зафиксировать</p><ul class="prep-list"><li><span>01</span>Точное место и время, когда вы заметили проблему.</li><li><span>02</span>Что именно происходит и как часто это повторяется.</li><li><span>03</span>Безопасные для вас подтверждения ситуации.</li></ul></aside><section><p class="points-label">Что можно сделать</p><article class="point"><div class="point-heading"><div><h2 class="point-name">${serviceName}</h2><p class="point-address">${serviceDescription}</p></div></div><div class="point-meta"><span class="point-hours">Для: ${escape(state.violation)}</span><span class="point-accepts">${hasLocation ? 'Подобрано по местоположению' : 'Общие рекомендации'}</span></div></article><p class="advice-note">Не приближайтесь к опасному источнику загрязнения и не пытайтесь устранить проблему самостоятельно.</p></section></div>`
}

function violationResultScreen() {
  return `<main class="page">${violationSteps()}<section class="result-screen"><p class="search-context">${state.violationLocation ? escape(state.violationLocation) : 'Местоположение не указано'}</p><h1 class="result-title">Что делать: ${escape(state.violation)}</h1><div class="results" id="violation-results"><div class="loading"><div class="loading-bar"></div><p class="status-title">Подбираем рекомендации</p><p class="status-text">Определяем, какие действия будут уместны в этой ситуации.</p></div></div><div class="result-actions"><button class="button-secondary" type="button" data-violation-screen="location">← Назад к местоположению</button><button class="button" type="button">Подробнее об обращении&nbsp; →</button></div></section></main>`
}

function aiAssistant() {
  return `<main class="page"><section class="ai-chat" aria-labelledby="ai-title"><div class="ai-heading"><p class="eyebrow">AI-помощник</p><h1 class="form-title" id="ai-title">Чем могу помочь?</h1><p class="form-hint">Отвечу на вопросы об экологических ситуациях и подскажу нужный раздел сервиса.</p></div><div class="chat-dialogue" aria-live="polite">${state.aiMessages.map(message => chatMessage(message)).join('')}</div><form class="chat-form" id="ai-chat-form"><label class="visually-hidden" for="ai-question">Ваш вопрос</label><input id="ai-question" placeholder="Напишите ваш вопрос" autocomplete="off" autofocus><button class="button" type="submit">Отправить</button></form></section></main>`
}

function chatMessage(message) {
  if (message.role === 'loading') return `<div class="chat-message assistant-message chat-loading"><span></span><span></span><span></span><p>Помощник готовит ответ</p></div>`
  const action = message.action ? `<button class="chat-action" type="button" data-view="${message.action.view}">${message.action.label}&nbsp; →</button>` : ''
  return `<div class="chat-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}"><p>${escape(message.text)}</p>${action}</div>`
}

function aiResponse(question) {
  const normalized = question.toLowerCase()
  if (/сдать|переработ|мусор|батаре|одежд|стекл|пластик|вещ/.test(normalized)) {
    return { text: 'Помогу найти способ сдать вещь и подходящие пункты приёма рядом с вами.', action: { view: 'guide', label: 'Куда сдать' } }
  }
  if (/наруш|свалк|сжига|загрязн|выруб|водоём|дерев/.test(normalized)) {
    return { text: 'Если вы заметили экологическую проблему, подскажем, что безопасно зафиксировать и в какую службу можно обратиться.', action: { view: 'violation', label: 'Сообщить о нарушении' } }
  }
  if (/эколог|природ|отход|сортир|эко/.test(normalized)) {
    return { text: 'Экопомощник помогает с вопросами об обращении с вещами и экологических нарушениях. Уточните ситуацию — я подскажу следующий шаг.' }
  }
  return { text: 'Я могу помочь только с вопросами об экологии и возможностях Экопомощника. Например, можно спросить, куда сдать вещь или что делать при экологическом нарушении.' }
}

function footer() {
  return `<footer class="site-footer"><div class="footer-inner"><div><p class="footer-brand">Экопомощник</p><p class="footer-note">Помогаем принимать экологичные решения каждый день.</p></div><div class="footer-contact"><p>Связаться с нами</p><a href="mailto:ecohelper@example.com">ecohelper@example.com</a></div></div></footer>`
}

function render() {
  const content = state.view === 'home'
    ? home()
    : state.view === 'violation'
      ? state.violationScreen === 'type' ? violationTypeScreen() : state.violationScreen === 'location' ? violationLocationScreen() : violationResultScreen()
      : state.view === 'ai'
        ? aiAssistant()
      : state.screen === 'intro' ? guideIntro() : state.screen === 'item' ? itemScreen() : state.screen === 'location' ? locationScreen() : resultsScreen()
  app.innerHTML = header() + content + footer()
  if (state.view === 'guide' && state.screen === 'result') {
    window.setTimeout(() => {
      const results = document.querySelector('#results')
      if (results) results.innerHTML = knownItems.includes(state.item.trim().toLowerCase()) ? foundResults() : emptyResults()
    }, 900)
  }
  if (state.view === 'violation' && state.violationScreen === 'result') {
    window.setTimeout(() => {
      const results = document.querySelector('#violation-results')
      if (results) results.innerHTML = violationAdvice() ?? `<div class="empty"><p class="notice-title">Пока без рекомендаций</p><p class="status-title">Не удалось определить тип ситуации</p><p class="status-text">Уточните описание проблемы или выберите один из демонстрационных типов нарушения.</p></div>`
    }, 900)
  }
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char])
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-view], [data-screen], [data-item], [data-violation-screen], [data-violation-type]')
  if (!target) return
  if (target.dataset.view) {
    event.preventDefault()
    state.view = target.dataset.view
    if (state.view === 'guide') state.screen = 'intro'
    if (state.view === 'violation') state.violationScreen = 'type'
    render()
  } else if (target.dataset.screen && !target.disabled) {
    state.screen = target.dataset.screen
    render()
  } else if (target.dataset.item) {
    state.item = target.dataset.item
    const input = document.querySelector('#item')
    if (input) input.value = state.item
  } else if (target.dataset.violationScreen && !target.disabled) {
    state.violationScreen = target.dataset.violationScreen
    render()
  } else if (target.dataset.violationType) {
    state.violation = target.dataset.violationType
    render()
  }
})

document.addEventListener('submit', event => {
  event.preventDefault()
  if (event.target.id === 'item-form') {
    state.item = document.querySelector('#item').value
    if (state.item.trim()) state.screen = 'location'
  }
  if (event.target.id === 'location-form') {
    state.city = document.querySelector('#city').value
    state.district = document.querySelector('#district').value
    if (state.city.trim()) state.screen = 'result'
  }
  if (event.target.id === 'violation-type-form') {
    state.violationDescription = document.querySelector('#violation-description').value
    if (state.violationDescription.trim()) state.violation = state.violationDescription.trim()
    if (state.violation.trim()) state.violationScreen = 'location'
  }
  if (event.target.id === 'violation-location-form') {
    state.violationLocation = document.querySelector('#violation-location').value
    state.violationScreen = 'result'
  }
  if (event.target.id === 'ai-chat-form') {
    const input = document.querySelector('#ai-question')
    const question = input.value.trim()
    if (!question) return
    state.aiMessages.push({ role: 'user', text: question }, { role: 'loading' })
    render()
    window.setTimeout(() => {
      const loadingIndex = state.aiMessages.findIndex(message => message.role === 'loading')
      if (loadingIndex !== -1) state.aiMessages.splice(loadingIndex, 1, { role: 'assistant', ...aiResponse(question) })
      render()
    }, 700)
    return
  }
  render()
})

render()
