import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { chooseGithub, mapSearchItem, parseTrendingHtml, searchUrl, trendingSelection } from './tech/github.js';
import { ITEMS_PER_SOURCE } from './tech/limits.js';
import { selectHnStories } from './tech/hn.js';
import { fetchProductHuntSection, productHuntLog } from './tech/producthunt.js';
import { previousSectionIds } from './tech/select.js';
import { taipeiDateString } from '../js/time.js';
import { USER_AGENT } from './lib/http.js';

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM = 'https://hacker-news.firebaseio.com/v0/item';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadIssues(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => readJson(path.join(dir, name), null))
    .filter(Boolean);
}

async function fetchText(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

export async function fetchGithubSection({ seenIds, date, token, limit }) {
  let trendingItems = [];
  let trendingError = null;
  try {
    const html = await fetchText('https://github.com/trending?since=daily', {
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
    });
    trendingItems = parseTrendingHtml(html);
    if (trendingItems.length < limit) trendingError = `熱門頁只解析到 ${trendingItems.length} 則`;
  } catch (error) {
    trendingError = error.message;
  }

  const trending = trendingSelection(trendingItems, trendingError, seenIds, limit);
  if (trending) {
    return { status: 'ok', fallback: false, source: 'trending', error: null, items: trending };
  }

  let searchItems = [];
  let searchError = null;
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = await fetchJson(searchUrl(date), headers);
    searchItems = (payload.items || []).map(mapSearchItem);
  } catch (error) {
    searchError = error.message;
  }
  return chooseGithub({ trendingItems, trendingError, searchItems, searchError, seenIds, limit });
}

export async function fetchHnSection({ seenIds, limit }) {
  try {
    const ids = await fetchJson(HN_TOP, { 'User-Agent': USER_AGENT, Accept: 'application/json' });
    const raw = [];
    for (let cursor = 0; cursor < ids.length && cursor < 80 && raw.length < limit + 30; cursor += 20) {
      const batch = ids.slice(cursor, cursor + 20);
      const items = await Promise.all(batch.map(async (id) => {
        try {
          return await fetchJson(`${HN_ITEM}/${id}.json`, { 'User-Agent': USER_AGENT, Accept: 'application/json' });
        } catch {
          return null;
        }
      }));
      raw.push(...items);
      if (selectHnStories(raw, seenIds, limit).length >= limit) break;
    }
    const items = selectHnStories(raw, seenIds, limit);
    if (items.length === 0) {
      return { status: 'failed', error: '沒有可刊出的討論', items: [] };
    }
    return { status: 'ok', error: null, items };
  } catch (error) {
    return { status: 'failed', error: error.message, items: [] };
  }
}

async function main() {
  const root = process.cwd();
  const config = readJson(path.join(root, 'data/sections.json'), { techSources: [] });
  const techSources = Array.isArray(config.techSources) ? config.techSources : [];
  const githubConfig = techSources.find((source) => source.id === 'github') || {};
  const hnConfig = techSources.find((source) => source.id === 'hackernews') || {};
  const phConfig = techSources.find((source) => source.id === 'producthunt') || {};
  const date = arg('--date', taipeiDateString(new Date()));
  const issuesDir = path.resolve(root, arg('--issues-dir', 'data/issues'));
  const outPath = path.resolve(root, arg('--out', 'data/tech/candidates.json'));
  const issues = loadIssues(issuesDir);
  const githubSeen = previousSectionIds(issues, 'github', githubConfig.skipPreviousIssues ?? 3, date);
  const hnSeen = previousSectionIds(issues, 'hackernews', hnConfig.skipPreviousIssues ?? 1, date);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

  const phSeen = previousSectionIds(issues, 'producthunt', phConfig.skipPreviousIssues ?? 1, date);
  const [github, hackernews, producthunt] = await Promise.all([
    fetchGithubSection({ seenIds: githubSeen, date, token, limit: githubConfig.dailyCount || ITEMS_PER_SOURCE }),
    fetchHnSection({ seenIds: hnSeen, limit: hnConfig.dailyCount || ITEMS_PER_SOURCE }),
    fetchProductHuntSection({
      issueDate: date,
      now: new Date(),
      token: process.env.PRODUCT_HUNT_TOKEN || '',
      limit: phConfig.dailyCount || ITEMS_PER_SOURCE,
    }).then((section) => {
      if (section.status !== 'ok') return section;
      const seen = new Set(phSeen.map((id) => String(id)));
      const items = (section.items || []).filter((item) => !seen.has(String(item.id)));
      if (items.length === 0) {
        return { ...section, status: 'failed', error: '都在近期刊出過', items: [] };
      }
      return { ...section, items };
    }),
  ]);

  const candidates = {
    version: 1,
    date,
    fetchedAt: new Date().toISOString(),
    github,
    hackernews,
    producthunt,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(candidates, null, 2)}\n`);
  console.log(`已寫入 ${path.relative(root, outPath)}`);
  console.log(`GitHub：${github.status}，${github.items.length} 則，備援=${github.fallback ? '是' : '否'}${github.error ? `（${github.error}）` : ''}`);
  console.log(`Hacker News：${hackernews.status}，${hackernews.items.length} 則${hackernews.error ? `（${hackernews.error}）` : ''}`);
  console.log(productHuntLog(producthunt));
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
