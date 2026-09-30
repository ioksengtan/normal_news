const TRACKING_EXACT = new Set(['traffic_source', 'at_medium', 'at_campaign', 'maca']);

export function stripTracking(urlString) {
  const url = new URL(urlString);
  const drop = [];
  for (const key of url.searchParams.keys()) {
    const name = key.toLowerCase();
    if (TRACKING_EXACT.has(name) || name.startsWith('utm_')) drop.push(key);
  }
  for (const key of drop) url.searchParams.delete(key);
  url.hash = '';
  return url.toString();
}
