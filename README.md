# 正常新聞

公開頁面只顯示我們自己寫的中文標題與摘要，以及原文連結。不顯示被標記的原文。

首頁是一份報紙，只有一個科技版。有 Product Hunt 的一天是 15 則：GitHub trending 5 則、Hacker News 5 則、Product Hunt 5 則，合在同一份清單，每則帶來源標籤。Product Hunt 當天略過時，該期是 10 則。頭條是 GitHub 當日第一名，其餘依來源名次交錯排列。Lobsters 依抓取規範不收錄；Product Hunt 只走官方 API，見 [docs/crawling-policy.md](docs/crawling-policy.md)。科技版沒有模型金鑰，步驟見 [docs/assistant-runbook-tech.md](docs/assistant-runbook-tech.md)。

科技版抓取使用 `normal-news-bot/0.2 (+https://github.com/ioksengtan/normal_news)`。抓取前先讀 robots.txt。只遵守 `normal-news-bot` 與 `*` 的規則。訓練爬蟲的規則不適用。robots.txt 回傳 401 或 403 視為全部禁止。重新導向到新主機時，先檢查該主機的 robots.txt。內容請求若收到 403，不換 User-Agent、不換 IP。啟用來源前會由人閱讀 robots.txt 註解與使用條款，明確反對就停用。

## 資料

- `data/issues/`：網站讀的科技版。每一期一個 `YYYY-MM-DD.json`，`index.json` 列出日期與刊號。首頁預設最新一期，`?date=YYYY-MM-DD` 打開過刊。
- `data/sections.json`：版名，以及 GitHub、Hacker News、Product Hunt 各自的每日則數。
- Product Hunt 權杖是執行當日抓取的機器上的環境變數 `PRODUCT_HUNT_TOKEN`，不提交、也不放進 GitHub Actions。

GitHub Actions 只在 push 與 pull request 時跑測試與資料檢查，沒有排程，也不呼叫模型。

## 跑一天的科技版

```bash
npm install
node scripts/fetch-tech.js
node scripts/ingest-tech.js
```

摘要由助手寫進 `data/tech/summaries.json`，格式見科技版步驟。出刊時把 `data/issues`、`data/diagrams`、`data/humor` 提交進 git。
