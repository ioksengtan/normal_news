import path from 'path';
import { flag, parseArgs } from './lib/args.js';
import { validateStoredData } from './lib/ingest.js';
import { readJson } from './lib/jsonio.js';
import { publishDataFiles, readPublishFiles, resolveRepo, resolveToken } from './lib/publish.js';
import { loadRubric } from './lib/rubric.js';

const USAGE = `用法：npm run publish -- [選項]

用 GitHub API 把 data/ 的六個公開檔案做成 main 上的一個 commit。
Token 取自 GITHUB_TOKEN，否則取 \`gh auth token\`。不需要 git push。
失敗會以非 0 結束，不會吞掉 API 錯誤。

選項：
  --repo <owner/name>   預設讀 gh repo view 或 GITHUB_REPOSITORY
  --branch <分支>       預設 main
  --message <訊息>      預設 chore: 更新新聞處理資料
  --data-dir <目錄>     預設 data
  --dry-run             只讀遠端並報告會不會 commit，不建立 commit
  --help
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (flag(args.help)) {
    console.log(USAGE);
    return 0;
  }

  const dataDir = path.resolve(args['data-dir'] || 'data');
  const branch = args.branch || 'main';
  const message = args.message || 'chore: 更新新聞處理資料';
  const dryRun = flag(args['dry-run']);
  const rubric = loadRubric();
  const stored = {
    articles: readJson(path.join(dataDir, 'articles.json')),
    events: readJson(path.join(dataDir, 'events.json')),
    home: readJson(path.join(dataDir, 'home.json')),
    international: readJson(path.join(dataDir, 'international.json')),
    stats: readJson(path.join(dataDir, 'source_stats.json')),
    criteria: readJson(path.join(dataDir, 'criteria.json')),
    rubric,
  };
  validateStoredData(stored);

  const files = readPublishFiles(dataDir);
  const token = resolveToken();
  const repo = resolveRepo(args.repo);
  const result = await publishDataFiles({
    token,
    repo,
    branch,
    message,
    files,
    dryRun,
  });

  if (!result.changed) {
    console.log(`${dryRun ? 'dry-run：' : ''}資料與 ${repo}@${branch} 相同，沒有建立 commit。`);
    return 0;
  }
  if (dryRun) {
    console.log(`dry-run：將在 ${repo}@${branch} 建立 1 個 commit：${result.files.join('、')}`);
    return 0;
  }
  console.log(`已在 ${repo}@${branch} 建立 1 個 commit ${result.commitSha}：${result.files.join('、')}`);
  return 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
