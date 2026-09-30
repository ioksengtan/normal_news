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

同一事件才用 `same_as`。不確定用 `unsure`，不要併。摘要若和原文有超過 10 個連續相同字，ingest 會拒絕。不要輸出 `removed_spans` 或 `metric_spans`，公開資料不保存它們。

語言揭露句和「評論」標示由網站依 `source_language`、`article_type` 顯示，不要寫進摘要。

## 公開資料

`data/international.json` 是網站讀的國際版。每則有中性標題、中性摘要、語言、文章類型，以及來源連結。沒有原標題，沒有標記摘錄，沒有來源比率。範例文章不會寫進這個檔。

`npm run publish` 用 `GITHUB_TOKEN` 或 `gh auth token` 在 `main` 上建一個 commit。不要用 git push 發布資料。`--dry-run` 只列出會提交的檔案。
