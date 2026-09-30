import assert from 'node:assert/strict';
import test from 'node:test';
import { applySourceFilters } from '../scripts/lib/filters.js';
import { aiAgentBlocks } from '../scripts/lib/robots.js';
import { normalizeOffsetDate } from '../scripts/lib/rss.js';
import { sharesLongRun } from '../scripts/lib/text.js';
import { stripTracking } from '../scripts/lib/url.js';

test('source filters drop old DW items, Al Jazeera liveblogs, and CNA Asia business or commentary', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const dw = applySourceFilters([
    { title: '新', link: 'https://www.dw.com/zh/new', publishedAt: '2026-09-29T00:00:00Z' },
    { title: '舊', link: 'https://www.dw.com/zh/old', publishedAt: '2026-09-01T00:00:00Z' },
    { title: '沒日期', link: 'https://www.dw.com/zh/nodate', publishedAt: null },
  ], { maxAgeDays: 3 }, now);
  assert.deepEqual(dw.map((item) => item.title), ['新']);

  const aj = applySourceFilters([
    { title: '報導', link: 'https://www.aljazeera.com/news/2026/9/30/story' },
    { title: '直播', link: 'https://www.aljazeera.com/news/liveblog/2026/9/30/iran-war-live' },
  ], { excludeUrlSubstrings: ['/liveblog/'] }, now);
  assert.deepEqual(aj.map((item) => item.title), ['報導']);

  const cna = applySourceFilters([
    { title: '世界', link: 'https://www.channelnewsasia.com/world/a', categories: ['World'] },
    { title: '商業', link: 'https://www.channelnewsasia.com/world/b', categories: ['World ,Business'] },
    { title: '評論', link: 'https://www.channelnewsasia.com/commentary/c', categories: ['Commentary ,World'] },
  ], { excludeCategories: ['business', 'commentary'] }, now);
  assert.deepEqual(cna.map((item) => item.title), ['世界']);
});

test('robots checks the project agent and the wildcard group, after tracking parameters are removed', () => {
  const aljazeera = `
User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /*?traffic_source=
Allow: /
`;
  const raw = 'https://www.aljazeera.com/news/2026/9/30/story?traffic_source=rss&utm_source=feed';
  const clean = stripTracking(raw);
  assert.equal(clean, 'https://www.aljazeera.com/news/2026/9/30/story');
  assert.equal(aiAgentBlocks(aljazeera, raw).blocked, true);
  assert.equal(aiAgentBlocks(aljazeera, clean).blocked, false);

  const named = `
User-agent: normal-news-bot
Disallow: /private
Allow: /

User-agent: *
Disallow: /
`;
  assert.equal(aiAgentBlocks(named, 'https://example.com/news').blocked, true);
  assert.equal(aiAgentBlocks(named, 'https://example.com/private').blocked, true);

  const trainingOnly = `
User-agent: ClaudeBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: *
Allow: /
`;
  assert.equal(aiAgentBlocks(trainingOnly, 'https://www.bbc.com/zhongwen/articles/abc').blocked, false);
});

test('RSS offsets like +09:00 stay in that zone', () => {
  assert.equal(normalizeOffsetDate('2026-09-30T10:31:00+09:00'), '2026-09-30T10:31:00+09:00');
  assert.equal(normalizeOffsetDate('2026-09-30T10:31:00+0900'), '2026-09-30T10:31:00+09:00');
  assert.notEqual(Date.parse('2026-09-30T10:31:00+09:00'), Date.parse('2026-09-30T10:31:00+08:00'));
});

test('a summary that copies more than 10 characters of the source is rejected', () => {
  const source = '市議會今日通過預算案，官員說明法定程序已經完成。';
  assert.equal(sharesLongRun('議會完成預算表決。各方說法已轉述。', source), false);
  assert.equal(sharesLongRun(`開頭${source}結尾補充說明。`, source), true);
});
