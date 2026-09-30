import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFromHtml, isVideoPage } from '../scripts/lib/extract.js';
import { applySourceFilters, markerInText, pageTail } from '../scripts/lib/filters.js';
import { aiAgentBlocks, fetchRobots } from '../scripts/lib/robots.js';
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

  const markets = applySourceFilters([
    { title: 'World leaders meet', link: 'https://www.channelnewsasia.com/world/meet', summary: 'Talks continue.' },
    { title: 'Wall Street closes higher', link: 'https://www.channelnewsasia.com/world/street', summary: 'Indexes rose.' },
    { title: 'Oil prices fall', link: 'https://www.channelnewsasia.com/world/oil', summary: 'Crude slipped.' },
    { title: 'Bond yields climb', link: 'https://www.channelnewsasia.com/world/bonds', summary: 'Treasuries moved.' },
    { title: 'Airline stocks jump', link: 'https://www.channelnewsasia.com/world/stocks', summary: 'Shares rose.' },
  ], { excludeKeywords: ['Wall Street', 'stocks', 'oil prices', 'bond yields'] }, now);
  assert.deepEqual(markets.map((item) => item.title), ['World leaders meet']);

  const wires = applySourceFilters([
    { title: 'Leaders meet in Asia Pacific', link: 'https://www.channelnewsasia.com/world/asia', summary: 'Talks on capital projects.' },
    { title: 'Markets', link: 'https://www.channelnewsasia.com/world/afp', summary: 'AFP - shares moved.', author: 'Channel NewsAsia' },
    { title: 'Talks', link: 'https://www.channelnewsasia.com/world/ap', summary: 'Officials spoke.', author: 'AP' },
    { title: '法新社稿', link: 'https://www.channelnewsasia.com/world/agence', summary: 'A report.', author: '法新社' },
    { title: 'Wire desk', link: 'https://www.channelnewsasia.com/world/presse', summary: 'A report.', byline: 'Agence France-Presse' },
  ], { excludeBylineMarkers: ['AFP', 'AP', 'Agence France-Presse', 'Associated Press', '法新社', '美聯社'] }, now);
  assert.deepEqual(wires.map((item) => item.title), ['Leaders meet in Asia Pacific']);

  const voa = applySourceFilters([
    { title: '報導', link: 'https://www.voachinese.com/a/story.html', categories: ['國際'] },
    { title: '影片', link: 'https://www.voachinese.com/video/clip.html', categories: ['國際'] },
    { title: '分類影片', link: 'https://www.voachinese.com/a/clip.html', categories: ['Video'] },
    { title: '路透稿', link: 'https://www.voachinese.com/a/wire.html', author: 'Reuters' },
  ], {
    excludeUrlSubstrings: ['/video/', '/videos/'],
    excludeCategories: ['video', 'videos'],
    excludeBylineMarkers: ['Reuters', 'AP', 'AFP'],
  }, now);
  assert.deepEqual(voa.map((item) => item.title), ['報導']);

  const apr = applySourceFilters([
    { title: 'Original', link: 'https://asiapacificreport.nz/2026/09/30/original/', categories: ['Pacific'], author: 'Pacific Media Watch' },
    { title: 'From RNZ', link: 'https://asiapacificreport.nz/2026/09/29/rnz/', categories: ['RNZ Pacific'] },
    { title: 'Republished', link: 'https://asiapacificreport.nz/2026/09/28/other/', summary: 'This item was republished from another desk.' },
    { title: 'Radio credit', link: 'https://asiapacificreport.nz/2026/09/27/radio/', author: 'Radio New Zealand' },
  ], {
    excludeCategories: ['RNZ Pacific'],
    excludeBylineMarkers: ['RNZ', 'Radio New Zealand', 'RNZ Pacific', 'republished from', 'reprinted from', 'originally published'],
  }, now);
  assert.deepEqual(apr.map((item) => item.title), ['Original']);
});

test('page credits dropped by the readable-text step still match markers in the tail', () => {
  const story = '<p>市政府說明預算程序已經完成，各方說法分開轉述。</p>'.repeat(12);
  const html = `<!doctype html><html><head><title>預算</title>
    <meta property="og:type" content="article"></head><body>
    <article>${story}</article>
    <footer>Source: AFP/staff writer</footer>
    </body></html>`;
  const extracted = extractFromHtml(html, 'https://www.channelnewsasia.com/world/story');
  assert.equal(extracted.text.includes('Source: AFP'), false);
  assert.match(extracted.pageText, /Source: AFP/);
  assert.equal(markerInText(pageTail(extracted.pageText), 'Source: AFP'), true);
  assert.equal(markerInText(pageTail(extracted.pageText), 'Source: AP'), false);

  const early = `AFP ${'字'.repeat(2000)}結尾沒有通訊社`;
  assert.equal(markerInText(pageTail(early), 'AFP'), false);
  assert.equal(markerInText(pageTail(`${'字'.repeat(2000)} Republished by Radio Desk`), 'Republished by'), true);
  assert.equal(markerInText(pageTail(`${'字'.repeat(2000)} Republished from RNZ`), 'Republished from'), true);
  assert.equal(markerInText(pageTail(`${'字'.repeat(2000)} Source: Reuters`), 'Source: Reuters'), true);
});

test('Voice of America video pages are detected when the url is not under /video/', () => {
  const story = '<p>這是一段足夠長的報導文字，用來通過可讀性萃取。</p>'.repeat(8);
  const og = extractFromHtml(`<!doctype html><html><head>
    <meta property="og:type" content="video.other"><title>片</title></head>
    <body><article>${story}</article></body></html>`,
  'https://www.voachinese.com/a/123.html');
  assert.equal(og.videoPage, true);
  assert.equal(isVideoPage({ ogType: 'video' }), true);
  assert.equal(isVideoPage({ ogType: 'article' }), false);

  const embed = extractFromHtml(`<!doctype html><html><head>
    <meta property="og:type" content="article"><title>片</title></head>
    <body><article>${story}</article><div>代码已经复制到剪贴板</div></body></html>`,
  'https://www.voachinese.com/a/456.html');
  assert.equal(embed.videoPage, true);
  assert.match(embed.pageText, /代码已经复制到剪贴板/);
});

test('robots.txt 401 and 403 disallow every path; other 4xx still allow', async () => {
  for (const status of [401, 403]) {
    const result = await fetchRobots('https://example.com', {
      fetchImpl: async () => {
        const error = new Error(`HTTP ${status}`);
        error.status = status;
        throw error;
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.match(result.error, new RegExp(`HTTP ${status}`));
    assert.match(result.error, /全部禁止/);
  }

  const missing = await fetchRobots('https://example.com', {
    fetchImpl: async () => {
      const error = new Error('HTTP 404');
      error.status = 404;
      throw error;
    },
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.blocked, false);

  const down = await fetchRobots('https://example.com', {
    fetchImpl: async () => {
      const error = new Error('HTTP 503');
      error.status = 503;
      throw error;
    },
  });
  assert.equal(down.ok, false);
  assert.equal(down.blocked, true);
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

  const original = 'Mindgard said Moonshot AI Holdings built the model after Donald Trump spoke.';
  const summary = '檢測業者（Mindgard）表示月之暗面（Moonshot AI Holdings）開發了模型。川普（Donald Trump）另有說法。各方主張已分開轉述。';
  assert.equal(sharesLongRun(summary, original), false);
  assert.equal(sharesLongRun('這句（市議會今日通過預算案，官員說明法定程序已經完成）仍是抄錄。', source), true);
});
