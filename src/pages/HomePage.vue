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
    <h2 class="hero-q">到底是<em>誰</em>上傳我的 log = =</h2>
    <p class="hero-sub">我有同意嗎？</p>
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
