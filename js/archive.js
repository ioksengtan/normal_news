import { escapeHtml } from './html.js';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function parseIssueDate(value) {
  const match = DATE_RE.exec(String(value || ''));
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return '';
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function sortIssues(issues) {
  return (Array.isArray(issues) ? issues : [])
    .filter((entry) => entry && parseIssueDate(entry.date))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function latestIssue(issues) {
  return sortIssues(issues).at(-1) || null;
}

export function selectIssue({ issues, requestedDate = '' } = {}) {
  const list = sortIssues(issues);
  const requested = parseIssueDate(requestedDate);
  if (requested) {
    const entry = list.find((issue) => issue.date === requested) || null;
    return { entry, requested, missing: !entry };
  }
  return { entry: list.at(-1) || null, requested: '', missing: false };
}

export function neighboringIssues(issues, date) {
  const list = sortIssues(issues);
  const index = list.findIndex((issue) => issue.date === date);
  if (index < 0) return { previous: null, next: null };
  return {
    previous: index > 0 ? list[index - 1] : null,
    next: index < list.length - 1 ? list[index + 1] : null,
  };
}

export function issueInstant(date) {
  return new Date(`${parseIssueDate(date)}T12:00:00+08:00`);
}

export function monthOf(date) {
  const parsed = parseIssueDate(date);
  const [year, month] = parsed.split('-').map(Number);
  return { year, month };
}

export function shiftMonth(year, month, delta) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let index = 0; index < first.getUTCDay(); index += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) {
    const isoMonth = String(month).padStart(2, '0');
    const isoDay = String(day).padStart(2, '0');
    cells.push({ date: `${year}-${isoMonth}-${isoDay}`, day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function rowsOf(cells) {
  const rows = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));
  return rows;
}

export function renderArchive({ issues, selectedDate = '', year, month }) {
  const list = sortIssues(issues);
  const byDate = new Map(list.map((entry) => [entry.date, entry]));
  const selected = parseIssueDate(selectedDate);
  const { previous, next } = neighboringIssues(list, selected);
  const label = `${year} 年 ${month} 月`;
  const head = WEEKDAYS.map((day) => `<th scope="col">${day}</th>`).join('');
  const body = rowsOf(monthGrid(year, month)).map((row) => {
    const cells = row.map((cell) => {
      if (!cell) return '<td class="archive-empty"></td>';
      const entry = byDate.get(cell.date);
      if (!entry) return `<td><span class="archive-day">${cell.day}</span></td>`;
      const current = cell.date === selected ? ' is-selected' : '';
      const pressed = cell.date === selected ? ' aria-current="date"' : '';
      const name = `${cell.date}，第 ${entry.issueNumber} 期`;
      return `<td><button type="button" class="archive-day has-issue${current}" data-date="${escapeHtml(cell.date)}" aria-label="${escapeHtml(name)}"${pressed}>${cell.day}</button></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  const previousButton = previous
    ? `<button type="button" class="archive-jump" data-date="${escapeHtml(previous.date)}">上一期</button>`
    : '<button type="button" class="archive-jump" disabled>上一期</button>';
  const nextButton = next
    ? `<button type="button" class="archive-jump" data-date="${escapeHtml(next.date)}">下一期</button>`
    : '<button type="button" class="archive-jump" disabled>下一期</button>';
  return `<div class="archive-month">
    <button type="button" class="archive-shift" data-shift="-1" aria-label="上個月">‹</button>
    <span class="archive-label">${label}</span>
    <button type="button" class="archive-shift" data-shift="1" aria-label="下個月">›</button>
  </div>
  <table class="archive-cal">
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="archive-jumps">${previousButton}${nextButton}</div>`;
}
