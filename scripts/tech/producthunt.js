import { taipeiStamp, USER_AGENT, waitForSlot } from '../lib/http.js';
import { ITEMS_PER_SOURCE } from './limits.js';
import { productHuntWindow } from './pacific.js';

export const PRODUCT_HUNT_ENDPOINT = 'https://api.producthunt.com/v2/api/graphql';

const QUERY = `query FeaturedPosts($postedAfter: DateTime!, $postedBefore: DateTime!, $first: Int!) {
  posts(featured: true, order: RANKING, postedAfter: $postedAfter, postedBefore: $postedBefore, first: $first) {
    edges {
      node {
        id
        name
        tagline
        description
        votesCount
        dailyRank
        url
        website
        slug
        createdAt
        featuredAt
        topics(first: 3) {
          edges { node { name } }
        }
      }
    }
  }
}`;

const RATE_HEADERS = [
  'retry-after',
  'x-rate-limit-limit',
  'x-rate-limit-remaining',
  'x-rate-limit-reset',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
];

function skipped(error, extra = {}) {
  return { status: 'failed', fallback: false, error, items: [], ...extra };
}

function scrub(message, token) {
  const text = String(message || '');
  if (!token) return text;
  return text.split(token).join('[token]');
}

function rateHeaders(response) {
  const found = {};
  for (const name of RATE_HEADERS) {
    const value = response.headers?.get?.(name);
    if (value) found[name] = value;
  }
  return found;
}

function rateSuffix(headers) {
  const parts = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  return parts.length ? `，${parts.join('，')}` : '';
}

function postUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'www.producthunt.com' && url.hostname !== 'producthunt.com') return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function parseProductHuntPosts(payload) {
  const edges = payload?.data?.posts?.edges;
  if (!Array.isArray(edges)) return { error: 'API 回應沒有 posts', items: [] };
  const items = [];
  for (const edge of edges) {
    const node = edge?.node;
    const url = postUrl(node?.url);
    if (!node?.id || !node?.name || !url) continue;
    const topics = (node.topics?.edges || [])
      .map((topic) => topic?.node?.name)
      .filter(Boolean)
      .slice(0, 3);
    items.push({
      id: String(node.id),
      name: String(node.name),
      tagline: String(node.tagline || ''),
      description: String(node.description || ''),
      votesCount: Number.isFinite(node.votesCount) ? node.votesCount : null,
      dailyRank: Number.isFinite(node.dailyRank) ? node.dailyRank : null,
      url,
      website: node.website || null,
      slug: node.slug || '',
      createdAt: node.createdAt || null,
      featuredAt: node.featuredAt || null,
      topics,
    });
  }
  items.sort((a, b) => {
    if (a.dailyRank == null && b.dailyRank == null) return 0;
    if (a.dailyRank == null) return 1;
    if (b.dailyRank == null) return -1;
    return a.dailyRank - b.dailyRank;
  });
  return { items };
}

export async function fetchProductHuntSection({
  issueDate,
  now = null,
  token = '',
  limit = ITEMS_PER_SOURCE,
  fetchImpl = globalThis.fetch,
  wait = true,
} = {}) {
  const window = productHuntWindow(now || issueDate);
  const secret = String(token || '').trim();
  if (!secret) return skipped('沒有環境變數 PRODUCT_HUNT_TOKEN', window);

  let response;
  try {
    if (wait) await waitForSlot(PRODUCT_HUNT_ENDPOINT);
    response = await fetchImpl(PRODUCT_HUNT_ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          postedAfter: window.postedAfter,
          postedBefore: window.postedBefore,
          first: limit,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    return skipped(scrub(error?.message || error, secret), window);
  }

  const limits = rateHeaders(response);
  const when = taipeiStamp();
  if (!response.ok) {
    return skipped(`API HTTP ${response.status}，台北時間 ${when}${rateSuffix(limits)}`, window);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return skipped(scrub(error?.message || error, secret), window);
  }
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    const message = payload.errors.map((error) => error?.message).filter(Boolean).join('；') || 'GraphQL 錯誤';
    return skipped(`${scrub(message, secret)}，台北時間 ${when}${rateSuffix(limits)}`, window);
  }
  const parsed = parseProductHuntPosts(payload);
  if (parsed.error) return skipped(`${parsed.error}，台北時間 ${when}${rateSuffix(limits)}`, window);
  const seen = new Set();
  const items = [];
  for (const item of parsed.items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= limit) break;
  }
  if (items.length === 0) return skipped(`沒有可刊出的產品，台北時間 ${when}${rateSuffix(limits)}`, window);
  return {
    status: 'ok',
    fallback: false,
    error: null,
    items,
    ...window,
    rateLimit: limits,
  };
}

export function productHuntLog(section) {
  if (section?.status === 'ok') {
    const rate = section.rateLimit ? rateSuffix(section.rateLimit).replace(/^，/, '') : '';
    const tail = rate ? `（${rate}）` : '';
    return `Product Hunt：ok，${section.items.length} 則，太平洋日 ${section.pacificDate}${tail}`;
  }
  return `Product Hunt：略過（${section?.error || '未知原因'}）`;
}
