import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { fetchText } from './http.js';

// 只在處理當下把原始頁面讀進記憶體、萃取可讀文字。
// 呼叫端寫進本地候選檔，不進 data/，也不要提交到公開 repo。
// 403 時不換 User-Agent、不換 IP。
export async function extractArticleText(url, { timeoutMs = 20000, fetchImpl } = {}) {
  const load = fetchImpl || fetchText;
  let html;
  try {
    html = await load(url, { timeoutMs });
  } catch (err) {
    throw new Error(`抓取頁面失敗：${err.message}`);
  }
  return extractFromHtml(html, url);
}

const VIDEO_EMBED_MARKER = '代码已经复制到剪贴板';

export function isVideoPage({ ogType = '', pageText = '', html = '' } = {}) {
  const type = String(ogType || '').trim().toLowerCase();
  if (type === 'video' || type.startsWith('video.')) return true;
  return String(pageText).includes(VIDEO_EMBED_MARKER) || String(html).includes(VIDEO_EMBED_MARKER);
}

export function extractFromHtml(html, url) {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  const ogType = document.querySelector('meta[property="og:type"], meta[name="og:type"]')?.getAttribute('content') || '';
  // Readability 會拿掉文末出處。標記要比對整頁文字，所以先留一份。
  const pageText = document.body?.textContent || '';
  const videoPage = isVideoPage({ ogType, pageText, html });
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.textContent) {
    if (videoPage) {
      return {
        title: document.title || null,
        text: '',
        pageText,
        ogType,
        videoPage,
      };
    }
    const error = new Error('無法從頁面擷取可讀內文（可能是動態渲染頁面或付費牆）');
    error.page = { pageText, ogType, videoPage };
    throw error;
  }

  return {
    title: article.title || null,
    text: article.textContent.trim(),
    pageText,
    ogType,
    videoPage,
  };
}
