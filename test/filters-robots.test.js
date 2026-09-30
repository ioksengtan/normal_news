import assert from 'node:assert/strict';
import test from 'node:test';
import { aiAgentBlocks, fetchRobots } from '../scripts/lib/robots.js';
import { stripTracking } from '../scripts/lib/url.js';

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

test('Lobsters allows named search crawlers and disallows everyone else, including the project bot', () => {
  const lobsters = `
User-agent: GoogleBot
Allow: /
Disallow: /search
Content-Signal: ai-input=no, ai-train=no, search=yes

User-agent: *
Crawl-delay: 1
Disallow: /
`;
  const hottest = aiAgentBlocks(lobsters, 'https://lobste.rs/hottest.json');
  assert.equal(hottest.blocked, true);
  assert.match(hottest.reason, /\*/);
  assert.equal(aiAgentBlocks(lobsters, 'https://lobste.rs/rss').blocked, true);
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
