export const TECH_SOURCES = [
  { id: 'github', label: 'GitHub' },
  { id: 'hackernews', label: 'Hacker News' },
];

export function interleaveByRank(groups) {
  const lists = (groups || []).map((group) => (group.items || []).map((item, rank) => ({
    ...item,
    source: group.id,
    sourceLabel: group.label,
    rank,
  })));
  const lead = lists.find((list) => list.length > 0)?.[0] || null;
  const max = lists.reduce((highest, list) => Math.max(highest, list.length), 0);
  const ordered = [];
  if (lead) ordered.push(lead);
  for (let rank = 0; rank < max; rank += 1) {
    for (const list of lists) {
      const item = list[rank];
      if (!item || item === lead) continue;
      ordered.push(item);
    }
  }
  return ordered;
}
