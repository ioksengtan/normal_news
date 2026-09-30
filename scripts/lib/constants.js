export const SOURCE_LANGUAGES = ['繁體中文', '簡體中文', '英文'];
export const ARTICLE_TYPES = ['新聞報導', '評論', '新聞稿', '其他'];
export const MAX_TITLE_CHARS = 30;
export const MIN_SUMMARY_CHARS = 150;
export const MAX_ARTICLE_SUMMARY_CHARS = 300;
export const MAX_SUMMARY_CHARS = 200;
export const MAX_OVERLAP_CHARS = 10;
export const MAX_NOTE_CHARS = 80;
export const MIN_ARTICLE_TEXT_CHARS = 200;
export const HOME_EVENT_LIMIT = 30;
export const HOME_CARD_SUMMARY_CHARS = 120;
export const HOME_MAX_BYTES = 300 * 1024;
export const MIN_ARTICLES_FOR_RANK = 20;
export const MAX_STORED_ARTICLES = 300;
export const SAMPLE_TOO_SMALL_NOTE = '樣本不足（未滿 20 篇），暫不排名';
export const EVENT_ID_RE = /^evt_[A-Za-z0-9_-]{1,80}$/;

// 這些檔案會被 publish 送上 main。候選全文不在其中。
export const PUBLISHED_DATA_FILES = [
  'articles.json',
  'events.json',
  'home.json',
  'home-more.json',
  'international.json',
  'source_stats.json',
  'criteria.json',
];

export const FORBIDDEN_TEXT_KEYS = new Set([
  'text',
  'originalText',
  'rawText',
  'fullText',
  'body',
  'content',
  'originalTitle',
]);
