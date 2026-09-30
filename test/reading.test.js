import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildHome, buildHomeFeeds, ingestBatch } from '../scripts/lib/ingest.js';
import { loadRubric } from '../scripts/lib/rubric.js';
import { dayBucket, renderEventList, renderReadingArticle, updateLabel } from '../js/reading.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rubric = loadRubric(path.join(root, 'rubric-spec.md'));
const now = new Date('2026-09-30T02:00:00.000Z');

function candidate(id, overrides = {}) {
  return {
    id,
    link: `https://news.example/${id}`,
    source: '測試報',
    title: `標題 ${id}`,
    publishedAt: '2026-09-30T01:00:00+08:00',
    text: '市議會今日通過預算。官員表示程序完成。反對者說顯然是黑箱作業。'.repeat(3),
    ...overrides,
  };
}

function filler(seed, length = 170) {
  let text = seed;
  while ([...text].length < length) text += '各方說法已分開轉述。';
  return [...text].slice(0, length).join('');
}

function rewrite(id, overrides = {}) {
  return {
    id,
    section: '國際版',
    source_language: '繁體中文',
    article_type: '新聞報導',
    neutral_title: '議會完成預算表決',
    neutral_summary: filler('議會完成年度預算表決。財政單位說明程序。批評方與主管機關的主張都已轉述。'),
    balance_notes: [],
    event: { decision: 'new', summary: '市議會通過預算。' },
    ...overrides,
  };
}

test('same event phrase merges, and unsure stays a separate event', () => {
  const articles = [{
    id: 'early',
    link: 'https://news.example/early',
    source: '中央社',
    publishedAt: '2026-09-29T02:00:00+08:00',
    processedAt: '2026-09-29T02:00:00.000Z',
    neutralTitle: '較早的預算消息',
    neutralSummary: filler('較早的預算消息。主管機關與批評方都已轉述。', 150),
    sourceLanguage: '繁體中文',
    articleType: '新聞報導',
    section: '國際版',
    balanceNotes: [],
    rubricVersion: rubric.version,
    eventId: 'evt_old',
  }];
  const events = [{
    id: 'evt_old',
    summary: '既有事件短述',
    representativeArticleId: 'early',
    articleIds: ['early'],
    uncertain: false,
    publishedAt: articles[0].publishedAt,
    updatedAt: '2026-09-29T02:00:00.000Z',
  }];
  const merged = ingestBatch({
    articles,
    events,
    candidates: [candidate('late', { source: '自由時報', publishedAt: '2026-09-30T00:15:00+08:00' })],
    rewrites: [rewrite('late', {
      neutral_summary: filler('較晚且較完整的預算消息。主管機關與批評方都已轉述。', 220),
      event: { decision: 'same event as existing event evt_old' },
    })],
    rubric,
    now: '2026-09-30T01:15:00.000Z',
  });
  const event = merged.events.find((item) => item.id === 'evt_old');
  assert.deepEqual(event.articleIds, ['early', 'late']);
  assert.equal(event.representativeArticleId, 'late');
  assert.equal(merged.home.events.length, 1);
  assert.deepEqual(merged.home.events[0].sources.map((source) => source.name), ['中央社', '自由時報']);
  assert.equal(merged.eventFiles.length, 1);
  assert.equal(merged.eventFiles[0].neutralSummary.length > merged.home.events[0].summary.length, true);
  assert.equal(JSON.stringify(merged.home).includes('顯然是黑箱'), false);
  assert.equal(JSON.stringify(merged.eventFiles).includes('removedSpans'), false);

  const separate = ingestBatch({
    articles,
    events,
    candidates: [candidate('other')],
    rewrites: [rewrite('other', { event: { decision: 'unsure', summary: '另一件事。' } })],
    rubric,
    now: '2026-09-30T01:15:00.000Z',
  });
  assert.equal(separate.events.some((item) => item.id === 'evt_other' && item.uncertain), true);
  assert.equal(separate.events.find((item) => item.id === 'evt_old').articleIds.length, 1);
});

test('removed spans and density stay on the article record only', () => {
  const stored = ingestBatch({
    articles: [],
    events: [],
    candidates: [candidate('span')],
    rewrites: [rewrite('span', {
      removed_spans: [{ original: '顯然是黑箱作業', category: '情緒用語' }],
      bias_ratio: 0.25,
    })],
    rubric,
    now: '2026-09-30T01:00:00.000Z',
  });
  const article = stored.articles[0];
  assert.deepEqual(article.removedSpans, [{ original: '顯然是黑箱作業', category: '情緒用語' }]);
  assert.equal(article.biasRatio, 0.25);
  assert.equal(stored.stats[0].avgBiasRatio, 0.25);
  assert.equal(stored.stats[0].rank, null);
  const publicJson = JSON.stringify({
    home: stored.home,
    homeMore: stored.homeMore,
    event: stored.eventFiles,
  });
  assert.equal(publicJson.includes('顯然是黑箱作業'), false);
  assert.equal(publicJson.includes('情緒用語'), false);
  assert.equal(publicJson.includes('biasRatio'), false);
  assert.equal(publicJson.includes('removedSpans'), false);
});

test('example events are left off the homepage', () => {
  const articles = [{
    id: 'sample',
    neutralTitle: '範例標題',
    neutralSummary: '範例摘要',
    link: '#',
    source: '範例媒體',
    publishedAt: '2026-09-30T01:00:00.000Z',
    isExample: true,
  }];
  const events = [{
    id: 'evt_sample',
    summary: '範例',
    representativeArticleId: 'sample',
    articleIds: ['sample'],
    isExample: true,
    updatedAt: '2026-09-30T01:00:00.000Z',
  }];
  const { home, homeMore } = buildHomeFeeds(events, articles, '2026-09-30T02:00:00.000Z');
  assert.deepEqual(home.events, []);
  assert.deepEqual(homeMore.events, []);
  assert.equal(buildHome(events, articles, '2026-09-30T02:00:00.000Z').events.length, 0);
});

test('homepage and article html omit audit fields and group one event as one card', () => {
  const events = [
    {
      id: 'evt_budget',
      title: '議會完成預算表決',
      summary: '主管機關與批評方的說法都已寫進摘要。',
      updatedAt: '2026-09-30T00:15:00.000Z',
      sources: [{ name: '中央社' }, { name: '自由時報' }],
      removedSpans: [{ original: '令人髮指的句子', category: '情緒用語' }],
      biasRatio: 0.4,
    },
    {
      id: 'evt_old',
      title: '昨日的會議',
      summary: '昨天的摘要。',
      updatedAt: '2026-09-29T02:00:00.000Z',
      sources: [{ name: '德國之聲' }],
    },
    {
      id: 'evt_older',
      title: '更早的會議',
      summary: '更早的摘要。',
      updatedAt: '2026-09-27T02:00:00.000Z',
      sources: [{ name: '半島電視台' }],
    },
  ];
  const html = renderEventList(events, now, { more: true });
  assert.equal(html.match(/class="event-card"/g).length, 3);
  assert.ok(html.indexOf('今天') < html.indexOf('evt_budget'));
  assert.ok(html.indexOf('evt_budget') < html.indexOf('昨天'));
  assert.ok(html.indexOf('今天') < html.indexOf('昨天'));
  assert.ok(html.indexOf('昨天') < html.indexOf('更早'));
  assert.match(html, /中央社、自由時報　08:15/);
  assert.match(html, /載入更多/);
  assert.equal(html.includes('回報問題'), false);
  assert.equal(html.includes('令人髮指'), false);
  assert.equal(html.includes('情緒密度'), false);
  assert.equal(html.includes('情緒用語'), false);
  assert.equal(html.includes('ranking.html'), false);
  assert.equal(html.includes('排行'), false);
  assert.equal(updateLabel(events, now), '更新於 08:15');
  assert.equal(updateLabel([{ updatedAt: '2026-09-29T02:00:00.000Z' }], now), '最近 12 小時沒有新文章');
  assert.equal(updateLabel([], now), '最近 12 小時沒有新文章');
  assert.equal(dayBucket('2026-09-30T00:15:00.000Z', now), '今天');

  const articleHtml = renderReadingArticle({
    id: 'evt_budget',
    neutralTitle: '議會完成預算表決',
    neutralSummary: '完整的中性內文。主管機關說明程序。',
    sourceLanguage: '繁體中文',
    articleType: '評論',
    updatedAt: '2026-09-30T00:15:00.000Z',
    sources: [
      { name: '中央社', url: 'https://example.com/cna' },
      { name: '自由時報', url: 'https://example.com/ltn' },
    ],
    removedSpans: [{ original: '令人髮指的句子', category: '情緒用語' }],
    biasRatio: 0.8,
  }, {
    repository: 'https://github.com/ioksengtan/normal_news',
    issueForm: 'article-report.yml',
  }, 'https://example.com/article');
  assert.match(articleHtml, /原文：/);
  assert.match(articleHtml, /中央社/);
  assert.match(articleHtml, /自由時報/);
  assert.match(articleHtml, /回報問題/);
  assert.match(articleHtml, /評論/);
  assert.match(articleHtml, /完整的中性內文/);
  assert.equal(articleHtml.includes('令人髮指'), false);
  assert.equal(articleHtml.includes('情緒密度'), false);
  assert.equal(articleHtml.includes('ranking.html'), false);
});

test('public pages do not name audit files or link a ranking', () => {
  const files = [
    'index.html',
    'article.html',
    'js/home.js',
    'js/article.js',
    'js/reading.js',
    'js/paper.js',
    'js/international.js',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(source.includes('articles.json'), false, file);
    assert.equal(source.includes('removedSpans'), false, file);
    assert.equal(source.includes('biasRatio'), false, file);
    assert.equal(source.includes('ranking.html'), false, file);
    assert.equal(source.includes('source_stats.json'), false, file);
  }
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.match(css, /font-size:\s*18px/);
  assert.match(css, /line-height:\s*1\.8/);
  assert.match(css, /\.event-title,\s*\n\.article-title \{[^}]*font-size:\s*22px/);
  assert.match(css, /\.reading-mast,\s*\n\.reading,\s*\n\.reading-footer \{\s*max-width:\s*680px/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
});
