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
