import { renderEventList, updateLabel } from './reading.js';

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

async function main() {
  const note = document.getElementById('update-note');
  const root = document.getElementById('events');
  const now = new Date();
  let events = [];

  function paint(more) {
    if (note) note.textContent = updateLabel(events, now);
    if (!root) return;
    root.innerHTML = renderEventList(events, now, { more });
    const button = document.getElementById('load-more');
    if (button) button.addEventListener('click', loadMore);
  }

  async function loadMore() {
    const button = document.getElementById('load-more');
    if (button) button.disabled = true;
    try {
      const extra = await fetchJson('data/home-more.json');
      const seen = new Set(events.map((event) => event.id));
      for (const event of extra.events || []) {
        if (event?.id && !seen.has(event.id)) events.push(event);
      }
      paint(false);
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = '載入失敗，再試一次';
      }
      console.error(error);
    }
  }

  try {
    const home = await fetchJson('data/home.json');
    events = Array.isArray(home.events) ? home.events.slice() : [];
    paint(Boolean(home.hasMore));
  } catch (error) {
    if (note) note.textContent = '最近 12 小時沒有新文章';
    if (root) root.innerHTML = '<p class="empty">首頁載入失敗。</p>';
    console.error(error);
  }
}

main();
