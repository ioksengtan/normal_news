import fs from 'fs';
import path from 'path';

const RUBRIC_PATH = path.join(process.cwd(), 'rubric-spec.md');

// rubric-spec.md 是唯一來源：系統提示詞餵給 LLM，使用者可讀說明顯示在準則頁。
// 兩者從同一份檔案解析出來，避免準則頁宣稱的標準跟管線實際邏輯不同步。
export function loadRubric() {
  const raw = fs.readFileSync(RUBRIC_PATH, 'utf8');

  const versionMatch = raw.match(/version:\s*(\S+)/);
  const updatedMatch = raw.match(/updated:\s*(\S+)/);
  const systemMatch = raw.match(/## 系統提示詞[^\n]*\n([\s\S]*?)\n## 使用者可讀說明/);
  const summaryMatch = raw.match(/## 使用者可讀說明[^\n]*\n([\s\S]*)$/);

  if (!systemMatch || !summaryMatch) {
    throw new Error('rubric-spec.md 格式不正確：缺少 "## 系統提示詞" 或 "## 使用者可讀說明" 區塊');
  }

  return {
    version: versionMatch ? versionMatch[1] : '0.0.0',
    updatedAt: updatedMatch ? updatedMatch[1] : null,
    systemPrompt: systemMatch[1].trim(),
    humanSummary: summaryMatch[1].trim(),
  };
}
