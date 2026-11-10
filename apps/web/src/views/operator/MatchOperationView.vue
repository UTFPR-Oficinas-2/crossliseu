<script setup lang="ts">
import FightRecorderPanel from './components/FightRecorderPanel.vue'

const { matchId } = defineProps<{ matchId: string }>()
</script>

<template>
  <h1 class="text-heading-l">Operação da luta</h1>
  <FightRecorderPanel :match-id="matchId" />
</template>
