import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { fileURLToPath } from 'url';
import { HOME_MAX_BYTES, MIN_ARTICLES_FOR_RANK, SAMPLE_TOO_SMALL_NOTE } from '../scripts/lib/constants.js';
import { ingestBatch, rebuildDerived, validateStoredData } from '../scripts/lib/ingest.js';
import { publishDataFiles } from '../scripts/lib/publish.js';
import { parseRubric, loadRubric } from '../scripts/lib/rubric.js';
import { countUnseen, feedFailureSummary, fetchFeed, selectByQuota } from '../scripts/lib/rss.js';
import { loadSources } from '../scripts/lib/sources.js';
import { buildSourceStats } from '../scripts/lib/stats.js';
import { buildHome } from '../scripts/lib/ingest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rubric = loadRubric(path.join(root, 'rubric-spec.md'));

function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function closeServer(server, sockets) {
  for (const socket of sockets) socket.destroy();
  return new Promise((resolve) => server.close(resolve));
}

function trackSockets(server) {
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  return sockets;
}

test('rubric headings in prose are not treated as section boundaries', () => {
  const raw = [
    '---',
    'version: 1.2.3',
    'updated: 2026-01-01',
    '---',
    '',
    '說明裡提到 `## 系統提示詞` 會送進模型，',
    '以及 `## 使用者可讀說明` 會顯示在頁面上。',
    '',
    '## 系統提示詞（LLM 使用）',
    '',
    '系統內容本身',
    '',
    '## 使用者可讀說明（顯示於準則頁）',
    '',
    '給人看的說明',
    '',
  ].join('\n');
  const parsed = parseRubric(raw);
  assert.equal(parsed.version, '1.2.3');
  assert.equal(parsed.systemPrompt, '系統內容本身');
  assert.equal(parsed.humanSummary, '給人看的說明');
});

test('checked-in rubric keeps the system prompt out of the criteria text', () => {
  assert.match(rubric.systemPrompt, /^你是新聞中性摘要編輯/);
  assert.equal(rubric.systemPrompt.includes('使用者可讀說明'), false);
  assert.match(rubric.systemPrompt, /unsure/);
  assert.match(rubric.systemPrompt, /neutral_summary/);
  assert.equal(rubric.systemPrompt.includes('domestic'), false);
  assert.match(rubric.humanSummary, /^(\*\*)?正常新聞做什麼/);
  assert.equal(rubric.humanSummary.includes('只回傳以下 JSON'), false);
  assert.equal(rubric.humanSummary.includes('## 系統提示詞'), false);
});

test('each feed gets its own quota instead of the first feed taking every slot', () => {
  const items = [];
  for (let i = 0; i < 8; i += 1) {
    items.push({ feedId: 'ltn', link: `https://ltn.example/${i}`, source: '自由時報' });
  }
  for (let i = 0; i < 8; i += 1) {
    items.push({ feedId: 'cna', link: `https://cna.example/${i}`, source: '中央社' });
  }
  const seen = new Set(['https://ltn.example/0', 'https://ltn.example/1']);
  const selected = selectByQuota(items, seen, 3);
  assert.deepEqual(
    selected.filter((item) => item.feedId === 'ltn').map((item) => item.link),
    ['https://ltn.example/2', 'https://ltn.example/3', 'https://ltn.example/4'],
  );
  assert.equal(selected.filter((item) => item.feedId === 'cna').length, 3);
  assert.equal(countUnseen(items.slice(0, 8), seen), 6);
});

test('feed summary fails only when every enabled feed failed', () => {
  assert.equal(feedFailureSummary([
    { status: 'error' },
    { status: 'ok' },
  ]).allFailed, false);
  assert.equal(feedFailureSummary([
    { status: 'error' },
    { status: 'disabled' },
  ]).allFailed, true);
  assert.equal(feedFailureSummary([{ status: 'disabled' }]).allFailed, true);
});

test('source config is international news and tech only', () => {
  const file = path.join(root, 'config', 'sources.json');
  const sources = loadSources(file);
  assert.deepEqual(sources.map((source) => source.id), [
    'bbc-chinese-trad',
    'dw-chinese',
    'al-jazeera',
    'channel-news-asia',
    'japan-times',
    'korea-herald',
  ]);
  assert.equal(sources.filter((source) => source.enabled).map((source) => source.id).join(','), [
    'bbc-chinese-trad',
    'dw-chinese',
    'al-jazeera',
    'channel-news-asia',
  ].join(','));
  assert.equal(sources.find((source) => source.id === 'japan-times').enabled, false);
  assert.equal(sources.find((source) => source.id === 'korea-herald').enabled, false);
  assert.equal(sources.find((source) => source.id === 'dw-chinese').maxAgeDays, 3);
  assert.deepEqual(sources.find((source) => source.id === 'al-jazeera').excludeUrlSubstrings, ['/liveblog/']);
  assert.deepEqual(
    sources.find((source) => source.id === 'channel-news-asia').excludeCategories,
    ['business', 'commentary'],
  );
  const disabled = loadSources(file, { disabled: ['英國廣播公司中文網'] });
  assert.equal(disabled.find((source) => source.id === 'bbc-chinese-trad').enabled, false);

  const bad = path.join(os.tmpdir(), `sources-bad-${Date.now()}.json`);
  fs.writeFileSync(bad, JSON.stringify({
    sources: [{ id: 'x', source: 'X', url: 'not-a-url' }],
  }));
  assert.throws(() => loadSources(bad), /http/);
});

test('source stats stay in the data file and are not ranked below 20 articles', () => {
  const few = buildSourceStats([
    { source: '甲', biasRatio: 0.2, isExample: false },
    { source: '範例', biasRatio: 0.5, isExample: true },
  ]);
  assert.equal(few.length, 2);
  assert.equal(few.every((row) => row.rank === null && row.sampleTooSmall), true);
  assert.equal(few.find((row) => row.source === '範例').isExample, true);
  assert.equal(few.find((row) => row.source === '範例').sampleNote, SAMPLE_TOO_SMALL_NOTE);

  const many = Array.from({ length: MIN_ARTICLES_FOR_RANK }, () => ({
    source: '甲',
    biasRatio: 0.2,
    isExample: false,
  }));
  const ranked = buildSourceStats(many);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].sampleTooSmall, false);
  assert.equal(ranked[0].sampleNote, '');
});

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

function filler(seed) {
  let text = seed;
  while ([...text].length < 160) text += '各方說法已分開轉述。';
  return [...text].slice(0, 170).join('');
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

test('ingest validates rewrites, drops examples, and keeps same-event links', () => {
  const existingArticles = [
    {
      id: 'example-1',
      title: '範例',
      link: '#',
      source: '範例媒體',
      publishedAt: '2026-09-01T00:00:00+08:00',
      processedAt: '2026-09-01T00:00:00+08:00',
      neutralText: '範例正文',
      removedSpans: [],
      biasRatio: 0.1,
      rubricVersion: '0.1.0',
      eventId: 'evt_example-1',
      isExample: true,
    },
  ];
  const existingEvents = [
    {
      id: 'evt_old',
      summary: '既有事件短述',
      representativeArticleId: 'kept-out',
      articleIds: [],
      uncertain: false,
      publishedAt: '2026-09-02T00:00:00+08:00',
      updatedAt: '2026-09-02T00:00:00+08:00',
    },
  ];
  // 空的 articleIds 會在重整時被丟掉；改成先放進一篇會被保留的文章，再測 same_as。
  existingArticles.push({
    id: 'early',
    link: 'https://news.example/early',
    source: '測試報',
    publishedAt: '2026-09-02T00:00:00+08:00',
    processedAt: '2026-09-02T00:00:00+08:00',
    neutralTitle: '較早的預算消息',
    neutralSummary: filler('較早的預算消息。主管機關與批評方都已轉述。'),
    sourceLanguage: '繁體中文',
    articleType: '新聞報導',
    section: '國際版',
    balanceNotes: [],
    rubricVersion: '0.1.0',
    eventId: 'evt_old',
    isExample: false,
  });
  existingEvents[0].articleIds = ['early'];
  existingEvents[0].representativeArticleId = 'early';

  const text = candidate('late').text;
  assert.throws(
    () => ingestBatch({
      articles: existingArticles,
      events: existingEvents,
      candidates: [candidate('late')],
      rewrites: [rewrite('late', { source_language: '法文' })],
      rubric,
      now: '2026-09-30T03:00:00.000Z',
    }),
    /source_language/,
  );

  assert.throws(
    () => ingestBatch({
      articles: existingArticles,
      events: existingEvents,
      candidates: [candidate('late', { text })],
      rewrites: [rewrite('late', { neutral_summary: filler(text) })],
      rubric,
    }),
    /連續相同/,
  );

  assert.throws(
    () => ingestBatch({
      articles: existingArticles,
      events: existingEvents,
      candidates: [candidate('late', { text })],
      rewrites: [rewrite('late', { event: { decision: 'unsure', same_as: 'evt_old', summary: '不該併' } })],
      rubric,
    }),
    /不要併入/,
  );

  const merged = ingestBatch({
    articles: existingArticles,
    events: existingEvents,
    candidates: [
      candidate('late', { publishedAt: '2026-08-01T00:00:00+08:00', text }),
      candidate('other', { text, publishedAt: '2026-09-29T00:00:00+08:00' }),
    ],
    rewrites: [
      rewrite('late', {
        event: { decision: 'same_as', same_as: 'evt_old' },
      }),
      rewrite('other', {
        event: { decision: 'unsure', summary: '另一件還不能確定的事。' },
      }),
    ],
    rubric,
    now: '2026-09-30T03:00:00.000Z',
  });

  assert.equal(merged.articles.some((article) => article.isExample), false);
  assert.equal(merged.articles.some((article) => article.id === 'example-1'), false);
  const late = merged.articles.find((article) => article.id === 'late');
  assert.equal('removedSpans' in late, false);
  assert.equal('biasRatio' in late, false);
  assert.equal(late.neutralTitle, '議會完成預算表決');
  assert.equal(late.sourceLanguage, '繁體中文');
  assert.equal(late.eventId, 'evt_old');
  const oldEvent = merged.events.find((event) => event.id === 'evt_old');
  assert.equal(oldEvent.summary, '既有事件短述');
  assert.equal(oldEvent.representativeArticleId, 'late');
  assert.deepEqual(oldEvent.articleIds, ['early', 'late']);
  const unsure = merged.events.find((event) => event.uncertain);
  assert.ok(unsure);
  assert.equal(unsure.id, 'evt_other');
  assert.notEqual(unsure.id, oldEvent.id);
  assert.equal(merged.home.events.length <= 30, true);
  assert.equal(JSON.stringify(merged.home).includes('neutralText'), false);
  assert.equal(merged.stats.find((row) => row.source === '範例媒體'), undefined);
  validateStoredData({ ...merged, rubric });
});

test('homepage keeps 30 event titles and summaries under 300KB', () => {
  const articles = [];
  const events = [];
  for (let i = 0; i < 35; i += 1) {
    const id = `a${String(i).padStart(2, '0')}`;
    articles.push({
      id,
      neutralTitle: `事件標題 ${i}`,
      link: `https://news.example/${id}`,
      source: '測試報',
      publishedAt: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T00:00:00+08:00`,
      processedAt: '2026-09-30T00:00:00.000Z',
      neutralSummary: `中性正文 ${i}`,
      sourceLanguage: '繁體中文',
      articleType: '新聞報導',
      rubricVersion: '0.1.0',
      eventId: `evt_${id}`,
    });
    events.push({
      id: `evt_${id}`,
      summary: `短述 ${i}`,
      representativeArticleId: id,
      articleIds: [id],
      uncertain: false,
      publishedAt: articles[i].publishedAt,
      updatedAt: '2026-09-30T00:00:00.000Z',
    });
  }
  const home = buildHome(events, articles, '2026-09-30T00:00:00.000Z');
  assert.equal(home.events.length, 30);
  assert.equal(home.hasMore, true);
  assert.equal(Buffer.byteLength(`${JSON.stringify(home, null, 2)}\n`) <= HOME_MAX_BYTES, true);
  assert.equal(home.events.some((event) => event.summary === '短述 0' && event.title.includes('0')), false);
  assert.equal(JSON.stringify(home).includes('https://'), false);
  const hugeArticles = articles.map((article) => (
    article.id === 'a00' ? { ...article, source: '名'.repeat(120000) } : article
  ));
  assert.throws(() => buildHome(events, hugeArticles, '2026-09-30T00:00:00.000Z'), /超過/);
});

test('ingest command exits non-zero and does not write when validation fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'normal-news-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir);
  const seeded = rebuildDerived({
    articles: [{
      id: 'example-9',
      title: '範例',
      link: '#',
      source: '範例媒體',
      publishedAt: '2026-09-01T00:00:00+08:00',
      processedAt: '2026-09-01T00:00:00+08:00',
      neutralText: '範例正文',
      removedSpans: [],
      biasRatio: 0,
      rubricVersion: rubric.version,
      eventId: 'evt_example-9',
      isExample: true,
    }],
    events: [{
      id: 'evt_example-9',
      summary: '範例事件。',
      representativeArticleId: 'example-9',
      articleIds: ['example-9'],
      uncertain: false,
      publishedAt: '2026-09-01T00:00:00+08:00',
      updatedAt: '2026-09-01T00:00:00+08:00',
      isExample: true,
    }],
    rubric,
    now: '2026-09-30T00:00:00.000Z',
  });
  for (const [name, value] of [
    ['articles.json', seeded.articles],
    ['events.json', seeded.events],
    ['home.json', seeded.home],
    ['source_stats.json', seeded.stats],
    ['criteria.json', seeded.criteria],
  ]) {
    fs.writeFileSync(path.join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`);
  }
  const before = fs.readFileSync(path.join(dataDir, 'articles.json'), 'utf8');
  const candidates = path.join(dir, 'candidates.json');
  const rewrites = path.join(dir, 'rewrites.json');
  fs.writeFileSync(candidates, JSON.stringify({ candidates: [candidate('n1')] }));
  fs.writeFileSync(rewrites, JSON.stringify({
    results: [rewrite('n1', { neutral_summary: filler(candidate('n1').text) })],
  }));
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'ingest.js'),
    '--data-dir', dataDir,
    '--rubric', path.join(root, 'rubric-spec.md'),
    '--candidates', candidates,
    '--rewrites', rewrites,
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /連續相同/);
  assert.equal(fs.readFileSync(path.join(dataDir, 'articles.json'), 'utf8'), before);
});

test('publish dry-run does not create a commit, and a real run sends one non-force update', async () => {
  const files = [
    'articles.json',
    'events.json',
    'home.json',
    'home-more.json',
    'international.json',
    'source_stats.json',
    'criteria.json',
  ].map((name) => ({ path: `data/${name}`, content: `${name}\n` }));
  const calls = [];
  const request = async (_token, route, options = {}) => {
    calls.push({ route, method: options.method || 'GET', body: options.body });
    if (route.endsWith('/git/ref/heads/main') && (options.method || 'GET') === 'GET') {
      return { object: { sha: 'parent' } };
    }
    if (route.endsWith('/git/commits/parent')) return { tree: { sha: 'tree0' }, sha: 'parent' };
    if (route.includes('/git/trees/tree0')) {
      return { tree: [], truncated: false };
    }
    if (route.endsWith('/git/trees') && options.method === 'POST') return { sha: 'tree1' };
    if (route.endsWith('/git/commits') && options.method === 'POST') return { sha: 'commit1' };
    if (route.endsWith('/git/refs/heads/main') && options.method === 'PATCH') {
      return { object: { sha: options.body.sha } };
    }
    throw new Error(`unexpected ${options.method || 'GET'} ${route}`);
  };

  const dry = await publishDataFiles({
    token: 'test-token',
    repo: 'owner/repo',
    files,
    dryRun: true,
    request,
  });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.changed, true);
  assert.equal(calls.some((call) => call.method === 'POST' || call.method === 'PATCH'), false);

  calls.length = 0;
  const published = await publishDataFiles({
    token: 'test-token',
    repo: 'owner/repo',
    files,
    dryRun: false,
    request,
  });
  assert.equal(published.commitSha, 'commit1');
  const writes = calls.filter((call) => call.method !== 'GET');
  assert.deepEqual(writes.map((call) => call.method), ['POST', 'POST', 'PATCH']);
  assert.equal(writes[2].body.force, false);
  assert.equal(writes[2].route.endsWith('/git/refs/heads/main'), true);
  assert.deepEqual(writes[0].body.tree.map((item) => item.path), files.map((file) => file.path));

  await assert.rejects(
    () => publishDataFiles({
      token: 'test-token',
      repo: 'owner/repo',
      files,
      request: async () => {
        throw new Error('GitHub API GET /repos/owner/repo/git/ref/heads/main 失敗：HTTP 401 Bad credentials');
      },
    }),
    /HTTP 401/,
  );
});

test('fetchFeed reports HTTP 403 and aborts a feed that never responds', async () => {
  const forbidden = http.createServer((req, res) => {
    res.writeHead(403, { 'content-type': 'text/html' });
    res.end('<h1>403 Forbidden</h1>');
  });
  const forbiddenSockets = trackSockets(forbidden);
  const forbiddenPort = await listen(forbidden);
  const started = Date.now();
  const denied = await fetchFeed({
    id: 'ltn',
    source: '自由時報',
    url: `http://127.0.0.1:${forbiddenPort}/rss/all.xml`,
  }, { timeoutMs: 2000, limit: 5 });
  assert.equal(denied.ok, false);
  assert.equal(denied.error, 'HTTP 403');
  assert.ok(Date.now() - started < 2000);
  await closeServer(forbidden, forbiddenSockets);

  const hanging = http.createServer(() => {});
  const hangingSockets = trackSockets(hanging);
  const hangingPort = await listen(hanging);
  const hungStarted = Date.now();
  const hung = await fetchFeed({
    id: 'slow',
    source: '慢',
    url: `http://127.0.0.1:${hangingPort}/rss`,
  }, { timeoutMs: 400, limit: 5 });
  assert.equal(hung.ok, false);
  assert.match(hung.error, /逾時/);
  assert.ok(Date.now() - hungStarted < 3000);
  await closeServer(hanging, hangingSockets);
});

test('fetch command keeps going after one feed fails and exits non-zero when all fail', async () => {
  const hits = { secret: 0, ok: 0, fail: 0 };
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/secret')) hits.secret += 1;
    if (req.url.startsWith('/ok')) hits.ok += 1;
    if (req.url.startsWith('/fail')) hits.fail += 1;
    if (req.url.startsWith('/fail') || req.url.startsWith('/secret')) {
      res.writeHead(403);
      res.end('no');
      return;
    }
    const port = server.address().port;
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel><title>ok</title>
        <item><title>已收錄</title><link>http://127.0.0.1:${port}/story</link><pubDate>Wed, 30 Sep 2026 00:00:00 GMT</pubDate></item>
      </channel></rss>`);
  });
  const sockets = trackSockets(server);
  const port = await listen(server);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'normal-news-fetch-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'articles.json'), JSON.stringify([
    { link: `http://127.0.0.1:${port}/story` },
  ]));
  fs.writeFileSync(path.join(dataDir, 'events.json'), '[]\n');
  const sourcesPath = path.join(dir, 'sources.json');
  const outFile = path.join(dir, 'candidates.json');
  fs.writeFileSync(sourcesPath, JSON.stringify({
    sources: [
      { id: 'fail', source: '失敗來源', url: `http://127.0.0.1:${port}/fail`, enabled: true },
      { id: 'ok', source: '成功來源', url: `http://127.0.0.1:${port}/ok`, enabled: true },
      { id: 'secret', source: '停用來源', url: `http://127.0.0.1:${port}/secret`, enabled: false },
    ],
  }));

  const partial = await runNode([
    path.join(root, 'scripts', 'fetch-candidates.js'),
    '--sources', sourcesPath,
    '--data-dir', dataDir,
    '--out', outFile,
    '--timeout', '2000',
  ]);
  assert.equal(partial.status, 0, partial.stderr);
  assert.match(partial.stderr, /警告：1 個來源失敗/);
  assert.equal(hits.secret, 0);
  const output = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(output.candidates.length, 0);
  assert.equal(output.feeds.find((feed) => feed.id === 'fail').status, 'error');
  assert.equal(output.feeds.find((feed) => feed.id === 'ok').status, 'ok');
  assert.equal(output.feeds.find((feed) => feed.id === 'ok').newCount, 0);
  assert.equal(output.feeds.find((feed) => feed.id === 'secret').status, 'disabled');

  fs.writeFileSync(sourcesPath, JSON.stringify({
    sources: [
      { id: 'fail', source: '失敗來源', url: `http://127.0.0.1:${port}/fail` },
    ],
  }));
  const allFailed = await runNode([
    path.join(root, 'scripts', 'fetch-candidates.js'),
    '--sources', sourcesPath,
    '--data-dir', dataDir,
    '--out', outFile,
    '--timeout', '2000',
  ]);
  assert.equal(allFailed.status, 1);
  assert.match(allFailed.stderr, /所有啟用的來源都抓取失敗/);

  const blocked = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'fetch-candidates.js'),
    '--sources', sourcesPath,
    '--data-dir', dataDir,
    '--out', path.join(dataDir, 'candidates.json'),
  ], { encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /禁止寫入/);
  assert.equal(fs.existsSync(path.join(dataDir, 'candidates.json')), false);

  await closeServer(server, sockets);
});
