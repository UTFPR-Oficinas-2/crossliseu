<script setup lang="ts">
// Figma: `10 / Organizador · Lutas` (node 22:496). Scheduling only: waiting matches can be
// edited, and the running flow ("Abrir operação", "Preparar", "Ver detalhes") is not built.
// Finished rows show "A × B": there is no result data for "A venceu B" yet.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import TabItem from '@/components/ui/TabItem.vue'
import { getChampionship, getMatchSummaries, getRobots } from '@/mocks'
import type { MatchSummary, Robot } from '@/types'
import { matchStatePill } from '@/utils/match'
import EmptyState from './components/EmptyState.vue'
import LoadStatePanel from './components/LoadStatePanel.vue'
import OrganizerBreadcrumb from './components/OrganizerBreadcrumb.vue'
import OrganizerFooter from './components/OrganizerFooter.vue'
import {
  MATCH_FILTERS,
  inMatchFilter,
  matchFilterFrom,
  matchRows,
  matchesSubtitle,
  type MatchFilter,
} from './matches-list'

const { championshipId } = defineProps<{ championshipId: string }>()

const route = useRoute()
const router = useRouter()

const activeFilter = computed(() => matchFilterFrom(route.query.state))

// Kept in the query string so reload and back restore the tab
function selectFilter(value: MatchFilter) {
  router.replace({ query: { ...route.query, state: value === 'all' ? undefined : value } })
}

const loadState = ref<'loading' | 'ready' | 'not-found' | 'error'>('loading')
const championshipName = ref('')
const matches = ref<MatchSummary[]>([])
const robots = ref<Robot[]>([])

// Single data entry point for this view
async function load() {
  // The component is reused when the id changes: only the latest request may write state
  const requestedId = championshipId
  loadState.value = 'loading'
  try {
    // Championship first: a malformed id is "not found" here, while the lists would reject it
    const championship = await getChampionship(requestedId)
    if (requestedId !== championshipId) return
    if (!championship) {
      loadState.value = 'not-found'
      return
    }
    const [loadedMatches, loadedRobots] = await Promise.all([
      getMatchSummaries(requestedId),
      getRobots(requestedId),
    ])
    if (requestedId !== championshipId) return
    championshipName.value = championship.name
    matches.value = loadedMatches
    robots.value = loadedRobots
    loadState.value = 'ready'
  } catch (error) {
    if (requestedId !== championshipId) return
    console.error('Failed to load matches', error)
    loadState.value = 'error'
  }
}
watch(() => championshipId, load, { immediate: true })

const rows = computed(() =>
  matchRows(
    matches.value.filter((m) => inMatchFilter(m.state, activeFilter.value)),
    robots.value,
  ),
)
const activeFilterEmpty = computed(
  () => MATCH_FILTERS.find((f) => f.value === activeFilter.value)?.empty ?? '',
)
const breadcrumb = computed(() => [
  { label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ...(championshipName.value ? [{ label: championshipName.value }] : []),
  { label: 'Lutas' },
])
</script>

<template>
  <div class="matches">
    <OrganizerBreadcrumb :items="breadcrumb" />

    <!-- Figma 10: the title row holds only the title and the action; the subtitle sits below it -->
    <header class="matches__header">
      <h1 class="matches__title text-display-page">Lutas</h1>
      <AppButton
        v-if="loadState === 'ready'"
        class="matches__create"
        :to="{ name: 'match-create', params: { championshipId } }"
      >
        Criar luta
      </AppButton>
    </header>
    <p v-if="loadState === 'ready'" class="matches__muted text-body-m">
      {{ matchesSubtitle(matches.length) }}
    </p>

    <LoadStatePanel
      v-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando lutas…"
      error-text="Não foi possível carregar as lutas."
      not-found-text="Campeonato não encontrado."
      :back="{ label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } }"
      @retry="load"
    />

    <EmptyState
      v-else-if="matches.length === 0"
      title="Nenhuma luta ainda."
      text="Use “Criar luta” para montar o primeiro confronto."
    />

    <template v-else>
      <div class="matches__filters" role="tablist" aria-label="Filtrar lutas">
        <TabItem
          v-for="filter in MATCH_FILTERS"
          :key="filter.value"
          :label="filter.label"
          :active="activeFilter === filter.value"
          aria-controls="matches-list"
          @click="selectFilter(filter.value)"
        />
      </div>

      <div id="matches-list" role="tabpanel">
        <p v-if="rows.length === 0" class="matches__muted text-body-m">{{ activeFilterEmpty }}</p>
        <div v-else class="matches__card">
          <!-- The rows are flex containers so they can wrap on narrow screens. Changing a table's
               display drops its semantics in some browsers, so the roles are stated explicitly. -->
          <table class="matches__table" role="table">
            <thead class="text-overline" role="rowgroup">
              <tr class="matches__row" role="row">
                <th scope="col" role="columnheader" class="matches__cell--pair">Confronto</th>
                <th scope="col" role="columnheader" class="matches__cell--status">Status</th>
                <th scope="col" role="columnheader" class="matches__cell--actions">
                  <span class="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              <tr
                v-for="{ match, robotA, robotB } in rows"
                :key="match.id"
                class="matches__row"
                :class="{ 'matches__row--finished': match.state === 'finished' }"
                role="row"
              >
                <th
                  scope="row"
                  role="rowheader"
                  class="matches__cell--pair matches__pair text-heading-s"
                >
                  <span class="matches__name">{{ robotA }}</span>
                  <span class="matches__versus" aria-hidden="true">×</span>
                  <span class="visually-hidden">contra</span>
                  <span class="matches__name">{{ robotB }}</span>
                </th>
                <td role="cell" class="matches__cell--status">
                  <StatusPill v-bind="matchStatePill[match.state]" />
                </td>
                <td role="cell" class="matches__cell--actions">
                  <AppButton
                    v-if="match.state === 'waiting'"
                    variant="secondary"
                    :to="{ name: 'match-edit', params: { championshipId, matchId: match.id } }"
                    :aria-label="`Editar luta ${robotA} contra ${robotB}`"
                  >
                    Editar
                  </AppButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <OrganizerFooter />
  </div>
</template>

<style scoped>
.matches {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.matches__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.matches__title {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--color-text);
  text-transform: uppercase;
}

.matches__muted {
  color: var(--color-muted);
}

.matches__create {
  min-height: var(--size-control-lg);
}

.matches__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.matches__card {
  padding: var(--space-6px) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.matches__table,
.matches__table thead,
.matches__table tbody {
  display: block;
}

/* Each row wraps instead of scrolling. Header and body cells share the same flex bases, so on
   desktop they line up as columns; on narrow screens the cells drop onto new lines.
   Figma rows: 14px above and below, 16px between columns, a soft rule under each row */
.matches__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-14px) 0;
  border-bottom: 1px solid var(--color-border-soft);
}

.matches__table tbody .matches__row:last-child {
  border-bottom: none;
}

.matches__row > * {
  min-width: 0;
  padding: 0;
  text-align: left;
  overflow-wrap: break-word;
}

.matches__table thead th {
  color: var(--color-muted);
  font-weight: inherit;
}

/* The 176px action token is borrowed for every column: the pair grows from it, and the status
   and action columns keep it (Figma: 212px and 186px) */
.matches__cell--pair {
  flex: 1 1 var(--size-live-action);
}

.matches__cell--status {
  display: flex;
  flex: 0 1 var(--size-live-action);
}

.matches__cell--actions {
  display: flex;
  flex: 0 1 var(--size-live-action);
  justify-content: flex-end;
  margin-left: auto;
}

/* Names wrap between words; a single word longer than the line is the only one that breaks */
.matches__pair {
  color: var(--color-text);
  text-transform: uppercase;
}

.matches__versus {
  margin: 0 var(--space-2);
  color: var(--color-muted);
}

.matches__row--finished .matches__pair {
  color: var(--color-muted);
}
</style>
