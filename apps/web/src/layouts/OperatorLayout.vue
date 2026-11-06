<script setup lang="ts">
// Figma: `11 / Operador · Preparação` (node 23:431). Shared frame for the operator screens:
// `Navigation / Operator`, the `Operator / Steps` indicator and the content padding. The page
// content (preparation, running, closing) is rendered by the child route.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OperatorNav from '@/components/ui/OperatorNav.vue'
import { getArenas, getChampionship, getMatch, getRobots } from '@/data'
import type { Arena, Championship, Match, MatchState, Robot } from '@/types'

type StepId = 'preparation' | 'running' | 'closing'
type StepStatus = 'done' | 'current' | 'upcoming'

const steps: { id: StepId; label: string }[] = [
  { id: 'preparation', label: '1 · Preparação' },
  { id: 'running', label: '2 · Em andamento' },
  { id: 'closing', label: '3 · Encerramento' },
]

const stepByState: Record<MatchState, StepId> = {
  scheduled: 'preparation',
  ongoing: 'running',
  paused: 'running',
  finished: 'closing',
}

const route = useRoute()
const router = useRouter()

const match = ref<Match | null>(null)
const championship = ref<Championship | null>(null)
const arena = ref<Arena | null>(null)
const robots = ref<Robot[]>([])

// Data loading lives here. The API has no operator match or arena data yet, so a failed load
// leaves the layout empty (every step reads as upcoming) instead of throwing into the router.
let loadId = 0
async function load(matchId: string) {
  const current = ++loadId
  let loaded: [Match | null, Championship | null, Arena[], Robot[]]
  try {
    const loadedMatch = await getMatch(matchId)
    loaded = loadedMatch
      ? [
          loadedMatch,
          ...(await Promise.all([
            getChampionship(loadedMatch.championshipId),
            getArenas(loadedMatch.championshipId),
            getRobots(loadedMatch.championshipId),
          ])),
        ]
      : [null, null, [], []]
  } catch (error) {
    console.error('Could not load the match', error)
    loaded = [null, null, [], []]
  }
  // Ignore a stale response if the route changed while loading
  if (current !== loadId) return
  const [loadedMatch, loadedChampionship, arenas, loadedRobots] = loaded
  match.value = loadedMatch
  championship.value = loadedChampionship
  arena.value = arenas.find((a) => a.id === loadedMatch?.arenaId) ?? null
  robots.value = loadedRobots
}

watch(
  () => route.params.matchId,
  (matchId) => load(String(matchId ?? '')),
  { immediate: true },
)

const robotName = (id: string | undefined) => robots.value.find((r) => r.id === id)?.name ?? ''
const robotNames = computed(() => ({
  a: robotName(match.value?.robotAId),
  b: robotName(match.value?.robotBId),
}))

// Demo value: there is no arena box connection data yet
const arenaConnected = computed(() => arena.value !== null)

// -1 when there is no match, so every step reads as upcoming
const currentStepIndex = computed(() => {
  const state = match.value?.state
  return state ? steps.findIndex((s) => s.id === stepByState[state]) : -1
})

function stepStatus(index: number): StepStatus {
  if (index < currentStepIndex.value) return 'done'
  if (index === currentStepIndex.value) return 'current'
  return 'upcoming'
}

function exitOperation() {
  if (!match.value) return
  router.push({
    name: 'championship-matches',
    params: { championshipId: match.value.championshipId },
  })
}
</script>

<template>
  <div class="operator-layout">
    <!-- Without a match there is no fight context to show, so the nav is omitted -->
    <OperatorNav
      v-if="match"
      :arena="arena?.name ?? ''"
      :championship="championship?.name ?? ''"
      :robot-a="robotNames.a"
      :robot-b="robotNames.b"
      :arena-connected="arenaConnected"
      @exit="exitOperation"
    />

    <main class="operator-layout__content">
      <nav v-if="match" class="operator-layout__steps" aria-label="Etapas da operação">
        <ol class="operator-steps">
          <li
            v-for="(step, index) in steps"
            :key="step.id"
            :class="['operator-steps__item', `operator-steps__item--${stepStatus(index)}`]"
            :aria-current="stepStatus(index) === 'current' ? 'step' : undefined"
          >
            <span class="operator-steps__line" aria-hidden="true"></span>
            <span class="operator-steps__label text-label-s">{{ step.label }}</span>
          </li>
        </ol>
      </nav>

      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.operator-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-bg);
}

.operator-layout__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-7) var(--space-8) var(--space-9);
}

.operator-steps {
  display: flex;
  align-items: center;
  padding: 0;
  list-style: none;
}

.operator-steps__item {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-14px) var(--space-18px);
}

.operator-steps__line {
  width: 100%;
  height: var(--size-step-line);
  border-radius: var(--radius-xs);
  background: var(--color-border);
}

.operator-steps__label {
  color: var(--color-muted);
  overflow-wrap: break-word;
}

/* Figma only shows the preparation state. Done steps keep the orange line (progress already
   made) but use the muted label, so only the current step reads as active. */
.operator-steps__item--done .operator-steps__line,
.operator-steps__item--current .operator-steps__line {
  background: var(--color-orange);
}

.operator-steps__item--current .operator-steps__label {
  color: var(--color-text);
}
</style>
