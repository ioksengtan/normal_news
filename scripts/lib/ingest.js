import { createHash } from 'crypto';
import {
  ARTICLE_TYPES,
  EVENT_ID_RE,
  FORBIDDEN_TEXT_KEYS,
  HOME_EVENT_LIMIT,
  HOME_MAX_BYTES,
  MAX_ARTICLE_SUMMARY_CHARS,
  MAX_OVERLAP_CHARS,
  MAX_STORED_ARTICLES,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
  MIN_SUMMARY_CHARS,
  SOURCE_LANGUAGES,
} from './constants.js';
import { criteriaFromRubric } from './rubric.js';
import { buildSourceStats } from './stats.js';
import { charLength, compactWhitespace, sharesLongRun } from './text.js';

// 用連結的 SHA-256 雜湊當 id。直接取連結 base64 的前 16 字時，所有 https://www. 開頭的連結都會得到同一個 id。
export function articleIdFromLink(link) {
  return createHash('sha256').update(String(link)).digest('base64url').slice(0, 16);
}

export function normalizeRewrites(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.results)) return raw.results;
  throw new Error('改寫檔必須是陣列，或是 { "results": [...] }');
}

export function ingestBatch({
  articles,
  events,
  candidates = [],
  rewrites = [],
  rubric,
  now = new Date().toISOString(),
  purgeExamples = false,
  allowEmpty = false,
}) {
  if (!Array.isArray(articles)) throw new Error('articles 必須是陣列');
  if (!Array.isArray(events)) throw new Error('events 必須是陣列');

  const results = normalizeRewrites(rewrites);
  if (results.length === 0 && !allowEmpty && !purgeExamples) {
    throw new Error('改寫檔沒有任何結果');
  }

  const errors = [];
  const candidateById = new Map();
  const candidateByLink = new Map();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (candidate.id) candidateById.set(candidate.id, candidate);
    if (candidate.link) candidateByLink.set(candidate.link, candidate);
    if (candidate.url) candidateByLink.set(candidate.url, candidate);
  }

  const nextArticles = articles.map((article) => ({ ...article }));
  const articleById = new Map(nextArticles.map((article) => [article.id, article]));
  const seenLinks = new Set(nextArticles.map((article) => article.link).filter(Boolean));

  const nextEvents = events.map((event) => ({
    ...event,
    articleIds: [...(event.articleIds || [])],
  }));
  const eventById = new Map(nextEvents.map((event) => [event.id, event]));
  const seenResultIds = new Set();
  const created = [];

  results.forEach((result, index) => {
    const where = `results[${index}]`;
    if (!result || typeof result !== 'object') {
      errors.push(`${where}：必須是物件`);
      return;
    }
    const candidate = lookupCandidate(result, candidateById, candidateByLink);
    if (!candidate) {
      errors.push(`${where}：找不到對應的候選文章（要比對 id 或 link）`);
      return;
    }
    if (typeof candidate.id !== 'string' || candidate.id === '') {
      errors.push(`${where}：候選文章缺少 id`);
      return;
    }
    if (typeof candidate.text !== 'string' || candidate.text.trim() === '') {
      errors.push(`${where}：候選文章缺少 text，無法計算情緒密度，也不能核對移除片段`);
      return;
    }
    if (seenResultIds.has(candidate.id)) {
      errors.push(`${where}：重複的文章 ${candidate.id}`);
      return;
    }
    seenResultIds.add(candidate.id);
    if (articleById.has(candidate.id) || (candidate.link && seenLinks.has(candidate.link))) {
      errors.push(`${where}：文章已在 data/articles.json（${candidate.id}）`);
      return;
    }

    const articleErrors = [];
    const article = buildArticle(result, candidate, rubric, now, articleErrors, where);
    const eventPlan = planEvent(result.event, eventById, where);
    if (articleErrors.length || eventPlan.error) {
      errors.push(...articleErrors);
      if (eventPlan.error) errors.push(eventPlan.error);
      return;
    }

    if (eventPlan.decision === 'same_as') {
      const event = eventById.get(eventPlan.sameAs);
      event.articleIds.push(article.id);
      event.updatedAt = now;
      article.eventId = event.id;
    } else {
      const eventId = eventPlan.eventId || `evt_${article.id}`;
      if (!EVENT_ID_RE.test(eventId)) {
        errors.push(`${where}：推導出的 event id 格式不正確：${eventId}`);
        return;
      }
      if (eventById.has(eventId)) {
        errors.push(`${where}：event_id ${eventId} 已存在，同一事件請用 same_as`);
        return;
      }
      const event = {
        id: eventId,
        summary: eventPlan.summary,
        representativeArticleId: article.id,
        articleIds: [article.id],
        uncertain: eventPlan.uncertain,
        publishedAt: article.publishedAt,
        updatedAt: now,
      };
      nextEvents.push(event);
      eventById.set(eventId, event);
      article.eventId = eventId;
    }

    nextArticles.push(article);
    articleById.set(article.id, article);
    if (article.link) seenLinks.add(article.link);
    created.push(article);
  });

  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  let storedArticles = [...created, ...nextArticles.filter((article) => !created.includes(article))];
  const hasReal = storedArticles.some((article) => !article.isExample);
  if (purgeExamples || hasReal) {
    storedArticles = storedArticles.filter((article) => !article.isExample);
  }
  storedArticles = storedArticles.slice(0, MAX_STORED_ARTICLES).map(serializeArticle);

  const keptIds = new Set(storedArticles.map((article) => article.id));
  const storedEvents = [];
  for (const event of nextEvents) {
    const articleIds = event.articleIds.filter((id) => keptIds.has(id));
    if (articleIds.length === 0) continue;
    const refreshed = refreshEvent({ ...event, articleIds }, keptIds, storedArticles);
    if (refreshed) storedEvents.push(refreshed);
  }

  const home = buildHome(storedEvents, storedArticles, now);
  const international = buildInternational(storedEvents, storedArticles, hasReal ? now : null);
  const stats = buildSourceStats(storedArticles);
  const criteria = criteriaFromRubric(rubric);
  const leaked = [
    ...findLeakedOriginalFields(storedArticles, '$.articles'),
    ...findLeakedOriginalFields(storedEvents, '$.events'),
    ...findLeakedOriginalFields(home, '$.home'),
    ...findLeakedOriginalFields(international, '$.international'),
  ];
  if (leaked.length) {
    throw new Error(leaked.join('\n'));
  }

  return {
    articles: storedArticles,
    events: storedEvents,
    home,
    international,
    stats,
    criteria,
    addedCount: created.filter((article) => keptIds.has(article.id)).length,
  };
}

export function rebuildDerived({ articles, events, rubric, now = new Date().toISOString(), purgeExamples = false }) {
  return ingestBatch({
    articles,
    events,
    candidates: [],
    rewrites: [],
    rubric,
    now,
    purgeExamples,
    allowEmpty: true,
  });
}

function lookupCandidate(result, candidateById, candidateByLink) {
  if (result.id && candidateById.has(result.id)) return candidateById.get(result.id);
  const link = result.link || result.url;
  if (link && candidateByLink.has(link)) return candidateByLink.get(link);
  return null;
}

function buildArticle(result, candidate, rubric, now, errors, where) {
  const sourceLanguage = typeof result.source_language === 'string' ? result.source_language.trim() : '';
  if (!SOURCE_LANGUAGES.includes(sourceLanguage)) {
    errors.push(`${where}：source_language 必須是 ${SOURCE_LANGUAGES.join('、')}`);
  }
  const articleType = typeof result.article_type === 'string' ? result.article_type.trim() : '';
  if (!ARTICLE_TYPES.includes(articleType)) {
    errors.push(`${where}：article_type 必須是 ${ARTICLE_TYPES.join('、')}`);
  }
  const section = typeof result.section === 'string' && result.section.trim() ? result.section.trim() : '國際版';
  if (section !== '國際版') {
    errors.push(`${where}：section 必須是國際版`);
  }
  const neutralTitle = typeof result.neutral_title === 'string' ? result.neutral_title.trim() : '';
  const neutralSummary = typeof result.neutral_summary === 'string' ? result.neutral_summary.trim() : '';
  if (!neutralTitle || charLength(neutralTitle) > MAX_TITLE_CHARS) {
    errors.push(`${where}：neutral_title 必須是 1 到 ${MAX_TITLE_CHARS} 個字，而且要自己撰寫`);
  }
  const summaryLen = charLength(neutralSummary);
  if (summaryLen < MIN_SUMMARY_CHARS || summaryLen > MAX_ARTICLE_SUMMARY_CHARS) {
    errors.push(`${where}：neutral_summary 必須是 ${MIN_SUMMARY_CHARS} 到 ${MAX_ARTICLE_SUMMARY_CHARS} 個字`);
  }
  if (neutralSummary && sharesLongRun(neutralSummary, candidate.text || '', MAX_OVERLAP_CHARS)) {
    errors.push(`${where}：neutral_summary 和原文有超過 ${MAX_OVERLAP_CHARS} 個連續相同字，必須改寫`);
  }
  if (neutralTitle && sharesLongRun(neutralTitle, candidate.title || '', MAX_OVERLAP_CHARS)) {
    errors.push(`${where}：neutral_title 和原標題有超過 ${MAX_OVERLAP_CHARS} 個連續相同字`);
  }
  if (neutralSummary && leaksOriginal(neutralSummary, candidate.text || '')) {
    errors.push(`${where}：neutral_summary 含有完整原文，不能寫進公開資料`);
  }
  const balanceNotes = [];
  if (result.balance_notes != null && !Array.isArray(result.balance_notes)) {
    errors.push(`${where}：balance_notes 必須是陣列`);
  } else if (Array.isArray(result.balance_notes)) {
    for (const note of result.balance_notes) {
      if (typeof note !== 'string' || charLength(note.trim()) < 1 || charLength(note.trim()) > 80) {
        errors.push(`${where}：balance_notes 每一項必須是 1 到 80 個字`);
      } else {
        balanceNotes.push(note.trim());
      }
    }
  }

  const article = {
    id: candidate.id,
    neutralTitle,
    neutralSummary,
    link: candidate.link || candidate.url || result.link || '',
    source: candidate.source || '',
    publishedAt: candidate.publishedAt || null,
    processedAt: now,
    sourceLanguage,
    articleType,
    section,
    balanceNotes,
    rubricVersion: rubric.version,
    eventId: null,
  };
  const license = typeof candidate.license === 'string' ? candidate.license.trim() : '';
  if (license) article.license = license;
  return article;
}

function planEvent(event, eventById, where) {
  if (!event || typeof event !== 'object') {
    return { error: `${where}：缺少 event（decision、summary 或 same_as）` };
  }
  const decision = event.decision;
  if (decision !== 'new' && decision !== 'same_as' && decision !== 'unsure') {
    return { error: `${where}：event.decision 必須是 new、same_as 或 unsure` };
  }
  if (decision === 'same_as') {
    const sameAs = typeof event.same_as === 'string' ? event.same_as.trim() : '';
    if (!sameAs || !eventById.has(sameAs)) {
      return { error: `${where}：same_as 必須是已經存在的事件 id。不確定時用 unsure，不要併入` };
    }
    return { decision, sameAs };
  }
  if (event.same_as) {
    return { error: `${where}：decision 為 ${decision} 時不能帶 same_as。不確定就不要併入既有事件` };
  }
  const summary = typeof event.summary === 'string' ? event.summary.trim() : '';
  const summaryLen = charLength(summary);
  if (summaryLen < 1 || summaryLen > MAX_SUMMARY_CHARS) {
    return { error: `${where}：summary 必須是 1 到 ${MAX_SUMMARY_CHARS} 個字的事件短述` };
  }
  if (event.event_id != null && event.event_id !== '') {
    if (typeof event.event_id !== 'string' || !EVENT_ID_RE.test(event.event_id)) {
      return { error: `${where}：event_id 必須符合 evt_ 後接英數、底線或連字號` };
    }
    if (eventById.has(event.event_id)) {
      return { error: `${where}：event_id ${event.event_id} 已存在，同一事件請用 same_as` };
    }
  }
  return {
    decision,
    summary,
    eventId: event.event_id || null,
    uncertain: decision === 'unsure',
  };
}

function leaksOriginal(neutral, original) {
  if (!original) return false;
  if (neutral === original) return true;
  if (original.length >= 40 && neutral.includes(original)) return true;
  const compactNeutral = compactWhitespace(neutral);
  const compactOriginal = compactWhitespace(original);
  if (compactOriginal.length >= 40 && (compactNeutral === compactOriginal || compactNeutral.includes(compactOriginal))) {
    return true;
  }
  return false;
}

function serializeArticle(article) {
  const stored = {
    id: article.id,
    neutralTitle: article.neutralTitle || '',
    neutralSummary: article.neutralSummary || '',
    link: article.link,
    source: article.source,
    publishedAt: article.publishedAt,
    processedAt: article.processedAt,
    sourceLanguage: article.sourceLanguage,
    articleType: article.articleType,
    section: article.section || '國際版',
    balanceNotes: Array.isArray(article.balanceNotes) ? article.balanceNotes : [],
    rubricVersion: article.rubricVersion,
    eventId: article.eventId,
  };
  if (typeof article.license === 'string' && article.license.trim()) {
    stored.license = article.license.trim();
  }
  if (article.isExample) stored.isExample = true;
  return stored;
}

function refreshEvent(event, keptIds, articles) {
  const articleIds = event.articleIds.filter((id) => keptIds.has(id));
  const members = articleIds
    .map((id) => articles.find((article) => article.id === id))
    .filter(Boolean);
  if (members.length === 0) return null;
  const representative = members.slice().sort(comparePublished)[0];
  const stored = {
    id: event.id,
    summary: event.summary,
    representativeArticleId: representative.id,
    articleIds,
    uncertain: Boolean(event.uncertain),
    publishedAt: representative.publishedAt,
    updatedAt: event.updatedAt,
  };
  if (members.every((article) => article.isExample)) stored.isExample = true;
  return stored;
}

function comparePublished(a, b) {
  const ta = Date.parse(a.publishedAt || '') || 0;
  const tb = Date.parse(b.publishedAt || '') || 0;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

export function buildHome(events, articles, generatedAt) {
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const sorted = events.slice().sort((a, b) => {
    const ta = Date.parse(a.publishedAt || '') || 0;
    const tb = Date.parse(b.publishedAt || '') || 0;
    if (ta !== tb) return tb - ta;
    return String(a.id).localeCompare(String(b.id));
  });
  const payload = {
    generatedAt,
    maxEvents: HOME_EVENT_LIMIT,
    maxBytes: HOME_MAX_BYTES,
    events: sorted.slice(0, HOME_EVENT_LIMIT).map((event) => {
      const representative = articleById.get(event.representativeArticleId);
      const homeEvent = {
        id: event.id,
        title: representative?.neutralTitle || '',
        summary: event.summary,
        publishedAt: event.publishedAt,
        articleCount: event.articleIds.length,
        representativeArticleId: event.representativeArticleId,
        uncertain: Boolean(event.uncertain),
      };
      if (event.isExample) homeEvent.isExample = true;
      return homeEvent;
    }),
  };
  const bytes = Buffer.byteLength(`${JSON.stringify(payload, null, 2)}\n`);
  if (bytes > HOME_MAX_BYTES) {
    throw new Error(`首頁資料 ${bytes} bytes，超過 ${HOME_MAX_BYTES} bytes。summary 只能是事件短述，不能放文章全文`);
  }
  return payload;
}

export function buildInternational(events, articles, updatedAt) {
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const list = [];
  for (const event of events) {
    const members = (event.articleIds || [])
      .map((id) => articleById.get(id))
      .filter((article) => article && !article.isExample);
    if (members.length === 0) continue;
    const representative = members.slice().sort(comparePublished)[0];
    const sources = members.map((article) => {
      const source = {
        name: article.source,
        url: article.link,
        publishedAt: article.publishedAt || null,
      };
      if (article.license) source.license = article.license;
      return source;
    });
    list.push({
      id: event.id,
      neutralTitle: representative.neutralTitle || '',
      neutralSummary: representative.neutralSummary || '',
      title: representative.neutralTitle || '',
      summary: representative.neutralSummary || '',
      sourceLanguage: representative.sourceLanguage || '',
      articleType: representative.articleType || '',
      balanceNotes: representative.balanceNotes || [],
      updatedAt: event.updatedAt || updatedAt,
      sources,
    });
  }
  list.sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0));
  const limited = list.slice(0, HOME_EVENT_LIMIT);
  let payload = {
    updatedAt: limited.length ? updatedAt : null,
    events: limited,
  };
  if (jsonBytes(payload) > HOME_MAX_BYTES) {
    payload = {
      updatedAt: payload.updatedAt,
      events: limited.map((event) => {
        const { neutralSummary, summary, balanceNotes, ...rest } = event;
        return rest;
      }),
    };
  }
  if (jsonBytes(payload) > HOME_MAX_BYTES) {
    throw new Error(`international.json ${jsonBytes(payload)} bytes，超過 ${HOME_MAX_BYTES} bytes`);
  }
  return payload;
}

function jsonBytes(value) {
  return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`);
}

export function findLeakedOriginalFields(value, label = '$') {
  const problems = [];
  walk(value, label, problems);
  return problems;
}

function walk(value, label, problems) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${label}[${index}]`, problems));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const here = `${label}.${key}`;
    if (FORBIDDEN_TEXT_KEYS.has(key) || key === 'removedSpans' || key === 'removed_spans' || key === 'metricSpans' || key === 'metric_spans' || key === 'biasRatio') {
      problems.push(`${here}：公開資料不可含原文、標記摘錄或來源比率`);
    }
    walk(child, here, problems);
  }
}

export function validateStoredData({ articles, events, home, international, stats, criteria, rubric }) {
  const problems = [];
  if (!Array.isArray(articles)) problems.push('articles.json 必須是陣列');
  if (!Array.isArray(events)) problems.push('events.json 必須是陣列');
  if (!home || !Array.isArray(home.events)) problems.push('home.json 必須包含 events 陣列');
  if (!international || !Array.isArray(international.events)) problems.push('international.json 必須包含 events 陣列');
  if (!Array.isArray(stats)) problems.push('source_stats.json 必須是陣列');
  if (problems.length) throw new Error(problems.join('\n'));

  const articleIds = new Set();
  for (const [index, article] of articles.entries()) {
    const where = `articles[${index}]`;
    for (const key of ['id', 'neutralTitle', 'neutralSummary', 'link', 'source', 'rubricVersion', 'eventId', 'processedAt']) {
      if (typeof article[key] !== 'string' || article[key] === '') {
        problems.push(`${where}.${key} 必須是非空字串`);
      }
    }
    if ('scope' in article || 'removedSpans' in article || 'biasRatio' in article || 'neutralText' in article) {
      problems.push(`${where} 含有已停用的公開欄位`);
    }
    if (!article.isExample && !SOURCE_LANGUAGES.includes(article.sourceLanguage)) {
      problems.push(`${where}.sourceLanguage 必須是 ${SOURCE_LANGUAGES.join('、')}`);
    }
    if (!article.isExample && !ARTICLE_TYPES.includes(article.articleType)) {
      problems.push(`${where}.articleType 不正確`);
    }
    if (articleIds.has(article.id)) problems.push(`${where}.id 重複`);
    articleIds.add(article.id);
  }

  const eventIds = new Set();
  for (const [index, event] of events.entries()) {
    const where = `events[${index}]`;
    if (!EVENT_ID_RE.test(event.id || '')) problems.push(`${where}.id 格式不正確`);
    if (eventIds.has(event.id)) problems.push(`${where}.id 重複`);
    eventIds.add(event.id);
    if (typeof event.summary !== 'string' || charLength(event.summary) > MAX_SUMMARY_CHARS) {
      problems.push(`${where}.summary 必須是 ${MAX_SUMMARY_CHARS} 字以內的短述`);
    }
    if (!Array.isArray(event.articleIds) || event.articleIds.length === 0) {
      problems.push(`${where}.articleIds 必須是非空陣列`);
    } else if (!event.articleIds.includes(event.representativeArticleId)) {
      problems.push(`${where}.representativeArticleId 必須是成員文章`);
    }
    for (const id of event.articleIds || []) {
      if (!articleIds.has(id)) problems.push(`${where} 引用了不存在的文章 ${id}`);
    }
    if ('scope' in event) problems.push(`${where}.scope 已停用`);
  }

  for (const [index, article] of articles.entries()) {
    if (!eventIds.has(article.eventId)) {
      problems.push(`articles[${index}].eventId ${article.eventId} 沒有對應事件`);
    }
  }

  const expected = rebuildDerived({
    articles,
    events,
    rubric,
    now: home.generatedAt,
    purgeExamples: false,
  });
  if (JSON.stringify(expected.home) !== JSON.stringify(home)) {
    problems.push('home.json 與事件、文章不一致，或超過最新 30 則事件');
  }
  if (JSON.stringify(expected.international) !== JSON.stringify(international)) {
    problems.push('international.json 與事件、文章不一致');
  }
  if (JSON.stringify(expected.stats) !== JSON.stringify(stats)) {
    problems.push('source_stats.json 與文章不一致（名次只給至少 20 篇的來源，並保留 isExample）');
  }
  if (JSON.stringify(expected.criteria) !== JSON.stringify(criteria)) {
    problems.push('criteria.json 與 rubric-spec.md 的使用者可讀說明不一致');
  }
  if (criteria.summary.includes('## 系統提示詞') || criteria.summary.includes('只回傳以下 JSON')) {
    problems.push('criteria.json 漏出了系統提示詞');
  }
  if (!Array.isArray(home.events) || home.events.length > HOME_EVENT_LIMIT) {
    problems.push(`home.json 最多 ${HOME_EVENT_LIMIT} 則事件`);
  }
  const homeBytes = Buffer.byteLength(`${JSON.stringify(home, null, 2)}\n`);
  if (homeBytes > HOME_MAX_BYTES) {
    problems.push(`home.json 有 ${homeBytes} bytes，超過 ${HOME_MAX_BYTES}`);
  }
  for (const homeEvent of home.events) {
    if ('neutralText' in homeEvent || 'text' in homeEvent) {
      problems.push(`首頁事件 ${homeEvent.id} 含有文章全文`);
    }
  }

  problems.push(...findLeakedOriginalFields(articles, '$.articles'));
  problems.push(...findLeakedOriginalFields(events, '$.events'));
  problems.push(...findLeakedOriginalFields(home, '$.home'));
  problems.push(...findLeakedOriginalFields(international, '$.international'));
  for (const event of international.events) {
    if (!event?.id || !event?.title || !Array.isArray(event.sources)) {
      problems.push('international.json 的事件要有 id、title 與 sources');
    }
  }

  if (problems.length) throw new Error(problems.join('\n'));
  return { homeBytes };
}
