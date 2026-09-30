import { formatDateline } from './time.js';

function domId(id, index) {
  return /^[A-Za-z0-9_-]+$/.test(String(id || '')) ? String(id) : `s${index}`;
}

function presentTech(item) {
  return {
    id: item.id,
    source: item.source || '',
    sourceLabel: item.sourceLabel || '',
    rank: item.rank ?? 0,
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

function techSection(section, issue) {
  const rawItems = Array.isArray(issue?.items) ? issue.items : [];
  const items = rawItems.map(presentTech);
  const failed = !issue || items.length === 0;
  const placeholder = items.length > 0 && items.every((item) => item.placeholder);
  const githubFallback = issue?.sources?.github?.fallback === true;
  return {
    id: section.id,
    domId: section.domId,
    name: section.name,
    navLabel: section.navLabel || section.name,
    columns: section.columns === 3 ? 3 : 2,
    lead: Boolean(section.lead) && items.length > 0,
    presentation: 'tech',
    emptyText: failed ? (section.emptyText || '今日未能取得') : '',
    fallbackNote: githubFallback ? (section.fallbackNote || '') : '',
    notice: placeholder ? '本版摘要尚未由內容長撰寫，以下為占位。' : '',
    items: failed ? [] : items,
    moreItems: [],
    moreLabel: '',
  };
}

function inlineSection(section) {
  const items = (Array.isArray(section.items) ? section.items : []).map((item) => ({
    id: item.id || item.title || '',
    source: item.source || '',
    sourceLabel: item.sourceLabel || '',
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

export function buildPaper({ config, issue, now = new Date() }) {
  const sections = (config?.sections || []).map((section, index) => {
    const ready = { ...section, domId: domId(section.id, index) };
    if (Array.isArray(section.items) || section.source === 'inline') return inlineSection(ready);
    if (section.source === 'issue' || section.presentation === 'tech') return techSection(ready, issue);
    return inlineSection(ready);
  });
  return {
    siteName: config?.siteName || '正常新聞',
    dateline: formatDateline(now, Number.isInteger(issue?.issueNumber) ? issue.issueNumber : null),
    sections,
  };
}
