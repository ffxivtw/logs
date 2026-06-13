# 「誰把我的 Log 上傳了？」上傳者排行榜 — 設計文件

日期：2026-06-12
狀態：已與使用者確認設計，待實作

## 目標

建立一個靜態網站，交叉比對 FFLogs TC（繁中服）log 的**上傳者**與 log 中出現的**玩家**：

1. **上傳者排行榜** — 誰上傳了最多 log。
2. **玩家搜尋** — 玩家查詢「誰把我的 Log 上傳了？」，列出每個上傳者與可驗證的 report 明細。

非官方社群工具，資料全部來自 FFLogs 公開報告。

## 已確認的決策

| 議題 | 決策 |
| --- | --- |
| 呈現方式 | 上傳者排行榜 + 玩家搜尋，兩者都要 |
| 資料來源 | 直接使用上游 repo `Kantai235/Final-Fantasy-XIV-Ranking-for-TC` 的 `data/rankings/*.reports/`，不自行呼叫 FFLogs API |
| 架構 | 純靜態網站：GitHub Actions 定時建置 → GitHub Pages，無後端 |
| 排行榜計分 | 多指標並列：report 數（預設排序）、不重複玩家數、戰鬥場次數，可點欄位切換排序 |
| 玩家頁明細層級 | 上傳者彙總 + 可展開的 report 明細（副本、時間、FFLogs 連結），不含 fight 級細節 |
| 索引範圍 | 只索引 TC 伺服器的玩家 |
| 前端技術棧 | Vue 3 + Vite（與上游一致） |
| 玩家識別 | `角色名@伺服器`（與上游 `character_key` 慣例一致），不處理轉服合併 |

## 整體架構與資料流

```
[上游] Kantai235/Final-Fantasy-XIV-Ranking-for-TC
         └─ data/rankings/*.reports/*.json  （~44k reports，含 owner + fights[].players[]）
                  │  GitHub Actions 定時 sparse clone（只取 data/rankings/）
                  ▼
[本專案] 建置管線 scripts/build_data.mjs（Node.js，離線執行）
         ├─ 掃描所有 reports
         ├─ 過濾：只取 TC 服玩家（player.server 屬於 TC 伺服器清單）
         ├─ 產出 public/data/uploaders.json          （排行榜，單檔）
         ├─ 產出 public/data/uploaders/<id>.json     （單一上傳者明細）
         ├─ 產出 public/data/players/<shard>.json    （玩家→上傳者索引，hash 分 256 片）
         ├─ 產出 public/data/players_index.json      （玩家 key 清單，供 autocomplete）
         └─ 產出 public/data/meta.json               （更新時間、統計總覽）
                  │
                  ▼
[前端] Vue 3 + Vite 靜態網站 → GitHub Pages（hash routing）
```

關鍵原則：

- 前端不呼叫任何 API；一切於 build 時算好成靜態 JSON。
- 上游資料約 476MB，CI 以 `git clone --depth 1 --filter=blob:none --sparse` 只抓 `data/rankings/`，用完即丟，不 commit 進本 repo。
- 本機開發時管線指向已 checkout 的 `Final-Fantasy-XIV-Ranking-for-TC/` 目錄，路徑可用環境變數覆寫。

## 上游資料結構（依實際資料確認）

每個 `*.reports/NNN.json` 是 `{report_code: report, ...}` 的 map，report 含：

- `owner`：`{id, name}` — 上傳者 FFLogs 帳號。
- `report_code`、`url`、`title`、`zone`、`report_start_time(_iso)`。
- `matched_traditional_chinese_servers`：該 report 是否含 TC 服玩家。
- `fights[]`：每場戰鬥含 `players[]`（`{name, server, job, ...}`）、`kill`、時間欄位。

## 建置管線

`scripts/build_data.mjs`，無外部相依（Node 內建模組）。

1. **取得上游資料**：CI sparse clone；本機用既有目錄。來源路徑由 `UPSTREAM_DATA_DIR` 環境變數覆寫，預設 `./Final-Fantasy-XIV-Ranking-for-TC/data/rankings`。
2. **掃描**：遍歷 `*.reports/*.json` 的每筆 report，取 owner、report 基本欄位、各 fight 的 players（不分 kill 與否，全部場次都算）。
3. **過濾 TC 玩家**：TC 伺服器清單從上游 config 抽出，硬編碼於本專案一個獨立模組，附註來源。`player.server` 在清單內才收錄。
4. **彙總**：
   - 每個 owner：report 數、不重複 TC 玩家集合、fight 總數、各副本 report 數。
   - 每個玩家（`名字@伺服器`）：出現過的 reports 按 owner 分組。
5. **去重**：同一 report 內同一玩家出現於多場 fight 只算一筆 report 關聯；fight_count 照實累計。同一 report 可能出現在多個 `.reports` 目錄（一筆 log 涵蓋多副本），以 report_code 全域去重，所屬副本記為 encounters 陣列。

### 輸出格式

`public/data/uploaders.json`（預期 < 1MB）：

```json
{
  "updated_at_iso": "...",
  "uploaders": [
    {
      "id": 866175,
      "name": "lanlan_TW",
      "report_count": 321,
      "unique_player_count": 540,
      "fight_count": 1893,
      "encounters": {"savage_m1s": 80}
    }
  ]
}
```

`public/data/players/<shard>.json` — shard 為 `角色名@伺服器` 的 SHA-1（UTF-8）前 2 hex 碼（256 片；用 Node 內建 `crypto`，前端用 Web Crypto 算同一值）：

```json
{
  "魚丸探長@鳳凰": {
    "uploaders": [
      {
        "id": 866175,
        "name": "lanlan_TW",
        "reports": [
          {"code": "xqLd...", "encounters": ["savage_m1s"], "time_iso": "...", "url": "https://www.fflogs.com/reports/xqLd..."}
        ]
      }
    ]
  }
}
```

`public/data/uploaders/<id>.json` — 只對有資料的上傳者產生：

```json
{
  "id": 866175,
  "name": "lanlan_TW",
  "report_count": 321,
  "fight_count": 1893,
  "encounters": {"savage_m1s": 80},
  "players": [
    {"key": "魚丸探長@鳳凰", "report_count": 12}
  ]
}
```

`public/data/players_index.json` — 所有玩家 key 的陣列（僅名字）。gzip 後預期數百 KB；若實測過大，降級為「輸入完整名字＋選伺服器」查詢，不做 autocomplete。

`public/data/meta.json` — 更新時間、report 總數、玩家總數、上傳者總數。

### 錯誤處理

- 單筆 report JSON 損壞：記 warning、跳過，不中斷 build。
- 上游 clone 失敗：CI fail，GitHub Pages 保留上一版部署。
- build 完跑資料契約檢查（必要欄位存在、計數 ≥ 0、分片可解析），異常即 fail。

## 前端

Vue 3 + Vite，執行期相依只有 `vue`。hash routing（免 SPA fallback）。

1. **首頁 `#/`** — 上傳者排行榜表格：名次、名稱、report 數、不重複玩家數、場次數；點欄位標頭切換排序；頂部玩家搜尋框。
2. **玩家頁 `#/player/<角色名@伺服器>`** — 依 report 數排序列出上傳者，每列可展開 report 明細（副本中文名、時間、FFLogs 連結，新分頁開啟）。查無此人顯示「找不到此玩家的公開紀錄」。
3. **上傳者頁 `#/uploader/<id>`** — 該上傳者統計與其上傳過的玩家清單。

搜尋框：載入 `players_index.json`，前端子字串比對，顯示前 10 筆候選。

介面語言：繁體中文（zh-TW）。

## CI / 部署

`.github/workflows/build-and-deploy.yml`：

- 觸發：排程每日 2 次（錯開上游更新時間）、手動 `workflow_dispatch`、push to main。
- 流程：sparse clone 上游 → `node scripts/build_data.mjs` → 資料契約檢查 → `vite build` → 部署 GitHub Pages。
- `public/data/` 為 CI 產物，不 commit 回 repo。

## 測試

- `scripts/test_build_data.mjs`（`node --test`）：以手寫 fixture（2-3 筆迷你 report）驗證——owner 統計正確、TC 過濾正確、同 report 去重正確、分片路由正確、損壞 JSON 被跳過。
- 資料契約檢查整合於 build 流程。
- 前端純展示層，不寫單元測試，本機 `npm run dev` 人工驗證。

## 範圍外（YAGNI）

- 不自行呼叫 FFLogs API、不申請 OAuth 憑證。
- 不處理轉服合併、不做角色改名追蹤。
- 不索引非 TC 服玩家。
- 不做 fight 級明細呈現。
- 不做後端、資料庫、使用者帳號系統。
