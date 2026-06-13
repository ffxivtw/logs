# 被上傳角色排行榜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「被上傳角色排行榜」：首頁 tab 切換（上傳者榜 / 角色榜），角色榜有伺服器篩選與多指標排序，並把 players_index.json 合併為含統計的 players_ranking.json。

**Architecture:** `buildOutputs` 多輸出一個排序好的 `playersRanking`（每筆 `{key, reports, uploaders}`）；`build_data.mjs` 寫成 `players_ranking.json` 取代 `players_index.json`。前端把首頁表格抽成 `UploaderTable.vue`、新增 `PlayerRankingTable.vue`（伺服器篩選 + 排序 + 截斷 + parse 色階），`HomePage.vue` 變成 hero + tab 殼，`#/players` 路由顯示角色 tab；搜尋框改用合併後的新檔。

**Tech Stack:** 既有棧不變（Node 內建模組、Vue 3、inline SVG，零新相依）。

**Spec:** `docs/superpowers/specs/2026-06-13-player-leaderboard-design.md`

**執行者必讀背景：**

- 先開分支 `feat/player-leaderboard`（Task 1 Step 0）。
- `scripts/lib/aggregate.mjs` 的 `buildOutputs` 玩家迴圈中，每個 key 已算出 `uploaderList`（陣列，每個 `{id, name, reports: [...]}`）。角色榜統計直接由它衍生：`reports = 各 uploader 的 reports.length 總和`、`uploaders = uploaderList.length`。
- `buildOutputs` 現有回傳欄位：`uploaders`、`playerShards`、`uploaderDetails`、`playersIndex`、`meta`。本計畫**新增** `playersRanking`，**保留** `playersIndex`（既有測試仍測它；只是 `build_data.mjs` 不再把它寫成檔）。
- 測試檔 `scripts/build_data.test.mjs` 已有 helper `buildSample()`（R1：小明@鳳凰+小華@泰坦 由 up1；R2：小明@鳳凰 由 up1；R3：小明@鳳凰 由 up2）→ 小明@鳳凰 共 3 筆 report、2 位上傳者；小華@泰坦 共 1 筆、1 位。
- 前端 parse 色階 helper：`src/lib/tier.js` 的 `tierClass(index, total)`。
- 7 個繁中服固定順序：伊弗利特、迦樓羅、利維坦、鳳凰、奧汀、巴哈姆特、泰坦。
- git identity 已設好；commit 訊息結尾固定 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: playersRanking 彙總（TDD）

**Files:**
- Modify: `scripts/lib/aggregate.mjs`
- Test: `scripts/build_data.test.mjs`

- [ ] **Step 0: 開分支**

```bash
git checkout -b feat/player-leaderboard
```

- [ ] **Step 1: 寫失敗的測試（附加到 scripts/build_data.test.mjs 末尾）**

```js
test('playersRanking: 按 reports 降冪、平手 key 字典序、含正確統計', () => {
  const out = buildSample()
  assert.deepEqual(out.playersRanking, [
    { key: '小明@鳳凰', reports: 3, uploaders: 2 },
    { key: '小華@泰坦', reports: 1, uploaders: 1 },
  ])
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: 新測試 FAIL（`out.playersRanking` undefined），既有測試 PASS。

- [ ] **Step 3: 實作（修改 scripts/lib/aggregate.mjs 的 buildOutputs）**

在玩家迴圈**之前**宣告收集陣列（與 `const playerShards = new Map()` 同區）：

```js
  const playersRanking = []
```

在玩家迴圈內、`content[key] = { uploaders: uploaderList, monthly: sortedMonthly(playerMonthly) }` 那行**之後**，加入：

```js
    playersRanking.push({
      key,
      reports: uploaderList.reduce((s, u) => s + u.reports.length, 0),
      uploaders: uploaderList.length,
    })
```

玩家迴圈**結束後**（`for (const key of sortedKeys) { ... }` 的右大括號之後、`const uploaderDetails = ...` 之前）加入排序：

```js
  playersRanking.sort((a, b) => b.reports - a.reports || a.key.localeCompare(b.key))
```

最後在 `return { ... }` 物件中加入欄位（放在 `playersIndex: sortedKeys,` 之後）：

```js
    playersRanking,
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`
Expected: 全部 PASS（既有 14 + 新 1 = 15）。

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: buildOutputs 產出被上傳角色排行榜 playersRanking

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: build_data 輸出改名 + validate 改檢查 + 實資料驗證

**Files:**
- Modify: `scripts/build_data.mjs`, `scripts/validate_data.mjs`

- [ ] **Step 1: build_data.mjs —— 把 players_index.json 改寫成 players_ranking.json**

找到這行：

```js
writeFileSync(join(OUT_DIR, 'players_index.json'), JSON.stringify(outputs.playersIndex))
```

替換為：

```js
writeFileSync(
  join(OUT_DIR, 'players_ranking.json'),
  JSON.stringify({ updated_at_iso: outputs.meta.updated_at_iso, players: outputs.playersRanking }),
)
```

- [ ] **Step 2: validate_data.mjs —— 把 players_index 檢查改為 players_ranking**

找到既有的 players_index 檢查區塊：

```js
const index = JSON.parse(readFileSync(join(OUT_DIR, 'players_index.json'), 'utf8'))
if (!Array.isArray(index)) fail('players_index.json 非陣列')
if (meta.player_count !== index.length) fail('meta.player_count 與 players_index 不符')
```

替換為：

```js
const ranking = JSON.parse(readFileSync(join(OUT_DIR, 'players_ranking.json'), 'utf8'))
if (!Array.isArray(ranking.players)) fail('players_ranking.json 缺 players 陣列')
if (meta.player_count !== ranking.players.length) fail('meta.player_count 與 players_ranking 不符')
let prevReports = Infinity
for (const p of ranking.players) {
  if (typeof p.key !== 'string' || !p.key.includes('@')) fail(`players_ranking key 異常: ${JSON.stringify(p)}`)
  if (!Number.isInteger(p.reports) || p.reports < 1) fail(`players_ranking ${p.key} reports 異常`)
  if (!Number.isInteger(p.uploaders) || p.uploaders < 1) fail(`players_ranking ${p.key} uploaders 異常`)
  if (p.reports > prevReports) fail('players_ranking 未按 reports 遞減排序')
  prevReports = p.reports
}
```

接著找到檔尾用到 `index.length` 的分片總數檢查：

```js
if (shardKeys !== index.length) fail(`分片玩家總數 ${shardKeys} 與索引 ${index.length} 不符`)
```

替換為（改用 ranking.players.length）：

```js
if (shardKeys !== ranking.players.length) fail(`分片玩家總數 ${shardKeys} 與排行榜 ${ranking.players.length} 不符`)
```

最後找到結尾 console.log（含 `players=${index.length}`）：

```js
console.log(`validate:data 通過 uploaders=${uploaders.uploaders.length} players=${index.length}`)
```

替換為：

```js
console.log(`validate:data 通過 uploaders=${uploaders.uploaders.length} players=${ranking.players.length}`)
```

- [ ] **Step 3: 對實資料跑全管線**

```bash
npm run build:data && npm run validate:data
```

Expected: build 統計 reports≈28k；validate 通過。確認 `public/data/players_index.json` 不再產生、`players_ranking.json` 已產生。

- [ ] **Step 4: 抽查實際輸出**

```bash
node -e "const r=require('./public/data/players_ranking.json');console.log('count',r.players.length);console.log(r.players.slice(0,3))"
test ! -f public/data/players_index.json && echo "players_index.json 已移除"
```

Expected: count 約 11769；前 3 名 reports 由大到小（榜首約 380）；舊檔已不存在（rmSync 清空 OUT_DIR 後不再寫入）。

- [ ] **Step 5: Commit**

```bash
git add scripts/build_data.mjs scripts/validate_data.mjs
git commit -m "feat: 輸出 players_ranking.json 取代 players_index.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 抽出 UploaderTable 元件（純重構）

**Files:**
- Create: `src/components/UploaderTable.vue`
- Modify: `src/pages/HomePage.vue`

- [ ] **Step 1: 建立 src/components/UploaderTable.vue**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchJson } from '../lib/data.js'
import { tierClass } from '../lib/tier.js'

const DISPLAY_LIMIT = 100

const data = ref(null)
const error = ref(null)
const sortKey = ref('report_count')
const showAll = ref(false)

const COLUMNS = [
  ['report_count', 'Report 數'],
  ['unique_player_count', '不重複玩家數'],
  ['fight_count', '戰鬥場次數'],
]

const sorted = computed(() => {
  if (!data.value) return []
  return [...data.value.uploaders].sort((a, b) => b[sortKey.value] - a[sortKey.value])
})

const visible = computed(() => (showAll.value ? sorted.value : sorted.value.slice(0, DISPLAY_LIMIT)))

onMounted(async () => {
  try {
    data.value = await fetchJson('uploaders.json')
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <p v-if="error" class="state-msg">資料載入失敗：{{ error }}。請重新整理頁面。</p>
  <template v-else-if="data">
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
        <tr v-for="(u, i) in visible" :key="u.id">
          <td class="rank" :class="tierClass(i, sorted.length)">{{ i + 1 }}</td>
          <td><a :href="`#/uploader/${u.id}`">{{ u.name }}</a></td>
          <td v-for="[key] in COLUMNS" :key="key" class="num">{{ u[key].toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!showAll && sorted.length > DISPLAY_LIMIT" class="show-all">
      <button type="button" @click="showAll = true">
        顯示全部 {{ sorted.length.toLocaleString() }} 位上傳者
      </button>
    </p>
  </template>
  <p v-else class="state-msg">載入中…</p>
</template>
```

- [ ] **Step 2: 整檔取代 src/pages/HomePage.vue（hero + legend + UploaderTable，移除已搬走的表格邏輯）**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { fetchJson } from '../lib/data.js'
import MonthlyBars from '../components/MonthlyBars.vue'
import UploaderTable from '../components/UploaderTable.vue'

const meta = ref(null)

onMounted(async () => {
  meta.value = await fetchJson('meta.json').catch(() => null)
})
</script>

<template>
  <section class="hero">
    <p class="eyebrow">FFXIV 繁中服 · FFLogs 上傳者排行榜</p>
    <h2 class="hero-q"><em>誰</em>把我的 Log 上傳了？</h2>
    <p v-if="meta" class="hero-stats">
      <span><b>{{ meta.report_count.toLocaleString() }}</b> 筆公開 report</span>
      <span><b>{{ meta.uploader_count.toLocaleString() }}</b> 位上傳者</span>
      <span><b>{{ meta.player_count.toLocaleString() }}</b> 位繁中服玩家</span>
      <span>更新於 {{ new Date(meta.updated_at_iso).toLocaleString('zh-TW') }}</span>
    </p>
    <MonthlyBars v-if="meta?.monthly" :monthly="meta.monthly" label="全站每月公開 report 數" />
  </section>
  <p class="tier-legend">
    名次配色沿用 parse 百分位：
    <span class="tier-gold">■ 第 1</span>
    <span class="tier-pink">■ 前 1%</span>
    <span class="tier-orange">■ 前 5%</span>
    <span class="tier-purple">■ 前 25%</span>
    <span class="tier-blue">■ 前 50%</span>
    <span class="tier-green">■ 前 75%</span>
  </p>
  <UploaderTable />
</template>
```

- [ ] **Step 3: 編譯與人工驗證**

Run: `npm run build`
Expected: 成功。再 `npm run dev`，開首頁確認上傳者榜行為與先前一致（排序切換、前 100、顯示全部、名次配色），關掉 dev server。

- [ ] **Step 4: Commit**

```bash
git add src/components/UploaderTable.vue src/pages/HomePage.vue
git commit -m "refactor: 上傳者榜抽成 UploaderTable 元件

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: PlayerRankingTable 元件 + 樣式

**Files:**
- Create: `src/components/PlayerRankingTable.vue`
- Modify: `src/styles.css`（「── 響應式與動效偏好 ──」區塊之前插入）

- [ ] **Step 1: 建立 src/components/PlayerRankingTable.vue**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchJson } from '../lib/data.js'
import { tierClass } from '../lib/tier.js'

const DISPLAY_LIMIT = 100
const SERVERS = ['伊弗利特', '迦樓羅', '利維坦', '鳳凰', '奧汀', '巴哈姆特', '泰坦']
const COLUMNS = [
  ['reports', '被收錄 report 數'],
  ['uploaders', '不重複上傳者數'],
]

const players = ref(null)
const error = ref(null)
const server = ref('全部')
const sortKey = ref('reports')
const showAll = ref(false)

const filtered = computed(() => {
  if (!players.value) return []
  const list =
    server.value === '全部'
      ? players.value
      : players.value.filter((p) => p.key.split('@')[1] === server.value)
  return [...list].sort((a, b) => b[sortKey.value] - a[sortKey.value] || a.key.localeCompare(b.key))
})

const visible = computed(() => (showAll.value ? filtered.value : filtered.value.slice(0, DISPLAY_LIMIT)))

function selectServer(s) {
  server.value = s
  showAll.value = false
}

onMounted(async () => {
  try {
    const data = await fetchJson('players_ranking.json')
    players.value = data.players
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <p v-if="error" class="state-msg">資料載入失敗：{{ error }}。請重新整理頁面。</p>
  <template v-else-if="players">
    <div class="filters">
      <button type="button" :class="{ active: server === '全部' }" @click="selectServer('全部')">全部</button>
      <button
        v-for="s in SERVERS"
        :key="s"
        type="button"
        :class="{ active: server === s }"
        @click="selectServer(s)"
      >{{ s }}</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>角色</th>
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
        <tr v-for="(p, i) in visible" :key="p.key">
          <td class="rank" :class="tierClass(i, filtered.length)">{{ i + 1 }}</td>
          <td><a :href="`#/player/${encodeURIComponent(p.key)}`">{{ p.key }}</a></td>
          <td v-for="[key] in COLUMNS" :key="key" class="num">{{ p[key].toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!showAll && filtered.length > DISPLAY_LIMIT" class="show-all">
      <button type="button" @click="showAll = true">
        顯示全部 {{ filtered.length.toLocaleString() }} 位角色
      </button>
    </p>
  </template>
  <p v-else class="state-msg">載入中…</p>
</template>
```

- [ ] **Step 2: src/styles.css 加 tab 與篩選列樣式（插在「/* ── 響應式與動效偏好 ── */」之前）**

```css
/* ── tab 列 ── */
.tabs {
  display: flex;
  gap: 1.5rem;
  margin: 1.5rem 0 0.5rem;
  border-bottom: 1px solid var(--line);
}

.tabs a {
  padding: 0.5rem 0;
  color: var(--muted);
  font-family: var(--serif);
  font-size: 1.05rem;
  font-weight: 700;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tabs a:hover { color: var(--text); text-decoration: none; }
.tabs a.active { color: var(--gold); border-bottom-color: var(--gold); }

/* ── 伺服器篩選列 ── */
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 1rem 0;
}

.filters button {
  font: inherit;
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--muted);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.filters button:hover { color: var(--text); }
.filters button.active { color: var(--bg); background: var(--gold); border-color: var(--gold); }
```

- [ ] **Step 3: 編譯驗證**

Run: `npm run build`
Expected: 成功（元件尚未接頁面，僅確認語法）。

- [ ] **Step 4: Commit**

```bash
git add src/components/PlayerRankingTable.vue src/styles.css
git commit -m "feat: PlayerRankingTable 角色排行榜元件（伺服器篩選 + 排序）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: HomePage 接 tab + 路由

**Files:**
- Modify: `src/lib/router.js`, `src/App.vue`, `src/pages/HomePage.vue`

- [ ] **Step 1: router.js —— 加 players 路由**

找到 `if (h.startsWith('uploader/')) ...` 那行，在它**之後**、`return { name: 'home' }` **之前**加入：

```js
  if (h === 'players') return { name: 'players' }
```

- [ ] **Step 2: App.vue —— home/players 都導向 HomePage 並傳 active**

找到：

```vue
    <HomePage v-else />
```

替換為：

```vue
    <HomePage v-else :active="route.name === 'players' ? 'players' : 'uploaders'" />
```

- [ ] **Step 3: HomePage.vue —— 加 active prop、tab 列、依 active 切換表格（整檔取代）**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { fetchJson } from '../lib/data.js'
import MonthlyBars from '../components/MonthlyBars.vue'
import UploaderTable from '../components/UploaderTable.vue'
import PlayerRankingTable from '../components/PlayerRankingTable.vue'

defineProps({ active: { type: String, default: 'uploaders' } })

const meta = ref(null)

onMounted(async () => {
  meta.value = await fetchJson('meta.json').catch(() => null)
})
</script>

<template>
  <section class="hero">
    <p class="eyebrow">FFXIV 繁中服 · FFLogs 公開報告交叉比對</p>
    <h2 class="hero-q"><em>誰</em>把我的 Log 上傳了？</h2>
    <p v-if="meta" class="hero-stats">
      <span><b>{{ meta.report_count.toLocaleString() }}</b> 筆公開 report</span>
      <span><b>{{ meta.uploader_count.toLocaleString() }}</b> 位上傳者</span>
      <span><b>{{ meta.player_count.toLocaleString() }}</b> 位繁中服玩家</span>
      <span>更新於 {{ new Date(meta.updated_at_iso).toLocaleString('zh-TW') }}</span>
    </p>
    <MonthlyBars v-if="meta?.monthly" :monthly="meta.monthly" label="全站每月公開 report 數" />
  </section>
  <nav class="tabs">
    <a href="#/" :class="{ active: active === 'uploaders' }">上傳者排行榜</a>
    <a href="#/players" :class="{ active: active === 'players' }">角色排行榜</a>
  </nav>
  <p class="tier-legend">
    名次配色沿用 parse 百分位：
    <span class="tier-gold">■ 第 1</span>
    <span class="tier-pink">■ 前 1%</span>
    <span class="tier-orange">■ 前 5%</span>
    <span class="tier-purple">■ 前 25%</span>
    <span class="tier-blue">■ 前 50%</span>
    <span class="tier-green">■ 前 75%</span>
  </p>
  <UploaderTable v-if="active === 'uploaders'" />
  <PlayerRankingTable v-else />
</template>
```

- [ ] **Step 4: 人工驗證**

Run: `npm run build`
Expected: 成功。`npm run dev` 後驗證：`#/` 顯示上傳者榜 tab 高亮；點「角色排行榜」→ URL 變 `#/players`、顯示角色榜、伺服器按鈕可篩選、排序可切換、前 100 截斷、名次配色；點某角色 → 進玩家詳情頁；直接開 `#/players` 也正確。關掉 dev server。

- [ ] **Step 5: Commit**

```bash
git add src/lib/router.js src/App.vue src/pages/HomePage.vue
git commit -m "feat: 首頁雙分頁 tab 與 #/players 路由

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: SearchBox 改用合併後的新檔

**Files:**
- Modify: `src/components/SearchBox.vue`

- [ ] **Step 1: 修改 ensureIndex 的資料源**

找到：

```js
async function ensureIndex() {
  if (!index.value) index.value = await fetchJson('players_index.json').catch(() => [])
}
```

替換為：

```js
async function ensureIndex() {
  if (!index.value) {
    const data = await fetchJson('players_ranking.json').catch(() => ({ players: [] }))
    index.value = data.players.map((p) => p.key)
  }
}
```

（其餘不動：`candidates` 仍對 `index.value`（字串陣列）做 `includes` 比對、`go` 仍導向 `#/player/<key>`。）

- [ ] **Step 2: 人工驗證**

Run: `npm run build`
Expected: 成功。`npm run dev` 後在搜尋框輸入中文 → 出現候選 → 點選跳玩家頁。關掉 dev server。

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchBox.vue
git commit -m "refactor: 搜尋框改用 players_ranking.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 全套驗證、合併、部署確認

- [ ] **Step 1: 全套驗證**

```bash
npm test && npm run build:data && npm run validate:data && npm run build
```

Expected: 15/15 測試、validate 通過、build 成功。

- [ ] **Step 2: 合併回 main 並推送**

```bash
git checkout main
git merge --no-ff feat/player-leaderboard -m "Merge feat/player-leaderboard: 被上傳角色排行榜

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main feat/player-leaderboard
```

- [ ] **Step 3: 等 CI 完成並確認線上**

```bash
curl -s https://ffxivtw.github.io/logs/data/players_ranking.json | python3 -c "import json,sys;d=json.load(sys.stdin);print('players',len(d['players']));print(d['players'][:2])"
```

Expected: players 約 11769；前 2 名 reports 由大到小。（CI 狀態可用 PAT 查 actions/runs，或請使用者開 Actions 頁確認。）

---

## 驗收清單

- 15/15 測試通過；validate:data 改檢查 players_ranking（降冪、欄位、長度、key 含 @）。
- `players_index.json` 不再產生，`players_ranking.json` 已產生且搜尋框正常。
- 首頁 tab 可切上傳者榜 / 角色榜；`#/players` 可分享。
- 角色榜：伺服器篩選、雙指標排序、前 100 + 顯示全部、parse 色階、列連玩家詳情頁。
- 線上 players_ranking.json 可取得。
