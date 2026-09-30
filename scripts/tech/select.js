export function selectFresh(items, seenIds, limit) {
  const seen = new Set((seenIds || []).map((id) => String(id).toLowerCase()));
  const selected = [];
  for (const item of items || []) {
    const key = String(item.id).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function previousSectionIds(issues, sectionId, count, beforeDate) {
  return (issues || [])
    .filter((issue) => issue?.date && issue.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, count)
    .flatMap((issue) => (issue.sections?.[sectionId]?.items || []).map((item) => String(item.id)));
}
