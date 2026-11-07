<script setup lang="ts">
// Figma: `OPE-01 Escolher arena e luta` (node 152:585), #37. The operator picks an arena, then a
// scheduled fight of one of their championships; "Abrir luta" makes it the arena's current match
// (PUT /arenas/:id/current-match) and opens /operator/:matchId. The championship and arena live
// in the URL query, and the server keeps the pick, so a reload restores both screens.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import ChoiceItem from '@/components/ui/ChoiceItem.vue'
import SelectField from '@/components/ui/SelectField.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import {
  getArenas,
  getManagedChampionships,
  getMatchSummaries,
  getRobots,
  selectArenaMatch,
} from '@/data'
import { useAuthStore } from '@/stores/auth'
import type { Arena, Championship, MatchSummary, Robot } from '@/types'
import { matchStatePill } from '@/utils/match'
import {
  actionHint,
  arenaChoice,
  fightDisabled,
  fightMeta,
  fightOptions,
  pickErrorMessage,
} from './arena-fight-pick'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const token = () => auth.token ?? ''

const status = ref<'loading' | 'ready' | 'error'>('loading')
const championships = ref<Championship[]>([])
const arenas = ref<Arena[]>([])
const matches = ref<MatchSummary[]>([])
const robots = ref<Robot[]>([])
const fightsStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

const championshipId = ref('')
const arenaId = ref<string | null>(null)
const matchId = ref<string | null>(null)
const opening = ref(false)
const pickError = ref('')

const queryId = (key: string) => {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

const isPickable = (id: string) => arenas.value.some((a) => a.id === id && !arenaChoice(a).disabled)

async function loadBase() {
  status.value = 'loading'
  try {
    const [loadedChampionships, loadedArenas] = await Promise.all([
      getManagedChampionships(token()),
      getArenas(token()),
    ])
    championships.value = loadedChampionships
    arenas.value = loadedArenas
  } catch (error) {
    console.error('Could not load the operator picker', error)
    status.value = 'error'
    return
  }
  // Ids from the URL count only if they still exist and are usable
  const fromQuery = queryId('championshipId')
  const only = championships.value.length === 1 ? championships.value[0]!.id : ''
  championshipId.value = championships.value.some((c) => c.id === fromQuery) ? fromQuery : only
  const arenaFromQuery = queryId('arenaId')
  arenaId.value = isPickable(arenaFromQuery) ? arenaFromQuery : null
  status.value = 'ready'
}

let fightsLoadId = 0
async function loadFights(id: string) {
  const current = ++fightsLoadId
  if (!id) {
    matches.value = []
    robots.value = []
    fightsStatus.value = 'idle'
    return
  }
  fightsStatus.value = 'loading'
  try {
    const [loadedMatches, loadedRobots] = await Promise.all([getMatchSummaries(id), getRobots(id)])
    if (current !== fightsLoadId) return
    matches.value = loadedMatches
    robots.value = loadedRobots
    fightsStatus.value = 'ready'
  } catch (error) {
    if (current !== fightsLoadId) return
    console.error('Could not load the fights', error)
    fightsStatus.value = 'error'
  }
}

watch(championshipId, (id) => {
  matchId.value = null
  loadFights(id)
})

// Keep the choice in the URL so a reload restores it
watch([championshipId, arenaId], ([championship, arena]) => {
  const query: Record<string, string> = {}
  if (championship) query.championshipId = championship
  if (arena) query.arenaId = arena
  if (
    queryId('championshipId') === (query.championshipId ?? '') &&
    queryId('arenaId') === (query.arenaId ?? '')
  )
    return
  router.replace({ query })
})

loadBase()

const championshipOptions = computed(() =>
  championships.value.map((c) => ({ value: c.id, label: c.name })),
)
const fights = computed(() => fightOptions(matches.value, robots.value, arenas.value))
const selectedArena = computed(() => arenas.value.find((a) => a.id === arenaId.value) ?? null)

const championshipHint = computed(() => {
  if (!championshipId.value) return 'Escolha um campeonato.'
  if (fightsStatus.value !== 'ready') return undefined
  const count = fights.value.length
  return `${count} ${count === 1 ? 'luta programada' : 'lutas programadas'}`
})

const canOpen = computed(
  () => !opening.value && selectedArena.value !== null && matchId.value !== null,
)

async function openFight() {
  if (!canOpen.value || !arenaId.value || !matchId.value) return
  opening.value = true
  pickError.value = ''
  try {
    await selectArenaMatch(arenaId.value, matchId.value, token())
    await router.push({ name: 'match-operation', params: { matchId: matchId.value } })
  } catch (error) {
    pickError.value = pickErrorMessage(error)
    // Someone else may have changed the arenas or the fight: show the current state
    try {
      arenas.value = await getArenas(token())
      if (arenaId.value && !isPickable(arenaId.value)) arenaId.value = null
    } catch (reloadError) {
      console.error('Could not reload the arenas', reloadError)
    }
    await loadFights(championshipId.value)
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <div class="operator-home">
    <header class="operator-home__titles">
      <h1 class="operator-home__title text-display-page">Operação</h1>
      <p class="operator-home__muted text-body-m">
        Escolha a arena e depois a luta que vai acontecer nela.
      </p>
    </header>

    <p v-if="status === 'loading'" class="operator-home__muted text-body-m" aria-live="polite">
      Carregando arenas e campeonatos…
    </p>
    <div v-else-if="status === 'error'" class="operator-home__error" role="alert">
      <p class="text-body-m">Não foi possível carregar as arenas e os campeonatos.</p>
      <AppButton variant="secondary" @click="loadBase">Tentar novamente</AppButton>
    </div>

    <template v-else>
      <div class="operator-home__columns">
        <section class="operator-home__card">
          <fieldset class="operator-home__group">
            <legend class="operator-home__card-title text-heading-m">1 · Arena</legend>
            <p class="operator-home__muted text-body-s">Cada arena roda uma luta por vez.</p>
            <ChoiceItem
              v-for="arena in arenas"
              :key="arena.id"
              v-model="arenaId"
              name="arena"
              :value="arena.id"
              :title="arena.name"
              :meta="arenaChoice(arena).meta"
              :disabled="arenaChoice(arena).disabled"
            >
              <template #status>
                <StatusPill
                  :label="arenaChoice(arena).pill.label"
                  :tone="arenaChoice(arena).pill.tone"
                />
              </template>
            </ChoiceItem>
            <template v-if="arenas.length === 0">
              <p class="operator-home__muted text-body-s">Nenhuma arena cadastrada.</p>
              <AppButton variant="secondary" :to="{ name: 'arenas' }">Cadastrar arena</AppButton>
            </template>
          </fieldset>
        </section>

        <section class="operator-home__card">
          <fieldset class="operator-home__group">
            <legend class="operator-home__card-title text-heading-m">2 · Luta</legend>
            <p class="operator-home__muted text-body-s">
              Só aparecem lutas programadas do campeonato escolhido.
            </p>
            <SelectField
              v-model="championshipId"
              label="Campeonato"
              :options="championshipOptions"
              :hint="championshipHint"
            />
            <p v-if="championships.length === 0" class="operator-home__muted text-body-s">
              Nenhum campeonato seu ainda.
            </p>
            <p
              v-else-if="fightsStatus === 'loading'"
              class="operator-home__muted text-body-s"
              aria-live="polite"
            >
              Carregando lutas…
            </p>
            <div v-else-if="fightsStatus === 'error'" class="operator-home__error" role="alert">
              <p class="text-body-s">Não foi possível carregar as lutas.</p>
              <AppButton variant="secondary" @click="loadFights(championshipId)">
                Tentar novamente
              </AppButton>
            </div>
            <template v-else-if="fightsStatus === 'ready'">
              <ChoiceItem
                v-for="fight in fights"
                :key="fight.match.id"
                v-model="matchId"
                name="fight"
                :value="fight.match.id"
                :title="`${fight.robotA} × ${fight.robotB}`"
                :meta="fightMeta(fight)"
                :disabled="fightDisabled(fight, arenaId)"
              >
                <template #status>
                  <StatusPill
                    :label="matchStatePill.scheduled.label"
                    :tone="matchStatePill.scheduled.tone"
                  />
                </template>
              </ChoiceItem>
              <p v-if="fights.length === 0" class="operator-home__muted text-body-s">
                Nenhuma luta programada neste campeonato.
              </p>
            </template>
          </fieldset>
        </section>
      </div>

      <div class="operator-home__action-bar">
        <div class="operator-home__action-text">
          <p v-if="pickError" class="operator-home__pick-error text-body-s" role="alert">
            {{ pickError }}
          </p>
          <p class="operator-home__muted text-body-s">{{ actionHint(selectedArena) }}</p>
        </div>
        <AppButton :disabled="!canOpen" @click="openFight">Abrir luta</AppButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.operator-home {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.operator-home__titles {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.operator-home__title,
.operator-home__card-title {
  color: var(--color-text);
  text-transform: uppercase;
}

.operator-home__muted {
  color: var(--color-muted);
}

.operator-home__columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
  align-items: start;
}

@media (min-width: 768px) {
  .operator-home__columns {
    grid-template-columns: 1fr 1fr;
  }
}

.operator-home__card,
.operator-home__action-bar {
  min-width: 0;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.operator-home__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-14px);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.operator-home__card-title {
  margin-bottom: var(--space-14px);
  padding: 0;
}

.operator-home__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-red);
}

.operator-home__action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.operator-home__action-text {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.operator-home__pick-error {
  color: var(--color-red);
}
</style>
