export async function getJson(path, params = {}, options = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && String(value).trim()) query.set(key, String(value));
  }
  return requestJson(`${path}${query.size ? `?${query}` : ''}`, options);
}

export async function postJson(path, data, options = {}) {
  return requestJson(path, { ...options, method: 'POST', body: JSON.stringify(data), timeoutMs: 30000 });
}

async function requestJson(path, { signal, method = 'GET', body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(path, {
      method, body, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      signal: controller.signal, credentials: 'same-origin',
    });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('Сервер вернул неожиданный ответ. Повторите запрос позже.'); }
    if (!response.ok) {
      const validation = Object.values(payload?.errors ?? {}).flat().join(' ');
      throw new Error(validation || payload?.detail || `Сервер вернул ошибку ${response.status}. Повторите запрос позже.`);
    }
    return payload;
  } catch (error) {
    if (timedOut) throw new Error('Сервер не ответил вовремя. Попробуйте повторить запрос.');
    if (error.name === 'AbortError') throw error;
    if (error instanceof TypeError) throw new Error('Не удалось связаться с сервером. Проверьте соединение и повторите запрос.');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}
