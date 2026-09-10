import Anthropic from '@anthropic-ai/sdk';

// Sonnet 判斷情緒/立場用語比 Haiku 準，這個任務的核心價值就在判斷準確度，
// 想省成本可以在 Actions 裡設 CLAUDE_MODEL=claude-haiku-4-5-20251001 覆蓋。
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

export async function neutralize({ systemPrompt, title, text }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `標題：${title}\n\n內文：\n${text}`,
      },
    ],
  });

  const raw = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM 回傳內容不是預期的 JSON 格式');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (typeof parsed.neutral_text !== 'string' || !Array.isArray(parsed.removed_spans)) {
    throw new Error('LLM 回傳的 JSON 缺少必要欄位（neutral_text / removed_spans）');
  }

  return parsed;
}
