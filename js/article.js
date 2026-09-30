import { renderReadingArticle } from './reading.js';

const EVENT_ID = /^evt_[A-Za-z0-9_-]{1,80}$/;

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

async function main() {
  const root = document.getElementById('article');
  if (!root) return;
  const id = new URLSearchParams(location.search).get('id') || '';
  if (!EVENT_ID.test(id)) {
    root.innerHTML = '<p class="empty">找不到這則新聞。</p>';
    return;
  }
  try {
    const config = await fetchJson('data/sections.json');
    const event = await fetchJson(`data/international/events/${encodeURIComponent(id)}.json`);
    root.innerHTML = renderReadingArticle(event, config, location.href);
    const title = String(event.neutralTitle || event.title || '').trim();
    if (title) document.title = `${title} · 正常新聞`;
  } catch (error) {
    root.innerHTML = '<p class="empty">這則新聞載入失敗。</p>';
    console.error(error);
  }
}

main();
