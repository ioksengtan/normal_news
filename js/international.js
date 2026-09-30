import { headlineAndSummary } from './html.js';

function maxIso(values) {
  let best = null;
  let bestMs = -Infinity;
  for (const value of values) {
    const time = Date.parse(value);
    if (Number.isNaN(time) || time < bestMs) continue;
    bestMs = time;
    best = value;
  }
  return best;
}

export function normalizeEvents(data) {
  const list = Array.isArray(data) ? data : (data?.events || []);
  return list.map((event) => {
    if (!event || event.id == null) return null;
    const sources = (event.sources || []).map((source) => ({
      name: source.name || source.source || '來源',
      url: source.url || source.link || '',
      publishedAt: source.publishedAt || source.at || null,
    }));
    const reports = sources
      .filter((source) => source.publishedAt && !Number.isNaN(Date.parse(source.publishedAt)))
      .map((source) => ({ source: source.name, at: source.publishedAt }));
    const neutralText = String(event.neutralText || '').trim();
    const head = headlineAndSummary(neutralText, event.title || event.neutralTitle);
    const title = String(event.title || head.title || '').trim();
    if (!title) return null;
    return {
      id: String(event.id),
      title,
      summary: String(event.summary || head.summary || '').trim(),
      neutralText,
      neutralTitle: title,
      updatedAt: event.updatedAt || maxIso(reports.map((report) => report.at)),
      sources,
      reports,
    };
  }).filter(Boolean);
}

export function presentEvent(event) {
  return {
    id: event.id,
    title: event.title,
    summary: event.summary,
    sources: event.sources,
    updatedAt: event.updatedAt,
  };
}
