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
