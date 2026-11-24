<script setup lang="ts">
// One view for the referee's whole session at `/referee/:accessToken`: name form, waiting,
// scoring and finished, all driven by the `referee` store. An invalid session redirects to the
// invalid-access page (the store keeps the reason for it).
import { onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRefereeStore } from '@/stores/referee'
import RefereeFinished from './components/RefereeFinished.vue'
import RefereeNameForm from './components/RefereeNameForm.vue'
import RefereeScoring from './components/RefereeScoring.vue'
import RefereeWaiting from './components/RefereeWaiting.vue'

const { accessToken } = defineProps<{ accessToken: string }>()

const router = useRouter()
const referee = useRefereeStore()

watch(
  () => accessToken,
  (token) => void referee.start(token),
  { immediate: true },
)

watch(
  () => referee.phase,
  (phase) => {
    if (phase === 'invalid') void router.replace({ name: 'referee-invalid-access' })
  },
  { immediate: true },
)

onBeforeUnmount(() => referee.dispose())
</script>

<template>
  <RefereeNameForm
    v-if="referee.phase === 'name'"
    :key="accessToken"
    :initial-name="referee.name ?? ''"
    :error="referee.joinError ?? undefined"
    @submit="referee.join"
  />
  <p
    v-else-if="referee.phase !== 'invalid' && !referee.fight"
    class="session__connecting text-body-m"
    role="status"
  >
    Conectando…
  </p>
  <RefereeWaiting
    v-else-if="referee.fight?.status === 'scheduled'"
    :robots="{ A: referee.fight.robots.A.name, B: referee.fight.robots.B.name }"
  />
  <RefereeScoring
    v-else-if="referee.fight?.status === 'ongoing' || referee.fight?.status === 'paused'"
  />
  <RefereeFinished
    v-else-if="referee.phase === 'finished' && referee.fight"
    :robots="{ A: referee.fight.robots.A.name, B: referee.fight.robots.B.name }"
    :score="referee.fight.score"
    :end-reason="referee.fight.endReason"
    :winner-side="referee.winnerSide"
  />
</template>

<style scoped>
.session__connecting {
  color: var(--color-muted);
}
</style>
