import Parser from 'rss-parser';

// 直接用各媒體自己的 RSS，不透過 Google News：
// Google News 的文章連結現在要靠前端 JS 才能解析出真正的發布頁網址，
// 單純 fetch() 拿到的是 Google News 自己的 SPA 頁面，抓不到全文，整條擷取管線會失敗。
// 改抓各家媒體自己的 feed，連結直接指向發布頁，穩定得多。
// 每個 feed 用前都手動用 curl 驗證過會回傳非空的 <item>，之後想加新來源，
// 也請先確認一下，不然 fetchHeadlines() 會默默跳過整個來源（例如聯合新聞網的
// RSS endpoint 雖然回應 200，但每個 <item> 欄位都是空字串，已經先排除掉）。
const FEEDS = [
  { source: '自由時報', url: 'https://news.ltn.com.tw/rss/all.xml' },
  { source: '中央社', url: 'https://feeds.feedburner.com/rsscna/politics' },
  { source: 'Yahoo新聞', url: 'https://tw.news.yahoo.com/rss/politics' },
];

export async function fetchHeadlines(limitPerFeed = 10) {
  const parser = new Parser();
  const results = [];

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items.slice(0, limitPerFeed)) {
        if (!item.link) continue;
        results.push({
          title: item.title,
          link: item.link,
          source: feed.source,
          publishedAt: item.pubDate || null,
        });
      }
    } catch (err) {
      console.error(`RSS 讀取失敗（${feed.source}）：${err.message}`);
    }
  }

  return results;
}
