# 被上傳角色排行榜 — 設計文件

日期：2026-06-13
狀態：已與使用者確認設計，待實作
前置：`docs/superpowers/specs/2026-06-12-uploader-leaderboard-design.md`、`docs/superpowers/specs/2026-06-13-upload-timeline-design.md`（皆已上線）

## 目標

在現有「上傳者排行榜」之外，新增對稱的「被上傳角色排行榜」：列出公開報告中最常被收錄的繁中服角色，回答「哪些角色的 log 最常被上傳、被最多人上傳」。與既有的玩家搜尋並存——搜尋是「找特定人」，排行榜是「總覽」。

## 已確認的決策

| 議題 | 決策 |
| --- | --- |
| 排序指標 | 多指標並列：被收錄 report 數（預設排序）、不重複上傳者數，可點欄位切換，與上傳者榜對稱 |
| 入口/導覽 | 首頁雙分頁 tab：`#/` 上傳者榜、`#/players` 角色榜，共用 hero 與全站時間軸 |
| 分頁 | 沿用「前 100 + 顯示全部」截斷 |
| 伺服器篩選 | 加：角色榜上方伺服器按鈕列（全部 + 7 繁中服），前端篩選 |
| 資料層 | 合併 `players_index.json` → 新 `players_ranking.json`（排序陣列含統計），搜尋與榜單共用，廢棄舊檔 |

## 資料層

### 新輸出 players_ranking.json（取代 players_index.json）

```json
{
  "updated_at_iso": "...",
  "players": [
    { "key": "老鴿@伊弗利特", "reports": 380, "uploaders": 146 },
    { "key": "Lavid@鳳凰", "reports": 264, "uploaders": 89 }
  ]
}
```

- `reports` = 該玩家被收錄的 report 數（= 各上傳者 reports 數總和；一筆 report 一個 owner，玩家在單筆 report 出現一次，故無重複）。
- `uploaders` = 上傳過含此玩家 log 的不重複上傳者數（= 玩家 entry 的 uploaders 陣列長度）。
- 陣列按 `reports` 降冪、平手時 `key` 字典序（決定性輸出）。
- 估計大小 ~400KB（gzip 後更小），僅在開角色榜或首次 focus 搜尋時載入。

### buildOutputs（scripts/lib/aggregate.mjs）

玩家迴圈中，每個玩家已彙總出 uploaderList，可直接算 `reports`（各 uploader reports 數總和）與 `uploaders`（uploaderList.length），收集成陣列後排序，作為新回傳欄位 `playersRanking`。`build_data.mjs` 將其寫成 `players_ranking.json`，不再輸出 `players_index.json`。

### validate_data.mjs

把既有的 `players_index.json` 檢查改為 `players_ranking.json`：
- 頂層含 `players` 陣列；長度 = `meta.player_count`。
- 按 `reports` 降冪（逐項檢查不遞增）。
- 每筆 `reports`/`uploaders` 為正整數、`key` 含 `@`。

`meta.player_count` 不變。

### 測試（scripts/build_data.test.mjs）

沿用既有 fixture，新增測試：`buildOutputs` 的 `playersRanking` 按 reports 降冪（平手 key 字典序）、每筆 `{key, reports, uploaders}` 值正確。

## 前端

### 路由（src/lib/router.js）

新增 `#/players` → `{ name: 'players' }`。與既有 `#/player/<key>`（單數＝玩家詳情頁）區分；`players` 無斜線，不與 `player/` 前綴衝突。

### App.vue

`home` 與 `players` 兩個 route 都交給 `HomePage`，以 prop 指定 active tab：

```
<PlayerPage   v-if="route.name === 'player'" :key="route.key" :player-key="route.key" />
<UploaderPage v-else-if="route.name === 'uploader'" :key="route.id" :uploader-id="route.id" />
<HomePage v-else :active="route.name === 'players' ? 'players' : 'uploaders'" />
```

### 元件拆分

- **HomePage.vue**（殼）：hero（meta 統計 + 全站 MonthlyBars）＋ tab 列（連結 `#/` 上傳者榜、`#/players` 角色榜，active 高亮）＋ 依 `active` 用 `v-if` 顯示 `UploaderTable` 或 `PlayerRankingTable`。載入 meta（給 hero）。
- **UploaderTable.vue**（從現有 HomePage 表格邏輯抽出）：fetch `uploaders.json`，欄位排序、前 100 截斷、顯示全部、parse 色階名次、連 `#/uploader/<id>`。行為與現狀一致。
- **PlayerRankingTable.vue**（新）：fetch `players_ranking.json`。
  - 伺服器篩選按鈕列：`['全部','伊弗利特','迦樓羅','利維坦','鳳凰','奧汀','巴哈姆特','泰坦']`（固定順序硬編），active 高亮。
  - 排序欄位：被收錄 report 數（預設）、不重複上傳者數，可點切換。
  - 處理順序：依 server 篩選 → 依 sortKey 降冪排序 → 截斷前 100。
  - parse 色階百分位以「篩選後清單」的 index/length 計算。
  - 顯示全部按鈕（篩選後超過 100 時出現）。
  - 每列 `角色名@伺服器` 連 `#/player/<encodeURIComponent(key)>`。
  - 伺服器從 `key.split('@')[1]` 取得（角色名不含 `@`）。

### SearchBox.vue

資料源 `players_index.json` → `players_ranking.json`，候選清單取 `data.players.map(p => p.key)`，子字串比對與導向不變。

### 樣式（src/styles.css）

新增 `.tabs`（tab 列）與 `.filters`（伺服器按鈕列）樣式，沿用既有 token；active 用 `--gold`。

## 錯誤處理

- `players_ranking.json` 載入失敗 → `PlayerRankingTable` 顯示 `.state-msg` 錯誤訊息；搜尋框沿用 `catch(() => [])` 降級為空清單。
- 某伺服器篩選後無資料 → 空表，篩選列可切回「全部」。

## 相容性

`players_index.json` → `players_ranking.json` 為破壞性改名，但前後端於同一次 CI 一起上線，無並存問題；部署後使用者重載即取得新檔。

## 範圍外（YAGNI）

- 角色榜的月度時間軸（玩家個人頁已有「被上傳時間軸」）。
- 職業 / 副本維度的榜（與「被上傳」軸線無關）。
- 真分頁、URL 帶頁碼/伺服器/排序狀態。
- 角色榜列內嵌迷你圖。
