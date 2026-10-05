import { issueInstant, parseIssueDate } from './archive.js';
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
    votesCount: item.votesCount ?? null,
    dailyRank: item.dailyRank ?? null,
    links: Array.isArray(item.links) ? item.links : [],
    placeholder: item.placeholder === true,
    diagram: presentDiagram(item.diagram),
    anchor: storyAnchor(item.id),
  };
}

function storyAnchor(id) {
  const slug = String(id ?? '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `story-${slug || 'item'}`;
}

function presentDiagram(diagram) {
  if (!diagram || typeof diagram !== 'object') return null;
  const src = String(diagram.src || '');
  const alt = String(diagram.alt || '');
  const caption = String(diagram.caption || '');
  if (!src || !alt || !caption) return null;
  return { src, alt, caption };
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
    humor: failed ? [] : presentHumor(issue?.humor, items),
    moreItems: [],
    moreLabel: '',
  };
}

function presentHumor(humor, items) {
  if (!Array.isArray(humor)) return [];
  const byId = new Map(items.map((item) => [String(item.id), item]));
  return humor.slice(0, 2).flatMap((panel) => {
    const related = byId.get(String(panel?.relatedItemId));
    const src = String(panel?.src || '');
    const alt = String(panel?.alt || '');
    const caption = String(panel?.caption || '');
    if (!related || !src || !alt || !caption) return [];
    return [{
      src,
      alt,
      caption,
      relatedAnchor: related.anchor,
      relatedTitle: related.titleZh || related.name || related.title || '相關新聞',
    }];
  });
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
  const issuedOn = parseIssueDate(issue?.date);
  return {
    siteName: config?.siteName || '正常新聞',
    dateline: formatDateline(issuedOn ? issueInstant(issuedOn) : now, Number.isInteger(issue?.issueNumber) ? issue.issueNumber : null),
    sections,
  };
}
