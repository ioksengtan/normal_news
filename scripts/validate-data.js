import fs from 'fs';
import path from 'path';
import { parseArgs } from './lib/args.js';
import { HOME_MAX_BYTES } from './lib/constants.js';
import { validateStoredData } from './lib/ingest.js';
import { readJson } from './lib/jsonio.js';
import { loadRubric } from './lib/rubric.js';

const USAGE = `用法：npm run validate-data -- [--data-dir data] [--rubric rubric-spec.md]

檢查已提交的公開資料：中性標題與摘要、事件參照、
首頁與文章全文拆檔、準則頁沒有漏出系統提示詞。
來源統計留在 source_stats.json，網站不顯示。
`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const dataDir = path.resolve(args['data-dir'] || 'data');
  const rubric = loadRubric(args.rubric);
  const homePath = path.join(dataDir, 'home.json');
  const homeBytesOnDisk = fs.statSync(homePath).size;
  if (homeBytesOnDisk > HOME_MAX_BYTES) {
    throw new Error(`home.json 檔案大小 ${homeBytesOnDisk} bytes，超過 ${HOME_MAX_BYTES}`);
  }
  const eventsDir = path.join(dataDir, 'international', 'events');
  const eventFiles = fs.existsSync(eventsDir)
    ? fs.readdirSync(eventsDir)
      .filter((name) => /^evt_[A-Za-z0-9_-]+\.json$/.test(name))
      .sort()
      .map((name) => readJson(path.join(eventsDir, name)))
    : [];
  const stored = {
    articles: readJson(path.join(dataDir, 'articles.json')),
    events: readJson(path.join(dataDir, 'events.json')),
    home: readJson(homePath),
    homeMore: readJson(path.join(dataDir, 'home-more.json')),
    international: readJson(path.join(dataDir, 'international.json')),
    eventFiles,
    stats: readJson(path.join(dataDir, 'source_stats.json')),
    criteria: readJson(path.join(dataDir, 'criteria.json')),
    rubric,
  };
  const { homeBytes } = validateStoredData(stored);
  console.log(
    `資料檢查通過。文章 ${stored.articles.length} 篇，事件 ${stored.events.length} 則，首頁 ${stored.home.events.length} 則、${homeBytes} bytes。`,
  );
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
