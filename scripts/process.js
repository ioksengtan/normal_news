import fs from 'fs';
import path from 'path';
import { fetchHeadlines } from './lib/rss.js';
import { extractArticleText } from './lib/extract.js';
import { neutralize } from './lib/claude.js';
import { loadRubric } from './lib/rubric.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const ARTICLES_PATH = path.join(DATA_DIR, 'articles.json');
const STATS_PATH = path.join(DATA_DIR, 'source_stats.json');
const CRITERIA_PATH = path.join(DATA_DIR, 'criteria.json');

const MAX_ARTICLES = 300; // 保留近期文章數量上限，避免 data/ 無限長大
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 8); // 每次排程最多處理幾篇（控制 API 成本與執行時間）

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function charLength(str) {
  return [...str].length;
}

function buildSourceStats(articles) {
  const bySource = new Map();

  for (const article of articles) {
    const key = article.source || '未知來源';
    if (!bySource.has(key)) {
      bySource.set(key, { source: key, articleCount: 0, totalBiasRatio: 0 });
    }
    const entry = bySource.get(key);
    entry.articleCount += 1;
    entry.totalBiasRatio += article.biasRatio;
  }

  return [...bySource.values()]
    .map((entry) => ({
      source: entry.source,
      articleCount: entry.articleCount,
      // 用「平均情緒密度」排序，不是篇數，避免發文量大的來源被誤判為最偏頗
      avgBiasRatio: Number((entry.totalBiasRatio / entry.articleCount).toFixed(3)),
    }))
    .sort((a, b) => b.avgBiasRatio - a.avgBiasRatio);
}

async function processOne(item, rubric) {
  const { title, text } = await extractArticleText(item.link);

  if (!text || text.length < 200) {
    throw new Error('內文過短，略過（可能是動態渲染頁面或萃取失敗）');
  }

  const result = await neutralize({
    systemPrompt: rubric.systemPrompt,
    title: title || item.title,
    text,
  });

  const originalLen = charLength(text);
  const removedLen = (result.removed_spans || []).reduce(
    (sum, span) => sum + charLength(span.original || ''),
    0
  );
  const biasRatio = originalLen > 0 ? Math.min(1, removedLen / originalLen) : 0;

  return {
    id: Buffer.from(item.link).toString('base64url').slice(0, 16),
    title: title || item.title,
    link: item.link,
    source: item.source,
    publishedAt: item.publishedAt,
    processedAt: new Date().toISOString(),
    neutralText: result.neutral_text,
    removedSpans: result.removed_spans || [],
    biasRatio: Number(biasRatio.toFixed(3)),
    rubricVersion: rubric.version,
  };
}

async function main() {
  const rubric = loadRubric();
  const existing = readJson(ARTICLES_PATH, []);
  const seenLinks = new Set(existing.map((a) => a.link));

  const headlines = await fetchHeadlines(10); // 每個 feed 最多取 10 篇
  const fresh = headlines.filter((h) => !seenLinks.has(h.link)).slice(0, MAX_PER_RUN);

  console.log(`RSS 共 ${headlines.length} 篇，其中 ${fresh.length} 篇是新文章`);

  const processed = [];
  for (const item of fresh) {
    try {
      const article = await processOne(item, rubric);
      processed.push(article);
      console.log(`已處理：${article.title}（情緒密度 ${(article.biasRatio * 100).toFixed(1)}%）`);
    } catch (err) {
      console.error(`略過 ${item.link}：${err.message}`);
    }
  }

  const merged = [...processed, ...existing].slice(0, MAX_ARTICLES);

  writeJson(ARTICLES_PATH, merged);
  writeJson(STATS_PATH, buildSourceStats(merged));
  writeJson(CRITERIA_PATH, {
    version: rubric.version,
    updatedAt: rubric.updatedAt,
    summary: rubric.humanSummary,
  });

  console.log(`本次新增 ${processed.length} 篇，資料庫共 ${merged.length} 篇文章`);
}

main().catch((err) => {
  console.error('執行失敗:', err);
  process.exit(1);
});
