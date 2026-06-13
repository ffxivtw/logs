# 上傳者身份推測（本人可能性）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用「角色佔帳號上傳比例」推測上傳帳號背後的角色，正向（上傳者頁推測本人）與反向（玩家頁各帳號本人可能性排名）雙向呈現，信心折成 5 級信號點。

**Architecture:** 純函式 `identityLevel(charReports, ownerTotal)` 算分級（正反向共用）；玩家分片每個 uploader 條目新增 `owner_total`（該帳號總上傳數）以支援反向；`IdentityBadge.vue` 渲染 5 點信號；上傳者頁用 `players[0]` 推測本人，玩家頁加徽章 + 排序切換 + ★。

**Tech Stack:** 既有棧不變（Node 內建模組、Vue 3，零新相依）。

**Spec:** `docs/superpowers/specs/2026-06-13-identity-inference-design.md`

**執行者必讀背景：**

- 先開分支 `feat/identity-inference`（Task 1 Step 0）。
- 信心佔比 `r = charReports / ownerTotal`。5 級分界：r≥0.90→5（極可能本人）、0.75–0.90→4（很可能）、0.50–0.75→3（可能）、0.30–0.50→2（不太像）、<0.30→1（不像）。`ownerTotal < 5` 為低樣本（lowSample）。
- `buildOutputs`（scripts/lib/aggregate.mjs）玩家迴圈中，`uploaderList` 的每個條目 `.map((pu) => ({ id, name, reports }))` 來自 `players.get(key)`；`buildOutputs` 的參數 `uploaders` 是 aggregate 回傳的 Map，`uploaders.get(pu.id).report_count` 即該帳號總上傳數（pu.id 必存在於 uploaders map）。
- 玩家分片消費端 `fetchPlayer` 回傳的 entry：`{ uploaders: [{id, name, reports:[...]}], monthly }`，`uploaders` 已按 `reports.length` 降冪。上傳者明細 `uploaders/<id>.json`：`{id, name, report_count, fight_count, encounters, monthly, players:[{key, report_count}]}`，`players` 已按 report_count 降冪。
- 既有 `package.json` 的 `test` script 是 `node --test scripts/build_data.test.mjs`。
- git identity 已設好；commit 訊息結尾固定 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: identityLevel 共用函式（TDD）

**Files:**
- Create: `src/lib/identity.js`, `scripts/identity.test.mjs`
- Modify: `package.json`

- [ ] **Step 0: 開分支**

```bash
git checkout -b feat/identity-inference
```

- [ ] **Step 1: package.json —— test script 涵蓋新測試檔**

把 `"test": "node --test scripts/build_data.test.mjs",` 改為：

```json
    "test": "node --test scripts/build_data.test.mjs scripts/identity.test.mjs",
```

- [ ] **Step 2: 寫失敗的測試 scripts/identity.test.mjs**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identityLevel } from '../src/lib/identity.js'

test('identityLevel 分界點', () => {
  assert.equal(identityLevel(90, 100).filled, 5)
  assert.equal(identityLevel(89, 100).filled, 4)
  assert.equal(identityLevel(75, 100).filled, 4)
  assert.equal(identityLevel(74, 100).filled, 3)
  assert.equal(identityLevel(50, 100).filled, 3)
  assert.equal(identityLevel(49, 100).filled, 2)
  assert.equal(identityLevel(30, 100).filled, 2)
  assert.equal(identityLevel(29, 100).filled, 1)
})

test('identityLevel 等級文字', () => {
  assert.equal(identityLevel(95, 100).label, '極可能本人')
  assert.equal(identityLevel(80, 100).label, '很可能')
  assert.equal(identityLevel(60, 100).label, '可能')
  assert.equal(identityLevel(40, 100).label, '不太像')
  assert.equal(identityLevel(10, 100).label, '不像')
})

test('identityLevel 低樣本旗標與分母', () => {
  assert.equal(identityLevel(4, 4).lowSample, true)
  assert.equal(identityLevel(5, 5).lowSample, false)
  assert.equal(identityLevel(48, 50).sample, '48/50')
  assert.equal(identityLevel(4, 4).filled, 5)
})

test('identityLevel 防呆 ownerTotal<=0', () => {
  const r = identityLevel(3, 0)
  assert.equal(r.filled, 1)
  assert.equal(r.lowSample, true)
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm test`
Expected: identity 測試 FAIL（模組不存在），build_data 既有測試 PASS。

- [ ] **Step 4: 實作 src/lib/identity.js**

```js
// 上傳帳號「本人可能性」分級。正向（上傳者頁）與反向（玩家頁）共用。
// 佔比 r = 該角色出現的 report 數 / 該帳號總上傳數。
const LEVELS = [
  { min: 0.9, filled: 5, label: '極可能本人' },
  { min: 0.75, filled: 4, label: '很可能' },
  { min: 0.5, filled: 3, label: '可能' },
  { min: 0.3, filled: 2, label: '不太像' },
  { min: 0, filled: 1, label: '不像' },
]

export function identityLevel(charReports, ownerTotal) {
  if (!ownerTotal || ownerTotal <= 0) {
    return { filled: 1, label: '不像', lowSample: true, sample: `${charReports || 0}/0` }
  }
  const r = charReports / ownerTotal
  const tier = LEVELS.find((t) => r >= t.min)
  return {
    filled: tier.filled,
    label: tier.label,
    lowSample: ownerTotal < 5,
    sample: `${charReports}/${ownerTotal}`,
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npm test`
Expected: 全部 PASS（build_data 15 + identity 4）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/identity.js scripts/identity.test.mjs package.json
git commit -m "feat: identityLevel 本人可能性分級共用函式

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 玩家分片加 owner_total（TDD）

**Files:**
- Modify: `scripts/lib/aggregate.mjs`
- Test: `scripts/build_data.test.mjs`

- [ ] **Step 1: 寫失敗的測試（附加到 scripts/build_data.test.mjs 末尾）**

```js
test('owner_total: 玩家分片 uploader 條目含該帳號總上傳數', () => {
  const out = buildSample()
  const entry = out.playerShards.get(shardOf('小明@鳳凰'))['小明@鳳凰']
  // up1（id 1）總上傳 2 筆（R1, R2）；up2（id 2）總上傳 1 筆（R3）
  assert.equal(entry.uploaders[0].id, 1)
  assert.equal(entry.uploaders[0].owner_total, 2)
  assert.equal(entry.uploaders[1].id, 2)
  assert.equal(entry.uploaders[1].owner_total, 1)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: 新測試 FAIL（owner_total undefined），其餘 PASS。

- [ ] **Step 3: 實作（scripts/lib/aggregate.mjs 的 buildOutputs 玩家迴圈）**

找到玩家迴圈中建 uploaderList 的 `.map(...)`：

```js
      .map((pu) => ({
        id: pu.id,
        name: pu.name,
        reports: [...pu.reports].sort(
          (a, b) => (b.time_iso ?? '').localeCompare(a.time_iso ?? '') || a.code.localeCompare(b.code),
        ),
      }))
```

在 `name: pu.name,` 之後加 `owner_total`：

```js
      .map((pu) => ({
        id: pu.id,
        name: pu.name,
        owner_total: uploaders.get(pu.id).report_count,
        reports: [...pu.reports].sort(
          (a, b) => (b.time_iso ?? '').localeCompare(a.time_iso ?? '') || a.code.localeCompare(b.code),
        ),
      }))
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`
Expected: 全部 PASS（build_data 16 + identity 4）。

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: 玩家分片 uploader 加 owner_total（帳號總上傳數）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: validate 加 owner_total 檢查 + 實資料驗證

**Files:**
- Modify: `scripts/validate_data.mjs`

- [ ] **Step 1: 在玩家分片迴圈加 owner_total 檢查**

`scripts/validate_data.mjs` 的玩家分片迴圈中，目前每個玩家 entry 會檢查 `value.uploaders`（既有 `if (!Array.isArray(value.uploaders) || value.uploaders.length === 0) fail(...)`），在它之後加：

```js
    for (const u of value.uploaders) {
      if (!Number.isInteger(u.owner_total) || u.owner_total < 1) {
        fail(`玩家 ${key} 的上傳者 ${u.id} owner_total 異常`)
      }
      if (u.owner_total < u.reports.length) {
        fail(`玩家 ${key} 的上傳者 ${u.id} owner_total(${u.owner_total}) 小於該玩家筆數(${u.reports.length})`)
      }
    }
```

- [ ] **Step 2: 重建實資料並驗證**

```bash
npm run build:data && npm run validate:data
```

Expected: build reports≈28k；validate 通過。

- [ ] **Step 3: 抽查 owner_total 已寫入分片**

```bash
node -e "const d=require('./public/data/players/00.json');const k=Object.keys(d)[0];console.log(k, d[k].uploaders[0])"
```

Expected: 第一個 uploader 條目含 `owner_total`（正整數，≥ 其 reports 長度）。

- [ ] **Step 4: Commit**

```bash
git add scripts/validate_data.mjs
git commit -m "feat: validate 檢查玩家分片 owner_total

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: IdentityBadge 元件 + 樣式

**Files:**
- Create: `src/components/IdentityBadge.vue`
- Modify: `src/styles.css`（「── 響應式與動效偏好 ──」之前插入）

- [ ] **Step 1: 建立 src/components/IdentityBadge.vue**

```vue
<script setup>
import { computed } from 'vue'
import { identityLevel } from '../lib/identity.js'

const props = defineProps({ charReports: Number, ownerTotal: Number })
const info = computed(() => identityLevel(props.charReports, props.ownerTotal))
</script>

<template>
  <span
    class="idbadge"
    :class="{ low: info.lowSample }"
    :title="`本人可能性：${info.label}（出現在 ${info.sample} 筆上傳${info.lowSample ? '，樣本少僅供參考' : ''}）`"
  >
    <span class="dots" aria-hidden="true">
      <span v-for="n in 5" :key="n" class="dot" :class="{ on: n <= info.filled }"></span>
    </span>
    <span class="idlabel">{{ info.label }}</span>
    <span class="idsample">{{ info.sample }}</span>
    <span v-if="info.lowSample" class="idlow">樣本少</span>
  </span>
</template>
```

- [ ] **Step 2: src/styles.css 加徽章樣式（插在「/* ── 響應式與動效偏好 ── */」之前）**

```css
/* ── 本人可能性信號徽章 ── */
.idbadge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--mono);
  font-size: 0.78rem;
  color: var(--text);
}

.idbadge .dots { display: inline-flex; gap: 2px; }

.idbadge .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--line);
}

.idbadge .dot.on { background: var(--gold); }

.idbadge .idsample { color: var(--muted); }

.idbadge .idlow {
  color: var(--bg);
  background: var(--muted);
  border-radius: 999px;
  padding: 0 0.4rem;
  font-size: 0.7rem;
}

.idbadge.low { opacity: 0.55; }
.idbadge.low .dot.on { background: var(--muted); }

/* 推測本人區塊（上傳者頁） */
.identity {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1rem 0;
  font-family: var(--mono);
  font-size: 0.85rem;
  color: var(--muted);
}

.identity a { color: var(--text); font-weight: 600; }

/* ★ 最可能是本人 */
.id-star {
  color: var(--gold);
  font-family: var(--mono);
  font-size: 0.75rem;
  white-space: nowrap;
}
```

- [ ] **Step 3: 編譯驗證**

Run: `npm run build`
Expected: 成功（元件尚未接頁面，僅確認語法）。

- [ ] **Step 4: Commit**

```bash
git add src/components/IdentityBadge.vue src/styles.css
git commit -m "feat: IdentityBadge 本人可能性信號徽章元件

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 上傳者頁正向推測

**Files:**
- Modify: `src/pages/UploaderPage.vue`

- [ ] **Step 1: import 元件並在 summary 後插入推測本人區塊**

`<script setup>` 的 import 區（`import MonthlyBars ...` 那行後）加：

```js
import IdentityBadge from '../components/IdentityBadge.vue'
```

template 中，找到 page-summary 那段的結尾 `</p>` 與 `<MonthlyBars ... />` 之間，插入：

```vue
    <p v-if="data.players.length" class="identity">
      推測本人角色
      <a :href="`#/player/${encodeURIComponent(data.players[0].key)}`">{{ data.players[0].key }}</a>
      <IdentityBadge :char-reports="data.players[0].report_count" :owner-total="data.report_count" />
    </p>
```

（`data.players[0]` 是此帳號上傳最多的角色；信心 = 它的 report_count / 帳號 report_count，由 IdentityBadge 內部算。）

- [ ] **Step 2: 人工驗證**

Run: `npm run build`（須成功）。`npm run dev` 後開任一上傳者頁（從首頁排行榜點入），確認「推測本人角色」區塊顯示角色連結 + 信號點 + 等級 + 分母；高上傳量帳號通常 ●●●●● 極可能本人。關掉 dev server。

- [ ] **Step 3: Commit**

```bash
git add src/pages/UploaderPage.vue
git commit -m "feat: 上傳者頁推測本人角色

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 玩家頁反向推測（徽章 + 排序切換 + ★）

**Files:**
- Modify: `src/pages/PlayerPage.vue`

- [ ] **Step 1: 整檔取代 src/pages/PlayerPage.vue**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchJson, fetchPlayer } from '../lib/data.js'
import MonthlyBars from '../components/MonthlyBars.vue'
import IdentityBadge from '../components/IdentityBadge.vue'

const props = defineProps({ playerKey: String })
const result = ref(undefined) // undefined=載入中, null=查無
const meta = ref(null)
const open = ref(new Set())
const sortMode = ref('reports') // 'reports' | 'identity'

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

const sortedUploaders = computed(() => {
  if (!result.value) return []
  const list = [...result.value.uploaders]
  if (sortMode.value === 'identity') {
    list.sort((a, b) => {
      const ra = a.owner_total ? a.reports.length / a.owner_total : 0
      const rb = b.owner_total ? b.reports.length / b.owner_total : 0
      return rb - ra || b.reports.length - a.reports.length
    })
  }
  return list // 'reports'：維持後端已按 reports.length 降冪的順序
})

// 樣本足（owner_total >= 5）中本人可能性最高的帳號 id，標★
const bestUploaderId = computed(() => {
  if (!result.value) return null
  let best = null
  let bestRatio = -1
  for (const u of result.value.uploaders) {
    if (!u.owner_total || u.owner_total < 5) continue
    const ratio = u.reports.length / u.owner_total
    if (ratio > bestRatio) {
      bestRatio = ratio
      best = u.id
    }
  }
  return best
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
    <div class="filters">
      <button type="button" :class="{ active: sortMode === 'reports' }" @click="sortMode = 'reports'">依上傳筆數</button>
      <button type="button" :class="{ active: sortMode === 'identity' }" @click="sortMode = 'identity'">依本人可能性</button>
    </div>
    <div v-for="u in sortedUploaders" :key="u.id" class="uploader">
      <button
        type="button"
        class="uploader-head"
        :aria-expanded="open.has(u.id)"
        @click="toggle(u.id)"
      >
        <span class="caret">{{ open.has(u.id) ? '▼' : '▶' }}</span>
        <a :href="`#/uploader/${u.id}`" @click.stop>{{ u.name }}</a>
        <span v-if="u.id === bestUploaderId" class="id-star">★ 最可能是本人</span>
        <IdentityBadge v-if="u.owner_total" :char-reports="u.reports.length" :owner-total="u.owner_total" />
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

Run: `npm run build`（須成功）。`npm run dev` 後開一個被多帳號上傳的角色頁（例如從角色榜點榜首），確認：每張上傳者卡片有信號徽章 + 分母；切「依本人可能性」會重排；樣本足且佔比最高者標「★ 最可能是本人」；展開明細仍正常。關掉 dev server。

- [ ] **Step 3: Commit**

```bash
git add src/pages/PlayerPage.vue
git commit -m "feat: 玩家頁反向本人可能性（徽章 + 排序切換 + ★）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 全套驗證、合併、部署確認

- [ ] **Step 1: 全套驗證**

```bash
npm test && npm run build:data && npm run validate:data && npm run build
```

Expected: build_data 16 + identity 4 = 20 測試通過、validate 通過、build 成功。

- [ ] **Step 2: 合併回 main 並推送**

```bash
git checkout main
git merge --no-ff feat/identity-inference -m "Merge feat/identity-inference: 上傳者身份推測

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main feat/identity-inference
```

- [ ] **Step 3: 等 CI 完成並確認線上**

```bash
curl -s https://ffxivtw.github.io/logs/data/players/00.json | python3 -c "import json,sys;d=json.load(sys.stdin);k=list(d)[0];print(k, 'owner_total' in d[k]['uploaders'][0], d[k]['uploaders'][0].get('owner_total'))"
```

Expected: `True` 與一個正整數。

---

## 驗收清單

- 20 測試通過（含 identityLevel 分界/標籤/低樣本/防呆）；validate 檢查 owner_total。
- 玩家分片含 owner_total（≥ 各玩家筆數）。
- 上傳者頁：推測本人角色 + 5 級信號徽章（不顯示 %），高量帳號顯極可能。
- 玩家頁：每帳號信號徽章、排序可切「筆數 / 本人可能性」、樣本足最高者標★、舊資料無 owner_total 時不渲染徽章。
- 線上玩家分片含 owner_total。
