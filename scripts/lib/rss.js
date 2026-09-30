import Parser from 'rss-parser';
import { fetchResponse } from './http.js';

// rss-parser 的 parseURL 在非 2xx 時不會關掉 response，Node 會再空等約 240 秒。
// 改用 fetch + AbortSignal.timeout，成功後才把字串交給 parseString。
// HTTP 403 直接失敗，不換 User-Agent、不換 IP。
export async function fetchFeed(feed, { timeoutMs = 20000, limit = 30, headers = {} } = {}) {
  const parser = new Parser();
  try {
    const response = await fetchResponse(feed.url, {
      timeoutMs,
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        ...headers,
      },
    });
    if (response.status === 304) {
      return {
        ok: true,
        notModified: true,
        error: null,
        items: [],
        etag: response.etag,
        lastModified: response.lastModified,
      };
    }
    const parsed = await parser.parseString(response.text);
    const items = [];
    for (const item of (parsed.items || []).slice(0, limit)) {
      if (!item.link) continue;
      items.push({
        title: item.title || '',
        link: item.link,
        source: feed.source,
        feedId: feed.id,
        publishedAt: publishedAtFromItem(item),
        categories: item.categories || [],
        summary: item.contentSnippet || item.summary || '',
      });
    }
    return {
      ok: true,
      notModified: false,
      error: null,
      items,
      etag: response.etag,
      lastModified: response.lastModified,
    };
  } catch (err) {
    return {
      ok: false,
      notModified: false,
      error: err?.message || String(err),
      status: err?.status || null,
      retryAfter: err?.retryAfter || null,
      items: [],
    };
  }
}

// 保留原始時區。+09:00 與 +0900 都是韓國時間，不能改讀成台北時間。
export function publishedAtFromItem(item) {
  const values = [item?.pubDate, item?.isoDate, item?.published].filter(Boolean).map((value) => String(value).trim());
  const withOffset = values.find((value) => /(?:Z|[+-]\d{2}:?\d{2})\s*$/i.test(value));
  return normalizeOffsetDate(withOffset || values[0] || null);
}

export function normalizeOffsetDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})$/i);
  if (iso) {
    const seconds = iso[2].length === 5 ? `${iso[2]}:00` : iso[2];
    const offset = formatOffset(iso[3]);
    const normalized = `${iso[1]}T${seconds}${offset}`;
    return Number.isNaN(Date.parse(normalized)) ? null : normalized;
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  const rfc = text.match(/([+-])(\d{2}):?(\d{2})\s*$/);
  if (!rfc) return new Date(parsed).toISOString();
  const sign = rfc[1] === '-' ? -1 : 1;
  const offsetMin = sign * (Number(rfc[2]) * 60 + Number(rfc[3]));
  const shifted = new Date(parsed + offsetMin * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}${rfc[1]}${rfc[2]}:${rfc[3]}`;
}

function formatOffset(offset) {
  if (/^Z$/i.test(offset)) return 'Z';
  const match = offset.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return offset;
  return `${match[1]}${match[2]}:${match[3]}`;
}

// 每個 feed 各自有名額。舊流程是全來源加總後取前 N 篇，排在前面的來源會佔滿名額。
export function selectByQuota(items, seenLinks, maxPerSource) {
  const seen = new Set(seenLinks);
  const counts = new Map();
  const selected = [];
  for (const item of items) {
    if (!item.link || seen.has(item.link)) continue;
    const used = counts.get(item.feedId) || 0;
    if (used >= maxPerSource) continue;
    counts.set(item.feedId, used + 1);
    seen.add(item.link);
    selected.push(item);
  }
  return selected;
}

export function countUnseen(items, seenLinks) {
  const seen = new Set(seenLinks);
  let count = 0;
  for (const item of items) {
    if (!item.link || seen.has(item.link)) continue;
    seen.add(item.link);
    count += 1;
  }
  return count;
}

export function feedFailureSummary(feeds) {
  const enabled = feeds.filter((feed) => feed.status !== 'disabled');
  const failed = enabled.filter((feed) => feed.status === 'error');
  const blocked = enabled.filter((feed) => feed.status === 'blocked');
  return {
    enabledCount: enabled.length,
    failedCount: failed.length,
    blockedCount: blocked.length,
    allFailed: enabled.length === 0 || enabled.every((feed) => feed.status !== 'ok' && feed.status !== 'rate_limited'),
  };
}
