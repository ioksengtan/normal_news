// 全專案只用這一個 User-Agent。403、429 或 robots 禁令都不換身分、不換 IP、不重試。
export const USER_AGENT = 'normal-news-bot/0.2 (+https://github.com/ioksengtan/normal_news)';
export const MIN_REQUEST_GAP_MS = 5000;

const lastRequestAt = new Map();

export function taipeiStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+08:00`;
}

export async function waitForSlot(url, gapMs = MIN_REQUEST_GAP_MS) {
  const origin = new URL(url).origin;
  const gap = Math.max(gapMs, 0);
  const last = lastRequestAt.get(origin) || 0;
  const delay = last + gap - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequestAt.set(origin, Date.now());
}

export async function fetchResponse(url, {
  timeoutMs = 20000,
  headers = {},
  beforeRequest,
  normalizeUrl,
  maxRedirects = 5,
} = {}) {
  if (!beforeRequest && !normalizeUrl) {
    const res = await request(url, { timeoutMs, headers, redirect: 'follow' });
    return readBody(res);
  }

  let current = applyNormalize(url, normalizeUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (beforeRequest) await beforeRequest(current, { hop });
    const res = await request(current, { timeoutMs, headers, redirect: 'manual' });
    const location = res.headers.get('location');
    if (location && res.status >= 300 && res.status < 400 && res.status !== 304) {
      await res.body?.cancel?.().catch(() => {});
      if (hop === maxRedirects) throw new Error('重新導向次數過多');
      current = applyNormalize(new URL(location, current).toString(), normalizeUrl);
      continue;
    }
    return readBody(res);
  }
  throw new Error('重新導向次數過多');
}

function applyNormalize(url, normalizeUrl) {
  if (typeof normalizeUrl !== 'function') return url;
  return normalizeUrl(url);
}

async function request(url, { timeoutMs, headers, redirect }) {
  try {
    return await fetch(url, {
      redirect,
      headers: {
        'User-Agent': USER_AGENT,
        ...headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new Error(timedOut ? `逾時（${timeoutMs}ms）` : (err?.message || String(err)));
  }
}

async function readBody(res) {
  const retryAfter = res.headers.get('retry-after');
  if (!res.ok && res.status !== 304) {
    await res.body?.cancel?.().catch(() => {});
    const error = new Error(`HTTP ${res.status}`);
    error.status = res.status;
    error.retryAfter = retryAfter;
    throw error;
  }
  return {
    status: res.status,
    text: res.status === 304 ? '' : await res.text(),
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
    retryAfter,
  };
}

export async function fetchText(url, options) {
  const response = await fetchResponse(url, options);
  return response.text;
}
