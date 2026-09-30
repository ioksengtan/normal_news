import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildPaper, selectByCoverage } from '../js/paper.js';
import { renderArticle, renderNav, renderSections } from '../js/render.js';
import { formatDateline, publicationStart, taipeiDateString } from '../js/time.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/sections.json'), 'utf8'));
const now = new Date('2026-09-30T02:00:00.000Z');

test('masthead uses the Taipei calendar date, weekday, and issue number', () => {
  assert.equal(formatDateline(now, 12), '2026 年 9 月 30 日\u3000星期三\u3000第 12 期');
  assert.equal(taipeiDateString(new Date('2026-09-29T16:30:00.000Z')), '2026-09-30');
  assert.equal(publicationStart(now).toISOString(), '2026-09-29T23:00:00.000Z');
  assert.equal(publicationStart(new Date('2026-09-29T22:59:00.000Z')).toISOString(), '2026-09-28T23:00:00.000Z');
});

test('tech sections lead the paper and GitHub opens with a lead story', () => {
  const model = buildPaper({
    config,
    international: { updatedAt: null, events: [] },
    issue: {
      date: '2026-09-30',
      issueNumber: 1,
      sections: {
        github: {
          status: 'ok',
          fallback: false,
          items: [
            {
              id: 'octo/lead',
              name: 'octo/lead',
              url: 'https://github.com/octo/lead',
              language: 'Go',
              starsToday: 20,
              stars: 100,
              summary: '【占位摘要，尚未撰寫】這是占位說明，不是正式摘要，用來預覽版面。',
              placeholder: true,
            },
            {
              id: 'octo/next',
              name: 'octo/next',
              url: 'https://github.com/octo/next',
              language: 'Rust',
              starsToday: 5,
              stars: 40,
              summary: '【占位摘要，尚未撰寫】第二則也是占位，不該被當成正式摘要。',
              placeholder: true,
            },
          ],
        },
        hackernews: { status: 'failed', items: [] },
      },
    },
    now,
  });
  const html = `${renderNav(model)}${renderSections(model)}`;
  assert.deepEqual(model.sections.map((section) => section.id), ['github', 'hackernews', 'international']);
  assert.ok(html.indexOf('科技．GitHub') < html.indexOf('科技．Hacker News'));
  assert.ok(html.indexOf('科技．Hacker News') < html.indexOf('國際版'));
  assert.match(html, /今日國際版尚無新聞/);
  assert.equal(model.sections[0].lead, true);
  assert.match(html, /class="item is-lead"/);
  assert.match(html, /octo\/lead/);
  assert.match(html, /今日未能取得/);
  assert.equal(html.includes('articles.json'), false);
  assert.equal(model.frontUpdated, '');
});

test('international coverage ranking keeps twelve stories and a single lead', () => {
  const report = (source, at) => ({ source, at });
  const event = (id, reports) => ({
    id,
    title: `${id} 的中性標題`,
    summary: '中性摘要。',
    neutralText: '被移除的句子不在這裡。',
    updatedAt: reports.map((item) => item.at).sort().at(-1),
    sources: reports.map((item) => ({ name: item.source, url: `https://example.com/${item.source}`, publishedAt: item.at })),
    reports,
    removedSpans: [{ original: '令人髮指的句子', category: '情緒用語' }],
    biasRatio: 0.4,
  });
  const today = '2026-09-30T01:00:00.000Z';
  const multis = Array.from({ length: 12 }, (_, index) => event(`multi-${index}`, [
    report(`來源甲${index}`, today),
    report(`來源乙${index}`, today),
  ]));
  const single = event('single', [report('單獨來源', '2026-09-30T01:30:00.000Z')]);
  const ranked = selectByCoverage([...multis, single], now, 12);
  assert.equal(ranked.length, 12);
  assert.equal(ranked.some((item) => item.id === 'single'), false);

  const few = selectByCoverage([
    event('many', [report('甲', today), report('乙', today)]),
    event('one-new', [report('丙', '2026-09-30T01:40:00.000Z')]),
    event('one-old', [report('丁', '2026-09-30T00:10:00.000Z')]),
  ], now, 12);
  assert.deepEqual(few.map((item) => item.id), ['many', 'one-new', 'one-old']);

  const model = buildPaper({
    config,
    international: { updatedAt: '2026-09-30T01:40:00.000Z', events: [few[0], few[1], few[2]] },
    issue: null,
    now,
  });
  const html = renderSections(model);
  const section = model.sections.find((item) => item.id === 'international');
  assert.equal(section.lead, true);
  assert.deepEqual(section.items.map((item) => item.id), ['many', 'one-new', 'one-old']);
  assert.equal(section.items.length <= 12, true);
  assert.equal(html.includes('令人髮指的句子'), false);
  assert.equal(html.includes('情緒密度'), false);
  assert.equal(html.includes('ranking.html'), false);
  assert.equal(model.frontUpdated, '國際版更新於 09:40');
  const articleHtml = renderArticle(few[0], config, 'https://example.com/article');
  assert.match(articleHtml, /回報問題/);
  assert.match(articleHtml, /https:\/\/github\.com\/ioksengtan\/normal_news\/issues\/new/);
});

test('a previously printed international story waits for a new report', () => {
  const event = (id, reports) => ({
    id,
    title: `${id} 標題`,
    summary: '摘要',
    updatedAt: reports.map((item) => item.at).sort().at(-1),
    sources: [],
    reports,
  });
  const ids = selectByCoverage([
    event('repeated', [
      { source: '甲', at: '2026-09-29T20:00:00.000Z' },
      { source: '乙', at: '2026-09-29T20:10:00.000Z' },
    ]),
    event('developed', [
      { source: '甲', at: '2026-09-29T20:00:00.000Z' },
      { source: '乙', at: '2026-09-30T01:20:00.000Z' },
    ]),
    event('fresh', [
      { source: '甲', at: '2026-09-30T01:00:00.000Z' },
      { source: '乙', at: '2026-09-30T01:00:00.000Z' },
    ]),
  ], now, 12).map((item) => item.id);
  assert.equal(ids.includes('repeated'), false);
  assert.equal(ids.includes('developed'), true);
  assert.equal(ids.includes('fresh'), true);
});

test('a long tech summary stays collapsed until it is expanded', () => {
  const model = buildPaper({
    config,
    international: { events: [] },
    issue: {
      issueNumber: 1,
      sections: {
        hackernews: {
          status: 'ok',
          items: [{
            id: 7,
            title: 'A long discussion',
            titleZh: '一則較長的討論',
            url: 'https://example.com/story',
            hnUrl: 'https://news.ycombinator.com/item?id=7',
            score: 10,
            comments: 2,
            summary: '這是一段比較長的中文說明，'.repeat(8),
          }],
        },
      },
    },
    now,
  });
  const html = renderSections(model);
  assert.match(html, /class="summary clamp"/);
  assert.match(html, /class="expand"/);
  assert.match(html, /展開/);
});

test('a section added only in config appears in the paper and the navigation', () => {
  const extra = {
    ...config,
    sections: [...config.sections, {
      id: 'extra',
      name: '測試版',
      navLabel: '測試',
      source: 'inline',
      presentation: 'generic',
      columns: 2,
      items: [{ title: '測試標題', summary: '測試摘要', url: 'https://example.com/extra' }],
    }],
  };
  const model = buildPaper({ config: extra, international: { events: [] }, issue: null, now });
  const html = `${renderNav(model)}${renderSections(model)}`;
  assert.equal(model.sections.at(-1).name, '測試版');
  assert.match(html, />測試</);
  assert.match(html, /測試標題/);
});

test('the public page does not read the Taiwan article file', () => {
  const files = ['js/home.js', 'js/article.js', 'js/paper.js', 'js/international.js', 'index.html'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(source.includes('articles.json'), false, file);
    assert.equal(source.includes('removedSpans'), false, file);
    assert.equal(source.includes('biasRatio'), false, file);
  }
  const committed = JSON.parse(fs.readFileSync(path.join(root, 'data/international.json'), 'utf8'));
  assert.deepEqual(committed.events, []);
});
