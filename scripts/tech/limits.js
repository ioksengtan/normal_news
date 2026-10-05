export const ITEMS_PER_SOURCE = 5;

// Issues through this date were published with 10 items from each source.
export const PREVIOUS_COUNT_UNTIL = '2026-10-05';

export function productHuntIncluded(block) {
  return block?.status === 'ok' && Array.isArray(block.items) && block.items.length > 0;
}

export function limitsFromConfig(techSources, { withProductHunt = false } = {}) {
  const limits = {};
  for (const source of techSources || []) {
    const count = withProductHunt && Number.isInteger(source.withProductHunt)
      ? source.withProductHunt
      : source.dailyCount;
    if (Number.isInteger(count)) limits[source.id] = count;
  }
  return limits;
}

export function sourceCountProblems(issue, {
  perSource = ITEMS_PER_SOURCE,
  previousUntil = PREVIOUS_COUNT_UNTIL,
  techSources = null,
} = {}) {
  if (!issue?.date || issue.date <= previousUntil) return [];
  const included = (issue.items || []).some((item) => item?.source === 'producthunt');
  const limits = techSources ? limitsFromConfig(techSources, { withProductHunt: included }) : null;
  const counts = {};
  for (const item of issue.items || []) {
    const source = item?.source;
    if (!source) continue;
    counts[source] = (counts[source] || 0) + 1;
  }
  return Object.entries(counts).flatMap(([source, count]) => {
    const cap = limits?.[source] ?? perSource;
    if (count <= cap) return [];
    return [`${issue.date} 的 ${source} 有 ${count} 則，每日最多 ${cap} 則`];
  });
}
