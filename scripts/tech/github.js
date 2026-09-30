import { decodeHtml } from './html.js';
import { selectFresh } from './select.js';

export function parseTrendingHtml(html) {
  const articles = String(html || '').split('<article class="Box-row">').slice(1);
  const items = [];
  for (const article of articles) {
    const href = article.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"/i);
    if (!href) continue;
    let fullName = href[1].split('?')[0].replace(/\/$/, '');
    try {
      fullName = decodeURIComponent(fullName);
    } catch {
      // keep the raw path
    }
    if (!/^[^/\s]+\/[^/\s]+$/.test(fullName)) continue;

    const descriptionMatch = article.match(/<p[^>]*class="[^"]*\bcol-9\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const languageMatch = article.match(/itemprop="programmingLanguage">([^<]+)</i);
    const todayMatch = article.match(/([\d,]+)\s+stars?\s+today/i);
    const starsMatch = article.match(/href="\/[^"]+\/stargazers"[\s\S]*?>([\s\S]*?)<\/a>/i);
    const starsText = starsMatch ? decodeHtml(starsMatch[1]).replace(/[^\d]/g, '') : '';

    items.push({
      id: fullName,
      name: fullName,
      url: `https://github.com/${fullName}`,
      description: descriptionMatch ? decodeHtml(descriptionMatch[1]) : '',
      language: languageMatch ? decodeHtml(languageMatch[1]) : null,
      starsToday: todayMatch ? Number(todayMatch[1].replace(/,/g, '')) : null,
      stars: starsText ? Number(starsText) : null,
    });
  }
  return items;
}

export function createdAfterDate(issueDate) {
  const [year, month, day] = String(issueDate).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

export function searchUrl(issueDate) {
  const query = `created:>${createdAfterDate(issueDate)}`;
  return `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=40`;
}

export function mapSearchItem(item) {
  return {
    id: item.full_name,
    name: item.full_name,
    url: item.html_url,
    description: item.description || '',
    language: item.language || null,
    starsToday: null,
    stars: item.stargazers_count ?? null,
  };
}

export function trendingSelection(trendingItems, trendingError, seenIds, limit) {
  if (trendingError || !Array.isArray(trendingItems) || trendingItems.length < limit) return null;
  const selected = selectFresh(trendingItems, seenIds, limit);
  return selected.length >= limit ? selected : null;
}

export function chooseGithub({
  trendingItems = [],
  trendingError = null,
  searchItems = null,
  searchError = null,
  seenIds = [],
  limit = 10,
}) {
  const trending = trendingSelection(trendingItems, trendingError, seenIds, limit);
  if (trending) {
    return { status: 'ok', fallback: false, source: 'trending', error: null, items: trending };
  }
  if (searchError || !Array.isArray(searchItems)) {
    const error = [trendingError, searchError].filter(Boolean).join('；') || '熱門頁不足，備援也失敗';
    return { status: 'failed', fallback: false, source: 'none', error, items: [] };
  }
  const selected = selectFresh(searchItems, seenIds, limit);
  if (selected.length === 0) {
    return { status: 'failed', fallback: true, source: 'search', error: '備援沒有可刊出的專案', items: [] };
  }
  return { status: 'ok', fallback: true, source: 'search', error: null, items: selected };
}
