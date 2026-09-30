# 正常新聞

把新聞拆成「可查證事實」與「情緒/立場用語」，只留下中性改寫版本，並公開紀錄每次移除了什麼、依據什麼準則。

## 架構

- **來源**：直接抓自由時報、中央社、Yahoo新聞自己的 RSS feed（見 `scripts/lib/rss.js` 的 `FEEDS`），
  不透過 Google News（它的文章連結要靠前端 JS 才能解析出真正網址，單純 fetch 抓不到全文），也不即時爬 PTT。
- **排程與處理**：GitHub Actions 排程 workflow（`.github/workflows/process-news.yml`），每 30 分鐘抓新文章、
  呼叫 Claude API 做去偏見改寫，結果寫成 `data/*.json` 並 commit 回 repo。
- **資料**：沒有資料庫，全部是靜態 JSON 檔（`data/articles.json`、`data/source_stats.json`、`data/criteria.json`）。
- **前端**：純 HTML/CSS/JS，GitHub Pages 直接讀 `data/` 底下的 JSON 渲染，沒有建置流程。
- **準則單一來源**：`rubric-spec.md` 同時是 LLM 的 system prompt 與準則頁顯示的文字，改判斷邏輯時兩邊一起改。

## 設定步驟

1. 安裝依賴：

   ```bash
   npm install
   ```

2. 在 GitHub repo 設定一個 secret：`Settings → Secrets and variables → Actions → New repository secret`，
   名稱 `ANTHROPIC_API_KEY`，值是你的 Anthropic API key。**不要把金鑰寫進任何檔案或 commit 進 repo。**

3. 啟用 GitHub Pages：`Settings → Pages → Source` 選 `Deploy from a branch`，branch 選 `main`，資料夾選 `/ (root)`。

4. 先手動跑一次排程驗證：到 `Actions` 頁籤找到「處理新聞（去偏見管線）」，點 `Run workflow` 手動觸發，
   確認能成功抓 RSS、呼叫 Claude、commit 資料回來。之後就會照 cron 排程自動跑。

## 本機測試處理腳本

```bash
ANTHROPIC_API_KEY=sk-xxx npm run process
```

會更新 `data/` 底下三個檔案。想調整每次處理幾篇、用哪個模型，可以加環境變數：

```bash
MAX_PER_RUN=3 CLAUDE_MODEL=claude-haiku-4-5-20251001 ANTHROPIC_API_KEY=sk-xxx npm run process
```

## 已知限制

- **GitHub Actions cron 不保證準點**，常見延遲數分鐘到十幾分鐘，不適合需要「即時」更新的場景。
- **資料用 git commit 方式寫回**，repo 歷史會一直長大。目前 `data/articles.json` 只保留最近 300 篇，
  但 git 歷史仍會累積；資料量大了之後可以考慮改用獨立的 `data` 分支，或定期 squash 歷史。
- 若目標網站有付費牆或內容是動態渲染（非伺服器端輸出的 HTML），`scripts/lib/extract.js` 可能抓不到全文，
  該篇會被跳過並在 Actions log 留下錯誤訊息，不會讓整個排程失敗。
- 目前只設定 3 個 RSS 來源（`scripts/lib/rss.js` 的 `FEEDS`），想擴充媒體多樣性可以直接加陣列項目，
  但要先手動用 curl 確認該 feed 真的回傳非空的 `<item>`（實測過聯合新聞網的 RSS endpoint 雖然 HTTP 200，
  內容卻全是空字串），也要確認連結是指向真正發布頁而不是另一層轉址，不然會被 `extractArticleText` 擋下來。
- 來源排行榜用「情緒密度比率」（被標記字數 ÷ 全文字數）排序，不是處理篇數，避免發文量大的來源被誤判為最偏頗。
