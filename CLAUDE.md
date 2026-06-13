# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

「誰把我的 Log 上傳了？」——交叉比對 FFLogs TC（繁中服）log 上傳者與 log 中玩家的靜態網站：上傳者排行榜 + 玩家搜尋。純靜態（無後端、前端不打 API），資料於 build 時產生。介面語言 zh-TW。

設計文件：`docs/superpowers/specs/2026-06-12-uploader-leaderboard-design.md`

## 常用指令

```bash
npm install            # 安裝依賴（Node 20+）
npm test               # node --test 跑建置管線測試
npm run build:data     # 掃上游資料產出 public/data/（需先有上游 checkout）
npm run validate:data  # 資料契約檢查（build:data 之後跑）
npm run dev            # Vite dev server（需先 build:data）
npm run build          # 產出 dist/
```

單一測試：`node --test --test-name-pattern='<名稱>' scripts/build_data.test.mjs`

## 架構

- **資料來源**：上游 repo `Kantai235/Final-Fantasy-XIV-Ranking-for-TC` 的 `data/rankings/*.reports/*.json`。本機預設讀 `./Final-Fantasy-XIV-Ranking-for-TC/`（獨立 git repo，已 gitignore），可用 `UPSTREAM_DIR` 環境變數覆寫。CI 中 sparse clone。不自行呼叫 FFLogs API。
- **建置管線** `scripts/build_data.mjs` + `scripts/lib/aggregate.mjs`：掃描 reports（同一 report 會出現在多個 `.reports` 目錄，以 report_code 全域去重）、只收 TC 服玩家（清單在 `scripts/lib/tc_servers.mjs`，來源為上游 fetch_fflogs.py）、產出 `public/data/`（uploaders.json、players/<shard>.json、uploaders/<id>.json、players_index.json、meta.json）。`public/data/` 是 build 產物，不入版控。
- **分片**：玩家 key 為 `角色名@伺服器`；分片 = UTF-8 SHA-1 第 1 byte 的 2 位 hex。`scripts/lib/aggregate.mjs` 的 `shardOf`（Node crypto）與 `src/lib/data.js` 的 `shardOf`（Web Crypto）必須一致，改其一必改另一。
- **前端**：Vue 3 + Vite，hash routing（自製 `src/lib/router.js`，無 vue-router）。三頁：首頁排行榜、`#/player/<key>` 玩家頁、`#/uploader/<id>` 上傳者頁。
- **部署**：`.github/workflows/build-and-deploy.yml` 定時/手動/push 觸發，建置後部署 GitHub Pages。

## 注意事項

- 上游資料格式變動是主要風險；`npm run validate:data` 異常即 fail，避免壞資料上線。
- 不處理轉服合併、不索引非 TC 服玩家（spec 範圍外）。
