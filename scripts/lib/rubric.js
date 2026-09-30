import fs from 'fs';
import path from 'path';

const DEFAULT_RUBRIC_PATH = path.join(process.cwd(), 'rubric-spec.md');

// 標題必須在行首。說明文字裡如果提到這些標題（rubric-spec.md 開頭那兩行），
// 不能把它們當成區塊邊界，否則準則頁會漏出整段系統提示詞。
const SYSTEM_RE = /^## 系統提示詞[^\n]*\r?\n([\s\S]*?)\r?\n(?=## 使用者可讀說明)/m;
const SUMMARY_RE = /^## 使用者可讀說明[^\n]*\r?\n([\s\S]*)$/m;

export function parseRubric(raw) {
  const versionMatch = raw.match(/^version:\s*(\S+)/m);
  const updatedMatch = raw.match(/^updated:\s*(\S+)/m);
  const systemMatch = raw.match(SYSTEM_RE);
  const summaryMatch = raw.match(SUMMARY_RE);

  if (!systemMatch || !summaryMatch) {
    throw new Error('rubric-spec.md 格式不正確：缺少行首的「## 系統提示詞」或「## 使用者可讀說明」');
  }

  return {
    version: versionMatch ? versionMatch[1] : '0.0.0',
    updatedAt: updatedMatch ? updatedMatch[1] : null,
    systemPrompt: systemMatch[1].trim(),
    humanSummary: summaryMatch[1].trim(),
  };
}

export function loadRubric(rubricPath = DEFAULT_RUBRIC_PATH) {
  return parseRubric(fs.readFileSync(rubricPath, 'utf8'));
}

export function criteriaFromRubric(rubric) {
  return {
    version: rubric.version,
    updatedAt: rubric.updatedAt,
    summary: rubric.humanSummary,
  };
}
