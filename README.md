# 正常新聞

公開頁面只顯示我們自己寫的中性標題與摘要，以及「媒體名稱　閱讀原文」連結。不顯示原標題，不刊出被標記的原文，也不做來源排行。

首頁是一份報紙，版面由 `data/sections.json` 決定：科技．GitHub、科技．Hacker News，然後國際版。Lobsters 與 Product Hunt 依抓取規範不收錄，見 [docs/crawling-policy.md](docs/crawling-policy.md)。科技版沒有模型金鑰，步驟見 [docs/assistant-runbook-tech.md](docs/assistant-runbook-tech.md)。國際版每天台北時間 06:48 由助手跑一輪，步驟見 [docs/assistant-runbook.md](docs/assistant-runbook.md)。抓取規範見 [docs/crawling-policy.md](docs/crawling-policy.md)。

## 國際版來源

`config/sources.json` 目前啟用四個來源：

- 亞洲新聞台（不收 business、commentary、華爾街等行情稿，以及法新社與美聯社供稿）
- 美國之音中文（不收影片頁與美聯社等第三方通訊社供稿）
- 巴西通訊社英文版
- Asia Pacific Report（只收原創；授權 CC BY-NC-SA 4.0，摘要下顯示授權與出處）

德國之聲停用，因為 robots.txt 的註解禁止未經書面許可以自動化方式探勘或抓取內容。英國廣播公司中文網停用，因為 robots.txt 的註解反對以人工智慧摘要其內容。半島電視台停用，因為使用條款禁止爬蟲與文字探勘。日本時報與韓國先驅報在設定裡但停用。不收台灣國內新聞。每天每個來源最多 6 篇，整輪最多 30 篇。

國際版與科技版抓取都使用 `normal-news-bot/0.2 (+https://github.com/ioksengtan/normal_news)`。抓取前先讀 robots.txt。只遵守 `normal-news-bot` 與 `*` 的規則。訓練爬蟲的規則不適用。robots.txt 回傳 401 或 403 視為全部禁止。重新導向到新主機時，先檢查該主機的 robots.txt。內容請求若收到 403，不換 User-Agent、不換 IP。啟用來源前會由人閱讀 robots.txt 註解與使用條款，明確反對就停用。

## 資料

- `data/international.json`：網站讀的國際版。每則有中性標題、中性摘要、原文語言、文章類型與來源連結。
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
