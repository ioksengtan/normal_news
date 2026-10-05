# 正常新聞抓取規範

抓取由助手執行，不在 GitHub Actions 排程，也不呼叫模型 API。科技版每天台北時間 07:00 抓一次。下面的規則在啟用任何來源之前都適用。

1. 所有請求使用固定的使用者代理字串：`normal-news-bot/0.2 (+https://github.com/ioksengtan/normal_news)`。科技版抓取用這一個字串。不偽裝成瀏覽器。
2. 任何抓取之前先讀該主機的 `/robots.txt`，包括新聞訂閱源本身。
3. 規則只看兩組：有 `normal-news-bot` 具名群組就用該群組，沒有就用 `*`；`*` 群組一律另外檢查。兩者任一禁止，就不抓。只針對訓練爬蟲（例如 GPTBot、ClaudeBot、anthropic-ai）的群組不適用。
4. robots.txt 回傳 401 或 403 視為全部禁止。其他 4xx 視為允許。5xx、逾時或連線失敗視為全部禁止。
5. 若網址被重新導向到另一個主機，必須先讀取新主機的 robots.txt，確認允許之後才向該主機抓取。
6. 抓取前先移除 `traffic_source`、`utm_*`、`at_medium`、`at_campaign`、`maca`，再用移除後的網址檢查 robots.txt 並抓取。重新導向後的網址也先移除這些參數。
7. 同一網域兩次請求至少間隔 5 秒。robots.txt 的 Crawl-delay 更大時，以 Crawl-delay 為準。
8. 收到 401、403 或 429 就記錄台北時間、網址與狀態碼，不換 User-Agent、不換 IP、不重試。
9. 不追蹤文章內的其他連結。原文只留在本地候選檔，不進公開 repo。
10. 啟用來源之前，由人閱讀該站 robots.txt 的註解與使用條款。註解或條款明確反對摘要、人工智慧處理、文字與資料探勘、抓取或自動收集時，該來源不得啟用。只有一般著作權聲明或範圍很寬的限制時，標記為不明確，由專案經理決定。

## 科技版候選來源（2026-09-30）

檢查時使用 `normal-news-bot/0.2 (+https://github.com/ioksengtan/normal_news)`。同一主機先讀 robots.txt，通過之後才讀其他網址。2026-09-30 17:54 與 17:59（台北時間）各查一次，結果相同。Lobsters 沒有通過。Product Hunt 的網頁同樣不抓；2026-10-05 起只走官方 API，條款見下方。

### Lobsters（lobste.rs）

- 時間：2026-09-30 17:54（台北時間）。`https://lobste.rs/robots.txt` 回傳 200。
- 沒有 `normal-news-bot` 群組。搜尋引擎群組（GoogleBot 等）允許多數路徑，但寫了 `Content-Signal: ai-input=no, ai-train=no, search=yes`。`User-agent: *` 是 `Disallow: /`，Crawl-delay 為 1 秒。註解要爬蟲照標準遵守 robots.txt。
- 本程式只看自己的群組（沒有就用 `*`）以及 `*`。`*` 禁止全站，因此 `https://lobste.rs/hottest.json` 與 `https://lobste.rs/rss` 都不能抓。
- `ai-input=no` 是明確反對把內容交給人工智慧處理。科技版摘要就是這種用途。
- 因為全站禁止，沒有再讀關於頁或使用條款。沒有實作 Lobsters 版。

### Product Hunt 網頁（www.producthunt.com）

- 同一時間。`https://www.producthunt.com/robots.txt` 回傳 403，內文是 Cloudflare 的阻擋頁。
- 依第 4 條，robots.txt 的 403 視為全部禁止。沒有改使用者代理字串，也沒有重試。
- 因此沒有讀 `/feed`，也沒有抓任何 Product Hunt 網頁。之後仍然不要抓 `producthunt.com` 的頁面。

### Product Hunt 官方 API（2026-10-05）

每日科技版改走官方 API v2，不抓網頁。請求是 `POST https://api.producthunt.com/v2/api/graphql`，標頭 `Authorization: Bearer`，權杖只讀執行當日助手的環境變數 `PRODUCT_HUNT_TOKEN`。權杖不寫進儲存庫，也不放進 GitHub Actions。沒有這個變數，或 API 回報錯誤時，當天略過 Product Hunt，仍然出 GitHub 與 Hacker News。

必須遵守的條款：

- API 僅供非商業使用。若報紙要放廣告或業配，須先寫信向 hello@producthunt.com 取得許可。
- 每一則都要連到該則的 Product Hunt 貼文頁（API 的 `url`），頁面上顯示來源標籤「Product Hunt」，並附一小行 `via Product Hunt`。
- 不刊出標語（tagline）或說明（description）的譯文。摘要由我們自己寫，保持中立。入庫時會核對摘要沒有照抄這兩個欄位。
- 只保存當天要刊出的幾則。不把整批 API 資料存進儲存庫。`data/tech/candidates.json` 可以當當天的工作檔，但該目錄已在 `.gitignore`，不要提交。
- 遵守回應裡的速率限制標頭（`X-Rate-Limit-*`、`Retry-After`）。遇到 429 或剩餘次數用盡時記下標頭，不重試、不再多打一次。
