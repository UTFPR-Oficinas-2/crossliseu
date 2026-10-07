<script setup lang="ts">
// Figma: `08 / Organizador · Criar / editar campeonato` (node 20:302) — Breadcrumb 20:312,
// Title 20:313, Card 20:316, Aside 20:354, Footer 20:369. Create renders without the sidebar
// (/manage/new); edit renders inside it (/manage/:id/settings). Location was dropped from the
// product and arenas will come later, so neither field is built.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import InputField from '@/components/ui/InputField.vue'
import { isApiEnabled } from '@/api/client'
import { createChampionship, getChampionship, updateChampionship } from '@/mocks'
import { useAuthStore } from '@/stores/auth'
import {
  describeSaveError,
  emptyFormValues,
  formValuesFrom,
  toChampionshipInput,
  validateChampionshipForm,
  type ChampionshipFormErrors,
  type ChampionshipFormField,
  type ChampionshipFormValues,
} from './championship-form'

// One form for both creating and editing a championship
const { mode, championshipId } = defineProps<{
  mode: 'create' | 'edit'
  /** Only set in edit mode */
  championshipId?: string
}>()

const auth = useAuthStore()
const router = useRouter()

const values = reactive(emptyFormValues())
const baseline = ref<ChampionshipFormValues>(emptyFormValues())
const touched = reactive(new Set<ChampionshipFormField>())
const apiFieldErrors = ref<ChampionshipFormErrors>({})
const loadState = ref<'loading' | 'ready' | 'not-found' | 'error'>(
  mode === 'create' ? 'ready' : 'loading',
)
const championshipName = ref('')
const saving = ref(false)
const bannerError = ref<string | null>(null)
const saved = ref(false)
const formEl = ref<HTMLFormElement | null>(null)
let isUnmounted = false

const fields = Object.keys(values) as ChampionshipFormField[]
const clientErrors = computed(() => validateChampionshipForm(values))
const fieldError = (field: ChampionshipFormField) =>
  (touched.has(field) ? clientErrors.value[field] : undefined) ?? apiFieldErrors.value[field]
const isDirty = computed(() => fields.some((field) => values[field] !== baseline.value[field]))

function reset(next: ChampionshipFormValues) {
  Object.assign(values, next)
  baseline.value = { ...next }
  touched.clear()
}

// Single data entry point for this view
async function load() {
  if (mode === 'create' || !championshipId) return
  // The component is reused when the id changes: only the latest request may write state
  const requestedId = championshipId
  loadState.value = 'loading'
  championshipName.value = ''
  try {
    const championship = await getChampionship(requestedId)
    if (requestedId !== championshipId) return
    if (!championship) {
      loadState.value = 'not-found'
      return
    }
    championshipName.value = championship.name
    reset(formValuesFrom(championship))
    loadState.value = 'ready'
  } catch (error) {
    if (requestedId !== championshipId) return
    console.error('Failed to load championship', error)
    loadState.value = 'error'
  }
}
watch(() => championshipId, load, { immediate: true })

// A new edit invalidates the last attempt's banner, API field errors and confirmation
watch(values, () => {
  bannerError.value = null
  apiFieldErrors.value = {}
  saved.value = false
})

async function onSubmit() {
  if (saving.value) return
  fields.forEach((field) => touched.add(field))
  if (Object.keys(clientErrors.value).length > 0) {
    // Announce the failure to keyboard and screen reader users
    await nextTick()
    formEl.value?.querySelector<HTMLElement>('input[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  bannerError.value = null
  saved.value = false
  try {
    const input = toChampionshipInput(values)
    const token = auth.token ?? ''
    if (mode === 'create') {
      const created = await createChampionship(input, token)
      // The user left while the request was in flight: don't pull them back
      if (isUnmounted) return
      // Not dirty any more: skip the leave confirmation
      baseline.value = { ...values }
      await router.push({ name: 'championship-overview', params: { championshipId: created.id } })
    } else {
      const updated = await updateChampionship(championshipId!, input, token)
      if (isUnmounted) return
      championshipName.value = updated.name
      reset(formValuesFrom(updated))
      // The `values` watcher runs on the next tick and would clear the confirmation
      await nextTick()
      saved.value = true
    }
  } catch (error) {
    if (isUnmounted) return
    const described = describeSaveError(error)
    bannerError.value = described.message
    apiFieldErrors.value = described.fields
  } finally {
    saving.value = false
  }
}

const cancelTarget = computed(() =>
  mode === 'create'
    ? { name: 'my-championships' }
    : { name: 'championship-overview', params: { championshipId } },
)

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

const nextSteps = [
  'Cadastre os participantes e seus robôs.',
  'Crie as lutas e defina a ordem.',
  'Abra a preparação da luta para o operador.',
]
</script>

<template>
  <div class="championship-form">
    <nav aria-label="Navegação estrutural">
      <ol class="championship-form__breadcrumb text-mono-s">
        <li>
          <RouterLink class="championship-form__crumb-link" :to="{ name: 'my-championships' }">
            Meus campeonatos
          </RouterLink>
        </li>
        <li aria-hidden="true">/</li>
        <template v-if="mode === 'create'">
          <li aria-current="page">Novo campeonato</li>
        </template>
        <template v-else>
          <template v-if="championshipName">
            <li>{{ championshipName }}</li>
            <li aria-hidden="true">/</li>
          </template>
          <li aria-current="page">Configurações</li>
        </template>
      </ol>
    </nav>

    <h1 class="championship-form__title text-display-page">
      {{ mode === 'create' ? 'Criar campeonato' : 'Editar campeonato' }}
    </h1>
    <p class="championship-form__muted text-body-m">
      {{
        mode === 'create'
          ? 'Preencha os dados principais. Participantes e lutas são cadastrados depois de salvar.'
          : 'Altere os dados do campeonato. As mudanças aparecem na página pública assim que você salvar.'
      }}
    </p>

    <p
      v-if="loadState === 'loading'"
      class="championship-form__muted text-body-m"
      aria-live="polite"
    >
      Carregando campeonato…
    </p>

    <div v-else-if="loadState === 'error'" class="championship-form__error" role="alert">
      <p class="text-body-m">Não foi possível carregar o campeonato.</p>
      <AppButton variant="secondary" @click="load">Tentar novamente</AppButton>
    </div>

    <div v-else-if="loadState === 'not-found'" class="championship-form__not-found">
      <p class="championship-form__muted text-body-m">Campeonato não encontrado.</p>
      <AppButton variant="secondary" :to="{ name: 'my-championships' }">
        Voltar para meus campeonatos
      </AppButton>
    </div>

    <div v-else class="championship-form__columns">
      <form
        ref="formEl"
        class="championship-form__card"
        novalidate
        aria-labelledby="championship-form-heading"
        @submit.prevent="onSubmit"
      >
        <h2 id="championship-form-heading" class="championship-form__heading text-heading-m">
          Informações do campeonato
        </h2>

        <InputField
          v-model="values.name"
          label="Nome *"
          name="name"
          hint="Aparece na página pública do campeonato."
          required
          :disabled="saving"
          :error="fieldError('name')"
          @focusout="touched.add('name')"
        />

        <div class="championship-form__dates">
          <InputField
            v-model="values.startDate"
            type="date"
            label="Data de início *"
            name="startDate"
            required
            :disabled="saving"
            :error="fieldError('startDate')"
            @focusout="touched.add('startDate')"
          />
          <InputField
            v-model="values.endDate"
            type="date"
            label="Data de término *"
            name="endDate"
            required
            :disabled="saving"
            :error="fieldError('endDate')"
            @focusout="touched.add('endDate')"
          />
        </div>

        <div v-if="bannerError" class="championship-form__banner" role="alert">
          <span class="championship-form__banner-dot" aria-hidden="true" />
          <p class="championship-form__banner-text text-body-s">{{ bannerError }}</p>
        </div>

        <div class="championship-form__actions">
          <p class="championship-form__saved text-body-s" role="status">
            {{ saved ? 'Alterações salvas.' : '' }}
          </p>
          <AppButton class="championship-form__button" variant="secondary" :to="cancelTarget">
            Cancelar
          </AppButton>
          <AppButton
            class="championship-form__button"
            type="submit"
            :disabled="saving"
            :aria-busy="saving"
          >
            Salvar campeonato
          </AppButton>
        </div>
      </form>

      <aside class="championship-form__aside">
        <section class="championship-form__panel championship-form__panel--steps">
          <h2 class="championship-form__heading text-heading-s">Depois de salvar</h2>
          <ol class="championship-form__steps">
            <li v-for="(step, index) in nextSteps" :key="step" class="championship-form__step">
              <span class="championship-form__step-number text-mono-m">{{ index + 1 }}</span>
              <span class="championship-form__muted text-body-s">{{ step }}</span>
            </li>
          </ol>
        </section>
        <section class="championship-form__panel championship-form__panel--required">
          <h2 class="championship-form__heading text-heading-s">Campos obrigatórios</h2>
          <p class="championship-form__muted text-body-s">
            Nome, data de início e data de término. O status (programado, em andamento ou encerrado)
            é definido pelas datas. O campeonato fica visível publicamente assim que é salvo.
          </p>
        </section>
      </aside>
    </div>

    <footer class="championship-form__footer text-mono-s">
      <p>CROSSLISEU · UTFPR</p>
      <p v-if="!isApiEnabled">Conceito visual · dados demonstrativos</p>
    </footer>
  </div>
</template>

<style scoped>
.championship-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.championship-form__breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--color-muted);
  text-transform: uppercase;
}

.championship-form__crumb-link {
  color: inherit;
  text-decoration: none;
}

.championship-form__crumb-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-xs);
}

.championship-form__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.championship-form__muted {
  color: var(--color-muted);
}

.championship-form__error {
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

.championship-form__not-found {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}

.championship-form__columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-6);
}

.championship-form__card {
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

.championship-form__heading {
  color: var(--color-text);
  text-transform: uppercase;
}

.championship-form__dates {
  display: flex;
  gap: var(--space-4);
}

.championship-form__dates > * {
  flex: 1 1 0;
  min-width: 0;
}

.championship-form__banner {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
}

.championship-form__banner-dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--color-red);
}

.championship-form__banner-text {
  min-width: 0;
  color: var(--color-red);
}

.championship-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.championship-form__saved {
  margin-right: auto;
  color: var(--color-green);
}

.championship-form__button {
  min-height: var(--size-control-lg);
}

.championship-form__aside {
  display: flex;
  flex: 1 1 var(--size-aside);
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.championship-form__panel {
  display: flex;
  flex-direction: column;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.championship-form__panel--steps {
  gap: var(--space-3);
}

.championship-form__panel--required {
  gap: var(--space-10px);
}

.championship-form__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.championship-form__step {
  display: flex;
  gap: var(--space-3);
}

.championship-form__step-number {
  min-width: var(--space-4);
  color: var(--color-orange);
}

.championship-form__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  color: var(--color-muted);
}
</style>
