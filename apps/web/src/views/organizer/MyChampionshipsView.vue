<script setup lang="ts">
// Figma: `06 / Organizador · Meus campeonatos` (node 20:240) — Header 20:250, Filters 20:256,
// List 20:265 (row 20:266), Footer 20:299. Nav comes from OrganizerLayout (no sidebar here).
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import TabItem from '@/components/ui/TabItem.vue'
import { isApiEnabled } from '@/api/client'
import { getManagedChampionships } from '@/mocks'
import type { Championship } from '@/types'
import { championshipMeta, championshipStatusPill } from '@/utils/championship'

type Filter = 'all' | 'running' | 'finished'

const filters: { value: Filter; label: string; empty: string }[] = [
  {
    value: 'all',
    label: 'Todos',
    empty: 'Nenhum campeonato ainda. Use "Criar campeonato" para começar.',
  },
  { value: 'running', label: 'Em andamento', empty: 'Nenhum campeonato em andamento.' },
  { value: 'finished', label: 'Encerrados', empty: 'Nenhum campeonato encerrado.' },
]

const route = useRoute()
const router = useRouter()

const activeFilter = computed<Filter>(() => {
  const value = route.query.status
  return value === 'running' || value === 'finished' ? value : 'all'
})

// Kept in the query string so reload and back restore the tab
function selectFilter(value: Filter) {
  router.replace({ query: { ...route.query, status: value === 'all' ? undefined : value } })
}

const loadState = ref<'loading' | 'ready' | 'error'>('loading')
const championships = ref<Championship[]>([])

// Single data entry point for this view
async function load() {
  loadState.value = 'loading'
  try {
    championships.value = await getManagedChampionships()
    loadState.value = 'ready'
  } catch (error) {
    console.error('Failed to load managed championships', error)
    loadState.value = 'error'
  }
}

onMounted(load)

// Programado appears only under "Todos" (Figma)
const visible = computed(() =>
  activeFilter.value === 'all'
    ? championships.value
    : championships.value.filter((c) => c.status === activeFilter.value),
)

const rows = computed(() => visible.value.map((c) => ({ c, meta: championshipMeta(c) })))

const activeFilterEmpty = computed(
  () => filters.find((f) => f.value === activeFilter.value)?.empty ?? '',
)

const numberFormat = new Intl.NumberFormat('pt-BR')

const subtitle = computed(() => {
  const count = championships.value.length
  return `Você tem permissão para gerenciar ${numberFormat.format(count)} ${count === 1 ? 'campeonato' : 'campeonatos'}.`
})
</script>

<template>
  <div class="my-championships">
    <header class="my-championships__header">
      <div class="my-championships__titles">
        <h1 class="my-championships__title text-display-page">Meus campeonatos</h1>
        <p v-if="loadState === 'ready'" class="my-championships__muted text-body-m">
          {{ subtitle }}
        </p>
      </div>
      <AppButton class="my-championships__create" :to="{ name: 'championship-create' }">
        Criar campeonato
      </AppButton>
    </header>

    <p
      v-if="loadState === 'loading'"
      class="text-body-m my-championships__muted"
      aria-live="polite"
    >
      Carregando campeonatos…
    </p>

    <div v-else-if="loadState === 'error'" class="my-championships__error" role="alert">
      <p class="text-body-m">Não foi possível carregar os campeonatos.</p>
      <AppButton variant="secondary" @click="load">Tentar novamente</AppButton>
    </div>

    <p v-else-if="championships.length === 0" class="text-body-m my-championships__muted">
      {{ filters[0]!.empty }}
    </p>

    <template v-else>
      <div class="my-championships__filters" role="tablist" aria-label="Filtrar campeonatos">
        <TabItem
          v-for="filter in filters"
          :key="filter.value"
          :label="filter.label"
          :active="activeFilter === filter.value"
          aria-controls="my-championships-list"
          @click="selectFilter(filter.value)"
        />
      </div>

      <div id="my-championships-list" role="tabpanel">
        <p v-if="visible.length === 0" class="text-body-m my-championships__muted">
          {{ activeFilterEmpty }}
        </p>
        <ul v-else class="my-championships__list">
          <li v-for="{ c, meta } in rows" :key="c.id" class="my-championships__row">
            <div class="my-championships__info">
              <h2 class="my-championships__name text-heading-m">{{ c.name }}</h2>
              <p v-if="meta" class="my-championships__muted text-body-s">
                {{ meta }}
              </p>
            </div>
            <div class="my-championships__side">
              <StatusPill v-if="c.status" v-bind="championshipStatusPill[c.status]" />
              <AppButton
                variant="ghost"
                class="my-championships__action"
                :to="{ name: 'championship', params: { championshipId: c.id } }"
                :aria-label="`Ver página pública de ${c.name}`"
              >
                Ver pública
              </AppButton>
              <AppButton
                :variant="c.status === 'running' ? 'primary' : 'secondary'"
                class="my-championships__action"
                :to="{ name: 'championship-overview', params: { championshipId: c.id } }"
                :aria-label="`Gerenciar ${c.name}`"
              >
                Gerenciar
              </AppButton>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <footer class="my-championships__footer text-mono-s">
      <p>CROSSLISEU · UTFPR</p>
      <p v-if="!isApiEnabled">Conceito visual · dados demonstrativos</p>
    </footer>
  </div>
</template>

<style scoped>
.my-championships {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.my-championships__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.my-championships__titles {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.my-championships__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.my-championships__muted {
  color: var(--color-muted);
}

.my-championships__create {
  min-height: var(--size-control-lg);
}

.my-championships__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.my-championships__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-championships__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.my-championships__info {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-6px);
  min-width: 0;
}

.my-championships__name {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.my-championships__side {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-5);
}

.my-championships__action {
  width: var(--size-row-action);
}

.my-championships__error {
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

.my-championships__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  color: var(--color-muted);
}
</style>
