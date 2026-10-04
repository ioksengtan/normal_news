import fs from 'fs';
import path from 'path';
import { parseArgs } from './lib/args.js';
import { readJson } from './lib/jsonio.js';
import { archiveProblems } from './tech/archive.js';
import { TECH_SOURCES } from './tech/combine.js';
import { diagramProblems, humorProblems } from './lib/svg.js';

const USAGE = `用法：npm run validate-data -- [--data-dir data]

檢查已提交的科技版：一期一份合併清單，每則有來源標籤與中文摘要。
`;

const ALLOWED = new Set(TECH_SOURCES.map((source) => source.id));
const FORBIDDEN_KEYS = ['text', 'originalTitle', 'removedSpans', 'biasRatio', 'neutralText'];
const REMOVED_FILES = [
  'international.json',
  'articles.json',
  'events.json',
  'home.json',
  'criteria.json',
  'source_stats.json',
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const dataDir = path.resolve(args['data-dir'] || 'data');
  const problems = [];
  const config = readJson(path.join(dataDir, 'sections.json'));
  const sectionIds = (config.sections || []).map((section) => section.id);
  if (sectionIds.includes('international')) problems.push('sections.json 仍有國際版');
  if (!sectionIds.includes('tech')) problems.push('sections.json 缺少合併後的科技版');
  if ((config.sections || []).some((section) => section.id !== 'tech' && section.source === 'issue')) {
    problems.push('科技內容仍拆成多個來源版');
  }
  for (const source of config.techSources || []) {
    if (!ALLOWED.has(source.id)) problems.push(`techSources 含有未允許的來源 ${source.id}`);
  }
  for (const name of REMOVED_FILES) {
    if (fs.existsSync(path.join(dataDir, name))) problems.push(`仍有 ${name}`);
  }

  const issuesDir = path.join(dataDir, 'issues');
  problems.push(...archiveProblems(issuesDir));
  const index = readJson(path.join(issuesDir, 'index.json'));
  if (!Array.isArray(index.issues)) problems.push('issues/index.json 必須包含 issues 陣列');
  let itemCount = 0;
  for (const entry of index.issues || []) {
    const issuePath = path.join(dataDir, 'issues', `${entry.date}.json`);
    if (!fs.existsSync(issuePath)) {
      problems.push(`找不到 ${entry.date} 的期次檔`);
      continue;
    }
    const issue = readJson(issuePath);
    if (issue.date !== entry.date) problems.push(`${entry.date} 的日期不一致`);
    if (!Array.isArray(issue.items)) {
      problems.push(`${entry.date} 缺少 items`);
      continue;
    }
    if (issue.sections) problems.push(`${entry.date} 仍按來源拆版`);
    if (issue.items[0] && issue.items[0].rank !== 0) problems.push(`${entry.date} 的頭條不是來源第一名`);
    for (const item of issue.items) {
      itemCount += 1;
      const label = `${entry.date} ${item.source || '?'} ${item.id || '?'}`;
      if (!ALLOWED.has(item.source)) problems.push(`${label} 的來源不在允許清單`);
      if (!item.sourceLabel) problems.push(`${label} 缺少來源標籤`);
      if (!item.summary) problems.push(`${label} 缺少摘要`);
      if (item.source === 'github' && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(item.url || '')) {
        problems.push(`${label} 的專案連結無效`);
      }
      if (item.source === 'hackernews') {
        if (!item.titleZh) problems.push(`${label} 缺少中文標題`);
        if (!/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/.test(item.hnUrl || '')) {
          problems.push(`${label} 的討論連結無效`);
        }
      }
      for (const key of FORBIDDEN_KEYS) {
        if (key in item) problems.push(`${label} 含有 ${key}`);
      }
      for (const problem of diagramProblems({
        diagram: item.diagram,
        date: issue.date,
        id: item.id,
        dataDir,
      })) {
        problems.push(`${label} ${problem}`);
      }
    }
    for (const problem of humorProblems({
      humor: issue.humor,
      date: issue.date,
      itemIds: issue.items.map((item) => item.id),
      dataDir,
    })) {
      problems.push(`${issue.date} ${problem}`);
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`資料檢查通過。科技版 ${index.issues.length} 期、${itemCount} 則。`);
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
