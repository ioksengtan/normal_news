import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { USER_AGENT } from '../scripts/lib/http.js';
import { fetchGithubSection } from '../scripts/fetch-tech.js';
import { chooseGithub, createdAfterDate, parseTrendingHtml, searchUrl } from '../scripts/tech/github.js';
import { isHiringPost, selectHnStories } from '../scripts/tech/hn.js';
import { buildIssue } from '../scripts/tech/issue.js';
import { interleaveByRank } from '../scripts/tech/combine.js';
import { previousSectionIds, selectFresh } from '../scripts/tech/select.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function trendingArticle(name, { starsToday = 10, stars = 100, language = 'Python', description = 'A &amp; B demo.' } = {}) {
  return `<article class="Box-row">
    <h2 class="h3 lh-condensed"><a href="/${name}"><span class="text-normal">${name.split('/')[0]} /</span> ${name.split('/')[1]}</a></h2>
    <p class="col-9 color-fg-muted my-1">${description}</p>
    <span itemprop="programmingLanguage">${language}</span>
    <a href="/${name}/stargazers">${stars.toLocaleString('en-US')}</a>
    <span>${starsToday.toLocaleString('en-US')} stars today</span>
  </article>`;
}

test('tech fetcher uses the project user agent', async () => {
  const agents = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    agents.push(options.headers?.['User-Agent']);
    const href = String(url);
    if (href.includes('trending')) {
      return { ok: true, status: 200, text: async () => '<html></html>', json: async () => ({}) };
    }
    return { ok: true, status: 200, text: async () => '', json: async () => ({ items: [] }) };
  };
  try {
    await fetchGithubSection({ seenIds: [], date: '2026-09-30', token: '', limit: 10 });
  } finally {
    globalThis.fetch = original;
  }
  assert.ok(agents.length >= 1);
  assert.equal(agents.every((agent) => agent === USER_AGENT), true);
  assert.equal(USER_AGENT, 'normal-news-bot/0.2 (+https://github.com/ioksengtan/normal_news)');
  const source = fs.readFileSync(path.join(root, 'scripts/fetch-tech.js'), 'utf8');
  assert.equal(source.includes('normal-news/1.0'), false);
});

test('trending HTML keeps page order, today stars, and language', () => {
  const html = [trendingArticle('octo/hello', { starsToday: 56, stars: 1234, language: 'Go' }), trendingArticle('octo/next')].join('');
  const items = parseTrendingHtml(html);
  assert.equal(items[0].id, 'octo/hello');
  assert.equal(items[0].starsToday, 56);
  assert.equal(items[0].stars, 1234);
  assert.equal(items[0].language, 'Go');
  assert.equal(items[0].description, 'A & B demo.');
  assert.equal(items[0].url, 'https://github.com/octo/hello');
  assert.deepEqual(items.map((item) => item.id), ['octo/hello', 'octo/next']);
});

test('GitHub uses trending until dedupe leaves fewer than ten, then switches to search', () => {
  const trending = Array.from({ length: 12 }, (_, index) => ({ id: `octo/repo-${index}`, name: `octo/repo-${index}` }));
  const search = Array.from({ length: 10 }, (_, index) => ({ id: `new/repo-${index}`, name: `new/repo-${index}` }));
  const direct = chooseGithub({ trendingItems: trending, searchItems: search, seenIds: [], limit: 10 });
  assert.equal(direct.fallback, false);
  assert.equal(direct.items.length, 10);
  assert.equal(direct.items[0].id, 'octo/repo-0');

  const seen = trending.slice(0, 5).map((item) => item.id);
  const fallback = chooseGithub({ trendingItems: trending, searchItems: search, seenIds: seen, limit: 10 });
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.status, 'ok');
  assert.equal(fallback.items[0].id, 'new/repo-0');

  const failed = chooseGithub({
    trendingItems: [],
    trendingError: 'HTTP 500',
    searchItems: null,
    searchError: 'HTTP 403',
    limit: 10,
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.items.length, 0);
  assert.equal(createdAfterDate('2026-09-30'), '2026-09-23');
  assert.match(searchUrl('2026-09-30'), /created%3A%3E2026-09-23/);
});

test('previous issues supply the dedupe window, and hiring posts are skipped', () => {
  const issues = [
    { date: '2026-09-27', items: [{ source: 'github', id: 'old/three' }, { source: 'hackernews', id: 3 }] },
    { date: '2026-09-28', items: [{ source: 'github', id: 'old/two' }, { source: 'hackernews', id: 2 }] },
    { date: '2026-09-29', items: [{ source: 'github', id: 'old/one' }, { source: 'hackernews', id: 1 }] },
    { date: '2026-09-30', items: [{ source: 'github', id: 'today/repo' }, { source: 'hackernews', id: 9 }] },
  ];
  assert.deepEqual(previousSectionIds(issues, 'github', 3, '2026-09-30'), ['old/one', 'old/two', 'old/three']);
  assert.deepEqual(previousSectionIds(issues, 'hackernews', 1, '2026-09-30'), ['1']);
  const picked = selectFresh(
    [{ id: 'old/one' }, { id: 'fresh/repo' }, { id: 'fresh/repo' }],
    previousSectionIds(issues, 'github', 3, '2026-09-30'),
    10,
  );
  assert.deepEqual(picked.map((item) => item.id), ['fresh/repo']);

  assert.equal(isHiringPost({ type: 'job', title: 'Engineer' }), true);
  assert.equal(isHiringPost({ type: 'story', title: 'Ask HN: Who is hiring? (October 2026)' }), true);
  const stories = selectHnStories([
    { id: 1, type: 'story', title: 'Ask HN: Who is hiring?', score: 10 },
    { id: 2, type: 'job', title: 'A job', score: 10 },
    { id: 3, type: 'story', title: 'A real discussion', url: 'https://example.com/post', score: 20, descendants: 4 },
    { id: 4, type: 'story', title: 'Ask HN: How does this work?', text: '<p>Hello &amp; welcome</p>', score: 5, descendants: 1 },
  ], ['3'], 10);
  assert.deepEqual(stories.map((item) => item.id), [4]);
  assert.equal(stories[0].hnUrl, 'https://news.ycombinator.com/item?id=4');
  assert.equal(stories[0].url, null);
  assert.match(stories[0].text, /Hello & welcome/);
});

test('ingest requires real summaries and still publishes a failed section', () => {
  const candidates = {
    date: '2026-09-30',
    fetchedAt: '2026-09-30T00:00:00.000Z',
    github: {
      status: 'failed',
      fallback: false,
      error: 'both down',
      items: [],
    },
    hackernews: {
      status: 'ok',
      items: [{
        id: 42,
        title: 'Original title',
        url: 'https://example.com/story',
        hnUrl: 'https://news.ycombinator.com/item?id=42',
        score: 8,
        comments: 3,
        text: 'raw post',
      }],
    },
  };
  const summaries = {
    date: '2026-09-30',
    hackernews: {
      42: { titleZh: '【待譯，尚未翻譯】', summary: '【占位摘要，尚未撰寫】此處將由內容長改寫成事實摘要。' },
    },
  };
  assert.throws(() => buildIssue({ candidates, summaries, allowPlaceholders: false }), /占位/);
  const { issue, index } = buildIssue({
    candidates,
    summaries,
    existingIndex: { issues: [{ date: '2026-09-29', issueNumber: 4, path: 'data/issues/2026-09-29.json' }] },
    allowPlaceholders: true,
  });
  assert.equal(issue.issueNumber, 5);
  assert.equal(issue.sources.github.status, 'failed');
  assert.equal(issue.items.length, 1);
  assert.equal(issue.items[0].source, 'hackernews');
  assert.equal(issue.items[0].sourceLabel, 'Hacker News');
  assert.equal(issue.items[0].rank, 0);
  assert.equal(issue.items[0].titleZh.includes('待譯'), true);
  assert.equal(JSON.stringify(issue).includes('raw post'), false);
  assert.equal(issue.sections, undefined);
  assert.equal(index.issues.at(-1).path, 'data/issues/2026-09-30.json');

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'normal-news-'));
  const candidatesPath = path.join(directory, 'candidates.json');
  const summariesPath = path.join(directory, 'summaries.json');
  fs.writeFileSync(candidatesPath, JSON.stringify(candidates));
  fs.writeFileSync(summariesPath, JSON.stringify(summaries));
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/ingest-tech.js'),
    '--candidates', candidatesPath,
    '--summaries', summariesPath,
    '--issues-dir', directory,
    '--allow-placeholders',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const written = JSON.parse(fs.readFileSync(path.join(directory, '2026-09-30.json'), 'utf8'));
  assert.equal(written.items[0].score, 8);
  assert.equal(written.items[0].sourceLabel, 'Hacker News');
});

test('the combined feed leads with the first source and then alternates by rank', () => {
  const items = interleaveByRank([
    { id: 'github', label: 'GitHub', items: [{ id: 'g0' }, { id: 'g1' }, { id: 'g2' }] },
    { id: 'hackernews', label: 'Hacker News', items: [{ id: 'h0' }, { id: 'h1' }] },
  ]);
  assert.deepEqual(items.map((item) => item.id), ['g0', 'h0', 'g1', 'h1', 'g2']);
  assert.equal(items[0].sourceLabel, 'GitHub');
  assert.equal(items[0].rank, 0);
  assert.equal(items[1].source, 'hackernews');
  assert.equal(items[1].rank, 0);
  assert.equal(items[2].rank, 1);
});
