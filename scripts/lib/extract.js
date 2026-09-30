import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { fetchText } from './http.js';

// 只在處理當下把原始頁面讀進記憶體、萃取可讀文字。
// 呼叫端寫進本地候選檔，不進 data/，也不要提交到公開 repo。
// 403 時不換 User-Agent、不換 IP。
export async function extractArticleText(url, { timeoutMs = 20000 } = {}) {
  let html;
  try {
    html = await fetchText(url, { timeoutMs });
  } catch (err) {
    throw new Error(`抓取頁面失敗：${err.message}`);
  }
  return extractFromHtml(html, url);
}

export function extractFromHtml(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent) {
    throw new Error('無法從頁面擷取可讀內文（可能是動態渲染頁面或付費牆）');
  }

  return {
    title: article.title || null,
    text: article.textContent.trim(),
  };
}
