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
