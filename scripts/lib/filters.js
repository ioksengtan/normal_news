export function applySourceFilters(items, source, now = new Date()) {
  return items.filter((item) => keepItem(item, source, now));
}

function keepItem(item, source, now) {
  const link = item.link || '';
  for (const piece of source.excludeUrlSubstrings || []) {
    if (piece && link.includes(piece)) return false;
  }
  const banned = new Set((source.excludeCategories || []).map((category) => category.toLowerCase()));
  if (banned.size > 0 && categoryTokens(item).some((token) => banned.has(token))) {
    return false;
  }
  const keywords = source.includeKeywords || [];
  if (keywords.length > 0) {
    const haystack = `${item.title || ''}\n${item.summary || ''}`;
    if (!keywords.some((keyword) => keyword && haystack.includes(keyword))) return false;
  }
  if (source.maxAgeDays) {
    const published = Date.parse(item.publishedAt || '');
    if (Number.isNaN(published)) return false;
    const maxAgeMs = source.maxAgeDays * 24 * 60 * 60 * 1000;
    if (now.getTime() - published > maxAgeMs) return false;
  }
  return true;
}

function categoryTokens(item) {
  const raw = [];
  if (Array.isArray(item.categories)) raw.push(...item.categories);
  if (item.category) raw.push(item.category);
  return raw
    .flatMap((category) => String(category).split(/[,，]/))
    .map((category) => category.trim().toLowerCase())
    .filter(Boolean);
}
