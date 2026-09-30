# 正常新聞

首頁只顯示中性改寫：標題、摘要、來源名稱與時間。點進文章才載入全文，底部有原文連結。被移除片段、分類、情緒密度與來源統計留在資料檔，頁面上不顯示、也不連結。

科技版資料仍由另一套流程產生，步驟見 [docs/assistant-runbook-tech.md](docs/assistant-runbook-tech.md)。國際版每天台北時間 06:48 由助手跑一輪，步驟見 [docs/assistant-runbook.md](docs/assistant-runbook.md)。抓取規範見 [docs/crawling-policy.md](docs/crawling-policy.md)。

## 國際版來源

`config/sources.json` 目前啟用四個來源：

- 英國廣播公司中文網（繁體）
- 德國之聲（超過 3 天的項目不收）
- 半島電視台英文網（先去掉 `traffic_source` 等追蹤參數，不收 `/liveblog/`）
- 亞洲新聞台（不收 business 與 commentary）

日本時報與韓國先驅報在設定裡但停用。不收台灣國內新聞。

抓取前先讀 robots.txt。只遵守 `normal-news-bot` 與 `*` 的規則。訓練爬蟲的規則不適用。403 不換 User-Agent、不換 IP。

## 資料

- `data/home.json`：首頁最新 30 個事件的標題與摘要，小於 300 KB。
- `data/home-more.json`：「載入更多」用的其餘事件，同樣只有標題與摘要。
- `data/international/events/`：文章頁才下載的全文。
- `data/events.json`：事件 id、代表文章、成員文章。
- `data/articles.json` 與 `data/source_stats.json`：內容長檢查用，網站不讀。
- `data/criteria.json`：準則頁文字，來自 `rubric-spec.md` 的使用者可讀說明。
- 原文只留在本地 `tmp/candidates.json`，不進公開 repo。

GitHub Actions 只在 push 與 pull request 時跑測試與資料檢查，沒有排程，也不呼叫模型。

## 跑一天的國際版

```bash
npm install
npm run fetch
npm run ingest -- --candidates tmp/candidates.json --rewrites tmp/rewrites.json
npm run publish
```

`npm run publish` 用 `gh auth token` 或 `GITHUB_TOKEN` 在 `main` 上建一個 commit。
