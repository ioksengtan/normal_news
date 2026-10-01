import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildPaper } from '../js/paper.js';
import { renderNav, renderSections } from '../js/render.js';
import { formatDateline, publicationStart, taipeiDateString } from '../js/time.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/sections.json'), 'utf8'));
const now = new Date('2026-09-30T02:00:00.000Z');

function techItem(source, id, extra = {}) {
  return {
    source,
    sourceLabel: source === 'hackernews' ? 'Hacker News' : 'GitHub',
    rank: extra.rank ?? 0,
    id,
    name: extra.name || id,
    title: extra.title || '',
    titleZh: extra.titleZh || '',
    url: extra.url || '',
    hnUrl: extra.hnUrl || '',
    language: extra.language || '',
    starsToday: extra.starsToday ?? null,
    stars: extra.stars ?? null,
    score: extra.score ?? 0,
    comments: extra.comments ?? 0,
    summary: extra.summary || '這是一則中文摘要，說明這則科技消息的事實。',
    placeholder: extra.placeholder === true,
    diagram: extra.diagram || null,
  };
}

test('masthead uses the Taipei calendar date, weekday, and issue number', () => {
  assert.equal(formatDateline(now, 12), '2026 年 9 月 30 日\u3000星期三\u3000第 12 期');
  assert.equal(taipeiDateString(new Date('2026-09-29T16:30:00.000Z')), '2026-09-30');
  assert.equal(publicationStart(now).toISOString(), '2026-09-29T23:00:00.000Z');
  assert.equal(publicationStart(new Date('2026-09-29T22:59:00.000Z')).toISOString(), '2026-09-28T23:00:00.000Z');
});

test('one tech section leads with the top story and tags each item', () => {
  const longSummary = '這是一段比較長的中文說明，'.repeat(8);
  const model = buildPaper({
    config,
    issue: {
      date: '2026-09-30',
      issueNumber: 1,
      sources: {
        github: { status: 'ok', fallback: false, error: null },
        hackernews: { status: 'ok', fallback: false, error: null },
      },
      items: [
        techItem('github', 'octo/lead', {
          name: 'octo/lead',
          url: 'https://github.com/octo/lead',
          language: 'Go',
          starsToday: 20,
          stars: 100,
          summary: '【占位摘要，尚未撰寫】這是占位說明，不是正式摘要，用來預覽版面。',
          placeholder: true,
          diagram: {
            src: 'data/diagrams/2026-09-30/octo/lead.svg',
            alt: '自己的電腦連到本機引擎',
            caption: '在自己的電腦上處理聲音。',
          },
        }),
        techItem('hackernews', 7, {
          rank: 0,
          title: 'A long discussion',
          titleZh: '一則較長的討論',
          url: 'https://example.com/story',
          hnUrl: 'https://news.ycombinator.com/item?id=7',
          score: 10,
          comments: 2,
          summary: longSummary,
          placeholder: true,
          diagram: {
            src: 'data/diagrams/2026-09-30/7.svg',
            alt: '四種記憶指向調整行為',
            caption: '其他項目的圖比較小。',
          },
        }),
      ],
    },
    now,
  });
  const html = `${renderNav(model)}${renderSections(model)}`;
  assert.deepEqual(model.sections.map((section) => section.id), ['tech']);
  assert.equal(model.sections[0].name, '科技');
  assert.equal(model.sections[0].lead, true);
  assert.match(html, /class="item is-lead"/);
  assert.match(html, /octo\/lead/);
  assert.match(html, /data-source="github"/);
  assert.match(html, /data-source="hackernews"/);
  assert.match(html, />GitHub</);
  assert.match(html, />Hacker News</);
  assert.match(html, /依來源篩選/);
  assert.doesNotMatch(html, /class="summary clamp"/);
  assert.doesNotMatch(html, /<button[^>]*class="expand"/);
  assert.ok(html.includes(longSummary), 'long summaries render in full, not truncated');
  assert.match(html, /本版摘要尚未由內容長撰寫/);
  assert.match(html, /<figure class="diagram is-lead">/);
  assert.match(html, /<figure class="diagram">/);
  assert.match(html, /在自己的電腦上處理聲音。/);
  assert.match(html, /其他項目的圖比較小。/);
  assert.equal(html.includes('國際版'), false);
  assert.equal(html.includes('articles.json'), false);
});

test('a missing issue shows the empty line and a GitHub fallback note when marked', () => {
  const empty = buildPaper({ config, issue: null, now });
  assert.match(renderSections(empty), /今日未能取得/);
  const fallback = buildPaper({
    config,
    issue: {
      issueNumber: 2,
      sources: { github: { status: 'ok', fallback: true, error: null } },
      items: [techItem('github', 'octo/next', { name: 'octo/next', url: 'https://github.com/octo/next' })],
    },
    now,
  });
  assert.match(renderSections(fallback), /GitHub 今日改用近 7 天新專案/);
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
  const model = buildPaper({ config: extra, issue: null, now });
  const html = `${renderNav(model)}${renderSections(model)}`;
  assert.equal(model.sections.at(-1).name, '測試版');
  assert.match(html, />測試</);
  assert.match(html, /測試標題/);
});

test('humor sits in its own box and links to the related story', () => {
  const model = buildPaper({
    config,
    issue: {
      issueNumber: 3,
      items: [techItem('github', 'octo/lead', { name: 'octo/lead', url: 'https://github.com/octo/lead' })],
      humor: [{
        src: 'data/humor/2026-09-30/sweat.svg',
        alt: '一台流汗的電腦，旁邊是小點。',
        caption: '背景還在載入。',
        relatedItemId: 'octo/lead',
      }],
    },
    now,
  });
  const html = renderSections(model);
  assert.match(html, /今日一笑/);
  assert.match(html, /class="humor-box"/);
  assert.match(html, /href="#story-octo-lead"/);
  assert.match(html, /id="story-octo-lead"/);
  assert.ok(html.indexOf('class="item') < html.indexOf('humor-box'));
  assert.equal(html.includes('class="diagram"'), false);
});

test('the public page does not read removed international files', () => {
  const files = ['js/home.js', 'js/paper.js', 'js/render.js', 'index.html'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(source.includes('articles.json'), false, file);
    assert.equal(source.includes('international.json'), false, file);
    assert.equal(source.includes('removedSpans'), false, file);
    assert.equal(source.includes('biasRatio'), false, file);
  }
  for (const file of ['js/international.js', 'js/article.js', 'js/criteria.js', 'article.html', 'criteria.html', 'data/international.json']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
});
