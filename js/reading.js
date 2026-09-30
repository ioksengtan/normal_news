import { escapeHtml, safeUrl } from './html.js';
import { reportUrl } from './render.js';
import { formatHM, taipeiDateString, taipeiMidnight } from './time.js';

const STALE_MS = 12 * 60 * 60 * 1000;

export function updateLabel(events, now) {
  const times = (events || [])
    .map((event) => Date.parse(event?.updatedAt || ''))
    .filter((time) => !Number.isNaN(time));
  if (times.length === 0) return '最近 12 小時沒有新文章';
  const newest = Math.max(...times);
  if (now.getTime() - newest > STALE_MS) return '最近 12 小時沒有新文章';
  return `更新於 ${formatHM(new Date(newest))}`;
}

export function dayBucket(updatedAt, now) {
  const when = new Date(updatedAt);
  if (Number.isNaN(when.getTime())) return '更早';
  const eventDay = taipeiDateString(when);
  const today = taipeiDateString(now);
  if (eventDay === today) return '今天';
  const yesterday = taipeiDateString(new Date(taipeiMidnight(now).getTime() - 1));
  if (eventDay === yesterday) return '昨天';
  return '更早';
}

function compareEventsDesc(a, b) {
  const ta = Date.parse(a.updatedAt || '') || 0;
  const tb = Date.parse(b.updatedAt || '') || 0;
  if (ta !== tb) return tb - ta;
  return String(a.id).localeCompare(String(b.id));
}

function sourceLine(event) {
  const names = (event.sources || []).map((source) => source.name).filter(Boolean);
  const time = event.updatedAt && !Number.isNaN(Date.parse(event.updatedAt))
    ? formatHM(new Date(event.updatedAt))
    : '';
  return `${names.join('、')}${names.length && time ? '\u3000' : ''}${time}`;
}

function renderCard(event) {
  return `<a class="event-card" href="article.html?id=${encodeURIComponent(event.id)}">
    <h3 class="event-title">${escapeHtml(event.title || '')}</h3>
    <p class="event-summary">${escapeHtml(event.summary || '')}</p>
    <p class="event-sources">${escapeHtml(sourceLine(event))}</p>
  </a>`;
}

export function renderEventList(events, now, { more = false } = {}) {
  const sorted = (events || []).slice().sort(compareEventsDesc);
  let html = '';
  let lastBucket = '';
  for (const event of sorted) {
    const bucket = dayBucket(event.updatedAt, now);
    if (bucket !== lastBucket) {
      html += `<h2 class="day-label">${escapeHtml(bucket)}</h2>`;
      lastBucket = bucket;
    }
    html += renderCard(event);
  }
  if (more) html += '<button type="button" class="load-more" id="load-more">載入更多</button>';
  return html;
}

function languageLine(language) {
  const text = {
    英文: '本摘要根據英文原文撰寫。',
    簡體中文: '本摘要根據簡體中文原文撰寫。',
    繁體中文: '本摘要根據繁體中文原文撰寫。',
  }[language];
  return text ? `<p class="meta">${escapeHtml(text)}</p>` : '';
}

function commentaryLine(articleType) {
  return articleType === '評論' ? '<p class="meta">評論</p>' : '';
}

function paragraphs(text) {
  return String(text || '')
    .trim()
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function renderReadingArticle(event, config, pageUrl) {
  if (!event) return '<p class="empty">找不到這則新聞。</p>';
  const title = String(event.neutralTitle || event.title || '').trim();
  const body = paragraphs(event.neutralSummary || event.summary || '')
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join('');
  const updated = event.updatedAt && !Number.isNaN(Date.parse(event.updatedAt))
    ? `更新於 ${formatHM(new Date(event.updatedAt))}`
    : '';
  const links = (event.sources || []).map((source) => {
    const url = safeUrl(source.url);
    const name = escapeHtml(source.name || '來源');
    return url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
      : name;
  });
  const originals = links.length ? `<p class="originals"><span>原文：</span>${links.join('<span>｜</span>')}</p>` : '';
  const report = reportUrl(config?.repository, config?.issueForm, pageUrl, title || '新聞');
  return `${languageLine(event.sourceLanguage)}
    ${commentaryLine(event.articleType)}
    <h2 class="article-title">${escapeHtml(title || '新聞')}</h2>
    <div class="article-body">${body}</div>
    ${updated ? `<p class="meta">${escapeHtml(updated)}</p>` : ''}
    ${originals}
    <p class="report"><a href="${escapeHtml(report)}">回報問題</a></p>`;
}
