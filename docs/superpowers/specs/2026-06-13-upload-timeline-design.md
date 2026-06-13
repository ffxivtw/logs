# 上傳關係強化：月度時間軸、副本分布、排行榜截斷 — 設計文件

日期：2026-06-13
狀態：已與使用者確認設計，待實作
前置：`docs/superpowers/specs/2026-06-12-uploader-leaderboard-design.md`（已上線）

## 目標

把資料中與「誰把我的 Log 上傳了」直接相關、但尚未呈現的關聯補上：

1. 玩家頁 — 每月被上傳的 report 數長條圖、首次/最近被上傳日期、被上傳的副本分布。
2. 上傳者頁 — 每月上傳的 report 數長條圖。
3. 首頁 — 全站每月公開 report 數長條圖；排行榜預設前 100 名 + 顯示全部按鈕。

## 範圍決策（與使用者確認）

| 議題 | 決策 |
| --- | --- |
| 功能軸線 | 只做與「上傳關係」相關的；職業分布、常同場隊友（log 內容社交面）、kill 篩選（99.3% 皆 kill 無區分度）、guild（覆蓋率 0.9%）皆不做 |
| 月度統計來源 | build 時預算（方案 A）：玩家/上傳者/全站三層都在 `buildOutputs` 算好，前端零計算、單一資料來源 |
| Pagination | 只有首頁需要：前端截斷前 100 列 + 「顯示全部」按鈕。不做真分頁、不記狀態。上傳者頁（最多 ~431 列）與玩家頁不分頁 |
| 圖表 | inline SVG 長條圖自製元件，不引入圖表庫（資料量小、零相依、吃現有 design token） |

## 資料層變更

### buildOutputs（scripts/lib/aggregate.mjs）

月度鍵 = `time_iso` 前 7 碼（`YYYY-MM`）。`time_iso` 為 null 的 report 不計入 monthly（總數不受影響）。

1. **玩家分片** `players/<shard>.json` 每玩家新增 `monthly`：

   ```json
   { "魚丸探長@鳳凰": { "uploaders": [...], "monthly": { "2026-04": 3, "2026-05": 9 } } }
   ```

   計數單位 = 該玩家當月被收錄的 report 數（同 report 多 fight 仍算 1，沿用現有去重）。

2. **上傳者明細** `uploaders/<id>.json` 新增 `monthly`：該上傳者每月上傳的 report 數。

3. **meta.json** 新增 `monthly`：全站每月 report 總數（以去重後的 report 計）。

玩家頁「首次/最近被上傳」由前端取 `monthly` 鍵的 min/max，不另存欄位。

### validate_data.mjs

- 三層 `monthly` 的鍵符合 `/^\d{4}-\d{2}$/`，值為正整數。
- 每玩家 `monthly` 值總和 ≤ 該玩家所有 uploaders 的 reports 數總和（≤ 因 null time_iso 不計入月度）。
- meta.monthly 值總和 ≤ meta.report_count。

### 測試（scripts/build_data.test.mjs）

- fixture reports 已含不同日期：驗證玩家/上傳者/meta 三層 monthly 計數正確。
- 一筆 time_iso 為 null 的 report：總數計入、monthly 不計入。

## 前端變更

### 新元件 src/components/MonthlyBars.vue（唯一新元件，三處重用）

- Props：`monthly`（物件，可能為 undefined/空）、`label`（標題小字）。
- `monthly` 缺漏或為空 → 不渲染（`v-if` 於呼叫端或元件內 return）。
- X 軸：從最早月到**當前月**的連續月份序列，缺資料的月補 0（不可跳月）。超過 18 個月只顯示最近 18 個月，左端標「…」。
- Y 軸：自動取最大值。
- 長條色 `--gold`；每條帶原生 `<title>` tooltip（格式「2026-05 · 9 筆」）；軸標籤 `--mono` 小字，只標首月、尾月、最大值月。
- 尺寸：高約 72px，寬 100%（SVG viewBox 響應式）。靜態圖無動畫。

### 頁面

1. **PlayerPage**：summary 下方加 `MonthlyBars`（label「每月被上傳的 report 數」）與一行「首次被上傳 YYYY-MM · 最近 YYYY-MM」（monthly 為空則整段不顯示）。其下加「被上傳的副本分布」：前端由現有 `result.uploaders[].reports[].encounters` 彙總計數（同一 report 含多副本時每個副本各 +1），以 `.tag` 樣式顯示「副本中文名 ×N」，按次數降冪。
2. **UploaderPage**：summary 下方加 `MonthlyBars`（label「每月上傳的 report 數」）。
3. **HomePage**：hero 統計列下方加 `MonthlyBars`（label「全站每月公開 report 數」，資料 meta.monthly）。排行榜以 `displayLimit`（初始 100）截斷渲染，表格下方 `<button>`「顯示全部 N 位上傳者」→ 點擊後顯示全量並隱藏按鈕。純前端狀態，路由切換重置。

### 錯誤處理

- `monthly` 缺漏（舊資料快取、build 尚未更新）：元件不渲染，頁面其餘正常 —— 前後端版本不同步時優雅降級。
- 副本分布彙總在前端進行，資料來源是已載入的玩家 entry，無新請求、無新失敗模式。

## 相容性

新欄位皆為**加法**變更：舊前端讀新資料不受影響，新前端讀舊資料（無 monthly）走缺漏分支。部署順序無約束（同一次 CI 一起上線）。

## 範圍外（YAGNI）

- 職業分布、常同場隊友、kill/guild 維度。
- 圖表庫、互動式圖表（縮放、刷選）。
- 真分頁（URL 帶頁碼）、排行榜搜尋/篩選。
- 週/日粒度時間軸。
