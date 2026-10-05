<script setup lang="ts">
// Figma: `11 / Operador · Preparação` (node 23:431). Shared frame for the operator screens:
// `Navigation / Operator`, the `Operator / Steps` indicator and the content padding. The page
// content (preparation, running, closing) is rendered by the child route.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OperatorNav from '@/components/ui/OperatorNav.vue'
import { getArenas, getChampionship, getMatch } from '@/mocks'
import type { Arena, Championship, Match, MatchState } from '@/types'

type StepId = 'preparation' | 'running' | 'closing'
type StepStatus = 'done' | 'current' | 'upcoming'

const steps: { id: StepId; label: string }[] = [
  { id: 'preparation', label: '1 · Preparação' },
  { id: 'running', label: '2 · Em andamento' },
  { id: 'closing', label: '3 · Encerramento' },
]

const stepByState: Record<MatchState, StepId> = {
  waiting: 'preparation',
  running: 'running',
  paused: 'running',
  finished: 'closing',
}

const route = useRoute()
const router = useRouter()

const match = ref<Match | null>(null)
const championship = ref<Championship | null>(null)
const arena = ref<Arena | null>(null)

// Data loading lives here so it can be swapped for the API later.
let loadId = 0
async function load(matchId: string) {
  const current = ++loadId
  const loadedMatch = await getMatch(matchId)
  const [loadedChampionship, arenas]: [Championship | null, Arena[]] = loadedMatch
    ? await Promise.all([
        getChampionship(loadedMatch.championshipId),
        getArenas(loadedMatch.championshipId),
      ])
    : [null, []]
  // Ignore a stale response if the route changed while loading
  if (current !== loadId) return
  match.value = loadedMatch
  championship.value = loadedChampionship
  arena.value = arenas.find((a) => a.id === loadedMatch?.arenaId) ?? null
}

watch(
  () => route.params.matchId,
  (matchId) => load(String(matchId ?? '')),
  { immediate: true },
)

// Figma shows the arena in uppercase: "Arena 01" → "ARENA 01"
const arenaLabel = computed(() => arena.value?.name.toLocaleUpperCase('pt-BR') ?? '')

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
      :championship="championship?.name ?? ''"
      :fight-number="match.number"
      :arena="arenaLabel"
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
