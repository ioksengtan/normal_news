import path from 'path';
import { readJson } from './jsonio.js';

export const DEFAULT_SOURCES_PATH = path.join(process.cwd(), 'config', 'sources.json');

export function loadSources(filePath = DEFAULT_SOURCES_PATH, { disabled = [] } = {}) {
  const raw = readJson(filePath);
  if (!raw || !Array.isArray(raw.sources)) {
    throw new Error(`${filePath} 必須包含 sources 陣列`);
  }

  const disabledSet = new Set(disabled);
  const seenIds = new Set();
  return raw.sources.map((entry, index) => {
    const where = `${filePath} sources[${index}]`;
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${where} 必須是物件`);
    }
    const id = requiredString(entry.id, `${where}.id`);
    const source = requiredString(entry.source, `${where}.source`);
    const url = requiredString(entry.url, `${where}.url`);
    if (!/^https?:\/\//.test(url)) {
      throw new Error(`${where}.url 必須是 http(s) 網址`);
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      throw new Error(`${where}.id 只能用小寫英數與連字號`);
    }
    if (seenIds.has(id)) {
      throw new Error(`${where}.id ${id} 重複`);
    }
    seenIds.add(id);

    const enabledInConfig = entry.enabled !== false;
    const disabledByFlag = disabledSet.has(id) || disabledSet.has(source);
    let status = 'enabled';
    let disabledReason = null;
    if (!enabledInConfig) {
      status = 'disabled';
      disabledReason = typeof entry.note === 'string' && entry.note.trim()
        ? entry.note.trim()
        : '設定檔 enabled 為 false';
    } else if (disabledByFlag) {
      status = 'disabled';
      disabledReason = '本次以 --disable 或 DISABLED_SOURCES 停用';
    }

    return {
      id,
      source,
      url,
      enabled: status === 'enabled',
      disabledReason,
      maxAgeDays: optionalPositiveInt(entry.maxAgeDays, `${where}.maxAgeDays`),
      excludeUrlSubstrings: stringList(entry.excludeUrlSubstrings, `${where}.excludeUrlSubstrings`),
      excludeCategories: stringList(entry.excludeCategories, `${where}.excludeCategories`),
      includeKeywords: stringList(entry.includeKeywords, `${where}.includeKeywords`),
    };
  });
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} 必須是非空字串`);
  }
  return value.trim();
}

function stringList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${label} 必須是非空字串陣列`);
  }
  return value.map((item) => item.trim());
}

function optionalPositiveInt(value, label) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${label} 必須是正整數`);
  }
  return n;
}
