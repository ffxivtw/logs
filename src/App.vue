<script setup>
import { useRoute } from './lib/router.js'
import HomePage from './pages/HomePage.vue'
import PlayerPage from './pages/PlayerPage.vue'
import UploaderPage from './pages/UploaderPage.vue'
import SearchBox from './components/SearchBox.vue'

const route = useRoute()
</script>

<template>
  <header>
    <h1><a href="#/">到底是<em>誰</em>上傳我的 log = =</a></h1>
    <SearchBox />
  </header>
  <main>
    <PlayerPage v-if="route.name === 'player'" :key="route.key" :player-key="route.key" />
    <UploaderPage v-else-if="route.name === 'uploader'" :key="route.id" :uploader-id="route.id" />
    <HomePage v-else :active="route.name === 'players' ? 'players' : 'uploaders'" />
  </main>
  <footer>非官方社群工具，資料皆來自 FFLogs 公開報告，不代表完整通關紀錄。</footer>
</template>
