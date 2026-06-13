<script setup>
import { ref, computed } from 'vue'
import { fetchJson } from '../lib/data.js'

const query = ref('')
const index = ref(null)
const focused = ref(false)

async function ensureIndex() {
  if (!index.value) {
    const data = await fetchJson('players_ranking.json').catch(() => ({ players: [] }))
    index.value = data.players.map((p) => p.key)
  }
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
