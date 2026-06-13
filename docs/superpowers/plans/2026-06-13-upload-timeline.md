# 上傳關係強化（月度時間軸/副本分布/排行榜截斷）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家/上傳者/全站三層月度上傳統計（build 預算 + SVG 長條圖）、玩家頁副本分布、首頁排行榜前 100 截斷。

**Architecture:** `aggregate`/`buildOutputs` 在掃描時累計 `monthly: {"YYYY-MM": n}` 寫入玩家分片、上傳者明細與 meta；前端新增唯一元件 `MonthlyBars.vue`（inline SVG，連續月份補 0、上限 18 個月）三處重用；副本分布由玩家頁已載入的資料前端彙總，不動 build。全部為加法變更，舊資料缺 `monthly` 時前端以 `v-if` 優雅降級。

**Tech Stack:** 既有棧不變（Node 內建模組、Vue 3、inline SVG，零新相依）。

**Spec:** `docs/superpowers/specs/2026-06-13-upload-timeline-design.md`

**執行者必讀背景：**

- 在 main 分支工作前先開分支 `feat/upload-timeline`（Task 1 Step 0）。
- `scripts/lib/aggregate.mjs` 現有 exports：`shardOf`、`createAccumulator`、`readReportsJson`、`collectReport`、`aggregate`、`buildOutputs`。`aggregate(acc)` 回傳 `{ uploaders, players, reportCount }`；report entry 的 `time_iso` 可能為 null。
- 測試檔 `scripts/build_data.test.mjs` 已有 11 個測試與 helper `makeReport(code, ownerId, ownerName, fightsPlayers, timeIso = '2026-06-01T12:00:00+00:00')`——**傳入 `null` 會保留 null**（default 只對 undefined 生效），測 null time_iso 要用這點。
- 既有測試對輸出做 `deepEqual` 的地方都只取特定欄位/陣列，新增 `monthly` 欄位不會弄壞它們。
- 月度鍵一律 `time_iso.slice(0, 7)`；null 不計入 monthly 但總數照算。
- 輸出物件的 monthly 鍵須**升冪排序**（決定性輸出），用 `sortedMonthly` helper。
- git identity 已設好；commit 訊息結尾固定 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: monthly 彙總（TDD）

**Files:**
- Modify: `scripts/lib/aggregate.mjs`
- Test: `scripts/build_data.test.mjs`

- [ ] **Step 0: 開分支**

```bash
git checkout -b feat/upload-timeline
```

- [ ] **Step 1: 寫失敗的測試（附加到 scripts/build_data.test.mjs 末尾）**

```js
function buildMonthlySample() {
  const acc = createAccumulator()
  collectReport(makeReport('M1', 1, 'up1', [[['小明', '鳳凰']]], '2026-05-15T08:00:00+00:00'), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('M2', 1, 'up1', [[['小明', '鳳凰']]], '2026-06-01T08:00:00+00:00'), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('M3', 2, 'up2', [[['小明', '鳳凰']]], '2026-06-20T08:00:00+00:00'), 'savage_m2s', acc, TC_SERVERS)
  collectReport(makeReport('M4', 1, 'up1', [[['小明', '鳳凰']]], null), 'savage_m1s', acc, TC_SERVERS)
  return buildOutputs(aggregate(acc), { now: '2026-06-13T00:00:00.000Z', encounterNames: {} })
}

test('monthly: meta 全站月度計數且 null time_iso 不計入', () => {
  const out = buildMonthlySample()
  assert.deepEqual(out.meta.monthly, { '2026-05': 1, '2026-06': 2 })
  assert.equal(out.meta.report_count, 4) // M4 無時間仍計入總數
})

test('monthly: uploader 明細含月度、排行榜列不含', () => {
  const out = buildMonthlySample()
  assert.deepEqual(out.uploaderDetails.get(1).monthly, { '2026-05': 1, '2026-06': 1 })
  assert.equal('monthly' in out.uploaders.uploaders[0], false)
})

test('monthly: 玩家分片含月度且鍵升冪', () => {
  const out = buildMonthlySample()
  const entry = out.playerShards.get(shardOf('小明@鳳凰'))['小明@鳳凰']
  assert.deepEqual(entry.monthly, { '2026-05': 1, '2026-06': 2 })
  assert.deepEqual(Object.keys(entry.monthly), ['2026-05', '2026-06'])
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: 3 個新測試 FAIL（meta.monthly undefined 等），既有 11 個 PASS。

- [ ] **Step 3: 實作**

`scripts/lib/aggregate.mjs` 的 `aggregate`：uploader 初始化加 `monthly: {}`，迴圈內累計全站與 uploader 月度，回傳值加 `monthly`：

```js
export function aggregate(acc) {
  const uploaders = new Map()
  const players = new Map()
  const monthly = {}
  for (const r of acc.reports.values()) {
    let u = uploaders.get(r.owner.id)
    if (!u) {
      u = { id: r.owner.id, name: r.owner.name, report_count: 0, fight_count: 0, players: new Set(), encounters: {}, monthly: {} }
      uploaders.set(r.owner.id, u)
    }
    u.report_count += 1
    u.fight_count += r.fight_count
    const month = r.time_iso ? r.time_iso.slice(0, 7) : null
    if (month) {
      monthly[month] = (monthly[month] ?? 0) + 1
      u.monthly[month] = (u.monthly[month] ?? 0) + 1
    }
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
  return { uploaders, players, reportCount: acc.reports.size, monthly }
}
```

`buildOutputs`：模組層加 helper（放在 `buildOutputs` 上方，不 export）：

```js
function sortedMonthly(m) {
  return Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))
}
```

`buildOutputs` 改動四處——簽名解構加 `monthly = {}`；玩家迴圈累計 `playerMonthly` 並寫入分片 entry；`uploaderDetails` 從原始 `uploaders` Map 取該 id 的 monthly；meta 加 monthly：

```js
export function buildOutputs({ uploaders, players, reportCount, monthly = {} }, { now, encounterNames = {} }) {
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
        reports: [...pu.reports].sort(
          (a, b) => (b.time_iso ?? '').localeCompare(a.time_iso ?? '') || a.code.localeCompare(b.code),
        ),
      }))
      .sort((a, b) => b.reports.length - a.reports.length || a.id - b.id)
    const playerMonthly = {}
    for (const pu of uploaderList) {
      let m = perUploaderPlayers.get(pu.id)
      if (!m) { m = new Map(); perUploaderPlayers.set(pu.id, m) }
      m.set(key, pu.reports.length)
      for (const rep of pu.reports) {
        if (rep.time_iso) {
          const mk = rep.time_iso.slice(0, 7)
          playerMonthly[mk] = (playerMonthly[mk] ?? 0) + 1
        }
      }
    }
    const shard = shardOf(key)
    let content = playerShards.get(shard)
    if (!content) { content = {}; playerShards.set(shard, content) }
    content[key] = { uploaders: uploaderList, monthly: sortedMonthly(playerMonthly) }
  }

  const uploaderDetails = new Map()
  for (const u of uploaderRows) {
    const m = perUploaderPlayers.get(u.id) ?? new Map()
    uploaderDetails.set(u.id, {
      ...u,
      monthly: sortedMonthly(uploaders.get(u.id).monthly),
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
      monthly: sortedMonthly(monthly),
    },
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`
Expected: 14/14 PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: 玩家/上傳者/全站三層月度上傳統計

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: validate_data monthly 檢查 + 實資料驗證

**Files:**
- Modify: `scripts/validate_data.mjs`

- [ ] **Step 1: 加 checkMonthly 與三層檢查**

在 `fail` 函式定義之後插入：

```js
function checkMonthly(monthly, cap, label) {
  if (monthly == null || typeof monthly !== 'object') fail(`${label} 缺 monthly`)
  let sum = 0
  for (const [k, v] of Object.entries(monthly)) {
    if (!/^\d{4}-\d{2}$/.test(k)) fail(`${label} monthly 鍵格式錯誤: ${k}`)
    if (!Number.isInteger(v) || v < 1) fail(`${label} monthly 值異常: ${k}=${v}`)
    sum += v
  }
  if (sum > cap) fail(`${label} monthly 總和 ${sum} 超過上限 ${cap}`)
}
```

meta 檢查區塊（`if (meta.uploader_count !== ...)` 之後）加：

```js
checkMonthly(meta.monthly, meta.report_count, 'meta.json')
```

分片迴圈內、`shardKeys += 1` 之前加：

```js
    checkMonthly(
      value.monthly,
      value.uploaders.reduce((s, u) => s + u.reports.length, 0),
      `玩家 ${key}`,
    )
```

檔尾 `console.log` 之前加上傳者明細檢查（此前 validator 沒讀過這些檔，順手補上這個盲點）：

```js
for (const file of readdirSync(join(OUT_DIR, 'uploaders'))) {
  const d = JSON.parse(readFileSync(join(OUT_DIR, 'uploaders', file), 'utf8'))
  checkMonthly(d.monthly, d.report_count, `uploaders/${file}`)
}
```

- [ ] **Step 2: 對實資料跑全管線**

```bash
npm run build:data && npm run validate:data
```

Expected: build 統計與先前同量級（reports≈28k）；validate 通過。若 validate fail，先懷疑實作而非資料。

- [ ] **Step 3: 抽查實際輸出**

```bash
node -e "const m=require('./public/data/meta.json');console.log(m.monthly)"
```

Expected: 從 `2025-12`（或 `2026-01`）到當月的鍵、值合計接近 report_count、鍵升冪。

- [ ] **Step 4: Commit**

```bash
git add scripts/validate_data.mjs
git commit -m "feat: validate_data 檢查三層 monthly 與上傳者明細檔

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: MonthlyBars 元件

**Files:**
- Create: `src/components/MonthlyBars.vue`
- Modify: `src/styles.css`（檔尾「響應式」區塊之前插入）

- [ ] **Step 1: 建立 src/components/MonthlyBars.vue**

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({ monthly: Object, label: String })

const MAX_MONTHS = 18
const SLOT = 14 // 條寬 10 + 間距 4
const CHART_H = 64

// 從最早月到當前月的連續序列（缺月補 0），只留最近 MAX_MONTHS 個
const view = computed(() => {
  const data = props.monthly ?? {}
  const keys = Object.keys(data).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort()
  if (!keys.length) return { months: [], truncated: false }
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const end = cur > keys[keys.length - 1] ? cur : keys[keys.length - 1]
  const months = []
  let [y, m] = keys[0].split('-').map(Number)
  while (months.length < 600) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    months.push({ month: k, count: data[k] ?? 0 })
    if (k === end) break
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return { months: months.slice(-MAX_MONTHS), truncated: months.length > MAX_MONTHS }
})

const max = computed(() => Math.max(1, ...view.value.months.map((m) => m.count)))
const peak = computed(() => view.value.months.find((m) => m.count === max.value))

function barH(count) {
  if (count === 0) return 0.5
  return Math.max(2, (count / max.value) * (CHART_H - 4))
}
</script>

<template>
  <figure v-if="view.months.length" class="mbars">
    <figcaption>
      <span>{{ label }}</span>
      <span v-if="peak && peak.count > 0">峰值 {{ peak.month }} · {{ peak.count.toLocaleString() }} 筆</span>
    </figcaption>
    <svg
      :viewBox="`0 0 ${view.months.length * SLOT} ${CHART_H}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="label"
    >
      <rect
        v-for="(m, i) in view.months"
        :key="m.month"
        class="bar"
        :x="i * SLOT + 2"
        :y="CHART_H - barH(m.count)"
        :width="SLOT - 4"
        :height="barH(m.count)"
      >
        <title>{{ m.month }} · {{ m.count.toLocaleString() }} 筆</title>
      </rect>
    </svg>
    <div class="axis">
      <span>{{ view.truncated ? '… ' : '' }}{{ view.months[0].month }}</span>
      <span>{{ view.months[view.months.length - 1].month }}</span>
    </div>
  </figure>
</template>
```

- [ ] **Step 2: styles.css 加元件樣式（插在「── 響應式與動效偏好 ──」區塊之前）**

```css
/* ── 月度長條圖 ── */
.mbars { margin: 1.5rem 0; }

.mbars figcaption {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.4rem;
}

.mbars svg { display: block; width: 100%; height: 64px; }
.mbars .bar { fill: var(--gold); }
.mbars .bar:hover { fill: var(--pink); }

.mbars .axis {
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--muted);
  margin-top: 0.25rem;
}

/* ── 顯示全部按鈕 ── */
.show-all { text-align: center; margin: 1.25rem 0; }

.show-all button {
  font: inherit;
  font-family: var(--mono);
  font-size: 0.85rem;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
}

.show-all button:hover { border-color: var(--gold); color: var(--gold); }
```

- [ ] **Step 3: 編譯驗證**

Run: `npm run build`
Expected: 成功（元件尚未被引用，僅確認語法）。

- [ ] **Step 4: Commit**

```bash
git add src/components/MonthlyBars.vue src/styles.css
git commit -m "feat: MonthlyBars 月度長條圖元件（inline SVG）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: PlayerPage 強化

**Files:**
- Modify: `src/pages/PlayerPage.vue`（整檔取代）

- [ ] **Step 1: 整檔取代 src/pages/PlayerPage.vue**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchJson, fetchPlayer } from '../lib/data.js'
import MonthlyBars from '../components/MonthlyBars.vue'

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

const monthRange = computed(() => {
  const keys = Object.keys(result.value?.monthly ?? {}).sort()
  return keys.length ? { first: keys[0], last: keys[keys.length - 1] } : null
})

const encounterCounts = computed(() => {
  if (!result.value) return []
  const counts = {}
  for (const u of result.value.uploaders)
    for (const r of u.reports)
      for (const k of r.encounters) counts[k] = (counts[k] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})

onMounted(async () => {
  meta.value = await fetchJson('meta.json').catch(() => null)
  result.value = await fetchPlayer(props.playerKey)
})
</script>

<template>
  <h2 class="page-title">{{ playerKey }}</h2>
  <p v-if="result === undefined" class="state-msg">載入中…</p>
  <p v-else-if="result === null" class="state-msg">
    找不到此玩家的公開紀錄。確認角色名稱與伺服器拼寫，或從搜尋框重新選取。
  </p>
  <template v-else>
    <p class="page-summary">
      <b>{{ result.uploaders.length }}</b> 位上傳者上傳過包含此玩家的 log。點開可逐筆核對原始 report。
      <template v-if="monthRange">
        首次被上傳 <b>{{ monthRange.first }}</b> · 最近 <b>{{ monthRange.last }}</b>
      </template>
    </p>
    <MonthlyBars v-if="result.monthly" :monthly="result.monthly" label="每月被上傳的 report 數" />
    <p v-if="encounterCounts.length">
      <span v-for="[k, n] in encounterCounts" :key="k" class="tag">
        {{ meta?.encounters?.[k] ?? k }} <b>×{{ n }}</b>
      </span>
    </p>
    <div v-for="u in result.uploaders" :key="u.id" class="uploader">
      <button
        type="button"
        class="uploader-head"
        :aria-expanded="open.has(u.id)"
        @click="toggle(u.id)"
      >
        <span class="caret">{{ open.has(u.id) ? '▼' : '▶' }}</span>
        <a :href="`#/uploader/${u.id}`" @click.stop>{{ u.name }}</a>
        <span class="count">{{ u.reports.length }} 筆</span>
      </button>
      <table v-if="open.has(u.id)">
        <thead>
          <tr><th>副本</th><th>時間</th><th>Report</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in u.reports" :key="r.code">
            <td>{{ encounterNames(r.encounters) }}</td>
            <td class="num">{{ r.time_iso ? new Date(r.time_iso).toLocaleString('zh-TW') : '—' }}</td>
            <td><a class="report-code" :href="r.url" target="_blank" rel="noopener">{{ r.code }} ↗</a></td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
```

- [ ] **Step 2: 人工驗證**

`npm run dev`（public/data 已是 Task 2 重建的新資料），開 `#/player/` 任一玩家：長條圖顯示、首次/最近月份正確、副本 tag 計數合理、舊功能（展開明細）不變。

- [ ] **Step 3: Commit**

```bash
git add src/pages/PlayerPage.vue
git commit -m "feat: 玩家頁加被上傳時間軸與副本分布

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: UploaderPage + HomePage 強化

**Files:**
- Modify: `src/pages/UploaderPage.vue`, `src/pages/HomePage.vue`

- [ ] **Step 1: UploaderPage——import 元件並在 summary 後插入圖**

`<script setup>` 的 import 區加：

```js
import MonthlyBars from '../components/MonthlyBars.vue'
```

template 中 `</p>`（page-summary 那段）與 `<p>`（tag 那段）之間插入：

```vue
    <MonthlyBars v-if="data.monthly" :monthly="data.monthly" label="每月上傳的 report 數" />
```

- [ ] **Step 2: HomePage——整檔取代 src/pages/HomePage.vue**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchJson } from '../lib/data.js'
import { tierClass } from '../lib/tier.js'
import MonthlyBars from '../components/MonthlyBars.vue'

const DISPLAY_LIMIT = 100

const data = ref(null)
const meta = ref(null)
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
    ;[data.value, meta.value] = await Promise.all([fetchJson('uploaders.json'), fetchJson('meta.json')])
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <p v-if="error" class="state-msg">資料載入失敗：{{ error }}。請重新整理頁面。</p>
  <template v-else-if="data">
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

- [ ] **Step 3: 人工驗證**

`npm run dev`：首頁 hero 下有全站長條圖、表格只到第 100 列、按鈕顯示「顯示全部 2,7xx 位上傳者」、點擊展開全量且名次配色不變；上傳者頁 summary 下有圖。

- [ ] **Step 4: Commit**

```bash
git add src/pages/
git commit -m "feat: 首頁全站時間軸與排行榜截斷、上傳者頁時間軸

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 全套驗證、合併、部署確認

- [ ] **Step 1: 全套驗證**

```bash
npm test && npm run build:data && npm run validate:data && npm run build
```

Expected: 14/14 測試、validate 通過、build 成功。

- [ ] **Step 2: 合併回 main 並推送**

```bash
git checkout main
git merge --no-ff feat/upload-timeline -m "Merge feat/upload-timeline: 月度時間軸、副本分布、排行榜截斷

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main feat/upload-timeline
```

- [ ] **Step 3: 等 CI 完成並確認線上**

```bash
sleep 100
curl -s https://ffxivtw.github.io/logs/data/meta.json | python3 -c "import json,sys;d=json.load(sys.stdin);print('monthly' in d, list(d.get('monthly',{}).items())[:3])"
```

Expected: `True` 與前幾個月份計數。（CI 狀態可用 PAT 查 actions/runs，或請使用者開 Actions 頁確認。）

---

## 驗收清單

- 14/14 測試通過；validate:data 含三層 monthly 與上傳者明細檔檢查。
- 玩家頁：時間軸 + 首次/最近 + 副本分布；舊資料（無 monthly）不渲染圖、其餘正常。
- 上傳者頁：時間軸。首頁：全站時間軸 + 前 100 截斷 + 顯示全部。
- 線上 meta.json 含 monthly。
