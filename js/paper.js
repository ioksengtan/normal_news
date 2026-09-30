import { normalizeEvents, presentEvent } from './international.js';
import { formatDateline, formatHM, publicationStart } from './time.js';

function timeOf(event) {
  const time = Date.parse(event?.updatedAt || '');
  return Number.isNaN(time) ? 0 : time;
}

function byUpdatedDesc(a, b) {
  return timeOf(b) - timeOf(a);
}

function sourcesBetween(event, startMs, endMs) {
  const names = new Set();
  for (const report of event.reports || []) {
    const time = Date.parse(report.at);
    if (Number.isNaN(time) || time < startMs || time > endMs) continue;
    names.add(report.source);
  }
  return names.size;
}

function clipEvent(event, asOfMs) {
  const reports = (event.reports || []).filter((report) => {
    const time = Date.parse(report.at);
    return !Number.isNaN(time) && time <= asOfMs;
  });
  if (reports.length === 0) return null;
  let updatedAt = reports[0].at;
  let updatedMs = Date.parse(updatedAt);
  for (const report of reports) {
    const time = Date.parse(report.at);
    if (time >= updatedMs) {
      updatedMs = time;
      updatedAt = report.at;
    }
  }
  return { ...event, reports, updatedAt };
}

function hasReportSince(event, startMs) {
  return (event.reports || []).some((report) => {
    const time = Date.parse(report.at);
    return !Number.isNaN(time) && time >= startMs;
  });
}

export function selectByCoverage(events, now, limit = 12, depth = 0) {
  const startMs = publicationStart(now).getTime();
  let printed = new Set();
  if (depth < 14 && events.length > 0) {
    const asOf = startMs - 1;
    const historical = events.map((event) => clipEvent(event, asOf)).filter(Boolean);
    if (historical.length > 0) {
      printed = new Set(selectByCoverage(historical, new Date(asOf), limit, depth + 1).map((event) => event.id));
    }
  }
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  return events
    .filter((event) => !(printed.has(event.id) && !hasReportSince(event, startMs)))
    .map((event) => ({ event, count: sourcesBetween(event, dayAgo, now.getTime()) }))
    .filter((entry) => entry.count >= 1)
    .sort((a, b) => b.count - a.count || byUpdatedDesc(a.event, b.event))
    .slice(0, limit)
    .map((entry) => entry.event);
}

function domId(id, index) {
  return /^[A-Za-z0-9_-]+$/.test(String(id || '')) ? String(id) : `s${index}`;
}

function articleSection(section, items) {
  return {
    id: section.id,
    domId: section.domId,
    name: section.name,
    navLabel: section.navLabel || section.name,
    columns: section.columns === 2 ? 2 : 3,
    lead: Boolean(section.lead) && items.length > 0,
    presentation: 'article',
    emptyText: items.length ? '' : (section.emptyText || ''),
    fallbackNote: '',
    notice: '',
    items,
    moreItems: [],
    moreLabel: '',
  };
}

function presentTech(item) {
  return {
    id: item.id,
    name: item.name || '',
    title: item.title || item.name || '',
    titleZh: item.titleZh || '',
    summary: item.summary || '',
    url: item.url || '',
    hnUrl: item.hnUrl || '',
    language: item.language || '',
    starsToday: item.starsToday ?? null,
    stars: item.stars ?? null,
    score: item.score ?? 0,
    comments: item.comments ?? 0,
    links: Array.isArray(item.links) ? item.links : [],
    placeholder: item.placeholder === true,
  };
}

function issueSection(section, issue) {
  const block = issue?.sections?.[section.id];
  const rawItems = Array.isArray(block?.items) ? block.items : [];
  const failed = !block || block.status === 'failed' || rawItems.length === 0;
  const items = failed ? [] : rawItems.map(presentTech);
  const placeholder = items.length > 0 && items.every((item) => item.placeholder);
  return {
    id: section.id,
    domId: section.domId,
    name: section.name,
    navLabel: section.navLabel || section.name,
    columns: section.columns === 2 ? 2 : 3,
    lead: Boolean(section.lead) && items.length > 0,
    presentation: section.presentation || 'generic',
    emptyText: failed ? (section.emptyText || '今日未能取得') : '',
    fallbackNote: !failed && block?.fallback ? (section.fallbackNote || '') : '',
    notice: placeholder ? '本版摘要尚未由內容長撰寫，以下為占位。' : '',
    items,
    moreItems: [],
    moreLabel: '',
  };
}

function inlineSection(section) {
  const items = (Array.isArray(section.items) ? section.items : []).map((item) => ({
    id: item.id || item.title || '',
    title: item.title || '',
    summary: item.summary || '',
    url: item.url || '',
    links: Array.isArray(item.links) ? item.links : [],
    sources: Array.isArray(item.sources) ? item.sources : [],
  }));
  return {
    id: section.id,
    domId: section.domId,
    name: section.name,
    navLabel: section.navLabel || section.name,
    columns: section.columns === 2 ? 2 : 3,
    lead: Boolean(section.lead) && items.length > 0,
    presentation: section.presentation || 'generic',
    emptyText: items.length ? '' : (section.emptyText || ''),
    fallbackNote: '',
    notice: '',
    items,
    moreItems: [],
    moreLabel: '',
  };
}

export function buildPaper({ config, international, issue, now = new Date() }) {
  const events = normalizeEvents(international);
  const sections = (config?.sections || []).map((section, index) => {
    const ready = { ...section, domId: domId(section.id, index) };
    if (Array.isArray(section.items) || section.source === 'inline') return inlineSection(ready);
    if (section.source === 'international') {
      const selected = selectByCoverage(events, now, section.dailyCount || 12).map(presentEvent);
      return articleSection(ready, selected);
    }
    if (section.source === 'issue') return issueSection(ready, issue);
    return inlineSection(ready);
  });
  const updated = Date.parse(international?.updatedAt || '');
  return {
    siteName: config?.siteName || '正常新聞',
    dateline: formatDateline(now, Number.isInteger(issue?.issueNumber) ? issue.issueNumber : null),
    frontUpdated: Number.isNaN(updated) ? '' : `國際版更新於 ${formatHM(new Date(updated))}`,
    sections,
  };
}
