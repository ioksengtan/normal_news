import fs from 'fs';
import path from 'path';

const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export const PUBLISHED_FLOOR = [
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
];

function readIssueFile(file, date) {
  const issue = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (issue.date !== date) throw new Error(`${date} 的日期與檔名不一致`);
  if (!Number.isInteger(issue.issueNumber)) throw new Error(`${date} 缺少刊號`);
  return {
    date,
    issueNumber: issue.issueNumber,
    path: `data/issues/${date}.json`,
  };
}

export function indexFromDirectory(issuesDir) {
  const names = fs.existsSync(issuesDir)
    ? fs.readdirSync(issuesDir).filter((name) => FILE_RE.test(name)).sort()
    : [];
  const issues = names.map((name) => readIssueFile(path.join(issuesDir, name), name.slice(0, 10)));
  return { issues };
}

export function mergeIndex(issuesDir) {
  const onDisk = indexFromDirectory(issuesDir);
  const indexPath = path.join(issuesDir, 'index.json');
  let listed = [];
  if (fs.existsSync(indexPath)) {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    listed = Array.isArray(parsed.issues) ? parsed.issues : [];
  }
  const byDate = new Map();
  for (const entry of listed) {
    if (entry?.date) byDate.set(entry.date, entry);
  }
  for (const entry of onDisk.issues) byDate.set(entry.date, entry);
  const issues = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { issues };
}

export function archiveProblems(issuesDir, { requiredDates = PUBLISHED_FLOOR } = {}) {
  const problems = [];
  const indexPath = path.join(issuesDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    problems.push('找不到 issues/index.json');
    return problems;
  }
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    problems.push('issues/index.json 不是合法的 JSON');
    return problems;
  }
  if (!Array.isArray(index.issues)) {
    problems.push('issues/index.json 必須包含 issues 陣列');
    return problems;
  }
  const dates = index.issues.map((entry) => entry?.date);
  const sorted = [...dates].filter(Boolean).sort();
  if (dates.join('\0') !== sorted.join('\0')) problems.push('index 必須依日期由舊到新排列');
  if (new Set(dates).size !== dates.length) problems.push('index 的日期重複');
  const onDisk = fs.existsSync(issuesDir)
    ? fs.readdirSync(issuesDir).filter((name) => FILE_RE.test(name)).map((name) => name.slice(0, 10))
    : [];
  for (const entry of index.issues) {
    if (!FILE_RE.test(`${entry?.date}.json`)) {
      problems.push('index 含有無效日期');
      continue;
    }
    const file = path.join(issuesDir, `${entry.date}.json`);
    if (!fs.existsSync(file)) {
      problems.push(`找不到 ${entry.date} 的期次檔`);
      continue;
    }
    if (entry.path !== `data/issues/${entry.date}.json`) {
      problems.push(`${entry.date} 的路徑應為 data/issues/${entry.date}.json`);
    }
    let issue;
    try {
      issue = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      problems.push(`${entry.date} 的期次檔不是合法的 JSON`);
      continue;
    }
    if (issue.date !== entry.date) problems.push(`${entry.date} 的日期不一致`);
    if (issue.issueNumber !== entry.issueNumber) problems.push(`${entry.date} 的刊號不一致`);
  }
  for (const date of onDisk) {
    if (!dates.includes(date)) problems.push(`${date} 的期次檔沒有列入 index`);
  }
  for (const date of requiredDates) {
    if (!dates.includes(date)) problems.push(`過刊缺少 ${date}`);
  }
  return problems;
}
