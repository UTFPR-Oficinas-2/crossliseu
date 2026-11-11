<script setup lang="ts">
import FightRecorderPanel from './components/FightRecorderPanel.vue'

const { matchId } = defineProps<{ matchId: string }>()
</script>

<template>
  <h1 class="text-heading-l">Operação da luta</h1>
  <!-- Keyed by match: another fight gets a fresh panel, never the previous fight's video -->
  <FightRecorderPanel :key="matchId" :match-id="matchId" />
</template>
