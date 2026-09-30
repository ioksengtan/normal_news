# 科技版每日出刊

每天台北時間 07:00 出一刊。科技版在這個時間抓一次，當天不再改，像印好的報紙。重跑同一天會覆寫該期內容，刊號不變。

這個流程不呼叫模型。摘要由助手自己寫。不要把模型金鑰放進工作流程。

報紙順序是科技．GitHub、科技．Hacker News，然後國際版。GitHub 第一則是頭條。國際版讀 `data/international.json`，目前維持空陣列，頁面顯示「今日國際版尚無新聞」。科技版這份步驟不填國際版。

## 每天執行的指令

在儲存庫根目錄：

```bash
node scripts/fetch-tech.js
```

這會寫出 `data/tech/candidates.json`。GitHub 先解析 https://github.com/trending?since=daily ，失敗或少於 10 則時改走搜尋介面（過去 7 天新建、依星數排序），並在候選檔標記備援。Hacker News 讀官方的 `topstories.json` 與 `item/{id}.json`。過去 3 期出現過的 GitHub 專案、前一期出現過的 Hacker News 討論、以及徵才貼文會自動跳過。

若備援搜尋遇到未登入的每小時次數上限，用 GitHub CLI 的權杖再抓一次。在 GitHub Actions 裡則帶工作流程內建的 `GITHUB_TOKEN`：

```bash
GITHUB_TOKEN="$(gh auth token)" node scripts/fetch-tech.js
```

接著依候選檔寫 `data/tech/summaries.json`，再入庫：

```bash
node scripts/ingest-tech.js
git add data/issues
git commit -m "issue: YYYY-MM-DD 科技版"
git push
```

把 `YYYY-MM-DD` 換成候選檔裡的 `date`。某一版抓取失敗時仍然執行入庫，該版會顯示「今日未能取得」，其他版照常出刊。

## 摘要規則

用平實、可查證的中文，只寫候選資料裡已經有的事實。不要情緒用語，不要評價好壞，不要加上原文沒有的推論。

- GitHub：一到兩句，依專案描述與說明文件開頭。專案名稱保留原文。
- Hacker News：中文標題另寫，原文標題保留。摘要兩到三句，摘要所連結的文章。沒有連結的「問 Hacker News」就摘要貼文本身。

摘要檔格式：

```json
{
  "date": "2026-09-30",
  "github": {
    "owner/repo": "一到兩句中文。"
  },
  "hackernews": {
    "12345": {
      "titleZh": "中文標題",
      "summary": "兩到三句中文。"
    }
  }
}
```

`date` 必須和候選檔相同。正式出刊不要使用 `--allow-placeholders`。預覽用的占位字樣是「【占位摘要」和「【待譯」。

國際版以後寫進 `data/international.json`。`events` 每一則有 `id`、`title`、`summary`、`neutralText`、`updatedAt`，以及 `sources`（`name`、`url`、`publishedAt`）。頁面依過去 24 小時的來源數取前 12 則，第一則當頭條；只有一家來源的事件用來補滿 12 則。前一期已刊出、且這期沒有新報導的事件會跳過。
