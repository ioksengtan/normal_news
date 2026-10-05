export const ITEMS_PER_SOURCE = 5;

// Issues through this date were published with 10 items from each source.
export const PREVIOUS_COUNT_UNTIL = '2026-10-05';

export function sourceCountProblems(issue, {
  perSource = ITEMS_PER_SOURCE,
  previousUntil = PREVIOUS_COUNT_UNTIL,
} = {}) {
  if (!issue?.date || issue.date <= previousUntil) return [];
  const counts = {};
  for (const item of issue.items || []) {
    const source = item?.source;
    if (!source) continue;
    counts[source] = (counts[source] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, count]) => count > perSource)
    .map(([source, count]) => `${issue.date} 的 ${source} 有 ${count} 則，每日最多 ${perSource} 則`);
}
