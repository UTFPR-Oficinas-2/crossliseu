<script setup lang="ts">
// Figma: `09 / Organizador · Participantes` (node 22:336), empty state 22:487. The API has only
// name, team and weight class, so the Aptos/Pendentes tabs, the combat category and
// "responsável" are not built. "Categoria" shows the weight class label ("Peso leve").
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import InputField from '@/components/ui/InputField.vue'
import { ApiError } from '@/api/client'
import { deleteRobot, getChampionship, getRobots } from '@/mocks'
import { useAuthStore } from '@/stores/auth'
import type { Robot } from '@/types'
import { weightClassLabel } from '@/utils/robot'
import EmptyState from './components/EmptyState.vue'
import LoadStatePanel from './components/LoadStatePanel.vue'
import OrganizerBreadcrumb from './components/OrganizerBreadcrumb.vue'
import OrganizerFooter from './components/OrganizerFooter.vue'
import { describeRemoveError, filterRobots, participantsSubtitle } from './participants-list'

const { championshipId } = defineProps<{ championshipId: string }>()

const auth = useAuthStore()

const loadState = ref<'loading' | 'ready' | 'not-found' | 'error'>('loading')
const championshipName = ref('')
const robots = ref<Robot[]>([])
const search = ref('')
const removingId = ref<string | null>(null)
const removeError = ref<string | null>(null)

// Single data entry point for this view
async function load() {
  // The component is reused when the id changes: only the latest request may write state
  const requestedId = championshipId
  loadState.value = 'loading'
  removeError.value = null
  try {
    // Championship first: a malformed id is "not found" here, while GET /robots would reject it
    const championship = await getChampionship(requestedId)
    if (requestedId !== championshipId) return
    if (!championship) {
      loadState.value = 'not-found'
      return
    }
    const loaded = await getRobots(requestedId)
    if (requestedId !== championshipId) return
    championshipName.value = championship.name
    robots.value = loaded
    loadState.value = 'ready'
  } catch (error) {
    if (requestedId !== championshipId) return
    console.error('Failed to load participants', error)
    loadState.value = 'error'
  }
}
watch(() => championshipId, load, { immediate: true })

const visible = computed(() => filterRobots(robots.value, search.value))
const subtitle = computed(() => participantsSubtitle(robots.value))
const breadcrumb = computed(() => [
  { label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ...(championshipName.value ? [{ label: championshipName.value }] : []),
  { label: 'Participantes' },
])

async function remove(robot: Robot) {
  if (removingId.value) return
  if (!window.confirm(`Remover ${robot.name} do campeonato? Essa ação não pode ser desfeita.`)) {
    return
  }
  removingId.value = robot.id
  removeError.value = null
  try {
    await deleteRobot(robot.id, auth.token ?? '')
    robots.value = robots.value.filter((r) => r.id !== robot.id)
  } catch (error) {
    // Already removed elsewhere: the list just catches up
    if (error instanceof ApiError && error.status === 404) {
      robots.value = robots.value.filter((r) => r.id !== robot.id)
      return
    }
    removeError.value = describeRemoveError(error, robot.name)
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="participants">
    <OrganizerBreadcrumb :items="breadcrumb" />

    <!-- Figma 09: the title row holds only the title and the action; the subtitle sits below it -->
    <header class="participants__header">
      <h1 class="participants__title text-display-page">Participantes</h1>
      <AppButton
        v-if="loadState === 'ready'"
        class="participants__add"
        :to="{ name: 'participant-create', params: { championshipId } }"
      >
        Adicionar participante
      </AppButton>
    </header>
    <p v-if="loadState === 'ready'" class="participants__muted text-body-m">{{ subtitle }}</p>

    <LoadStatePanel
      v-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando participantes…"
      error-text="Não foi possível carregar os participantes."
      not-found-text="Campeonato não encontrado."
      :back="{ label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } }"
      @retry="load"
    />

    <EmptyState
      v-else-if="robots.length === 0"
      title="Nenhum participante inscrito."
      text="Use “Adicionar participante” para cadastrar o primeiro robô."
    />

    <template v-else>
      <InputField
        v-model="search"
        type="search"
        name="search"
        label="Buscar participantes"
        hide-label
        placeholder="Buscar robô ou equipe"
      />

      <div v-if="removeError" class="participants__banner" role="alert">
        <span class="participants__banner-dot" aria-hidden="true" />
        <p class="participants__banner-text text-body-s">{{ removeError }}</p>
      </div>

      <EmptyState
        v-if="visible.length === 0"
        title="Nenhum participante corresponde a essa busca."
        text="Ajuste a busca ou cadastre um novo participante."
      >
        <AppButton variant="secondary" @click="search = ''">Limpar busca</AppButton>
      </EmptyState>

      <div v-else class="participants__card">
        <!-- The rows are flex containers so they can wrap on narrow screens. Changing a table's
             display drops its semantics in some browsers, so the roles are stated explicitly. -->
        <table class="participants__table" role="table">
          <thead class="text-overline" role="rowgroup">
            <tr class="participants__row" role="row">
              <th scope="col" role="columnheader" class="participants__cell--robot">Robô</th>
              <th scope="col" role="columnheader" class="participants__cell--team">Equipe</th>
              <th scope="col" role="columnheader" class="participants__cell--weight">Categoria</th>
              <th scope="col" role="columnheader" class="participants__cell--actions">
                <span class="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr v-for="robot in visible" :key="robot.id" class="participants__row" role="row">
              <th
                scope="row"
                role="rowheader"
                class="participants__cell--robot participants__robot text-heading-s"
              >
                {{ robot.name }}
              </th>
              <td role="cell" class="participants__cell--team participants__team text-body-m">
                {{ robot.team }}
              </td>
              <td role="cell" class="participants__cell--weight participants__weight text-mono-s">
                {{ weightClassLabel(robot.weightClass) }}
              </td>
              <td role="cell" class="participants__cell--actions">
                <div class="participants__actions">
                  <AppButton
                    variant="secondary"
                    :to="{
                      name: 'participant-edit',
                      params: { championshipId, robotId: robot.id },
                    }"
                    :aria-label="`Editar ${robot.name}`"
                  >
                    Editar
                  </AppButton>
                  <AppButton
                    variant="destructive"
                    :disabled="removingId !== null"
                    :aria-busy="removingId === robot.id"
                    :aria-label="`Remover ${robot.name}`"
                    @click="remove(robot)"
                  >
                    Remover
                  </AppButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <OrganizerFooter />
  </div>
</template>

<style scoped>
.participants {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.participants__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.participants__title {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--color-text);
  text-transform: uppercase;
}

.participants__muted {
  color: var(--color-muted);
}

.participants__add {
  min-height: var(--size-control-lg);
}

.participants__banner {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
}

.participants__banner-dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--color-red);
}

.participants__banner-text {
  min-width: 0;
  color: var(--color-red);
}

.participants__card {
  padding: var(--space-6px) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.participants__table,
.participants__table thead,
.participants__table tbody {
  display: block;
}

/* Each row wraps instead of scrolling. Header and body cells share the same flex bases, so on
   desktop they line up as columns; on narrow screens the cells drop onto new lines.
   Figma rows: 14px above and below, 16px between columns, a soft rule under each row */
.participants__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-14px) 0;
  border-bottom: 1px solid var(--color-border-soft);
}

.participants__table tbody .participants__row:last-child {
  border-bottom: none;
}

.participants__row > * {
  min-width: 0;
  padding: 0;
  text-align: left;
  overflow-wrap: break-word;
}

.participants__table thead th {
  color: var(--color-muted);
  font-weight: inherit;
}

/* The 176px action token is borrowed as the robot and team width before the row wraps */
.participants__cell--robot {
  flex: 1 1 var(--size-live-action);
}

.participants__cell--team {
  flex: 0 1 var(--size-live-action);
}

/* The 120px button token is borrowed for the class column (Figma: 118px) */
.participants__cell--weight {
  flex: 0 0 var(--size-button-min);
}

/* Editar and Remover side by side; they stack when the row is narrower than both */
.participants__cell--actions {
  flex: 0 1 calc(2 * var(--size-button-min) + var(--space-2));
  margin-left: auto;
}

.participants__robot {
  color: var(--color-text);
  text-transform: uppercase;
}

.participants__team,
.participants__weight {
  color: var(--color-muted);
}

.participants__weight {
  white-space: nowrap;
}

.participants__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

/* 120px wide on desktop; on a narrow row both buttons shrink to their content to stay side by side */
.participants__actions > * {
  flex: 1 1 0;
  min-width: auto;
}
</style>
