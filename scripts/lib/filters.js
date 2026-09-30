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
  const excluded = source.excludeKeywords || [];
  if (excluded.length > 0) {
    const haystack = `${item.title || ''}\n${item.summary || ''}`.toLowerCase();
    if (excluded.some((keyword) => keyword && haystack.includes(String(keyword).toLowerCase()))) {
      return false;
    }
  }
  const markers = source.excludeBylineMarkers || [];
  if (markers.some((marker) => marker && markerHits(item, marker))) return false;
  if (source.maxAgeDays) {
    const published = Date.parse(item.publishedAt || '');
    if (Number.isNaN(published)) return false;
    const maxAgeMs = source.maxAgeDays * 24 * 60 * 60 * 1000;
    if (now.getTime() - published > maxAgeMs) return false;
  }
  return true;
}

function markerHits(item, marker) {
  const fields = [
    item.title,
    item.summary,
    item.author,
    item.creator,
    item.byline,
    item.category,
  ];
  if (Array.isArray(item.categories)) fields.push(...item.categories);
  return fields.some((field) => field && markerInText(String(field), marker));
}

// 三個字以內的英數標記（AP、AFP、RNZ）只對完整詞生效，避免 AP 命中 Asia Pacific。
function markerInText(text, marker) {
  const needle = String(marker || '').trim();
  if (!needle) return false;
  if (/^[A-Za-z0-9]{1,3}$/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, 'i').test(text);
  }
  return text.toLowerCase().includes(needle.toLowerCase());
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
