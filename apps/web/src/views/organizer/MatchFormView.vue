<script setup lang="ts">
// Figma: `10b / Organizador · Nova / editar luta` (node 126:530). One form for both modes. Only
// waiting matches can be edited or deleted. Figma 10 has no delete action, so "Excluir luta"
// lives here in edit mode.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import SelectField from '@/components/ui/SelectField.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import {
  createMatch,
  deleteMatch,
  getChampionship,
  getMatchSummaries,
  getRobots,
  updateMatch,
} from '@/mocks'
import { useAuthStore } from '@/stores/auth'
import type { MatchSummary, Robot } from '@/types'
import { matchStatePill } from '@/utils/match'
import LoadStatePanel from './components/LoadStatePanel.vue'
import OrganizerBreadcrumb from './components/OrganizerBreadcrumb.vue'
import OrganizerFooter from './components/OrganizerFooter.vue'
import {
  MATCH_MESSAGES,
  describeSaveError,
  emptyMatchValues,
  matchPreview,
  matchValuesFrom,
  pickRobot,
  robotHint,
  robotOptions,
  toMatchInput,
  validateMatchForm,
  type MatchFormErrors,
  type MatchFormField,
  type MatchFormValues,
} from './match-form'

const { mode, championshipId, matchId } = defineProps<{
  mode: 'create' | 'edit'
  championshipId: string
  /** Only set in edit mode */
  matchId?: string
}>()

const auth = useAuthStore()
const router = useRouter()

const values = reactive(emptyMatchValues())
const baseline = ref<MatchFormValues>(emptyMatchValues())
const touched = reactive(new Set<MatchFormField>())
const apiFieldErrors = ref<MatchFormErrors>({})
const loadState = ref<'loading' | 'ready' | 'not-found' | 'not-editable' | 'error'>('loading')
const missing = ref<'championship' | 'match'>('championship')
const championshipName = ref('')
const robots = ref<Robot[]>([])
const saving = ref(false)
const deleting = ref(false)
const bannerError = ref<string | null>(null)
const formEl = ref<HTMLFormElement | null>(null)
let isUnmounted = false

const busy = computed(() => saving.value || deleting.value)
const fields = Object.keys(values) as MatchFormField[]
const clientErrors = computed(() => validateMatchForm(robots.value, values))
const fieldError = (field: MatchFormField) =>
  (touched.has(field) ? clientErrors.value[field] : undefined) ?? apiFieldErrors.value[field]
const isDirty = computed(() => fields.some((field) => values[field] !== baseline.value[field]))
const optionsA = computed(() => robotOptions(robots.value, values, 'robotAId'))
const optionsB = computed(() => robotOptions(robots.value, values, 'robotBId'))
const preview = computed(() => matchPreview(robots.value, values))
const listRoute = computed(() => ({ name: 'championship-matches', params: { championshipId } }))

const breadcrumb = computed(() => [
  { label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ...(championshipName.value ? [{ label: championshipName.value }] : []),
  { label: 'Lutas', to: listRoute.value },
  { label: mode === 'create' ? 'Nova luta' : 'Editar luta' },
])

const notFound = computed(() =>
  missing.value === 'match'
    ? { text: 'Luta não encontrada.', back: { label: 'Voltar para lutas', to: listRoute.value } }
    : {
        text: 'Campeonato não encontrado.',
        back: { label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } },
      },
)

function reset(next: MatchFormValues) {
  Object.assign(values, next)
  baseline.value = { ...next }
  touched.clear()
}

function pick(slot: MatchFormField, robotId: string) {
  Object.assign(values, pickRobot(robots.value, values, slot, robotId))
}

// Single data entry point for this view
async function load() {
  // The component is reused across these routes: only the latest request may write state
  const requested = { mode, championshipId, matchId }
  const isStale = () =>
    requested.mode !== mode ||
    requested.championshipId !== championshipId ||
    requested.matchId !== matchId
  loadState.value = 'loading'
  championshipName.value = ''
  try {
    const championship = await getChampionship(requested.championshipId)
    if (isStale()) return
    if (!championship) {
      missing.value = 'championship'
      loadState.value = 'not-found'
      return
    }
    championshipName.value = championship.name
    const [loadedRobots, summaries] = await Promise.all([
      getRobots(requested.championshipId),
      requested.mode === 'edit'
        ? getMatchSummaries(requested.championshipId)
        : Promise.resolve<MatchSummary[]>([]),
    ])
    if (isStale()) return
    const match = summaries.find((m) => m.id === requested.matchId)
    if (requested.mode === 'edit' && !match) {
      missing.value = 'match'
      loadState.value = 'not-found'
      return
    }
    robots.value = loadedRobots
    if (match && match.state !== 'waiting') {
      loadState.value = 'not-editable'
      return
    }
    reset(match ? matchValuesFrom(match) : emptyMatchValues())
    loadState.value = 'ready'
  } catch (error) {
    if (isStale()) return
    console.error('Failed to load match', error)
    loadState.value = 'error'
  }
}
watch(() => [mode, championshipId, matchId], load, { immediate: true })

// A new pick invalidates the last attempt's banner and API field errors
watch(values, () => {
  bannerError.value = null
  apiFieldErrors.value = {}
})

async function onSubmit() {
  if (busy.value) return
  fields.forEach((field) => touched.add(field))
  if (Object.keys(clientErrors.value).length > 0) {
    // Announce the failure to keyboard and screen reader users
    await nextTick()
    formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  bannerError.value = null
  try {
    const input = toMatchInput(values)
    const token = auth.token ?? ''
    if (mode === 'edit') await updateMatch(matchId!, input, token)
    else await createMatch(championshipId, input, token)
    // The user left while the request was in flight: don't pull them back
    if (isUnmounted) return
    // Not dirty any more: skip the leave confirmation
    baseline.value = { ...values }
    await router.push(listRoute.value)
  } catch (error) {
    if (isUnmounted) return
    const described = describeSaveError(error)
    bannerError.value = described.message
    apiFieldErrors.value = described.fields
  } finally {
    if (!isUnmounted) saving.value = false
  }
}

async function onDelete() {
  if (busy.value || !matchId) return
  if (!window.confirm('Excluir esta luta? Essa ação não pode ser desfeita.')) return
  deleting.value = true
  bannerError.value = null
  try {
    await deleteMatch(matchId, auth.token ?? '')
    if (isUnmounted) return
    // The match is gone: leaving can't lose anything
    baseline.value = { ...values }
    await router.push(listRoute.value)
  } catch (error) {
    if (isUnmounted) return
    bannerError.value = describeSaveError(error, MATCH_MESSAGES.deleteGeneric).message
  } finally {
    if (!isUnmounted) deleting.value = false
  }
}

const LEAVE_MESSAGE = 'Há alterações não salvas. Deseja sair mesmo assim?'
onBeforeRouteLeave(() => (isDirty.value && !window.confirm(LEAVE_MESSAGE) ? false : undefined))
onBeforeRouteUpdate(() => (isDirty.value && !window.confirm(LEAVE_MESSAGE) ? false : undefined))
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (isDirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => {
  isUnmounted = true
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="match-form">
    <OrganizerBreadcrumb :items="breadcrumb" />

    <h1 class="match-form__title text-display-page">
      {{ mode === 'create' ? 'Nova luta' : 'Editar luta' }}
    </h1>
    <p v-if="loadState === 'ready'" class="match-form__muted text-body-m">
      Escolha dois robôs inscritos neste campeonato.
    </p>

    <div v-if="loadState === 'not-editable'" class="match-form__notice">
      <p class="match-form__muted text-body-m">{{ MATCH_MESSAGES.notEditable }}</p>
      <AppButton variant="secondary" :to="listRoute">Voltar para lutas</AppButton>
    </div>

    <LoadStatePanel
      v-else-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando luta…"
      error-text="Não foi possível carregar a luta."
      :not-found-text="notFound.text"
      :back="notFound.back"
      @retry="load"
    />

    <div v-else-if="robots.length < 2" class="match-form__notice">
      <p class="match-form__muted text-body-m">
        Uma luta precisa de dois robôs inscritos neste campeonato. Cadastre os participantes
        primeiro.
      </p>
      <AppButton :to="{ name: 'participant-create', params: { championshipId } }">
        Adicionar participante
      </AppButton>
    </div>

    <div v-else class="match-form__columns">
      <form
        ref="formEl"
        class="match-form__card"
        novalidate
        aria-labelledby="match-form-heading"
        @submit.prevent="onSubmit"
      >
        <h2 id="match-form-heading" class="match-form__heading text-heading-m">Confronto</h2>

        <div class="match-form__pickers">
          <SelectField
            class="match-form__picker"
            :model-value="values.robotAId"
            label="Robô 1 *"
            placeholder="Escolha um robô"
            :group-label="optionsA.groupLabel"
            :options="optionsA.options"
            :hint="robotHint(robots, values.robotAId)"
            :error="fieldError('robotAId')"
            :disabled="busy"
            required
            @update:model-value="pick('robotAId', $event)"
            @focusout="touched.add('robotAId')"
          />
          <span class="match-form__versus text-heading-m" aria-hidden="true">×</span>
          <SelectField
            class="match-form__picker"
            :model-value="values.robotBId"
            label="Robô 2 *"
            placeholder="Escolha um robô"
            :group-label="optionsB.groupLabel"
            :options="optionsB.options"
            :hint="robotHint(robots, values.robotBId)"
            :error="fieldError('robotBId')"
            :disabled="busy"
            required
            @update:model-value="pick('robotBId', $event)"
            @focusout="touched.add('robotBId')"
          />
        </div>

        <div v-if="bannerError" class="match-form__banner" role="alert">
          <span class="match-form__banner-dot" aria-hidden="true" />
          <p class="match-form__banner-text text-body-s">{{ bannerError }}</p>
        </div>

        <div class="match-form__actions">
          <AppButton
            v-if="mode === 'edit'"
            class="match-form__button match-form__delete"
            variant="destructive"
            :disabled="busy"
            :aria-busy="deleting"
            @click="onDelete"
          >
            Excluir luta
          </AppButton>
          <AppButton class="match-form__button" variant="secondary" :to="listRoute">
            Cancelar
          </AppButton>
          <AppButton class="match-form__button" type="submit" :disabled="busy" :aria-busy="saving">
            {{ mode === 'create' ? 'Criar luta' : 'Salvar luta' }}
          </AppButton>
        </div>
      </form>

      <aside class="match-form__aside">
        <section class="match-form__panel">
          <h2 class="match-form__heading text-heading-s">Prévia na lista</h2>
          <div class="match-form__matchup">
            <p class="match-form__pair text-heading-xl">
              {{ preview.robotA }}
              <span class="match-form__versus text-heading-m" aria-hidden="true">×</span>
              <span class="visually-hidden"> contra </span>
              {{ preview.robotB }}
            </p>
            <p class="match-form__muted text-body-s">{{ preview.teams }}</p>
            <StatusPill v-bind="matchStatePill.waiting" />
          </div>
          <p class="match-form__muted text-body-s">
            Assim a luta aparece na lista do campeonato. Os lados A e B são definidos na preparação.
          </p>
        </section>
        <section class="match-form__panel match-form__panel--rules">
          <h2 class="match-form__heading text-heading-s">Regras do confronto</h2>
          <p class="match-form__muted text-body-s">
            Dois robôs diferentes, ambos inscritos neste campeonato e da mesma categoria de peso.
            Robôs de outras categorias não aparecem na lista.
          </p>
        </section>
      </aside>
    </div>

    <OrganizerFooter />
  </div>
</template>

<style scoped>
.match-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.match-form__title,
.match-form__heading,
.match-form__pair {
  color: var(--color-text);
  text-transform: uppercase;
}

.match-form__muted {
  color: var(--color-muted);
}

.match-form__notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}

.match-form__columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-6);
}

.match-form__card {
  display: flex;
  flex: 999 1 0;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 50%;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.match-form__pickers {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-4);
}

/* The 176px action token is borrowed as the minimum field width before the pair stacks */
.match-form__picker {
  flex: 1 1 var(--size-live-action);
  min-width: 0;
}

.match-form__pickers {
  /* Width at which the two pickers and the "×" still fit on one line */
  --pickers-side-by-side: calc(2 * var(--size-live-action) + var(--space-6) + 2 * var(--space-4));
  /* Label height plus gap, then half of the room the "×" leaves in the trigger (Figma 126:647) */
  --versus-offset: calc(
    var(--text-label-s-size) * var(--text-label-s-line-height) + var(--space-2) +
      (var(--size-field) - var(--text-heading-m-size) * var(--text-heading-m-line-height)) / 2
  );
}

/* Side by side: a narrow column centered on the triggers, whatever hints sit under them. Too
   narrow for that: the same clamp makes it a full-width row of its own, centered between the
   pickers, with no offset. A percentage inside flex-basis and margin-top resolves against the
   width of .match-form__pickers, and the large factor turns the comparison into an on/off switch
   (CSS has no media or container query that accepts a token). */
.match-form__pickers > .match-form__versus {
  flex: 0 0 clamp(var(--space-6), calc((var(--pickers-side-by-side) - 100%) * 999), 100%);
  margin-top: clamp(0px, calc((100% - var(--pickers-side-by-side)) * 999), var(--versus-offset));
  text-align: center;
}

.match-form__versus {
  color: var(--color-muted);
}

.match-form__pair .match-form__versus {
  margin: 0 var(--space-2);
}

.match-form__banner {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
}

.match-form__banner-dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--color-red);
}

.match-form__banner-text {
  min-width: 0;
  color: var(--color-red);
}

.match-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.match-form__delete {
  margin-right: auto;
}

.match-form__button {
  min-height: var(--size-control-lg);
}

.match-form__aside {
  display: flex;
  flex: 1 1 var(--size-aside);
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.match-form__panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

/* Figma 126:696: names, teams and status pill sit 10px apart inside the card's 12px rhythm */
.match-form__matchup {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-10px);
  padding: var(--space-2) 0;
}

.match-form__pair {
  overflow-wrap: anywhere;
}

/* Figma 126:567: the "Regras do confronto" card has a 10px gap, the preview card 12px */
.match-form__panel--rules {
  gap: var(--space-10px);
}
</style>
