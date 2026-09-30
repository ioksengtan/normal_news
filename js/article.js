import { headlineAndSummary } from './html.js';
import { normalizeEvents } from './international.js';
import { renderArticle } from './render.js';

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

async function loadEvent(id) {
  let listed = null;
  try {
    const data = await fetchJson('data/international.json');
    listed = normalizeEvents(data).find((event) => event.id === id) || null;
  } catch {
    listed = null;
  }
  if (listed?.neutralText) return listed;
  try {
    const full = normalizeEvents({ events: [await fetchJson(`data/international/events/${encodeURIComponent(id)}.json`)] })[0];
    return full ? { ...listed, ...full, sources: full.sources?.length ? full.sources : listed?.sources } : listed;
  } catch {
    return listed;
  }
}

async function main() {
  const root = document.getElementById('article');
  if (!root) return;
  const id = new URLSearchParams(location.search).get('id');
  try {
    const config = await fetchJson('data/sections.json');
    const event = id ? await loadEvent(id) : null;
    root.innerHTML = renderArticle(event, config, location.href);
    if (event) {
      const { title } = headlineAndSummary(event.neutralText, event.neutralTitle || event.title);
      document.title = `${title || event.title || '新聞'} · 正常新聞`;
    }
  } catch (error) {
    root.innerHTML = '<p class="empty">這則新聞載入失敗。</p>';
    console.error(error);
  }
}

main();
