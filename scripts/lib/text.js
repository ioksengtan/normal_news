export function charLength(str) {
  return [...String(str ?? '')].length;
}

// 英文單字以空白分隔。連字號複合詞、數字與符號的組合各算 1 個。純標點不計。
export function countEnglishWords(str) {
  return String(str ?? '')
    .trim()
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;
}

export function compactWhitespace(str) {
  return String(str ?? '').replace(/\s+/g, '');
}

export function clipChars(str, max) {
  const chars = [...String(str ?? '')];
  if (chars.length <= max) return chars.join('');
  return `${chars.slice(0, max).join('')}…`;
}

// 摘要不得和原文共用超過 10 個連續字。數字與「（原文為…）」括注先拿掉，避免日期與附註原文被誤判。
export function sharesLongRun(summary, source, limit = 10) {
  const left = overlapText(summary);
  const right = overlapText(source);
  if (left.length <= limit || right.length <= limit) return false;
  const window = limit + 1;
  for (let i = 0; i <= left.length - window; i += 1) {
    if (right.includes(left.slice(i, i + window))) return true;
  }
  return false;
}

function overlapText(value) {
  return String(value ?? '')
    .replace(/（原文為[^）]{0,80}）/g, '')
    .replace(/\s+/g, '')
    .replace(/[0-9０-９]/g, '');
}
