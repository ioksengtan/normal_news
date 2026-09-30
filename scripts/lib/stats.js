import { MIN_ARTICLES_FOR_RANK, SAMPLE_TOO_SMALL_NOTE } from './constants.js';

// 來源統計只寫進 data/source_stats.json，給內容長看。網站不連結、不顯示。
export function buildSourceStats(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return [];
  const groups = new Map();
  for (const article of articles) {
    const source = article?.source || '未知來源';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(article);
  }

  const rows = [];
  for (const [source, list] of groups) {
    const ratios = list
      .map((article) => article?.biasRatio)
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const avgBiasRatio = ratios.length
      ? Math.round((ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 1000) / 1000
      : null;
    const articleCount = list.length;
    const sampleTooSmall = articleCount < MIN_ARTICLES_FOR_RANK;
    rows.push({
      source,
      articleCount,
      avgBiasRatio,
      rank: null,
      sampleTooSmall,
      sampleNote: sampleTooSmall ? SAMPLE_TOO_SMALL_NOTE : '',
      isExample: list.every((article) => article.isExample),
    });
  }

  const ranked = rows
    .filter((row) => !row.sampleTooSmall && row.avgBiasRatio != null)
    .sort((a, b) => {
      if (a.avgBiasRatio !== b.avgBiasRatio) return b.avgBiasRatio - a.avgBiasRatio;
      return a.source.localeCompare(b.source, 'zh-Hant');
    });
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  rows.sort((a, b) => a.source.localeCompare(b.source, 'zh-Hant'));
  return rows;
}
