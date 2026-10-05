import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  latestIssue,
  monthGrid,
  neighboringIssues,
  renderArchive,
  selectIssue,
  shiftMonth,
} from '../js/archive.js';
import { archiveProblems, PUBLISHED_FLOOR } from '../scripts/tech/archive.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const issues = [
  { date: '2026-09-30', issueNumber: 1, path: 'data/issues/2026-09-30.json' },
  { date: '2026-10-01', issueNumber: 2, path: 'data/issues/2026-10-01.json' },
  { date: '2026-10-02', issueNumber: 3, path: 'data/issues/2026-10-02.json' },
  { date: '2026-10-04', issueNumber: 5, path: 'data/issues/2026-10-04.json' },
];

test('the default issue is the latest, and a date query selects that day', () => {
  assert.equal(latestIssue(issues).date, '2026-10-04');
  assert.equal(selectIssue({ issues }).entry.date, '2026-10-04');
  assert.equal(selectIssue({ issues, requestedDate: '' }).missing, false);
  const picked = selectIssue({ issues, requestedDate: '2026-10-02' });
  assert.equal(picked.entry.issueNumber, 3);
  assert.equal(picked.missing, false);
  const missing = selectIssue({ issues, requestedDate: '2026-10-03' });
  assert.equal(missing.entry, null);
  assert.equal(missing.missing, true);
  assert.equal(selectIssue({ issues, requestedDate: '2026-02-31' }).entry.date, '2026-10-04');
  assert.deepEqual(neighboringIssues(issues, '2026-10-02'), {
    previous: issues[1],
    next: issues[3],
  });
  assert.equal(neighboringIssues(issues, '2026-10-04').next, null);
  assert.equal(neighboringIssues(issues, '2026-09-30').previous, null);
});

test('the month calendar starts on Sunday and marks days that have an issue', () => {
  const september = monthGrid(2026, 9);
  assert.equal(september[0], null);
  assert.equal(september[2].date, '2026-09-01');
  assert.equal(september.find((cell) => cell?.day === 30).date, '2026-09-30');
  assert.deepEqual(shiftMonth(2026, 9, -1), { year: 2026, month: 8 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });

  const html = renderArchive({ issues, selectedDate: '2026-10-02', year: 2026, month: 10 });
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="看往期"/);
  assert.match(html, /archive-panel" role="dialog" aria-label="往期月曆" hidden/);
  assert.match(html, /上一期/);
  const opened = renderArchive({ issues, selectedDate: '2026-10-02', year: 2026, month: 10, open: true });
  assert.match(opened, /aria-expanded="true"/);
  assert.equal(opened.includes('往期月曆" hidden'), false);
  assert.match(html, /2026 年 10 月/);
  assert.match(html, /<th scope="col">日<\/th>/);
  assert.match(html, /data-date="2026-10-02"[^>]*aria-current="date"/);
  assert.match(html, /data-date="2026-10-01"/);
  assert.match(html, /data-date="2026-10-04"/);
  assert.equal(html.includes('data-date="2026-10-03"'), false);
  assert.match(html, /上一期/);
  assert.match(html, /下一期/);
  assert.equal(html.includes('disabled>上一期'), false);
  assert.equal(html.includes('disabled>下一期'), false);

  const latest = renderArchive({ issues, selectedDate: '2026-10-04', year: 2026, month: 10 });
  assert.match(latest, /disabled>下一期/);
  const first = renderArchive({ issues, selectedDate: '2026-09-30', year: 2026, month: 9 });
  assert.match(first, /disabled>上一期/);
  assert.match(first, /data-date="2026-09-30"/);
});

test('2026-09-30 through 2026-10-04 stay archived with diagrams and humor', () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data/issues/index.json'), 'utf8'));
  assert.deepEqual(archiveProblems(path.join(root, 'data/issues')), []);
  for (const date of PUBLISHED_FLOOR) {
    const entry = index.issues.find((issue) => issue.date === date);
    assert.ok(entry, date);
    const issue = JSON.parse(fs.readFileSync(path.join(root, 'data/issues', `${date}.json`), 'utf8'));
    assert.equal(issue.date, date);
    assert.equal(issue.issueNumber, entry.issueNumber);
    assert.ok(issue.items.some((item) => item.diagram));
    for (const item of issue.items) {
      if (!item.diagram) continue;
      assert.equal(fs.existsSync(path.join(root, item.diagram.src)), true, item.diagram.src);
    }
    assert.ok(Array.isArray(issue.humor) && issue.humor.length > 0, date);
    for (const panel of issue.humor) {
      assert.equal(fs.existsSync(path.join(root, panel.src)), true, panel.src);
    }
  }
});

test('an issue file left off the index is still reported', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'normal-news-archive-'));
  try {
    fs.writeFileSync(path.join(directory, '2026-09-30.json'), JSON.stringify({
      date: '2026-09-30',
      issueNumber: 1,
    }));
    fs.writeFileSync(path.join(directory, 'index.json'), JSON.stringify({ issues: [] }));
    const problems = archiveProblems(directory, { requiredDates: ['2026-09-30'] });
    assert.ok(problems.some((problem) => problem.includes('2026-09-30')));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
