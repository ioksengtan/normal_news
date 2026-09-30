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

啟用中的來源在 `config/sources.json`：

| id | 來源 | 篩選 |
| --- | --- | --- |
| `channel-news-asia` | 亞洲新聞台 | 分類含 business 或 commentary 的不收；標題或摘要含 Wall Street、stocks、oil prices、bond yields 的行情稿不收；署名、來源標記，或頁面末段的 Source: AFP、Source: AP、Source: Reuters 不收。條款不明確，仍依決定維持啟用 |
| `voa-chinese` | 美國之音中文 | 簡體中文。網址含 `/video/`、分類為 video、og:type 為 video，或頁面含「代码已经复制到剪贴板」的不收；美聯社、法新社、路透等第三方通訊社供稿不收，含頁面末段的 Source: AFP、Source: AP、Source: Reuters |
| `agencia-brasil` | 巴西通訊社 | 英文版。注明出處即可轉載 |
| `asiapacific-report` | Asia Pacific Report | 只收原創。分類或標記為 RNZ、Radio New Zealand，或頁面末段出現 Republished from、Republished by 的轉載不收。授權為 CC BY-NC-SA 4.0，摘要下顯示授權與出處 |

每個來源的 `fundingNote` 寫出資與所有權，準則頁會顯示啟用中來源的這段文字。Asia Pacific Report 的 `license` 是 `CC BY-NC-SA 4.0`。

德國之聲已停用：robots.txt 的註解禁止未經書面許可以自動化方式探勘或抓取內容。英國廣播公司中文網已停用：robots.txt 的註解反對以人工智慧摘要其內容。半島電視台已停用：使用條款禁止爬蟲與文字探勘。日本時報與韓國先驅報在設定裡，`enabled` 為 false，等書面許可。不要把台灣媒體加回來，也不要重新啟用已表明反對的來源。Daily Maverick 與國際新聞社條款不明確，不要加入。

每個來源預設最多 6 篇，整輪最多 30 篇，數字在設定檔的 `perSource` 與 `total`。頁面末段命中排除標記，或美國之音被判為影片頁時，該篇不收，也不佔這個名額。已在 `data/articles.json` 的連結會跳過。抓取前先查 robots.txt。單一來原始失敗或被擋下只警告；全部啟用中的來源都沒成功時，結束碼是 1。

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
