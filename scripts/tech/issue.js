import { TECH_SOURCES, interleaveByRank } from './combine.js';

const PLACEHOLDER_RE = /【(?:占位摘要|待譯)/u;

function hanCount(value) {
  return (String(value || '').match(/\p{Script=Han}/gu) || []).length;
}

function lookup(table, id) {
  if (!table) return undefined;
  if (Array.isArray(table)) return table.find((entry) => String(entry.id) === String(id));
  return table[id] ?? table[String(id)];
}

function summaryText(entry) {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry.summary === 'string') return entry.summary.trim();
  return '';
}

function fail(errors) {
  const error = new Error(errors.join('\n'));
  error.errors = errors;
  throw error;
}

export function buildIssue({ candidates, summaries, existingIndex = { issues: [] }, allowPlaceholders = false }) {
  const errors = [];
  if (!candidates?.date || !/^\d{4}-\d{2}-\d{2}$/.test(candidates.date)) {
    errors.push('候選檔缺少日期');
  }
  if (!summaries || summaries.date !== candidates?.date) {
    errors.push(`摘要檔日期必須是 ${candidates?.date || '（候選檔沒有日期）'}`);
  }
  if (errors.length) fail(errors);

  const blocks = TECH_SOURCES.map((source) => {
    const built = publicSection(source.id, candidates[source.id], summaries[source.id], {
      allowPlaceholders,
      errors,
      toPublic: source.id === 'hackernews' ? toHackerNews : toGithub,
    });
    return { source, built };
  });

  if (errors.length) fail(errors);

  const items = interleaveByRank(blocks.map(({ source, built }) => ({
    id: source.id,
    label: source.label,
    items: built.items,
  })));
  const sources = {};
  for (const { source, built } of blocks) {
    sources[source.id] = {
      status: built.status,
      fallback: built.fallback,
      error: built.error,
    };
  }

  const issueNumber = nextIssueNumber(existingIndex, candidates.date);
  const issue = {
    date: candidates.date,
    issueNumber,
    timezone: 'Asia/Taipei',
    publishedAt: `${candidates.date}T07:00:00+08:00`,
    fetchedAt: candidates.fetchedAt || null,
    sources,
    items,
  };
  const issues = (existingIndex.issues || []).filter((entry) => entry.date !== candidates.date);
  issues.push({
    date: candidates.date,
    issueNumber,
    path: `data/issues/${candidates.date}.json`,
  });
  issues.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { issue, index: { issues } };
}

function toGithub(item, entry, errors, allowPlaceholders) {
  const summary = summaryText(entry);
  validateSummary(summary, item.description, `GitHub ${item.id}`, errors, allowPlaceholders);
  return {
    id: item.id,
    name: item.name,
    url: item.url,
    language: item.language || null,
    starsToday: item.starsToday ?? null,
    stars: item.stars ?? null,
    summary,
    placeholder: PLACEHOLDER_RE.test(summary),
  };
}

function toHackerNews(item, entry, errors, allowPlaceholders) {
  const summary = summaryText(entry);
  const titleZh = entry && typeof entry === 'object' ? String(entry.titleZh || '').trim() : '';
  validateSummary(summary, item.title, `Hacker News ${item.id}`, errors, allowPlaceholders);
  if (!titleZh) errors.push(`Hacker News ${item.id} 缺少中文標題`);
  else if (titleZh === item.title) errors.push(`Hacker News ${item.id} 的中文標題不能照抄原文`);
  else if (hanCount(titleZh) < 1) errors.push(`Hacker News ${item.id} 的中文標題需要中文`);
  if (!allowPlaceholders && PLACEHOLDER_RE.test(titleZh)) {
    errors.push(`Hacker News ${item.id} 的標題仍是占位`);
  }
  if (item.url && !/^https?:\/\//.test(item.url)) errors.push(`Hacker News ${item.id} 的原文連結無效`);
  if (!/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/.test(item.hnUrl || '')) {
    errors.push(`Hacker News ${item.id} 的討論連結無效`);
  }
  return {
    id: item.id,
    title: item.title,
    titleZh,
    url: item.url || null,
    hnUrl: item.hnUrl,
    score: item.score ?? 0,
    comments: item.comments ?? 0,
    summary,
    placeholder: PLACEHOLDER_RE.test(summary) || PLACEHOLDER_RE.test(titleZh),
  };
}

function publicSection(name, block, summaryTable, { toPublic, errors, allowPlaceholders }) {
  if (!block || (block.status !== 'ok' && block.status !== 'failed')) {
    errors.push(`${name} 候選資料缺少 status`);
    return { status: 'failed', fallback: false, error: '候選資料不完整', items: [] };
  }
  if (block.status === 'failed') {
    return {
      status: 'failed',
      fallback: Boolean(block.fallback),
      error: block.error || '今日未能取得',
      items: [],
    };
  }
  const items = [];
  const seen = new Set();
  for (const item of block.items || []) {
    const entry = lookup(summaryTable, item.id);
    if (entry == null) {
      errors.push(`${name} ${item.id} 沒有摘要`);
      continue;
    }
    seen.add(String(item.id));
    if (name === 'github' && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(item.url || '')) {
      errors.push(`GitHub ${item.id} 的專案連結無效`);
    }
    items.push(toPublic(item, entry, errors, allowPlaceholders));
  }
  const extra = summaryKeys(summaryTable).filter((id) => !seen.has(String(id)));
  for (const id of extra) errors.push(`${name} 摘要多了候選檔沒有的項目 ${id}`);
  return {
    status: 'ok',
    fallback: Boolean(block.fallback),
    error: null,
    items,
  };
}

function summaryKeys(table) {
  if (!table) return [];
  if (Array.isArray(table)) return table.map((entry) => entry.id);
  return Object.keys(table);
}

function validateSummary(summary, original, label, errors, allowPlaceholders) {
  if (!summary) {
    errors.push(`${label} 的摘要是空的`);
    return;
  }
  if (hanCount(summary) < 8) errors.push(`${label} 的摘要太短`);
  if (original && summary === String(original).trim()) errors.push(`${label} 的摘要不能照抄原文`);
  if (!allowPlaceholders && PLACEHOLDER_RE.test(summary)) errors.push(`${label} 的摘要仍是占位`);
}

function nextIssueNumber(index, date) {
  const existing = (index.issues || []).find((issue) => issue.date === date);
  if (existing?.issueNumber) return existing.issueNumber;
  const max = (index.issues || []).reduce((highest, issue) => Math.max(highest, issue.issueNumber || 0), 0);
  return max + 1;
}
