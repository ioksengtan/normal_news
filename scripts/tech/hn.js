export function isHiringPost(item) {
  if (!item || item.deleted || item.dead) return true;
  if (item.type === 'job') return true;
  const title = item.title || '';
  return /ask hn:\s*who is hiring/i.test(title) || /ask hn:\s*who wants to be hired/i.test(title);
}

function clipText(value, max) {
  const text = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

export function toHnCandidate(item) {
  if (!item || (item.type !== 'story' && item.type !== 'poll')) return null;
  if (isHiringPost(item) || !item.title || item.id == null) return null;
  return {
    id: item.id,
    title: item.title,
    url: item.url || null,
    hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
    score: item.score || 0,
    comments: item.descendants || 0,
    text: clipText(item.text || '', 1200),
  };
}

export function selectHnStories(rawItems, seenIds, limit) {
  const seen = new Set((seenIds || []).map((id) => String(id)));
  const selected = [];
  for (const raw of rawItems || []) {
    const item = toHnCandidate(raw);
    if (!item || seen.has(String(item.id))) continue;
    seen.add(String(item.id));
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}
