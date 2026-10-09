export function scenarioDraft(name) {
  const scenarios = {
    recycling: { key: 'ecohelper.recycling.v1', defaults: { screen: 'intro', item: '', city: 'Москва', district: '' } },
    violations: { key: 'ecohelper.violations.v1', defaults: { screen: 'type', typeCode: '', description: '', location: '' } },
  };
  const scenario = scenarios[name];
  if (!scenario) throw new Error('Неизвестный сценарий.');
  return formState(scenario.key, scenario.defaults);
}

export function formState(key, defaults) {
  const notice = document.querySelector('.storage-notice');
  const warn = () => {
    if (!notice) return;
    notice.hidden = false;
    notice.textContent = 'Браузер не разрешает сохранение черновика. Данные сохранятся при переходах между шагами, пока вы не покинете страницу.';
  };
  const data = { ...defaults };
  try {
    const stored = JSON.parse(sessionStorage.getItem(key));
    if (stored && typeof stored === 'object') {
      for (const field of Object.keys(defaults)) {
        if (typeof stored[field] === typeof defaults[field]) data[field] = stored[field];
      }
    }
  } catch { warn(); }
  const save = () => { try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { warn(); } };
  const restoreInputValues = () => {
    document.querySelectorAll('input[name], textarea[name]').forEach(input => {
      if (input.name in data) { input.value = data[input.name]; input.setCustomValidity(''); }
    });
  };
  const bindInputs = () => {
    restoreInputValues();
    document.querySelectorAll('input[name], textarea[name]').forEach(input => {
      if (!(input.name in data)) return;
      input.addEventListener('input', () => { data[input.name] = input.value; input.setCustomValidity(''); save(); });
    });
  };
  return { data, save, bindInputs, reset() { Object.assign(data, defaults); restoreInputValues(); save(); } };
}
