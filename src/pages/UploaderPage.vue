<script setup>
import { ref, onMounted } from 'vue'
import { fetchJson } from '../lib/data.js'
import MonthlyBars from '../components/MonthlyBars.vue'
import IdentityBadge from '../components/IdentityBadge.vue'

const props = defineProps({ uploaderId: String })
const data = ref(undefined)
const meta = ref(null)

onMounted(async () => {
  meta.value = await fetchJson('meta.json').catch(() => null)
  data.value = await fetchJson(`uploaders/${props.uploaderId}.json`).catch(() => null)
})
</script>

<template>
  <p v-if="data === undefined" class="state-msg">載入中…</p>
  <p v-else-if="data === null" class="state-msg">找不到此上傳者。從首頁排行榜重新選取。</p>
  <template v-else>
    <div class="title-row">
      <h2 class="page-title">{{ data.name }}</h2>
      <a class="profile-link" :href="`https://www.fflogs.com/user/${data.id}`" target="_blank" rel="noopener">
        FFLogs 個人頁 ↗
      </a>
    </div>
    <p class="page-summary">
      <b>{{ data.report_count.toLocaleString() }}</b> 筆 report ·
      <b>{{ data.fight_count.toLocaleString() }}</b> 場戰鬥 ·
      <b>{{ data.players.length.toLocaleString() }}</b> 位繁中服玩家
    </p>
    <p v-if="data.players.length" class="identity">
      推測本人角色
      <a :href="`#/player/${encodeURIComponent(data.players[0].key)}`">{{ data.players[0].key }}</a>
      <IdentityBadge :char-reports="data.players[0].report_count" :owner-total="data.report_count" />
    </p>
    <MonthlyBars v-if="data.monthly" :monthly="data.monthly" label="每月上傳的 report 數" />
    <p>
      <span v-for="(n, k) in data.encounters" :key="k" class="tag">
        {{ meta?.encounters?.[k] ?? k }} <b>×{{ n }}</b>
      </span>
    </p>
    <table>
      <thead>
        <tr><th>玩家</th><th>Report 數</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in data.players" :key="p.key">
          <td><a :href="`#/player/${encodeURIComponent(p.key)}`">{{ p.key }}</a></td>
          <td class="num">{{ p.report_count }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
