// 抓取前先檢查。只看專案自己的 User-Agent（沒有具名群組就用 *）以及 * 群組。
// 只針對訓練爬蟲（GPTBot、ClaudeBot、anthropic-ai）的群組不適用。
const PROJECT_AGENT = 'normal-news-bot';

export function parseRobots(text) {
  const groups = [];
  let current = null;
  const fresh = () => {
    current = { agents: [], rules: [], signals: null, crawlDelay: null, startedRules: false };
    groups.push(current);
  };

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const splitAt = line.indexOf(':');
    if (splitAt === -1) continue;
    const key = line.slice(0, splitAt).trim().toLowerCase();
    const value = line.slice(splitAt + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.startedRules) fresh();
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) fresh();
    current.startedRules = true;
    if (key === 'allow' || key === 'disallow') {
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'content-signal') {
      current.signals = parseSignals(value);
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
    }
  }
  return groups.filter((group) => group.agents.length > 0);
}

export function aiAgentBlocks(robotsText, urlString) {
  const url = new URL(urlString);
  const path = normalizePath(`${url.pathname}${url.search}`);
  const merged = mergeGroups(parseRobots(robotsText));
  const star = merged.get('*') || emptyGroup();
  const named = merged.get(PROJECT_AGENT);
  const checks = named
    ? [{ who: PROJECT_AGENT, group: named }, { who: '*', group: star }]
    : [{ who: '*', group: star }];
  let crawlDelaySeconds = 0;
  const seen = new Set();
  for (const check of checks) {
    if (seen.has(check.group)) continue;
    seen.add(check.group);
    crawlDelaySeconds = Math.max(crawlDelaySeconds, check.group.crawlDelay || 0);
    if (groupDisallows(check.group, path)) {
      return {
        blocked: true,
        reason: `robots.txt 禁止 ${check.who} 抓取 ${path}`,
        crawlDelaySeconds,
      };
    }
  }
  return { blocked: false, reason: null, crawlDelaySeconds };
}

export async function fetchRobots(origin, { timeoutMs = 20000, fetchImpl } = {}) {
  const load = fetchImpl || (await import('./http.js')).fetchResponse;
  try {
    const response = await load(`${origin}/robots.txt`, {
      timeoutMs,
      headers: { Accept: 'text/plain,*/*' },
    });
    return { ok: true, text: response.text || '', blocked: false };
  } catch (err) {
    const status = err?.status;
    if (status >= 400 && status < 500) {
      return { ok: true, text: '', blocked: false };
    }
    return {
      ok: false,
      blocked: true,
      text: '',
      error: err?.message || String(err),
    };
  }
}

function emptyGroup() {
  return { agents: ['*'], rules: [], crawlDelay: 0 };
}

function mergeGroups(groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const agent of group.agents) {
      const current = merged.get(agent) || { agents: [agent], rules: [], crawlDelay: 0 };
      current.rules.push(...group.rules);
      current.crawlDelay = Math.max(current.crawlDelay, group.crawlDelay || 0);
      merged.set(agent, current);
    }
  }
  return merged;
}

function normalizePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseSignals(value) {
  const signals = {};
  for (const part of value.split(',')) {
    const [key, raw] = part.split('=').map((piece) => piece.trim().toLowerCase());
    if (!key || !raw) continue;
    signals[key] = raw;
  }
  return { aiInput: signals['ai-input'] || null, aiTrain: signals['ai-train'] || null };
}

function groupDisallows(group, path) {
  let best = null;
  for (const rule of group.rules) {
    if (!robotsMatch(rule.path, path)) continue;
    const len = rule.path.length;
    if (!best || len > best.len || (len === best.len && rule.allow)) {
      best = { len, allow: rule.allow };
    }
  }
  return Boolean(best && !best.allow);
}

function robotsMatch(pattern, path) {
  let expression = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      expression += '.*';
    } else if (ch === '$' && i === pattern.length - 1) {
      expression += '$';
    } else {
      expression += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  if (!pattern.endsWith('$')) expression += '.*';
  return new RegExp(expression).test(path);
}
