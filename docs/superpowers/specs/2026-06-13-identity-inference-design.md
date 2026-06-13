# 上傳者身份推測（本人可能性）— 設計文件

日期：2026-06-13
狀態：已與使用者確認設計，待實作
前置：`docs/superpowers/specs/2026-06-12-uploader-leaderboard-design.md`、`2026-06-13-upload-timeline-design.md`、`2026-06-13-player-leaderboard-design.md`（皆已上線）

## 目標

用公開資料推測「FFLogs 上傳帳號背後是哪個遊戲角色」，雙向呈現：

1. **正向（上傳者頁）**：推測這個上傳帳號本人是哪個角色 + 本人可能性分級。
2. **反向（玩家頁）**：上傳過此角色的帳號中，哪個最可能就是本人，可按可能性排名。

本質是用 FFLogs 公開報告做「上傳帳號 ↔ 遊戲角色」的去匿名化推測，是本站「誰把我的 log 上傳了」主題的延伸。資料全部公開（上傳者名、角色名、報告皆公開）。

## 推測原理

人們上傳的是自己參與的戰鬥，所以上傳者本人的角色會出現在他絕大多數上傳裡。資料驗證（總上傳 ≥ 5 的 1450 位上傳者）：出現率最高的角色佔比中位數 0.95，928 位 ≥ 90%。

**核心指標（正反向共用）**：

```
信心佔比 r = 該角色出現的 report 數 ÷ 該上傳帳號的總上傳數
```

意義是「這個角色出現在這個帳號的百分之幾的上傳裡」。正向是固定帳號找 r 最高的角色；反向是固定角色比較各帳號的 r。同一個量，對稱。

## 已確認的決策

| 議題 | 決策 |
| --- | --- |
| 正向呈現 | 只在上傳者頁顯示「推測本人角色 + 分級」 |
| 反向呈現 | 玩家頁每個上傳者卡片加分級；可切換「上傳筆數 / 本人可能性」排序；最高且樣本足者標★ |
| 信心呈現 | **不顯示精確 %**，折成 5 級信號強度點（●●●●○），深=可能性高 |
| 樣本處理 | 帳號總上傳 < 5 為「樣本少」，徽章灰化並加註，避免小樣本假象 |
| 措辭 | 全程「推測 / 可能 / 像」，不用「確定 / 就是」 |

## 5 級分級規則

佔比 `r` → 信號點與等級文字：

| filled（亮點數） | 信號 | 等級文字 | 佔比 |
| --- | --- | --- | --- |
| 5 | ●●●●● | 極可能本人 | r ≥ 0.90 |
| 4 | ●●●●○ | 很可能 | 0.75 ≤ r < 0.90 |
| 3 | ●●●○○ | 可能 | 0.50 ≤ r < 0.75 |
| 2 | ●●○○○ | 不太像 | 0.30 ≤ r < 0.50 |
| 1 | ●○○○○ | 不像 | r < 0.30 |

**低樣本**：`ownerTotal < 5` → `lowSample = true`，徽章灰化 + 加註「樣本少」，filled 仍依 r 計算（只是視覺降權）。

## 資料層

### 玩家分片 players/<shard>.json 新增 owner_total

反向推測需要「每個上傳此玩家的帳號的總上傳數」，目前玩家分片的 `entry.uploaders[i]` 只有 `{id, name, reports:[...]}`（`reports.length` = 該帳號傳此玩家幾筆），缺帳號總上傳數。新增欄位：

```json
{
  "魚丸探長@鳳凰": {
    "uploaders": [
      { "id": 866175, "name": "lanlan_TW", "owner_total": 50, "reports": [ ... ] }
    ],
    "monthly": { ... }
  }
}
```

`owner_total` = 該 owner 的總上傳 report 數（= `uploaders.json` 中該 id 的 `report_count`）。反向信心 = `reports.length / owner_total`。

`buildOutputs` 在建玩家分片的 uploaderList 時，從 aggregate 的 uploaders map 取 `uploaders.get(pu.id).report_count` 填入 `owner_total`（資料現成，只是搬入分片）。

正向（上傳者頁）**不需改資料層**：`uploaders/<id>.json` 已有 `report_count`（總上傳）與 `players[0]`（出現最多的角色，已降冪），正向信心 = `players[0].report_count / report_count`，前端直接算。

### validate_data.mjs

玩家分片每個 uploader 條目新增檢查：`owner_total` 為正整數，且 `owner_total >= reports.length`（傳某玩家的筆數不可能超過帳號總上傳數）。

### 測試（scripts/build_data.test.mjs）

沿用既有 fixture：驗證玩家分片 uploader 條目含正確 `owner_total`（= 該 owner 的 report_count）。

## 前端

### 共用函式 src/lib/identity.js

```
identityLevel(charReports, ownerTotal) → { filled, label, lowSample, sample }
```

- `filled`：1–5（依上表佔比分界）。
- `label`：等級文字（極可能本人 / 很可能 / 可能 / 不太像 / 不像）。
- `lowSample`：`ownerTotal < 5`。
- `sample`：分母字串，如 `"48/50"`（`${charReports}/${ownerTotal}`）。
- `ownerTotal <= 0` 視為無效，回傳最低級且 lowSample=true（防呆）。

純函式，正反向共用，單一真相來源。

### 信號徽章元件 src/components/IdentityBadge.vue

props：`charReports`、`ownerTotal`。呼叫 `identityLevel`，渲染 5 個圓點（filled 個亮、其餘暗）+ 等級文字 + 分母；`lowSample` 時整體套用灰化 class 並加「樣本少」。

### 上傳者頁 UploaderPage.vue（正向）

summary 下方加「推測本人」區塊：

> 推測本人角色 [`魚丸探長@鳳凰`] ●●●●● 極可能本人 · 48/50

- 角色名連到 `#/player/<key>`。
- 用 `players[0]` 與 `report_count` 算；`players` 為空（無 TC 玩家）時不顯示此區塊。

### 玩家頁 PlayerPage.vue（反向）

- 每個上傳者卡片標題加 `IdentityBadge`（用 `u.reports.length` 與 `u.owner_total`）。
- **排序切換**：預設「上傳筆數」降冪（既有行為），可切「本人可能性」降冪（依 `reports.length / owner_total`，平手時筆數多者在前）。一組小按鈕。
- 信心最高且樣本足（`owner_total >= 5`）的帳號，標「★ 最可能是本人」（只標一個；若全為低樣本則不標）。

### 樣式（src/styles.css）

新增 `.idbadge`（圓點 + 文字 + 分母排版）、亮/暗點、`.idbadge.low`（灰化）、`.id-star`（★ 徽章）、玩家頁排序切換沿用既有 `.filters`。

## 錯誤處理

- 舊資料（玩家分片無 `owner_total`，部署時序差）：呼叫端 `v-if="u.owner_total"` 不渲染徽章（玩家頁其餘正常）。
- 上傳者 `players` 空 → 上傳者頁不顯示推測區塊。

## 相容性

`owner_total` 為玩家分片的**加法**欄位；正向不動資料。前後端同一次 CI 一起上線。舊前端讀新分片忽略多餘欄位；新前端讀舊分片走「缺欄位不渲染徽章」分支。

## 範圍外（YAGNI）

- 不做跨角色關聯（同一帳號操作多角色的合併推測）。
- 不做精確機率模型（Wilson 等）；用佔比分級 + 樣本標示。
- 不在排行榜（首頁雙榜）顯示推測，只在上傳者頁與玩家頁。
- 不顯示精確 % 數字。
