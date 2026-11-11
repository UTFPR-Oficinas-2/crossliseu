<script setup lang="ts">
// Figma: `11 / Operador · Preparação` (node 23:431). Shared frame for the operator screens:
// `Navigation / Operator`, the `Operator / Steps` indicator and the content padding. The page
// content (preparation, running, closing) is rendered by the child route.
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppNav from '@/components/ui/AppNav.vue'
import OperatorNav from '@/components/ui/OperatorNav.vue'
import { getArenas, getChampionship, getMatchSummary, getRobots } from '@/data'
import { useSignOut } from '@/composables/useSignOut'
import { useAuthStore } from '@/stores/auth'
import type { Arena, Championship, MatchState, MatchSummary, Robot } from '@/types'

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
const auth = useAuthStore()

const match = ref<MatchSummary | null>(null)
const championship = ref<Championship | null>(null)
const arenas = shallowRef<Arena[]>([])
const robots = ref<Robot[]>([])
const liveStatus = ref<MatchState | null>(null)
const hasSelectedArena = ref<boolean | null>(null)

const arena = computed(() => {
  if (hasSelectedArena.value !== false) {
    const current = arenas.value.find(
      (candidate) => candidate.currentMatchId === route.params.matchId,
    )
    if (current) return current
  }
  // A closed fight can still show the arena it was played on.
  if (hasSelectedArena.value === null || liveStatus.value === 'finished') {
    return arenas.value.find((candidate) => candidate.id === match.value?.arenaId) ?? null
  }
  return null
})

let loadId = 0
async function load(matchId: string) {
  const current = ++loadId
  try {
    const loadedMatch = await getMatchSummary(matchId)
    if (!loadedMatch || current !== loadId) return
    const [loadedChampionship, loadedRobots] = await Promise.all([
      getChampionship(loadedMatch.championshipId),
      getRobots(loadedMatch.championshipId),
    ])
    if (current !== loadId) return
    match.value = loadedMatch
    championship.value = loadedChampionship
    robots.value = loadedRobots
  } catch (error) {
    if (current === loadId) console.error('Could not load the match', error)
  }
}

// The fight snapshot reports assignment, while the authenticated arena list carries the name
// and connectivity. Refresh that context with each new snapshot and ignore old route reads.
let nextArenaRead = 0
let activeArenaRead: number | undefined
async function refreshArenas() {
  if (activeArenaRead !== undefined) return
  const current = ++nextArenaRead
  activeArenaRead = current
  try {
    const loadedArenas = await getArenas(auth.token ?? '')
    if (current === activeArenaRead) arenas.value = loadedArenas
  } catch (error) {
    if (current === activeArenaRead) {
      arenas.value = []
      console.error('Could not load the arenas', error)
    }
  } finally {
    if (current === activeArenaRead) activeArenaRead = undefined
  }
}

watch(
  () => route.params.matchId,
  (matchId) => {
    loadId++
    activeArenaRead = undefined
    match.value = null
    championship.value = null
    arenas.value = []
    robots.value = []
    liveStatus.value = null
    hasSelectedArena.value = null
    if (matchId) {
      void load(String(matchId))
      void refreshArenas()
    }
  },
  { immediate: true },
)

onScopeDispose(() => {
  loadId++
  activeArenaRead = undefined
})

const robotName = (id: string | undefined) => robots.value.find((r) => r.id === id)?.name ?? ''
const robotNames = computed(() => ({
  a: robotName(match.value?.robotAId),
  b: robotName(match.value?.robotBId),
}))

// Shown, never used to block anything
const arenaConnected = computed(() => arena.value?.online ?? false)

// -1 when there is no match, so every step reads as upcoming
const currentStepIndex = computed(() => {
  const state = liveStatus.value ?? match.value?.state
  return state ? steps.findIndex((s) => s.id === stepByState[state]) : -1
})

function updateFightStatus(matchId: string, status: MatchState, selectedArena: boolean) {
  if (route.params.matchId !== matchId) return
  liveStatus.value = status
  hasSelectedArena.value = selectedArena
  void refreshArenas()
}

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

// The picker (`/operator`, Figma OPE-01) has no fight yet and uses the app navigation
const onPicker = computed(() => !route.params.matchId)

const handleSignOut = useSignOut()
</script>

<template>
  <div class="operator-layout">
    <AppNav
      v-if="onPicker"
      :user-name="auth.username ?? ''"
      active="operator"
      @sign-out="handleSignOut"
    />
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

      <RouterView @fight-status="updateFightStatus" />
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

@media (max-width: 767px) {
  .operator-layout__content {
    padding-inline: var(--space-page-x-mobile);
  }
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

/* Keep completed steps visible while highlighting the current step's label. */
.operator-steps__item--done .operator-steps__line,
.operator-steps__item--current .operator-steps__line {
  background: var(--color-orange);
}

.operator-steps__item--current .operator-steps__label {
  color: var(--color-text);
}

@media (max-width: 767px) {
  .operator-steps {
    align-items: stretch;
  }

  .operator-steps__item {
    padding-inline: var(--space-2);
  }
}
</style>
