import path from 'path';
import { flag, parseArgs, parseList, positiveInt } from './lib/args.js';
import { MIN_ARTICLE_TEXT_CHARS } from './lib/constants.js';
import { extractArticleText } from './lib/extract.js';
import { MIN_REQUEST_GAP_MS, taipeiStamp, waitForSlot } from './lib/http.js';
import { stripTracking } from './lib/url.js';
import { applySourceFilters } from './lib/filters.js';
import { articleIdFromLink } from './lib/ingest.js';
import { readJson, writeJson } from './lib/jsonio.js';
import { aiAgentBlocks, fetchRobots } from './lib/robots.js';
import { countUnseen, feedFailureSummary, fetchFeed, selectByQuota } from './lib/rss.js';
import { fetchLimitsFromConfig, loadSources } from './lib/sources.js';
import { charLength } from './lib/text.js';

const USAGE = `用法：npm run fetch -- [選項]

抓取國際新聞與科技來源的 RSS，跳過 data/articles.json 已有的連結，萃取全文到本地檔。
這份檔案含原文，不要提交、也不要放到 data/。

選項：
  --out <檔案>         預設 tmp/candidates.json
  --per-source <n>     每個來源最多幾篇，預設 6（設定檔 perSource，或環境變數 MAX_PER_SOURCE）
  --total <n>          整輪最多幾篇，預設 30（設定檔 total，或環境變數 MAX_TOTAL）
  --limit <n>          每個 feed 最多讀幾則，預設 30（LIMIT_PER_FEED）
  --disable <id或名稱> 這次停用的來源，可重複，或用逗號分隔（DISABLED_SOURCES）
  --timeout <ms>       單次抓取逾時，預設 20000（FEED_TIMEOUT_MS）
  --data-dir <目錄>    預設 data
  --sources <檔案>     預設 config/sources.json
  --help
`;

const robotsCache = new Map();

function outsideDataDir(outFile, dataDir) {
  const out = path.resolve(outFile);
  const data = path.resolve(dataDir);
  const rel = path.relative(data, out);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(`候選文章含全文，禁止寫入 ${data}。請改寫到 tmp/ 這類不會被發布的路徑。`);
  }
}

function emptyFeed(source, status, error) {
  return {
    id: source.id,
    source: source.source,
    url: source.url,
    status,
    error,
    itemCount: 0,
    keptCount: 0,
    newCount: 0,
    selectedCount: 0,
    extractedCount: 0,
    robotsSkipped: 0,
  };
}

async function gate(url, timeoutMs) {
  const origin = new URL(url).origin;
  await waitForSlot(`${origin}/robots.txt`, MIN_REQUEST_GAP_MS);
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, fetchRobots(origin, { timeoutMs }));
  }
  const robots = await robotsCache.get(origin);
  if (!robots.ok) {
    return {
      blocked: true,
      reason: `讀不到 robots.txt（${robots.error}）。不改 User-Agent、不換 IP。`,
      crawlDelaySeconds: 0,
    };
  }
  return aiAgentBlocks(robots.text, url);
}

async function pauseForCrawlDelay(url, seconds) {
  const gap = Math.max(MIN_REQUEST_GAP_MS, Math.min(seconds, 60) * 1000);
  await waitForSlot(url, gap);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (flag(args.help)) {
    console.log(USAGE);
    return 0;
  }

  const dataDir = path.resolve(args['data-dir'] || 'data');
  const outFile = path.resolve(args.out || path.join('tmp', 'candidates.json'));
  outsideDataDir(outFile, dataDir);

  const sourceFile = args.sources || undefined;
  const limits = fetchLimitsFromConfig(readJson(sourceFile || 'config/sources.json'));
  const perSource = positiveInt(
    args['per-source'] ?? process.env.MAX_PER_SOURCE,
    '--per-source',
    limits.perSource,
  );
  const total = positiveInt(args.total ?? process.env.MAX_TOTAL, '--total', limits.total);
  const limit = positiveInt(args.limit ?? process.env.LIMIT_PER_FEED, '--limit', 30);
  const timeoutMs = positiveInt(args.timeout ?? process.env.FEED_TIMEOUT_MS, '--timeout', 20000);
  const disabled = [
    ...parseList(args.disable),
    ...parseList(process.env.DISABLED_SOURCES),
  ];
  const sources = loadSources(sourceFile, { disabled });
  const articles = readJson(path.join(dataDir, 'articles.json'));
  const events = readJson(path.join(dataDir, 'events.json'));
  if (!Array.isArray(articles)) throw new Error('articles.json 必須是陣列');
  if (!Array.isArray(events)) throw new Error('events.json 必須是陣列');

  const seenLinks = new Set(articles.map((article) => article.link).filter(Boolean));
  const seenForNew = new Set(seenLinks);
  const feedReports = [];
  const pooled = [];
  const now = new Date();

  for (const source of sources) {
    if (!source.enabled) {
      feedReports.push(emptyFeed(source, 'disabled', source.disabledReason));
      console.log(`[停用] ${source.source} (${source.id}) ${source.disabledReason}`);
      continue;
    }

    const feedUrl = stripTracking(source.url);
    const feedGate = await gate(feedUrl, timeoutMs);
    if (feedGate.blocked) {
      feedReports.push(emptyFeed(source, 'blocked', feedGate.reason));
      console.error(`[略過] ${taipeiStamp()} ${source.source} (${source.id}) ${feedGate.reason}`);
      continue;
    }

    await waitForSlot(feedUrl, Math.max(MIN_REQUEST_GAP_MS, feedGate.crawlDelaySeconds * 1000));
    const fetched = await fetchFeed({ ...source, url: feedUrl }, { timeoutMs, limit });
    const items = (fetched.items || []).map((item) => {
      try {
        return { ...item, link: stripTracking(item.link) };
      } catch {
        return null;
      }
    }).filter(Boolean);
    const filtered = applySourceFilters(items, source, now);
    const freshCount = countUnseen(filtered, seenForNew);
    for (const item of filtered) {
      if (item.link) seenForNew.add(item.link);
    }
    const report = {
      ...emptyFeed(source, fetched.ok ? 'ok' : 'error', fetched.error),
      itemCount: items.length,
      keptCount: filtered.length,
      newCount: freshCount,
    };
    feedReports.push(report);
    if (fetched.ok) {
      pooled.push(...filtered);
      console.log(`[成功] ${source.source} (${source.id}) 讀取 ${items.length}，留下 ${filtered.length}，新 ${freshCount}`);
    } else {
      const blockedStatus = fetched.status === 401 || fetched.status === 403 || fetched.status === 429;
      console.error(`[${blockedStatus ? '封鎖' : '失敗'}] ${taipeiStamp()} ${source.source} (${source.id}) ${fetched.error} ${feedUrl} — 不換 User-Agent、不換 IP、不重試。`);
    }
  }

  const selected = selectByQuota(pooled, seenLinks, perSource).slice(0, total);
  for (const item of selected) {
    const report = feedReports.find((entry) => entry.id === item.feedId);
    if (report) report.selectedCount += 1;
  }

  const candidates = [];
  for (const item of selected) {
    const report = feedReports.find((entry) => entry.id === item.feedId);
    let articleUrl = item.link;
    try {
      articleUrl = stripTracking(item.link);
    } catch (err) {
      console.error(`[萃取失敗] ${item.source} ${item.link}：${err.message}`);
      continue;
    }
    let articleGate;
    try {
      articleGate = await gate(articleUrl, timeoutMs);
    } catch (err) {
      console.error(`[萃取失敗] ${item.source} ${articleUrl}：${err.message}`);
      continue;
    }
    if (articleGate.blocked) {
      if (report) report.robotsSkipped += 1;
      console.error(`[略過] ${taipeiStamp()} ${item.source} ${articleUrl}：${articleGate.reason}`);
      continue;
    }
    try {
      await pauseForCrawlDelay(articleUrl, Math.max(5, articleGate.crawlDelaySeconds));
      const extracted = await extractArticleText(articleUrl, { timeoutMs });
      const text = extracted.text || '';
      if (charLength(text) < MIN_ARTICLE_TEXT_CHARS) {
        throw new Error(`內文過短（${charLength(text)} 字，可能是動態渲染或萃取失敗）`);
      }
      candidates.push({
        id: articleIdFromLink(item.link),
        url: articleUrl,
        link: articleUrl,
        source: item.source,
        feedId: item.feedId,
        title: extracted.title || item.title,
        publishedAt: item.publishedAt,
        text,
      });
      if (report) report.extractedCount += 1;
      console.log(`[萃取] ${item.source} ${extracted.title || item.title}`);
    } catch (err) {
      console.error(`[萃取失敗] ${item.source} ${item.link}：${err.message}`);
    }
  }

  for (const report of feedReports) {
    if (report.status !== 'ok') continue;
    console.log(
      `[選取] ${report.source} (${report.id}) 新 ${report.newCount}，選取 ${report.selectedCount}，萃取 ${report.extractedCount}，robots 略過 ${report.robotsSkipped}`,
    );
  }

  const summary = feedFailureSummary(feedReports);
  const output = {
    fetchedAt: new Date().toISOString(),
    perSourceQuota: perSource,
    totalQuota: total,
    notes: '改寫時用 publishedAt 把「今日」「昨日」換成絕對日期。同一事件才填 same_as；不確定就用 unsure，不要併。此檔含原文，不要提交。',
    feeds: feedReports,
    existingEvents: events
      .map((event) => ({
        id: event.id,
        summary: event.summary,
        publishedAt: event.publishedAt,
        articleCount: (event.articleIds || []).length,
        uncertain: Boolean(event.uncertain),
        representativeArticleId: event.representativeArticleId,
      }))
      .sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0)),
    candidates,
  };
  writeJson(outFile, output);

  let code = 0;
  if (summary.allFailed) {
    console.error(summary.blockedCount > 0 && summary.failedCount === 0
      ? '所有啟用的來源都被 robots.txt 擋下。'
      : '所有啟用的來源都抓取失敗。');
    code = 1;
  } else if (summary.failedCount > 0 || summary.blockedCount > 0) {
    const parts = [];
    if (summary.failedCount > 0) parts.push(`${summary.failedCount} 個來源失敗`);
    if (summary.blockedCount > 0) parts.push(`${summary.blockedCount} 個來源被 robots.txt 擋下`);
    console.error(`警告：${parts.join('，')}，已用其餘來源繼續。`);
  }
  if (selected.length > 0 && candidates.length === 0) {
    console.error('有新文章但全部萃取失敗。');
    code = 1;
  }
  console.log(`候選 ${candidates.length} 篇，已寫入 ${outFile}`);
  return code;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
