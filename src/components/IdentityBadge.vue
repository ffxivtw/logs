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
