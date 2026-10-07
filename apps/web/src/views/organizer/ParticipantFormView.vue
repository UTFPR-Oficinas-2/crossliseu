<script setup lang="ts">
// Figma: `09b / Organizador · Adicionar / editar participante` (node 120:493). One form for both
// modes. Mirrors ChampionshipFormView: touched-field validation, API field errors, a leave
// confirmation while dirty, and no state writes after unmount. Figma draws the weight class as a
// text input; it's a SelectField here because only two classes exist.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import CompetitorTile from '@/components/ui/CompetitorTile.vue'
import InputField from '@/components/ui/InputField.vue'
import SelectField from '@/components/ui/SelectField.vue'
import { createRobot, getChampionship, getRobots, updateRobot } from '@/mocks'
import { useAuthStore } from '@/stores/auth'
import type { Robot } from '@/types'
import LoadStatePanel from './components/LoadStatePanel.vue'
import OrganizerBreadcrumb from './components/OrganizerBreadcrumb.vue'
import OrganizerFooter from './components/OrganizerFooter.vue'
import {
  WEIGHT_CLASS_OPTIONS,
  describeSaveError,
  emptyParticipantValues,
  participantPreview,
  participantValuesFrom,
  toRobotInput,
  validateParticipantForm,
  type ParticipantFormErrors,
  type ParticipantFormField,
  type ParticipantFormValues,
} from './participant-form'

const { mode, championshipId, robotId } = defineProps<{
  mode: 'create' | 'edit'
  championshipId: string
  /** Only set in edit mode */
  robotId?: string
}>()

const auth = useAuthStore()
const router = useRouter()

const values = reactive(emptyParticipantValues())
const baseline = ref<ParticipantFormValues>(emptyParticipantValues())
const touched = reactive(new Set<ParticipantFormField>())
const apiFieldErrors = ref<ParticipantFormErrors>({})
const loadState = ref<'loading' | 'ready' | 'not-found' | 'error'>('loading')
const missing = ref<'championship' | 'robot'>('championship')
const championshipName = ref('')
const saving = ref(false)
const bannerError = ref<string | null>(null)
/** Name of the robot just saved with "Salvar e adicionar outro" */
const addedName = ref<string | null>(null)
const formEl = ref<HTMLFormElement | null>(null)
let isUnmounted = false

const fields = Object.keys(values) as ParticipantFormField[]
const clientErrors = computed(() => validateParticipantForm(values))
const fieldError = (field: ParticipantFormField) =>
  (touched.has(field) ? clientErrors.value[field] : undefined) ?? apiFieldErrors.value[field]
const isDirty = computed(() => fields.some((field) => values[field] !== baseline.value[field]))
const preview = computed(() => participantPreview(values))
const listRoute = computed(() => ({
  name: 'championship-participants',
  params: { championshipId },
}))

const breadcrumb = computed(() => [
  { label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ...(championshipName.value ? [{ label: championshipName.value }] : []),
  { label: 'Participantes', to: listRoute.value },
  { label: mode === 'create' ? 'Novo participante' : 'Editar participante' },
])

const notFound = computed(() =>
  missing.value === 'robot'
    ? {
        text: 'Participante não encontrado.',
        back: { label: 'Voltar para participantes', to: listRoute.value },
      }
    : {
        text: 'Campeonato não encontrado.',
        back: { label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } },
      },
)

function reset(next: ParticipantFormValues) {
  Object.assign(values, next)
  baseline.value = { ...next }
  touched.clear()
}

// Single data entry point for this view
async function load() {
  // The component is reused across these routes: only the latest request may write state
  const requested = { mode, championshipId, robotId }
  const isStale = () =>
    requested.mode !== mode ||
    requested.championshipId !== championshipId ||
    requested.robotId !== robotId
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
    let robot: Robot | undefined
    if (requested.mode === 'edit') {
      robot = (await getRobots(requested.championshipId)).find((r) => r.id === requested.robotId)
      if (isStale()) return
      if (!robot) {
        missing.value = 'robot'
        loadState.value = 'not-found'
        return
      }
    }
    reset(robot ? participantValuesFrom(robot) : emptyParticipantValues())
    loadState.value = 'ready'
  } catch (error) {
    if (isStale()) return
    console.error('Failed to load participant', error)
    loadState.value = 'error'
  }
}
watch(() => [mode, championshipId, robotId], load, { immediate: true })

// A new edit invalidates the last attempt's banner, API field errors and confirmation
watch(values, () => {
  bannerError.value = null
  apiFieldErrors.value = {}
  addedName.value = null
})

/** `list` returns to the participants; `another` keeps the form open for the next robot */
async function onSubmit(next: 'list' | 'another') {
  if (saving.value) return
  fields.forEach((field) => touched.add(field))
  if (Object.keys(clientErrors.value).length > 0) {
    // Announce the failure to keyboard and screen reader users
    await nextTick()
    formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  bannerError.value = null
  addedName.value = null
  try {
    const input = toRobotInput(values)
    const token = auth.token ?? ''
    if (mode === 'edit') await updateRobot(robotId!, input, token)
    else await createRobot(championshipId, input, token)
    // The user left while the request was in flight: don't pull them back
    if (isUnmounted) return
    if (next === 'another') {
      reset(emptyParticipantValues())
      // Inputs are disabled while saving; enable them before moving focus
      saving.value = false
      // The `values` watcher runs on the next tick and would clear the confirmation
      await nextTick()
      addedName.value = input.name
      formEl.value?.querySelector<HTMLInputElement>('input[name="name"]')?.focus()
      return
    }
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
  <div class="participant-form">
    <OrganizerBreadcrumb :items="breadcrumb" />

    <h1 class="participant-form__title text-display-page">
      {{ mode === 'create' ? 'Adicionar participante' : 'Editar participante' }}
    </h1>
    <p v-if="loadState === 'ready'" class="participant-form__muted text-body-m">
      {{
        mode === 'create'
          ? 'Cadastre um robô e a equipe dele neste campeonato.'
          : 'Altere os dados do robô. As mudanças aparecem nas lutas e na página pública.'
      }}
    </p>

    <LoadStatePanel
      v-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando participante…"
      error-text="Não foi possível carregar o participante."
      :not-found-text="notFound.text"
      :back="notFound.back"
      @retry="load"
    />

    <div v-else class="participant-form__columns">
      <form
        ref="formEl"
        class="participant-form__card"
        novalidate
        aria-labelledby="participant-form-heading"
        @submit.prevent="onSubmit('list')"
      >
        <h2 id="participant-form-heading" class="participant-form__heading text-heading-m">
          Robô e equipe
        </h2>

        <InputField
          v-model="values.name"
          label="Nome do robô *"
          name="name"
          hint="Aparece nas lutas, na tela dos árbitros e na página pública."
          required
          :disabled="saving"
          :error="fieldError('name')"
          @focusout="touched.add('name')"
        />

        <div class="participant-form__pair">
          <InputField
            v-model="values.team"
            label="Equipe *"
            name="team"
            required
            :disabled="saving"
            :error="fieldError('team')"
            @focusout="touched.add('team')"
          />
          <SelectField
            v-model="values.weightClass"
            label="Categoria de peso *"
            placeholder="Escolha a categoria"
            :options="WEIGHT_CLASS_OPTIONS"
            hint="Uma luta só reúne robôs da mesma categoria."
            required
            :disabled="saving"
            :error="fieldError('weightClass')"
            @focusout="touched.add('weightClass')"
          />
        </div>

        <div v-if="bannerError" class="participant-form__banner" role="alert">
          <span class="participant-form__banner-dot" aria-hidden="true" />
          <p class="participant-form__banner-text text-body-s">{{ bannerError }}</p>
        </div>

        <div class="participant-form__actions">
          <p class="participant-form__saved text-body-s" role="status">
            {{ addedName ? `${addedName} foi adicionado.` : '' }}
          </p>
          <AppButton class="participant-form__button" variant="secondary" :to="listRoute">
            Cancelar
          </AppButton>
          <AppButton
            v-if="mode === 'create'"
            class="participant-form__button"
            variant="ghost"
            :disabled="saving"
            @click="onSubmit('another')"
          >
            Salvar e adicionar outro
          </AppButton>
          <AppButton
            class="participant-form__button"
            type="submit"
            :disabled="saving"
            :aria-busy="saving"
          >
            {{ mode === 'create' ? 'Adicionar participante' : 'Salvar alterações' }}
          </AppButton>
        </div>
      </form>

      <aside class="participant-form__aside">
        <section class="participant-form__panel">
          <h2 class="participant-form__heading text-heading-s">Prévia na luta</h2>
          <CompetitorTile
            side="A"
            :team="preview.team"
            :robot="preview.robot"
            :details="preview.details"
          />
          <p class="participant-form__muted text-body-s">
            Assim o robô aparece para operador, árbitros e público. O lado A ou B é definido na
            preparação de cada luta.
          </p>
        </section>
        <section class="participant-form__panel participant-form__panel--required">
          <h2 class="participant-form__heading text-heading-s">Campos obrigatórios</h2>
          <p class="participant-form__muted text-body-s">
            Nome do robô, equipe e categoria de peso. O nome do robô não pode se repetir dentro do
            mesmo campeonato.
          </p>
        </section>
      </aside>
    </div>

    <OrganizerFooter />
  </div>
</template>

<style scoped>
.participant-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.participant-form__title,
.participant-form__heading {
  color: var(--color-text);
  text-transform: uppercase;
}

.participant-form__muted {
  color: var(--color-muted);
}

.participant-form__columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-6);
}

.participant-form__card {
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

.participant-form__pair {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

/* The 176px action token is borrowed as the minimum field width before the pair stacks */
.participant-form__pair > * {
  flex: 1 1 var(--size-live-action);
  min-width: 0;
}

.participant-form__banner {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
}

.participant-form__banner-dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--color-red);
}

.participant-form__banner-text {
  min-width: 0;
  color: var(--color-red);
}

.participant-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.participant-form__saved {
  margin-right: auto;
  color: var(--color-green);
}

.participant-form__button {
  min-height: var(--size-control-lg);
}

.participant-form__aside {
  display: flex;
  flex: 1 1 var(--size-aside);
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.participant-form__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

/* Figma 120:493: the "Campos obrigatórios" card has a 10px gap, the preview card 12px */
.participant-form__panel--required {
  gap: var(--space-10px);
}
</style>
