import fs from 'fs';
import path from 'path';
import { flag, parseArgs } from './lib/args.js';
import { ingestBatch, rebuildDerived } from './lib/ingest.js';
import { readJson, writeJson } from './lib/jsonio.js';
import { loadRubric } from './lib/rubric.js';

const USAGE = `用法：npm run ingest -- --candidates <候選.json> --rewrites <改寫.json> [選項]
      npm run ingest -- --rebuild [--purge-examples]

驗證改寫、併入 data/articles.json，並重算 events、home、home-more、文章全文、source_stats、criteria。
有任何一篇非範例文章時，會移除 isExample 文章。--purge-examples 會一律移除範例。

選項：
  --candidates <檔案>   fetch 產出的本地候選檔（含全文，不會被寫進 data/）
  --rewrites <檔案>     助手寫的改寫結果
  --rebuild             不讀改寫檔，只依現有文章重算衍生資料
  --purge-examples      移除範例文章
  --data-dir <目錄>     預設 data
  --rubric <檔案>       預設 rubric-spec.md
  --help
`;

function writeEventFiles(dataDir, eventFiles) {
  const dir = path.join(dataDir, 'international', 'events');
  const files = Array.isArray(eventFiles) ? eventFiles : [];
  const keep = new Set(files.map((event) => `${event.id}.json`));
  if (!fs.existsSync(dir)) {
    if (keep.size === 0) return;
    fs.mkdirSync(dir, { recursive: true });
  }
  for (const event of files) {
    writeJson(path.join(dir, `${event.id}.json`), event);
  }
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || keep.has(name)) continue;
    fs.unlinkSync(path.join(dir, name));
  }
}

function candidateList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.candidates)) return raw.candidates;
  throw new Error('候選檔必須是陣列，或是 { "candidates": [...] }');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (flag(args.help)) {
    console.log(USAGE);
    return 0;
  }

  const dataDir = path.resolve(args['data-dir'] || 'data');
  const rubric = loadRubric(args.rubric);
  const articles = readJson(path.join(dataDir, 'articles.json'));
  const events = readJson(path.join(dataDir, 'events.json'));
  const purgeExamples = flag(args['purge-examples']);
  const rebuild = flag(args.rebuild);
  const hasRewrites = Boolean(args.rewrites || args.candidates);

  let result;
  if (hasRewrites) {
    if (!args.candidates || !args.rewrites) {
      throw new Error('合併改寫時，--candidates 和 --rewrites 都要提供。\n' + USAGE);
    }
    result = ingestBatch({
      articles,
      events,
      candidates: candidateList(readJson(path.resolve(args.candidates))),
      rewrites: readJson(path.resolve(args.rewrites)),
      rubric,
      purgeExamples,
    });
  } else if (rebuild || purgeExamples) {
    result = rebuildDerived({ articles, events, rubric, purgeExamples });
  } else {
    console.error(USAGE);
    return 1;
  }

  writeJson(path.join(dataDir, 'articles.json'), result.articles);
  writeJson(path.join(dataDir, 'events.json'), result.events);
  writeJson(path.join(dataDir, 'home.json'), result.home);
  writeJson(path.join(dataDir, 'home-more.json'), result.homeMore);
  writeJson(path.join(dataDir, 'international.json'), result.international);
  writeJson(path.join(dataDir, 'source_stats.json'), result.stats);
  writeJson(path.join(dataDir, 'criteria.json'), result.criteria);
  writeEventFiles(dataDir, result.eventFiles);

  console.log(
    `新增 ${result.addedCount} 篇，文章共 ${result.articles.length} 篇，事件 ${result.events.length} 則，首頁 ${result.home.events.length} 則`,
  );
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
