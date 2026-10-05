import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildPaper } from '../js/paper.js';
import { renderSections } from '../js/render.js';
import { buildIssue } from '../scripts/tech/issue.js';
import { interleaveByRank } from '../scripts/tech/combine.js';
import { productHuntWindow } from '../scripts/tech/pacific.js';
import {
  PRODUCT_HUNT_ENDPOINT,
  fetchProductHuntSection,
  parseProductHuntPosts,
  productHuntLog,
} from '../scripts/tech/producthunt.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/sections.json'), 'utf8'));

function node(id, extra = {}) {
  return {
    id,
    name: extra.name || `Product ${id}`,
    tagline: extra.tagline || `Tagline for ${id}`,
    description: extra.description || `A longer description of product ${id} that should stay out of the paper.`,
    votesCount: extra.votesCount ?? 10,
    dailyRank: extra.dailyRank ?? Number(id),
    url: extra.url || `https://www.producthunt.com/posts/product-${id}`,
    website: 'https://example.com',
    slug: `product-${id}`,
    createdAt: '2026-10-04T18:00:00-07:00',
    featuredAt: '2026-10-04T00:05:00-07:00',
    topics: { edges: [{ node: { name: 'Productivity' } }] },
  };
}

function response(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => body,
  };
}

test('the Product Hunt window is the previous finished Pacific day, including the 2026 daylight-saving change', () => {
  const october = productHuntWindow('2026-10-06');
  assert.equal(october.pacificDate, '2026-10-04');
  assert.equal(october.postedAfter, '2026-10-04T00:00:00-07:00');
  assert.equal(october.postedBefore, '2026-10-05T00:00:00-07:00');

  const beforeChange = productHuntWindow('2026-11-02');
  assert.equal(beforeChange.pacificDate, '2026-10-31');
  assert.equal(beforeChange.postedAfter, '2026-10-31T00:00:00-07:00');
  assert.equal(beforeChange.postedBefore, '2026-11-01T00:00:00-07:00');

  const laterSameTaipeiDay = productHuntWindow(new Date('2026-10-06T16:00:00+08:00'));
  assert.equal(laterSameTaipeiDay.pacificDate, '2026-10-05');
  assert.equal(laterSameTaipeiDay.postedAfter, '2026-10-05T00:00:00-07:00');
  assert.equal(laterSameTaipeiDay.postedBefore, '2026-10-06T00:00:00-07:00');

  const changeDay = productHuntWindow('2026-11-03');
  assert.equal(changeDay.pacificDate, '2026-11-01');
  assert.equal(changeDay.postedAfter, '2026-11-01T00:00:00-07:00');
  assert.equal(changeDay.postedBefore, '2026-11-02T00:00:00-08:00');
});

test('Product Hunt uses one official API call and skips when the token or the API fails', async () => {
  let calls = 0;
  const missing = await fetchProductHuntSection({
    issueDate: '2026-10-06',
    token: '',
    fetchImpl: async () => {
      calls += 1;
      throw new Error('should not be called');
    },
    wait: false,
  });
  assert.equal(calls, 0);
  assert.equal(missing.status, 'failed');
  assert.match(productHuntLog(missing), /Product Hunt：略過（沒有環境變數 PRODUCT_HUNT_TOKEN）/);

  calls = 0;
  const limited = await fetchProductHuntSection({
    issueDate: '2026-10-06',
    token: 'test-token',
    wait: false,
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, PRODUCT_HUNT_ENDPOINT);
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(String(url).includes('www.producthunt.com'), false);
      const body = JSON.parse(options.body);
      assert.match(body.query, /featured: true/);
      assert.match(body.query, /order: RANKING/);
      assert.match(body.query, /tagline/);
      assert.match(body.query, /description/);
      assert.match(body.query, /topics\(first: 3\)/);
      assert.equal(body.variables.postedAfter, '2026-10-04T00:00:00-07:00');
      assert.equal(body.variables.postedBefore, '2026-10-05T00:00:00-07:00');
      assert.equal(body.variables.first, 5);
      return response({
        data: {
          posts: {
            edges: [6, 2, 2, 4, 1, 3, 5].map((rank) => ({ node: node(rank, { dailyRank: rank }) })),
          },
        },
      }, { headers: { 'x-rate-limit-remaining': '0', 'x-rate-limit-limit': '625' } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(limited.status, 'ok');
  assert.deepEqual(limited.items.map((item) => item.dailyRank), [1, 2, 3, 4, 5]);
  assert.equal(limited.items[0].tagline, 'Tagline for 1');
  assert.equal(limited.rateLimit['x-rate-limit-remaining'], '0');
  assert.match(productHuntLog(limited), /太平洋日 2026-10-04/);
  assert.match(productHuntLog(limited), /x-rate-limit-remaining: 0/);

  calls = 0;
  const denied = await fetchProductHuntSection({
    issueDate: '2026-10-06',
    token: 'test-token',
    wait: false,
    fetchImpl: async () => {
      calls += 1;
      return response({}, { status: 429, headers: { 'retry-after': '30', 'x-rate-limit-remaining': '0' } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(denied.status, 'failed');
  assert.match(denied.error, /HTTP 429/);
  assert.match(denied.error, /retry-after: 30/);
  assert.match(productHuntLog(denied), /^Product Hunt：略過/);
  assert.equal(parseProductHuntPosts({}).error.includes('posts'), true);
});

test('a Product Hunt summary cannot copy the tagline or description, and a skipped day still publishes the other sources', () => {
  const candidates = {
    date: '2026-10-06',
    github: { status: 'failed', fallback: false, error: 'down', items: [] },
    hackernews: { status: 'failed', error: 'down', items: [] },
    producthunt: {
      status: 'ok',
      items: [{
        id: '42',
        name: 'Calendar',
        tagline: 'The shared team calendar',
        description: 'A longer description of the shared team calendar for offices.',
        url: 'https://www.producthunt.com/posts/calendar',
        votesCount: 80,
        dailyRank: 1,
      }],
    },
  };
  const copied = {
    date: '2026-10-06',
    producthunt: { 42: { summary: '這是一則中文摘要，The shared team calendar，後面還有說明。' } },
  };
  assert.throws(() => buildIssue({ candidates, summaries: copied }), /不能照抄原文/);
  const described = {
    date: '2026-10-06',
    producthunt: { 42: { summary: 'A longer description of the shared team calendar for offices.' } },
  };
  assert.throws(() => buildIssue({ candidates, summaries: described }), /不能照抄原文/);

  const summaries = {
    date: '2026-10-06',
    producthunt: { 42: { summary: '這是給辦公室排班用的共用日曆，同事可以在同一張表上登記休假。' } },
  };
  const { issue } = buildIssue({ candidates, summaries });
  assert.equal(issue.items.length, 1);
  assert.equal(issue.items[0].sourceLabel, 'Product Hunt');
  assert.equal(issue.items[0].url, 'https://www.producthunt.com/posts/calendar');
  assert.equal('tagline' in issue.items[0], false);
  assert.equal('description' in issue.items[0], false);
  assert.equal(JSON.stringify(issue).includes('The shared team calendar'), false);

  const skipped = buildIssue({
    candidates: {
      date: '2026-10-06',
      github: {
        status: 'ok',
        items: [{ id: 'octo/a', name: 'octo/a', url: 'https://github.com/octo/a', description: 'A demo project.' }],
      },
      hackernews: {
        status: 'ok',
        items: [{
          id: 7,
          title: 'Original title',
          url: 'https://example.com/story',
          hnUrl: 'https://news.ycombinator.com/item?id=7',
          score: 3,
          comments: 1,
        }],
      },
      producthunt: { status: 'failed', error: '沒有環境變數 PRODUCT_HUNT_TOKEN', items: [] },
    },
    summaries: {
      date: '2026-10-06',
      github: { 'octo/a': { summary: '這是一個示範專案，用來說明入庫時可以沒有 Product Hunt。' } },
      hackernews: { 7: { titleZh: '中文標題', summary: '這是一則討論的中文摘要，說明貼文在講什麼。' } },
    },
  });
  assert.equal(skipped.issue.items.length, 2);
  assert.equal(skipped.issue.items.some((item) => item.source === 'producthunt'), false);
  assert.equal(skipped.issue.sources.producthunt.status, 'failed');

  const items = interleaveByRank([
    { id: 'github', label: 'GitHub', items: [{ id: 'g0' }, { id: 'g1' }] },
    { id: 'hackernews', label: 'Hacker News', items: [{ id: 'h0' }] },
    { id: 'producthunt', label: 'Product Hunt', items: [{ id: 'p0' }, { id: 'p1' }] },
  ]);
  assert.deepEqual(items.map((item) => item.id), ['g0', 'h0', 'p0', 'g1', 'p1']);
  assert.equal(items[2].sourceLabel, 'Product Hunt');

  const model = buildPaper({
    config,
    issue: {
      date: '2026-10-06',
      issueNumber: 7,
      items: [
        { source: 'hackernews', sourceLabel: 'Hacker News', rank: 0, id: '7', titleZh: '一則討論', title: 'A post', summary: '這是一則中文摘要，說明討論在講什麼。', hnUrl: 'https://news.ycombinator.com/item?id=7' },
        { source: 'producthunt', sourceLabel: 'Product Hunt', rank: 0, id: '42', name: 'Calendar', url: 'https://www.producthunt.com/posts/calendar', summary: '這是一則中文摘要，說明這個產品在做什麼。', votesCount: 80, dailyRank: 1 },
        { source: 'github', sourceLabel: 'GitHub', rank: 0, id: 'octo/a', name: 'octo/a', url: 'https://github.com/octo/a', summary: '這是一則中文摘要，說明這個專案在做什麼。' },
      ],
    },
  });
  const html = renderSections(model);
  assert.match(html, /data-source="producthunt"/);
  assert.match(html, /via Product Hunt/);
  assert.match(html, /href="https:\/\/www\.producthunt\.com\/posts\/calendar"/);
  assert.match(html, /當日第 1 名/);
  const githubAt = html.indexOf('data-source="github"');
  const hnAt = html.indexOf('data-source="hackernews"');
  const phAt = html.indexOf('data-source="producthunt"');
  assert.ok(githubAt >= 0 && githubAt < hnAt && hnAt < phAt);
  assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes('data/tech/'), true);
  assert.equal(fs.readFileSync(path.join(root, 'scripts/tech/producthunt.js'), 'utf8').includes('PRODUCT_HUNT_TOKEN='), false);
});
