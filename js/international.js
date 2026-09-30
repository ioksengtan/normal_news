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
    const sources = (event.sources || []).map((source) => {
      const mapped = {
        name: source.name || source.source || '來源',
        url: source.url || source.link || '',
        publishedAt: source.publishedAt || source.at || null,
      };
      if (source.license) mapped.license = source.license;
      return mapped;
    });
    const reports = sources
      .filter((source) => source.publishedAt && !Number.isNaN(Date.parse(source.publishedAt)))
      .map((source) => ({ source: source.name, at: source.publishedAt }));
    const neutralTitle = String(event.neutralTitle || event.title || '').trim();
    const neutralSummary = String(event.neutralSummary || event.summary || event.neutralText || '').trim();
    const head = headlineAndSummary(neutralSummary, neutralTitle);
    const title = neutralTitle || head.title;
    if (!title) return null;
    return {
      id: String(event.id),
      title,
      summary: neutralSummary || head.summary,
      neutralText: neutralSummary,
      neutralTitle: title,
      sourceLanguage: event.sourceLanguage || '',
      articleType: event.articleType || '',
      balanceNotes: Array.isArray(event.balanceNotes) ? event.balanceNotes : [],
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
    sourceLanguage: event.sourceLanguage || '',
    articleType: event.articleType || '',
    balanceNotes: event.balanceNotes || [],
  };
}
