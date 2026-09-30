# 助手每天 06:48 的國際版流程

時區是台北時間。這一步每天做一次，不在 GitHub Actions 排程，也不呼叫模型 API。科技版仍照 [assistant-runbook-tech.md](assistant-runbook-tech.md) 另走。

抓取規範見 [crawling-policy.md](crawling-policy.md)。

在 repo 根目錄：

```bash
npm install
npm run fetch
# 依 rubric-spec.md 的系統提示詞，為 tmp/candidates.json 寫 tmp/rewrites.json
npm run ingest -- --candidates tmp/candidates.json --rewrites tmp/rewrites.json
npm run publish
```

`tmp/candidates.json` 含原文，已在 `.gitignore`。不要提交。

## 來源

啟用中的只有這四個，都在 `config/sources.json`：

| id | 來源 | 篩選 |
| --- | --- | --- |
| `bbc-chinese-trad` | 英國廣播公司中文網 | 無 |
| `dw-chinese` | 德國之聲 | 超過 3 天的項目不收 |
| `al-jazeera` | 半島電視台 | 去掉追蹤參數，網址含 `/liveblog/` 的不收 |
| `channel-news-asia` | 亞洲新聞台 | 分類含 business 或 commentary 的不收 |

日本時報與韓國先驅報在設定裡，`enabled` 為 false，等書面許可。不要把台灣媒體加回來。

每個來源預設最多 2 篇，整輪最多 8 篇。已在 `data/articles.json` 的連結會跳過。抓取前先查 robots.txt。單一來原始失敗或被擋下只警告；全部啟用中的來源都沒成功時，結束碼是 1。

## 改寫 JSON

每一篇：

```json
{
  "id": "與候選相同的 id",
  "section": "國際版",
  "source_language": "繁體中文",
  "article_type": "新聞報導",
  "neutral_title": "自己寫的標題，30 字以內",
  "neutral_summary": "150 到 300 字的中性摘要",
  "balance_notes": [],
  "event": { "decision": "new", "summary": "事件短述" }
}
```

`source_language` 只能是 `繁體中文`、`簡體中文`、`英文`。`article_type` 只能是 `新聞報導`、`評論`、`新聞稿`、`其他`。

摘要若和原文有超過 10 個連續相同字，ingest 會拒絕。語言揭露句和「評論」標示由網站依 `source_language`、`article_type` 顯示，不要寫進摘要。

### 事件

改寫時同時寫事件短述，並決定要不要併入既有事件。先看 `data/events.json` 裡過去 36 小時更新過的事件。

- 新事件：`{ "decision": "new", "summary": "200 字以內的事件短述" }`。可以加 `event_id`（`evt_` 開頭）。省略時用這篇文章的 id 產生。
- 同一件事：`{ "decision": "same_as", "same_as": "evt_既有編號" }`。也可以把 decision 寫成 `same event as existing event evt_既有編號`。
- 拿不準就不合併。用 `{ "decision": "unsure", "summary": "事件短述" }`，不要填 `same_as`。分成兩則的代價只是多讀一則；把兩件不同的事合成一則會讀錯。

合併後，卡片和文章頁只顯示一篇代表內文：中性摘要最長的那篇。其他來源只留名稱和原文連結。代表文章由 ingest 決定，瀏覽器不算。

`removed_spans` 與 `bias_ratio` 可以不寫。若要留給內容長檢查改寫品質，`removed_spans` 的每一項要有 `original`（必須是原文裡的片段）和 `category`，`bias_ratio` 是 0 到 1。它們只寫進 `data/articles.json`。`data/source_stats.json` 繼續計算來源統計。網站不顯示被移除片段、分類、情緒密度，也不連結來源統計。

## 公開資料

瀏覽器只讀結果，不讀 `articles.json`。

- `data/home.json`：最新 30 個事件的標題、摘要（中性內文截到約 120 字）、更新時間、來源名稱。小於 300 KB。範例文章不會出現。
- `data/home-more.json`：第 31 則以後，同樣只有標題與摘要。首頁的「載入更多」才下載。
- `data/international/events/<事件 id>.json`：點進文章才下載的全文，含來源原文連結。
- `data/events.json`：事件 id、事件短述、代表文章、成員文章。
- `data/articles.json`：每篇文章的中性標題與摘要，以及可選的 `removedSpans`、`biasRatio`。
- `data/source_stats.json`：來源統計。未滿 20 篇不排名。
- `data/international.json`：給舊的報紙組版用的國際版清單。首頁不下載這個檔。

`npm run publish` 用 `GITHUB_TOKEN` 或 `gh auth token` 在 `main` 上建一個 commit。不要用 git push 發布資料。`--dry-run` 只列出會提交的檔案。
