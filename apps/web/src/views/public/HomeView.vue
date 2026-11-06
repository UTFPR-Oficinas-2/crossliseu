<script setup lang="ts">
// Figma: `PUB-01 Home` (node 2:13, phone 155:820). Navigation and page padding come from
// PublicLayout. There is no live-fight block: the home lists championships only.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import ChampionshipCard from '@/components/ui/ChampionshipCard.vue'
import TabItem from '@/components/ui/TabItem.vue'
import { getChampionships } from '@/data'
import type { Championship, ChampionshipStatus } from '@/types'

type Filter = ChampionshipStatus | 'all'

const filters: { value: Filter; label: string; empty: string }[] = [
  { value: 'ongoing', label: 'Em andamento', empty: 'Nenhum campeonato em andamento.' },
  { value: 'scheduled', label: 'Próximos', empty: 'Nenhum campeonato programado.' },
  { value: 'closed', label: 'Encerrados', empty: 'Nenhum campeonato encerrado.' },
  { value: 'all', label: 'Todos', empty: 'Nenhum campeonato cadastrado ainda.' },
]

const route = useRoute()
const router = useRouter()

// Kept in `?status=` so reload and back restore the tab; anything unknown opens "Em andamento"
const activeFilter = computed<Filter>(() => {
  const value = route.query.status
  return filters.find((f) => f.value === value)?.value ?? 'ongoing'
})

function selectFilter(value: Filter) {
  router.replace({ query: { ...route.query, status: value } })
}

const loadState = ref<'loading' | 'ready' | 'error'>('loading')
const championships = ref<Championship[]>([])

// Single data entry point for this view
async function load() {
  loadState.value = 'loading'
  try {
    championships.value = await getChampionships()
    loadState.value = 'ready'
  } catch (error) {
    console.error('Failed to load home data', error)
    loadState.value = 'error'
  }
}

onMounted(load)

// The championship page is dev-only for now (see router); never link to a missing route
const hasChampionshipPage = router.hasRoute('championship')

const numberFormat = new Intl.NumberFormat('pt-BR')

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
  const { startDate, endDate, status, fightsDone, fightsTotal } = championship
  if (!startDate || !status || fightsDone === undefined || fightsTotal === undefined) {
    return null
  }
  return {
    name: championship.name,
    startDate,
    endDate,
    status,
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
</script>

<template>
  <div class="home">
    <header class="home__hero">
      <h1 class="home__title text-display-page">Acompanhe a arena</h1>
    </header>

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
            @click="selectFilter(filter.value)"
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

.home__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.home__muted {
  color: var(--color-muted);
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

/* Figma PUB-01 celular */
@media (max-width: 767px) {
  .home,
  .home__grid {
    gap: var(--space-5);
  }
}
</style>
