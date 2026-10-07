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
        <table class="participants__table">
          <thead class="text-overline">
            <tr>
              <th scope="col">Robô</th>
              <th scope="col">Equipe</th>
              <th scope="col">Categoria</th>
              <th scope="col"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="robot in visible" :key="robot.id">
              <th scope="row" class="participants__robot text-heading-s">{{ robot.name }}</th>
              <td class="participants__team text-body-m">{{ robot.team }}</td>
              <td class="participants__weight text-mono-s">
                {{ weightClassLabel(robot.weightClass) }}
              </td>
              <td>
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

/* The card may scroll on very narrow screens; the page itself never scrolls sideways */
.participants__card {
  overflow-x: auto;
  padding: var(--space-6px) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.participants__table {
  width: 100%;
  border-collapse: collapse;
}

/* Figma rows: 14px above and below, 16px between columns, a soft rule under each row */
.participants__table th,
.participants__table td {
  padding: var(--space-14px) var(--space-4) var(--space-14px) 0;
  border-bottom: 1px solid var(--color-border-soft);
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.participants__table th:last-child,
.participants__table td:last-child {
  padding-right: 0;
}

.participants__table tbody tr:last-child > * {
  border-bottom: none;
}

.participants__table thead th {
  color: var(--color-muted);
  font-weight: inherit;
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
</style>
