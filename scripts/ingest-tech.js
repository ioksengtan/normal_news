import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { buildIssue } from './tech/issue.js';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const root = process.cwd();
  const candidatesPath = path.resolve(root, arg('--candidates', 'data/tech/candidates.json'));
  const summariesPath = path.resolve(root, arg('--summaries', 'data/tech/summaries.json'));
  const issuesDir = path.resolve(root, arg('--issues-dir', 'data/issues'));
  const allowPlaceholders = process.argv.includes('--allow-placeholders');
  const candidates = readJson(candidatesPath);
  const summaries = readJson(summariesPath);
  const indexPath = path.join(issuesDir, 'index.json');
  const existingIndex = fs.existsSync(indexPath) ? readJson(indexPath) : { issues: [] };
  const { issue, index } = buildIssue({ candidates, summaries, existingIndex, allowPlaceholders });
  fs.mkdirSync(issuesDir, { recursive: true });
  const issuePath = path.join(issuesDir, `${issue.date}.json`);
  fs.writeFileSync(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`已寫入 ${path.relative(root, issuePath)}（第 ${issue.issueNumber} 期）`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
