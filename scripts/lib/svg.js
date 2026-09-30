import fs from 'fs';
import path from 'path';

export const DIAGRAM_MAX_BYTES = 60 * 1024;

const FONT_STACK = '"Noto Serif TC", "Songti TC", "PMingLiU", "WenQuanYi Micro Hei", "Droid Sans Fallback", serif';

export function diagramFontStack() {
  return FONT_STACK;
}

export function diagramSrc(date, id) {
  const text = String(id ?? '');
  const parts = text.split('/');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(text)) return '';
  if (parts.some((part) => !part || part === '.' || part === '..')) return '';
  return `data/diagrams/${date}/${text}.svg`;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

export function svgContentProblems(text) {
  const problems = [];
  const source = String(text || '');
  if (!/<\s*svg[\s>]/i.test(source)) problems.push('不是 SVG');
  const haystack = `${source}\n${decodeEntities(source)}`;
  if (/<\s*script\b/i.test(haystack)) problems.push('含有 script');
  if (/<\s*(?:foreignObject|iframe|embed|object|link)\b/i.test(haystack)) problems.push('含有外部嵌入');
  if (/<\s*!DOCTYPE\b/i.test(haystack)) problems.push('含有 DOCTYPE');
  if (/\son[a-z][a-z0-9]*\s*=/i.test(haystack)) problems.push('含有事件處理屬性');
  if (/javascript\s*:/i.test(haystack)) problems.push('含有 javascript 網址');
  if (/@import\b/i.test(haystack)) problems.push('含有外部樣式');
  if (/url\(\s*(?!#)/i.test(haystack)) problems.push('含有外部網址');
  if (/\b(?:href|src|xlink:href)\s*=\s*(['"])(?!#)/i.test(haystack)) problems.push('含有外部參照');
  return problems;
}

export function diagramProblems({ diagram, date, id, dataDir }) {
  if (diagram == null) return [];
  const problems = [];
  const expected = diagramSrc(date, id);
  if (!diagram || typeof diagram !== 'object' || Array.isArray(diagram)) {
    problems.push('圖解必須是物件');
    return problems;
  }
  if (!expected || diagram.src !== expected) {
    problems.push(`圖解路徑必須是 ${expected || 'data/diagrams/日期/項目.svg'}`);
    return problems;
  }
  if (typeof diagram.alt !== 'string' || !diagram.alt.trim()) problems.push('圖解缺少 alt');
  if (typeof diagram.caption !== 'string' || !diagram.caption.trim()) problems.push('圖解缺少 caption');
  const file = path.resolve(dataDir, '..', expected);
  const root = path.resolve(dataDir, 'diagrams', date);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    problems.push('圖解路徑超出該期目錄');
    return problems;
  }
  if (!fs.existsSync(file)) {
    problems.push('找不到圖解檔案');
    return problems;
  }
  const size = fs.statSync(file).size;
  if (size > DIAGRAM_MAX_BYTES) problems.push(`圖解超過 ${DIAGRAM_MAX_BYTES} bytes`);
  const text = fs.readFileSync(file, 'utf8');
  for (const problem of svgContentProblems(text)) problems.push(`圖解${problem}`);
  return problems;
}
