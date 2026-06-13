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
