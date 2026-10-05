import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { indexFromDirectory, mergeIndex } from './tech/archive.js';
import { buildIssue } from './tech/issue.js';
import { limitsFromConfig, productHuntIncluded } from './tech/limits.js';

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
  const sectionsPath = path.resolve(root, arg('--sections', 'data/sections.json'));
  const sections = readJson(sectionsPath);
  const perSourceLimits = limitsFromConfig(sections.techSources, {
    withProductHunt: productHuntIncluded(candidates.producthunt),
  });
  fs.mkdirSync(issuesDir, { recursive: true });
  const existingIndex = mergeIndex(issuesDir);
  const { issue } = buildIssue({
    candidates,
    summaries,
    existingIndex,
    allowPlaceholders,
    perSourceLimits,
  });
  const issuePath = path.join(issuesDir, `${issue.date}.json`);
  fs.writeFileSync(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
  const index = indexFromDirectory(issuesDir);
  const indexPath = path.join(issuesDir, 'index.json');
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
