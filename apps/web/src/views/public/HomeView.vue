<script setup lang="ts">
// Figma: `01 / Público · Home` (node 2:13), `Home / Content` and its blocks. Navigation and page
// padding come from PublicLayout.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import ChampionshipCard from '@/components/ui/ChampionshipCard.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import TabItem from '@/components/ui/TabItem.vue'
import { isApiEnabled } from '@/api/client'
import { getChampionships, getLiveFight, type LiveFight } from '@/mocks'
import type { Championship, ChampionshipStatus } from '@/types'

type Filter = ChampionshipStatus | 'all'

const filters: { value: Filter; label: string; empty: string }[] = [
  { value: 'running', label: 'Em andamento', empty: 'Nenhum campeonato em andamento.' },
  { value: 'scheduled', label: 'Próximos', empty: 'Nenhum campeonato programado.' },
  { value: 'finished', label: 'Encerrados', empty: 'Nenhum campeonato encerrado.' },
  { value: 'all', label: 'Todos', empty: 'Nenhum campeonato cadastrado ainda.' },
]

const loadState = ref<'loading' | 'ready' | 'error'>('loading')
const championships = ref<Championship[]>([])
const liveFight = ref<LiveFight | null>(null)
const activeFilter = ref<Filter>('running')

// Single data entry point for this view
async function load() {
  loadState.value = 'loading'
  try {
    const [championshipList, live] = await Promise.all([getChampionships(), getLiveFight()])
    championships.value = championshipList
    liveFight.value = live
    // Figma opens on "Em andamento"; without any status data only "Todos" can list anything
    activeFilter.value = championshipList.some((c) => c.status) ? 'running' : 'all'
    loadState.value = 'ready'
  } catch (error) {
    console.error('Failed to load home data', error)
    loadState.value = 'error'
  }
}

onMounted(load)

// Championship and match pages are dev-only for now (see router); never link to a missing route
const router = useRouter()
const hasChampionshipPage = router.hasRoute('championship')
const hasMatchPage = router.hasRoute('match-details')

const numberFormat = new Intl.NumberFormat('pt-BR')
const pad2 = (value: number) => String(value).padStart(2, '0')

const championshipCount = computed(() => {
  const count = championships.value.length
  return `${numberFormat.format(count)} ${count === 1 ? 'campeonato' : 'campeonatos'}`
})

// Championships without a status only appear under "Todos"
const filteredChampionships = computed(() =>
  activeFilter.value === 'all'
    ? championships.value
    : championships.value.filter((c) => c.status === activeFilter.value),
)

const activeFilterEmpty = computed(
  () => filters.find((f) => f.value === activeFilter.value)?.empty ?? '',
)

/**
 * ChampionshipCard needs a date, a status and fight counts. Championships missing any of them
 * are not rendered as a card rather than shown with made-up values.
 */
function toCardProps(championship: Championship) {
  const { startDate, status, robotCount, fightsDone, fightsTotal } = championship
  if (
    !startDate ||
    !status ||
    robotCount === undefined ||
    fightsDone === undefined ||
    fightsTotal === undefined
  ) {
    return null
  }
  return {
    name: championship.name,
    date: startDate,
    status,
    robotCount,
    fightsDone,
    fightsTotal,
    // Without the page the card keeps its default link (home)
    ...(hasChampionshipPage && {
      to: { name: 'championship', params: { championshipId: championship.id } },
    }),
  }
}

const cards = computed(() =>
  filteredChampionships.value.flatMap((championship) => {
    const props = toCardProps(championship)
    return props ? [{ id: championship.id, props }] : []
  }),
)

const hiddenCount = computed(() => filteredChampionships.value.length - cards.value.length)

const hiddenNote = computed(() => {
  const count = hiddenCount.value
  return count === 1
    ? '1 campeonato sem dados suficientes para exibição.'
    : `${numberFormat.format(count)} campeonatos sem dados suficientes para exibição.`
})

const live = computed(() => {
  const fight = liveFight.value
  if (!fight) return null
  const status = fight.state === 'paused' ? 'Pausada' : 'Ao vivo'
  return {
    pillLabel: fight.arenaName ? `${status} · ${fight.arenaName}` : status,
    pillTone: fight.state === 'paused' ? ('warning' as const) : ('live' as const),
    // Screen readers would otherwise read "×" as a multiplication sign
    matchup: `${fight.robotAName} contra ${fight.robotBName}`,
    // "Copa Crossliseu 2026 · Luta 07 de 15"
    context: `${fight.championshipName} · Luta ${pad2(fight.number)} de ${pad2(fight.fightsTotal)}`,
    // "01:42"
    clock: `${pad2(Math.floor(fight.remainingSeconds / 60))}:${pad2(fight.remainingSeconds % 60)}`,
    to: hasMatchPage ? { name: 'match-details', params: { matchId: fight.matchId } } : null,
  }
})
</script>

<template>
  <div class="home">
    <header class="home__hero">
      <p class="home__eyebrow text-overline">Robótica em combate · UTFPR</p>
      <h1 class="home__title text-display-page">Acompanhe a arena</h1>
      <p class="home__lead text-body-l">
        Campeonatos, confrontos e resultados da UTFPR em um só lugar.
      </p>
    </header>

    <section v-if="liveFight && live" class="home__live" aria-label="Luta ao vivo">
      <div class="home__live-info">
        <StatusPill :label="live.pillLabel" :tone="live.pillTone" />
        <h2 class="home__live-title text-heading-l" :aria-label="live.matchup">
          {{ liveFight.robotAName }} × {{ liveFight.robotBName }}
        </h2>
        <p class="home__muted text-body-s">{{ live.context }}</p>
      </div>
      <div class="home__live-clock">
        <p class="home__live-time text-timer-l">{{ live.clock }}</p>
        <p class="home__muted text-mono-s">TEMPO RESTANTE</p>
      </div>
      <AppButton v-if="live.to" class="home__live-action" :to="live.to">Acompanhar luta</AppButton>
    </section>

    <section class="home__championships" aria-labelledby="home-championships-title">
      <div class="home__section-header">
        <h2 id="home-championships-title" class="home__section-title text-heading-xl">
          Campeonatos
        </h2>
        <p v-if="loadState === 'ready'" class="home__muted text-body-s">
          {{ championshipCount }}
        </p>
      </div>

      <p v-if="loadState === 'loading'" class="home__muted text-body-m" aria-live="polite">
        Carregando campeonatos…
      </p>

      <div v-else-if="loadState === 'error'" class="home__error" role="alert">
        <p class="text-body-m">Não foi possível carregar os campeonatos.</p>
        <AppButton variant="secondary" @click="load">Tentar novamente</AppButton>
      </div>

      <template v-else>
        <div class="home__filters" role="tablist" aria-label="Filtrar campeonatos">
          <TabItem
            v-for="filter in filters"
            :key="filter.value"
            :label="filter.label"
            :active="activeFilter === filter.value"
            aria-controls="home-championships-grid"
            @click="activeFilter = filter.value"
          />
        </div>

        <div id="home-championships-grid" role="tabpanel" class="home__results">
          <p v-if="filteredChampionships.length === 0" class="home__muted text-body-m">
            {{ activeFilterEmpty }}
          </p>
          <div v-if="cards.length > 0" class="home__grid">
            <ChampionshipCard v-for="card in cards" :key="card.id" v-bind="card.props" />
          </div>
          <p v-if="hiddenCount > 0" class="home__muted text-body-s">{{ hiddenNote }}</p>
        </div>
      </template>
    </section>

    <footer class="home__footer text-mono-s">
      <p>CROSSLISEU · UTFPR</p>
      <p v-if="!isApiEnabled">Conceito visual · dados demonstrativos</p>
    </footer>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-9);
}

.home__hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-10px);
}

.home__eyebrow {
  color: var(--color-orange);
}

.home__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.home__lead,
.home__muted {
  color: var(--color-muted);
}

.home__live {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-28px);
  padding: var(--space-22px) var(--space-6) var(--space-22px) var(--space-28px);
  border: 1px solid var(--color-orange);
  border-left-width: var(--size-accent-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.home__live-info {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;
}

.home__live-title {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: break-word;
}

.home__live-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  text-align: center;
  white-space: nowrap;
}

.home__live-time {
  color: var(--color-orange);
}

.home__live-action {
  width: var(--size-live-action);
  min-height: var(--size-control-lg);
}

.home__championships {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.home__section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.home__section-title {
  color: var(--color-text);
  text-transform: uppercase;
}

.home__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.home__results {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--size-card-min)), 1fr));
  gap: var(--space-7);
}

.home__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
  color: var(--color-text);
}

.home__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  color: var(--color-muted);
}
</style>
