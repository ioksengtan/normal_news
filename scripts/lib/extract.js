import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// 只在處理當下把原始頁面讀進記憶體、萃取可讀文字，
// 呼叫端用完即丟，不寫進 data/ 也不進 git，避免整篇原文被落地保存。
export async function extractArticleText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; normal-news-bot/0.1)' },
  });
  if (!res.ok) {
    throw new Error(`抓取頁面失敗：HTTP ${res.status}`);
  }

  const html = await res.text();
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
