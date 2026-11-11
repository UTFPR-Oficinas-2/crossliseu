<script setup lang="ts">
import FightRecorderPanel, { type FightPhase } from './components/FightRecorderPanel.vue'

const { matchId } = defineProps<{ matchId: string }>()

// TODO(matches API): not connected yet. The matches backend (match status, start / end of the
// fight) doesn't exist, so the recorder only ever sees the preparation phase here. When it does,
// derive the phase from the match status and stop hardcoding it:
//   scheduled          -> 'before'  (camera preview only)
//   ongoing | paused   -> 'running' (recording starts by itself)
//   finished           -> 'ended'   (the video can be sent / downloaded)
// Recording stays optional: starting or ending the fight must never wait for the camera.
const fightPhase: FightPhase = 'before'
</script>

<template>
  <h1 class="text-heading-l">Operação da luta</h1>
  <!-- Keyed by match: another fight gets a fresh panel, never the previous fight's video -->
  <FightRecorderPanel :key="matchId" :match-id="matchId" :fight-phase="fightPhase" />
</template>
