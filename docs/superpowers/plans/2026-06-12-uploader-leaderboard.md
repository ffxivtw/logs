# 「誰把我的 Log 上傳了？」上傳者排行榜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立靜態網站：上傳者排行榜 + 玩家搜尋「誰把我的 Log 上傳了？」，資料來自上游 repo 的 FFLogs reports。

**Architecture:** Node.js 建置管線掃描上游 `data/rankings/*.reports/*.json`（全域以 report_code 去重），彙總出排行榜與玩家→上傳者索引（SHA-1 前 2 hex 碼分 256 片）靜態 JSON；Vue 3 前端以 hash routing 呈現三個頁面；GitHub Actions 定時 sparse clone 上游、建置、部署 GitHub Pages。

**Tech Stack:** Node.js 20（內建模組，無外部相依）、Vue 3 + Vite、GitHub Actions + Pages。

**Spec:** `docs/superpowers/specs/2026-06-12-uploader-leaderboard-design.md`

**重要背景（執行者必讀）：**

- 上游資料在 `./Final-Fantasy-XIV-Ranking-for-TC/`（已 checkout，是獨立 git repo、已被 .gitignore 排除）。reports 位於 `data/rankings/<encounter_key>.reports/NNN.json`，每檔是 `{report_code: report}` 的 map。report 內含 `owner: {id, name}`、`url`、`report_start_time_iso`、`fights[].players[]`（`{name, server, job, ...}`）。
- **同一 report 會出現在多個 `.reports` 目錄**（一筆 log 涵蓋多副本），必須全域以 `report_code` 去重；report 所屬副本以 `encounters` 陣列表示。
- TC 伺服器共 7 個（來源：上游 `scripts/fetch_fflogs.py:231`）：伊弗利特、迦樓羅、利維坦、鳳凰、奧汀、巴哈姆特、泰坦。
- 上游 `config/encounters.json` 是 `[{key, name, ...}]` 陣列，提供副本中文名。
- 本 repo 的 git identity 已設為 `ffxivtw <ffxivtw@users.noreply.github.com>`，commit 訊息結尾固定加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 玩家識別 key 一律為 `角色名@伺服器`。分片 = key 的 UTF-8 SHA-1 digest 第 1 個 byte 的 2 位 hex（共 256 片）。

---

### Task 0: 修正 spec 的 encounter 欄位

**Files:**
- Modify: `docs/superpowers/specs/2026-06-12-uploader-leaderboard-design.md`

- [ ] **Step 1: 把玩家分片格式中的單一 `encounter` 改為 `encounters` 陣列**

在 spec 的 `players/<shard>.json` 範例中，把：

```json
{"code": "xqLd...", "encounter": "savage_m1s", "time_iso": "...", "url": "https://www.fflogs.com/reports/xqLd..."}
```

改為：

```json
{"code": "xqLd...", "encounters": ["savage_m1s"], "time_iso": "...", "url": "https://www.fflogs.com/reports/xqLd..."}
```

並在「建置管線」一節的「去重」項補上一句：「同一 report 可能出現在多個 `.reports` 目錄（一筆 log 涵蓋多副本），以 report_code 全域去重，所屬副本記為 encounters 陣列。」

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-12-uploader-leaderboard-design.md
git commit -m "spec: report 以 encounters 陣列表示所屬副本（上游同一 report 涵蓋多副本）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1: 專案腳手架

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/App.vue`, `src/styles.css`

- [ ] **Step 1: 建立 package.json**

```json
{
  "name": "fflogs-uploader-leaderboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "build:data": "node scripts/build_data.mjs",
    "validate:data": "node scripts/validate_data.mjs",
    "test": "node --test scripts/build_data.test.mjs",
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": { "vue": "^3.5.13" },
  "devDependencies": { "@vitejs/plugin-vue": "^5.2.4", "vite": "^6.3.5" }
}
```

- [ ] **Step 2: 建立 vite.config.js**

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
})
```

`base: './'` 讓產物用相對路徑，部署在 GitHub Pages 的子路徑下不需改設定。

- [ ] **Step 3: 建立 index.html**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>誰把我的 Log 上傳了？ — FFXIV 繁中服</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: 建立 src/main.js、src/App.vue（暫時版）、src/styles.css**

`src/main.js`:

```js
import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

createApp(App).mount('#app')
```

`src/App.vue`（Task 7 會整個換掉）:

```vue
<template>
  <h1>誰把我的 Log 上傳了？</h1>
</template>
```

`src/styles.css`:

```css
:root { color-scheme: light dark; }
body { font-family: system-ui, "Noto Sans TC", sans-serif; margin: 0; line-height: 1.6; }
main { max-width: 960px; margin: 0 auto; padding: 0 1rem 2rem; }
header { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; max-width: 960px; margin: 0 auto; padding: 0.5rem 1rem; }
header h1 { font-size: 1.25rem; margin: 0.5rem 0; }
header h1 a { color: inherit; text-decoration: none; }
footer { max-width: 960px; margin: 0 auto; padding: 1rem; font-size: 0.85rem; opacity: 0.7; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(128, 128, 128, 0.3); }
th.sortable { cursor: pointer; user-select: none; }
th.active { text-decoration: underline; }
.tag { display: inline-block; margin: 0 0.4rem 0.2rem 0; padding: 0 0.4rem; border: 1px solid rgba(128, 128, 128, 0.4); border-radius: 4px; font-size: 0.85rem; }
.uploader h3 { cursor: pointer; user-select: none; }
.search { position: relative; }
.search input { padding: 0.35rem 0.6rem; min-width: 16rem; }
.search ul { position: absolute; z-index: 10; margin: 0; padding: 0; list-style: none; background: Canvas; border: 1px solid rgba(128, 128, 128, 0.4); width: 100%; }
.search li a { display: block; padding: 0.3rem 0.6rem; cursor: pointer; }
.search li a:hover { background: rgba(128, 128, 128, 0.2); }
```

- [ ] **Step 5: 安裝依賴並驗證 build**

```bash
npm install
npm run build
```

Expected: `vite build` 成功，產出 `dist/`。（`node_modules/`、`dist/` 已在 .gitignore。）

- [ ] **Step 6: Commit（含 package-lock.json）**

```bash
git add package.json package-lock.json vite.config.js index.html src/
git commit -m "feat: Vue 3 + Vite 專案腳手架

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: TC 伺服器常數與 shardOf

**Files:**
- Create: `scripts/lib/tc_servers.mjs`, `scripts/lib/aggregate.mjs`
- Test: `scripts/build_data.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

建立 `scripts/build_data.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TC_SERVERS } from './lib/tc_servers.mjs'
import { shardOf } from './lib/aggregate.mjs'

test('TC_SERVERS 包含全部 7 個繁中服', () => {
  assert.deepEqual(
    [...TC_SERVERS].sort(),
    ['伊弗利特', '利維坦', '奧汀', '巴哈姆特', '泰坦', '迦樓羅', '鳳凰'].sort(),
  )
})

test('shardOf 回傳 2 位 hex 且輸入相同結果相同', () => {
  const s = shardOf('魚丸探長@鳳凰')
  assert.match(s, /^[0-9a-f]{2}$/)
  assert.equal(s, shardOf('魚丸探長@鳳凰'))
  assert.notEqual(shardOf('a@鳳凰'), shardOf('b@鳳凰')) // 已驗證此二值不同
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作**

`scripts/lib/tc_servers.mjs`:

```js
// 繁中服伺服器清單。來源：上游 Final-Fantasy-XIV-Ranking-for-TC
// scripts/fetch_fflogs.py 的「繁中服伺服器名稱」常數。
export const TC_SERVERS = new Set([
  '伊弗利特',
  '迦樓羅',
  '利維坦',
  '鳳凰',
  '奧汀',
  '巴哈姆特',
  '泰坦',
])
```

`scripts/lib/aggregate.mjs`:

```js
import { createHash } from 'node:crypto'

// 玩家 key（角色名@伺服器）→ 分片名：UTF-8 SHA-1 第 1 個 byte 的 2 位 hex。
// 前端 src/lib/data.js 的 shardOf 必須算出相同值。
export function shardOf(playerKey) {
  return createHash('sha1').update(playerKey, 'utf8').digest('hex').slice(0, 2)
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`
Expected: PASS（注意 `a@鳳凰` / `b@鳳凰` 若碰巧同分片，換一組字串並保留註解）

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: TC 伺服器清單與玩家分片 hash

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: report 收集與彙總（核心邏輯）

**Files:**
- Modify: `scripts/lib/aggregate.mjs`
- Test: `scripts/build_data.test.mjs`

- [ ] **Step 1: 寫失敗的測試（fixture + 收集/彙總行為）**

附加到 `scripts/build_data.test.mjs`:

```js
import { createAccumulator, collectReport, aggregate, readReportsJson } from './lib/aggregate.mjs'

function makeReport(code, ownerId, ownerName, fightsPlayers, timeIso = '2026-06-01T12:00:00+00:00') {
  return {
    report_code: code,
    url: `https://www.fflogs.com/reports/${code}`,
    owner: { id: ownerId, name: ownerName },
    report_start_time_iso: timeIso,
    fights: fightsPlayers.map((players) => ({
      players: players.map(([name, server]) => ({ name, server })),
    })),
  }
}

test('collectReport 只收 TC 服玩家', () => {
  const acc = createAccumulator()
  collectReport(
    makeReport('AAA', 1, 'up1', [[['小明', '鳳凰'], ['路人', 'Tonberry']]]),
    'savage_m1s', acc, TC_SERVERS,
  )
  const entry = acc.reports.get('AAA')
  assert.deepEqual([...entry.players], ['小明@鳳凰'])
})

test('collectReport 同 report 出現在多個副本目錄時去重、encounters 合併', () => {
  const acc = createAccumulator()
  const r = makeReport('BBB', 1, 'up1', [[['小明', '鳳凰']], [['小華', '泰坦']]])
  collectReport(r, 'savage_m1s', acc, TC_SERVERS)
  collectReport(r, 'savage_m2s', acc, TC_SERVERS)
  assert.equal(acc.reports.size, 1)
  const entry = acc.reports.get('BBB')
  assert.deepEqual([...entry.encounters].sort(), ['savage_m1s', 'savage_m2s'])
  assert.equal(entry.fight_count, 2)
})

test('collectReport 略過缺 owner 或缺 report_code 的 report', () => {
  const acc = createAccumulator()
  collectReport({ ...makeReport('CCC', 1, 'up1', [[]]), owner: null }, 'savage_m1s', acc, TC_SERVERS)
  collectReport({ ...makeReport('', 1, 'up1', [[]]) }, 'savage_m1s', acc, TC_SERVERS)
  assert.equal(acc.reports.size, 0)
})

test('aggregate 彙總上傳者與玩家', () => {
  const acc = createAccumulator()
  collectReport(makeReport('R1', 1, 'up1', [[['小明', '鳳凰'], ['小華', '泰坦']]]), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('R2', 1, 'up1', [[['小明', '鳳凰']], [['小明', '鳳凰']]]), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('R3', 2, 'up2', [[['小明', '鳳凰']]]), 'extreme_zoraal_ja', acc, TC_SERVERS)
  const { uploaders, players, reportCount } = aggregate(acc)

  assert.equal(reportCount, 3)
  const u1 = uploaders.get(1)
  assert.equal(u1.report_count, 2)
  assert.equal(u1.fight_count, 3)
  assert.deepEqual([...u1.players].sort(), ['小明@鳳凰', '小華@泰坦'])
  assert.deepEqual(u1.encounters, { savage_m1s: 2 })

  const ming = players.get('小明@鳳凰')
  // 同一 report 內出現在多場 fight 只算一筆 report 關聯
  assert.equal(ming.get(1).reports.length, 2)
  assert.equal(ming.get(2).reports.length, 1)
})

test('readReportsJson 解析失敗回傳 null', () => {
  assert.equal(readReportsJson('{broken'), null)
  assert.deepEqual(readReportsJson('{"X":{"report_code":"X"}}'), { X: { report_code: 'X' } })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL（`createAccumulator` 等未定義）

- [ ] **Step 3: 實作（附加到 scripts/lib/aggregate.mjs）**

```js
export function createAccumulator() {
  return { reports: new Map() }
}

export function readReportsJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function collectReport(report, encounterKey, acc, tcServers) {
  const code = report?.report_code
  const owner = report?.owner
  if (!code || !owner || owner.id == null) return
  let entry = acc.reports.get(code)
  if (!entry) {
    const players = new Set()
    for (const fight of report.fights ?? []) {
      for (const p of fight.players ?? []) {
        if (p.name && tcServers.has(p.server)) players.add(`${p.name}@${p.server}`)
      }
    }
    entry = {
      code,
      url: report.url ?? `https://www.fflogs.com/reports/${code}`,
      owner: { id: owner.id, name: owner.name ?? String(owner.id) },
      time_iso: report.report_start_time_iso ?? null,
      fight_count: (report.fights ?? []).length,
      players,
      encounters: new Set(),
    }
    acc.reports.set(code, entry)
  }
  entry.encounters.add(encounterKey)
}

export function aggregate(acc) {
  const uploaders = new Map()
  const players = new Map()
  for (const r of acc.reports.values()) {
    let u = uploaders.get(r.owner.id)
    if (!u) {
      u = { id: r.owner.id, name: r.owner.name, report_count: 0, fight_count: 0, players: new Set(), encounters: {} }
      uploaders.set(r.owner.id, u)
    }
    u.report_count += 1
    u.fight_count += r.fight_count
    for (const k of r.encounters) u.encounters[k] = (u.encounters[k] ?? 0) + 1
    const reportRef = {
      code: r.code,
      encounters: [...r.encounters].sort(),
      time_iso: r.time_iso,
      url: r.url,
    }
    for (const key of r.players) {
      u.players.add(key)
      let byUploader = players.get(key)
      if (!byUploader) { byUploader = new Map(); players.set(key, byUploader) }
      let pu = byUploader.get(r.owner.id)
      if (!pu) { pu = { id: r.owner.id, name: r.owner.name, reports: [] }; byUploader.set(r.owner.id, pu) }
      pu.reports.push(reportRef)
    }
  }
  return { uploaders, players, reportCount: acc.reports.size }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: report 收集（全域去重）與上傳者/玩家彙總

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 輸出建構 buildOutputs

**Files:**
- Modify: `scripts/lib/aggregate.mjs`
- Test: `scripts/build_data.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

附加到 `scripts/build_data.test.mjs`:

```js
import { buildOutputs } from './lib/aggregate.mjs'

function buildSample() {
  const acc = createAccumulator()
  collectReport(makeReport('R1', 1, 'up1', [[['小明', '鳳凰'], ['小華', '泰坦']]]), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('R2', 1, 'up1', [[['小明', '鳳凰']]], '2026-06-02T12:00:00+00:00'), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('R3', 2, 'up2', [[['小明', '鳳凰']]]), 'extreme_zoraal_ja', acc, TC_SERVERS)
  return buildOutputs(aggregate(acc), {
    now: '2026-06-12T00:00:00.000Z',
    encounterNames: { savage_m1s: '零式 M1S / 黑貓' },
  })
}

test('buildOutputs: uploaders.json 按 report_count 遞減排序', () => {
  const out = buildSample()
  assert.equal(out.uploaders.updated_at_iso, '2026-06-12T00:00:00.000Z')
  assert.deepEqual(out.uploaders.uploaders.map((u) => u.id), [1, 2])
  const u1 = out.uploaders.uploaders[0]
  assert.equal(u1.report_count, 2)
  assert.equal(u1.unique_player_count, 2)
})

test('buildOutputs: 玩家分片內容正確且 report 按時間新→舊', () => {
  const out = buildSample()
  const shard = shardOf('小明@鳳凰')
  const entry = out.playerShards.get(shard)['小明@鳳凰']
  assert.equal(entry.uploaders[0].id, 1) // up1 有 2 筆，排前面
  assert.deepEqual(entry.uploaders[0].reports.map((r) => r.code), ['R2', 'R1'])
})

test('buildOutputs: uploader 明細含 per-player report 數', () => {
  const out = buildSample()
  const d = out.uploaderDetails.get(1)
  assert.deepEqual(d.players, [
    { key: '小明@鳳凰', report_count: 2 },
    { key: '小華@泰坦', report_count: 1 },
  ])
})

test('buildOutputs: players_index 排序且 meta 計數正確', () => {
  const out = buildSample()
  assert.deepEqual(out.playersIndex, ['小明@鳳凰', '小華@泰坦'].sort())
  assert.equal(out.meta.report_count, 3)
  assert.equal(out.meta.uploader_count, 2)
  assert.equal(out.meta.player_count, 2)
  assert.equal(out.meta.encounters.savage_m1s, '零式 M1S / 黑貓')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL（`buildOutputs` 未定義）

- [ ] **Step 3: 實作（附加到 scripts/lib/aggregate.mjs）**

```js
export function buildOutputs({ uploaders, players, reportCount }, { now, encounterNames = {} }) {
  const uploaderRows = [...uploaders.values()]
    .map((u) => ({
      id: u.id,
      name: u.name,
      report_count: u.report_count,
      unique_player_count: u.players.size,
      fight_count: u.fight_count,
      encounters: u.encounters,
    }))
    .sort((a, b) => b.report_count - a.report_count || a.id - b.id)

  const playerShards = new Map()
  const perUploaderPlayers = new Map() // ownerId → Map(playerKey → report 數)
  const sortedKeys = [...players.keys()].sort()
  for (const key of sortedKeys) {
    const uploaderList = [...players.get(key).values()]
      .map((pu) => ({
        id: pu.id,
        name: pu.name,
        reports: [...pu.reports].sort((a, b) => (b.time_iso ?? '').localeCompare(a.time_iso ?? '')),
      }))
      .sort((a, b) => b.reports.length - a.reports.length || a.id - b.id)
    for (const pu of uploaderList) {
      let m = perUploaderPlayers.get(pu.id)
      if (!m) { m = new Map(); perUploaderPlayers.set(pu.id, m) }
      m.set(key, pu.reports.length)
    }
    const shard = shardOf(key)
    let content = playerShards.get(shard)
    if (!content) { content = {}; playerShards.set(shard, content) }
    content[key] = { uploaders: uploaderList }
  }

  const uploaderDetails = new Map()
  for (const u of uploaderRows) {
    const m = perUploaderPlayers.get(u.id) ?? new Map()
    uploaderDetails.set(u.id, {
      ...u,
      players: [...m.entries()]
        .map(([key, report_count]) => ({ key, report_count }))
        .sort((a, b) => b.report_count - a.report_count || a.key.localeCompare(b.key)),
    })
  }

  return {
    uploaders: { updated_at_iso: now, uploaders: uploaderRows },
    playerShards,
    uploaderDetails,
    playersIndex: sortedKeys,
    meta: {
      updated_at_iso: now,
      report_count: reportCount,
      uploader_count: uploaderRows.length,
      player_count: sortedKeys.length,
      encounters: encounterNames,
    },
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: 由彙總結果建構排行榜/分片/明細/索引輸出

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: build_data.mjs CLI 與實際資料驗證

**Files:**
- Create: `scripts/build_data.mjs`

- [ ] **Step 1: 建立 scripts/build_data.mjs**

```js
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createAccumulator, collectReport, aggregate, buildOutputs, readReportsJson } from './lib/aggregate.mjs'
import { TC_SERVERS } from './lib/tc_servers.mjs'

const UPSTREAM_DIR = process.env.UPSTREAM_DIR ?? './Final-Fantasy-XIV-Ranking-for-TC'
const OUT_DIR = process.env.OUT_DIR ?? './public/data'
const rankingsDir = join(UPSTREAM_DIR, 'data', 'rankings')

const acc = createAccumulator()
let badFiles = 0
for (const entry of readdirSync(rankingsDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.endsWith('.reports')) continue
  const encounterKey = entry.name.slice(0, -'.reports'.length)
  const dir = join(rankingsDir, entry.name)
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const reports = readReportsJson(readFileSync(join(dir, file), 'utf8'))
    if (!reports) {
      console.warn(`warning: 略過損壞檔案 ${join(dir, file)}`)
      badFiles += 1
      continue
    }
    for (const report of Object.values(reports)) collectReport(report, encounterKey, acc, TC_SERVERS)
  }
}

let encounterNames = {}
try {
  const list = JSON.parse(readFileSync(join(UPSTREAM_DIR, 'config', 'encounters.json'), 'utf8'))
  encounterNames = Object.fromEntries(list.map((e) => [e.key, e.name]))
} catch {
  console.warn('warning: 無法讀取上游 config/encounters.json，副本名稱將以 key 顯示')
}

const outputs = buildOutputs(aggregate(acc), { now: new Date().toISOString(), encounterNames })

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(join(OUT_DIR, 'players'), { recursive: true })
mkdirSync(join(OUT_DIR, 'uploaders'), { recursive: true })
writeFileSync(join(OUT_DIR, 'uploaders.json'), JSON.stringify(outputs.uploaders))
writeFileSync(join(OUT_DIR, 'players_index.json'), JSON.stringify(outputs.playersIndex))
writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(outputs.meta))
for (const [shard, content] of outputs.playerShards) {
  writeFileSync(join(OUT_DIR, 'players', `${shard}.json`), JSON.stringify(content))
}
for (const [id, content] of outputs.uploaderDetails) {
  writeFileSync(join(OUT_DIR, 'uploaders', `${id}.json`), JSON.stringify(content))
}

console.log(
  `build:data 完成 reports=${outputs.meta.report_count} uploaders=${outputs.meta.uploader_count} ` +
  `players=${outputs.meta.player_count} shards=${outputs.playerShards.size} badFiles=${badFiles}`,
)
```

- [ ] **Step 2: 對實際上游資料跑一次**

Run: `npm run build:data`
Expected: 正常結束並輸出統計（reports 約 4 萬上下、players 數千～數萬）。記下數字。

- [ ] **Step 3: 抽查輸出合理性**

```bash
ls public/data/players | wc -l
node -e "const u=require('./public/data/uploaders.json');console.log(u.uploaders.slice(0,3))"
du -sh public/data public/data/players_index.json
```

Expected: 分片數 ≤ 256；前 3 名上傳者數字非零且 name 合理；`players_index.json` 在低 MB 級以內（gzip 後更小，若 > 5MB 需回報討論降級方案）。

- [ ] **Step 4: Commit（public/data 不入版控，僅 commit 程式）**

```bash
git add scripts/build_data.mjs
git commit -m "feat: build_data CLI——掃描上游 reports 產出靜態資料

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: validate_data.mjs 資料契約檢查

**Files:**
- Create: `scripts/validate_data.mjs`

- [ ] **Step 1: 建立 scripts/validate_data.mjs**

```js
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { shardOf } from './lib/aggregate.mjs'

const OUT_DIR = process.env.OUT_DIR ?? './public/data'
function fail(msg) {
  console.error(`validate:data 失敗: ${msg}`)
  process.exit(1)
}

const uploaders = JSON.parse(readFileSync(join(OUT_DIR, 'uploaders.json'), 'utf8'))
if (!Array.isArray(uploaders.uploaders)) fail('uploaders.json 缺 uploaders 陣列')
if (uploaders.uploaders.length === 0) fail('uploaders 為空')
let prev = Infinity
for (const u of uploaders.uploaders) {
  if (u.id == null || typeof u.name !== 'string') fail(`uploader 缺 id/name: ${JSON.stringify(u)}`)
  for (const f of ['report_count', 'unique_player_count', 'fight_count']) {
    if (!Number.isInteger(u[f]) || u[f] < 0) fail(`uploader ${u.id} 欄位 ${f} 異常`)
  }
  if (u.report_count > prev) fail('uploaders 未按 report_count 遞減排序')
  prev = u.report_count
}

const meta = JSON.parse(readFileSync(join(OUT_DIR, 'meta.json'), 'utf8'))
for (const f of ['updated_at_iso', 'report_count', 'uploader_count', 'player_count', 'encounters']) {
  if (meta[f] == null) fail(`meta.json 缺 ${f}`)
}
if (meta.uploader_count !== uploaders.uploaders.length) fail('meta.uploader_count 與 uploaders.json 不符')

const index = JSON.parse(readFileSync(join(OUT_DIR, 'players_index.json'), 'utf8'))
if (!Array.isArray(index)) fail('players_index.json 非陣列')
if (meta.player_count !== index.length) fail('meta.player_count 與 players_index 不符')

let shardKeys = 0
for (const file of readdirSync(join(OUT_DIR, 'players'))) {
  const shard = file.replace(/\.json$/, '')
  const content = JSON.parse(readFileSync(join(OUT_DIR, 'players', file), 'utf8'))
  for (const [key, value] of Object.entries(content)) {
    if (shardOf(key) !== shard) fail(`玩家 ${key} 不應在分片 ${shard}`)
    if (!Array.isArray(value.uploaders) || value.uploaders.length === 0) fail(`玩家 ${key} uploaders 異常`)
    shardKeys += 1
  }
}
if (shardKeys !== index.length) fail(`分片玩家總數 ${shardKeys} 與索引 ${index.length} 不符`)

console.log(`validate:data 通過 uploaders=${uploaders.uploaders.length} players=${index.length}`)
```

- [ ] **Step 2: 跑檢查**

Run: `npm run validate:data`
Expected: `validate:data 通過 ...`

- [ ] **Step 3: Commit**

```bash
git add scripts/validate_data.mjs
git commit -m "feat: 資料契約檢查

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 前端資料層與路由 + App 殼

**Files:**
- Create: `src/lib/data.js`, `src/lib/router.js`, `src/pages/HomePage.vue`（暫時殼）, `src/pages/PlayerPage.vue`（暫時殼）, `src/pages/UploaderPage.vue`（暫時殼）, `src/components/SearchBox.vue`（暫時殼）
- Modify: `src/App.vue`

- [ ] **Step 1: 建立 src/lib/data.js**

```js
const cache = new Map()

export function fetchJson(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${import.meta.env.BASE_URL}data/${path}`).then((r) => {
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
        return r.json()
      }),
    )
  }
  return cache.get(path)
}

// 必須與 scripts/lib/aggregate.mjs 的 shardOf 算出相同值（SHA-1 第 1 byte 的 2 位 hex）
export async function shardOf(playerKey) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(playerKey))
  return new Uint8Array(digest)[0].toString(16).padStart(2, '0')
}

export async function fetchPlayer(playerKey) {
  const shard = await shardOf(playerKey)
  try {
    const data = await fetchJson(`players/${shard}.json`)
    return data[playerKey] ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: 建立 src/lib/router.js**

```js
import { ref } from 'vue'

export function parseHash(hash) {
  const h = hash.replace(/^#\/?/, '')
  if (h.startsWith('player/')) return { name: 'player', key: decodeURIComponent(h.slice('player/'.length)) }
  if (h.startsWith('uploader/')) return { name: 'uploader', id: h.slice('uploader/'.length) }
  return { name: 'home' }
}

export function useRoute() {
  const route = ref(parseHash(location.hash))
  window.addEventListener('hashchange', () => {
    route.value = parseHash(location.hash)
  })
  return route
}
```

- [ ] **Step 3: 建立三個頁面與 SearchBox 的暫時殼**

`src/pages/HomePage.vue`、`src/pages/PlayerPage.vue`、`src/pages/UploaderPage.vue`、`src/components/SearchBox.vue` 先各放一個可編譯的殼，例如 PlayerPage：

```vue
<script setup>
defineProps({ playerKey: String })
</script>
<template><p>player: {{ playerKey }}</p></template>
```

（HomePage 殼 `<template><p>home</p></template>`；UploaderPage 殼接收 `uploaderId` prop；SearchBox 殼 `<template><span /></template>`。Task 8、9 會換成正式版。）

- [ ] **Step 4: 改寫 src/App.vue**

```vue
<script setup>
import { useRoute } from './lib/router.js'
import HomePage from './pages/HomePage.vue'
import PlayerPage from './pages/PlayerPage.vue'
import UploaderPage from './pages/UploaderPage.vue'
import SearchBox from './components/SearchBox.vue'

const route = useRoute()
</script>

<template>
  <header>
    <h1><a href="#/">誰把我的 Log 上傳了？</a></h1>
    <SearchBox />
  </header>
  <main>
    <PlayerPage v-if="route.name === 'player'" :key="route.key" :player-key="route.key" />
    <UploaderPage v-else-if="route.name === 'uploader'" :key="route.id" :uploader-id="route.id" />
    <HomePage v-else />
  </main>
  <footer>非官方社群工具，資料皆來自 FFLogs 公開報告，不代表完整通關紀錄。</footer>
</template>
```

（`:key` 綁路由參數，切換玩家/上傳者時強制重建元件重新載資料。）

- [ ] **Step 5: 驗證編譯與路由**

```bash
npm run build
```

Expected: 成功。再以 `npm run dev` 開 `http://127.0.0.1:5173/#/player/小明@鳳凰` 確認顯示 `player: 小明@鳳凰`（中文經 URL encode 也要正常）。

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: 前端資料層、hash 路由與 App 殼

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 首頁排行榜與搜尋框

**Files:**
- Modify: `src/pages/HomePage.vue`, `src/components/SearchBox.vue`

- [ ] **Step 1: 實作 HomePage.vue（整檔取代）**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchJson } from '../lib/data.js'

const data = ref(null)
const meta = ref(null)
const error = ref(null)
const sortKey = ref('report_count')

const COLUMNS = [
  ['report_count', 'Report 數'],
  ['unique_player_count', '不重複玩家數'],
  ['fight_count', '戰鬥場次數'],
]

const sorted = computed(() => {
  if (!data.value) return []
  return [...data.value.uploaders].sort((a, b) => b[sortKey.value] - a[sortKey.value])
})

onMounted(async () => {
  try {
    ;[data.value, meta.value] = await Promise.all([fetchJson('uploaders.json'), fetchJson('meta.json')])
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <p v-if="error">資料載入失敗：{{ error }}</p>
  <template v-else-if="data">
    <p v-if="meta">
      共 {{ meta.report_count }} 筆公開 report、{{ meta.uploader_count }} 位上傳者、
      {{ meta.player_count }} 位繁中服玩家。更新於
      {{ new Date(meta.updated_at_iso).toLocaleString('zh-TW') }}。
    </p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>上傳者</th>
          <th
            v-for="[key, label] in COLUMNS"
            :key="key"
            class="sortable"
            :class="{ active: sortKey === key }"
            @click="sortKey = key"
          >{{ label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(u, i) in sorted" :key="u.id">
          <td>{{ i + 1 }}</td>
          <td><a :href="`#/uploader/${u.id}`">{{ u.name }}</a></td>
          <td v-for="[key] in COLUMNS" :key="key">{{ u[key] }}</td>
        </tr>
      </tbody>
    </table>
  </template>
  <p v-else>載入中…</p>
</template>
```

- [ ] **Step 2: 實作 SearchBox.vue（整檔取代）**

```vue
<script setup>
import { ref, computed } from 'vue'
import { fetchJson } from '../lib/data.js'

const query = ref('')
const index = ref(null)
const focused = ref(false)

async function ensureIndex() {
  if (!index.value) index.value = await fetchJson('players_index.json').catch(() => [])
}

const candidates = computed(() => {
  const q = query.value.trim()
  if (!q || !index.value) return []
  return index.value.filter((k) => k.includes(q)).slice(0, 10)
})

function go(key) {
  query.value = ''
  location.hash = `#/player/${encodeURIComponent(key)}`
}
</script>

<template>
  <div class="search" @focusin="(focused = true), ensureIndex()" @focusout="focused = false">
    <input v-model="query" placeholder="搜尋角色名稱…" />
    <ul v-if="focused && candidates.length">
      <li v-for="k in candidates" :key="k">
        <a @mousedown.prevent="go(k)">{{ k }}</a>
      </li>
    </ul>
  </div>
</template>
```

（索引在第一次 focus 才載入，避免首頁載入即抓大檔；`@mousedown.prevent` 讓點選先於 blur 觸發。）

- [ ] **Step 3: 人工驗證**

`npm run dev`（需先跑過 `npm run build:data` 產生 public/data）。確認：排行榜載入、點欄位換排序、搜尋框輸入中文出現候選、點候選跳玩家頁。

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: 上傳者排行榜首頁與玩家搜尋框

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 玩家頁與上傳者頁

**Files:**
- Modify: `src/pages/PlayerPage.vue`, `src/pages/UploaderPage.vue`

- [ ] **Step 1: 實作 PlayerPage.vue（整檔取代）**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { fetchJson, fetchPlayer } from '../lib/data.js'

const props = defineProps({ playerKey: String })
const result = ref(undefined) // undefined=載入中, null=查無
const meta = ref(null)
const open = ref(new Set())

function toggle(id) {
  const s = new Set(open.value)
  s.has(id) ? s.delete(id) : s.add(id)
  open.value = s
}

function encounterNames(keys) {
  return keys.map((k) => meta.value?.encounters?.[k] ?? k).join('、')
}

onMounted(async () => {
  meta.value = await fetchJson('meta.json').catch(() => null)
  result.value = await fetchPlayer(props.playerKey)
})
</script>

<template>
  <h2>{{ playerKey }}</h2>
  <p v-if="result === undefined">載入中…</p>
  <p v-else-if="result === null">找不到此玩家的公開紀錄。</p>
  <template v-else>
    <p>共 {{ result.uploaders.length }} 位上傳者上傳過包含此玩家的 log。</p>
    <div v-for="u in result.uploaders" :key="u.id" class="uploader">
      <h3 @click="toggle(u.id)">
        {{ open.has(u.id) ? '▼' : '▶' }}
        <a :href="`#/uploader/${u.id}`" @click.stop>{{ u.name }}</a>
        — {{ u.reports.length }} 筆 report
      </h3>
      <table v-if="open.has(u.id)">
        <thead>
          <tr><th>副本</th><th>時間</th><th>Report</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in u.reports" :key="r.code">
            <td>{{ encounterNames(r.encounters) }}</td>
            <td>{{ r.time_iso ? new Date(r.time_iso).toLocaleString('zh-TW') : '—' }}</td>
            <td><a :href="r.url" target="_blank" rel="noopener">{{ r.code }}</a></td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
```

- [ ] **Step 2: 實作 UploaderPage.vue（整檔取代）**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { fetchJson } from '../lib/data.js'

const props = defineProps({ uploaderId: String })
const data = ref(undefined)
const meta = ref(null)

onMounted(async () => {
  meta.value = await fetchJson('meta.json').catch(() => null)
  data.value = await fetchJson(`uploaders/${props.uploaderId}.json`).catch(() => null)
})
</script>

<template>
  <p v-if="data === undefined">載入中…</p>
  <p v-else-if="data === null">找不到此上傳者。</p>
  <template v-else>
    <h2>{{ data.name }}</h2>
    <p>
      {{ data.report_count }} 筆 report、{{ data.fight_count }} 場戰鬥、
      {{ data.players.length }} 位繁中服玩家。
    </p>
    <p>
      <span v-for="(n, k) in data.encounters" :key="k" class="tag">
        {{ meta?.encounters?.[k] ?? k }} ×{{ n }}
      </span>
    </p>
    <table>
      <thead>
        <tr><th>玩家</th><th>Report 數</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in data.players" :key="p.key">
          <td><a :href="`#/player/${encodeURIComponent(p.key)}`">{{ p.key }}</a></td>
          <td>{{ p.report_count }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
```

- [ ] **Step 3: 人工驗證**

`npm run dev`：從首頁點上傳者 → 上傳者頁數字合理；點玩家 → 玩家頁列出上傳者；展開明細 → FFLogs 連結可開、副本顯示中文名；搜尋一個不存在的名字組合（直接改 URL）→ 顯示「找不到此玩家的公開紀錄」。

- [ ] **Step 4: 完整驗證並 Commit**

```bash
npm test && npm run validate:data && npm run build
git add src/
git commit -m "feat: 玩家頁（誰傳了我的 log）與上傳者明細頁

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: GitHub Actions 建置部署

**Files:**
- Create: `.github/workflows/build-and-deploy.yml`

- [ ] **Step 1: 建立 workflow**

```yaml
name: build-and-deploy

on:
  schedule:
    - cron: '23 3,15 * * *' # UTC，每日兩次，避開整點
  workflow_dispatch:
  push:
    branches: [main, master]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Clone upstream data (sparse)
        run: |
          git clone --depth 1 --filter=blob:none --sparse \
            https://github.com/Kantai235/Final-Fantasy-XIV-Ranking-for-TC.git upstream
          git -C upstream sparse-checkout set data/rankings config
      - run: node scripts/build_data.mjs
        env:
          UPSTREAM_DIR: ./upstream
      - run: node scripts/validate_data.mjs
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 本機模擬 CI 流程驗證**

```bash
rm -rf /tmp/upstream && git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/Kantai235/Final-Fantasy-XIV-Ranking-for-TC.git /tmp/upstream
git -C /tmp/upstream sparse-checkout set data/rankings config
UPSTREAM_DIR=/tmp/upstream node scripts/build_data.mjs
node scripts/validate_data.mjs
npm run build
```

Expected: 全部成功，統計數字與 Task 5 對本地 checkout 跑的結果同量級。

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: 定時抓上游資料、建置並部署 GitHub Pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

注意：部署生效需要 repo 推上 GitHub 並在 Settings → Pages 選 "GitHub Actions" 作為 source——這是使用者手動操作，完成本 task 時提醒即可。

---

### Task 11: 更新 CLAUDE.md 與收尾

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 改寫 CLAUDE.md**

整檔取代為：

```markdown
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
```

- [ ] **Step 2: 全套驗證**

```bash
npm test && npm run build:data && npm run validate:data && npm run build
```

Expected: 全部通過。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 更新 CLAUDE.md 為實際指令與架構

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 驗收清單（全部完成後）

- `npm test` 通過。
- `npm run build:data && npm run validate:data` 對實際上游資料通過。
- `npm run dev` 手動走過：首頁排序切換、搜尋→玩家頁→展開明細→FFLogs 連結、上傳者頁、查無玩家訊息。
- `npm run build` 成功。
- 提醒使用者：推上 GitHub 後到 Settings → Pages 啟用 "GitHub Actions" source。
