<script setup lang="ts">
// Figma ORG-20 (list), ORG-21 (name form) and ORG-22 (credentials), with the spec's tweaks: no
// status pill, a Remover action and a config.h panel. The plain token only ever lives in `config`
// below: component state, never a store, storage or the URL.
import { computed, onMounted, ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import InputField from '@/components/ui/InputField.vue'
import { addArena, getMyArenas, newArenaToken, removeArena, renameArena } from '@/data'
import { useAuthStore } from '@/stores/auth'
import type { DeviceCredentials, ManagedArena } from '@/types'
import { buildArenaConfig } from '@/utils/arena-config'
import ArenaCredentialsPanel from './components/ArenaCredentialsPanel.vue'
import LoadStatePanel from './components/LoadStatePanel.vue'
import { arenaSubtitle, describeArenaError, validateArenaName } from './arenas-view'

const auth = useAuthStore()

const loadState = ref<'loading' | 'error' | 'ready'>('loading')
const arenas = ref<ManagedArena[]>([])

async function load() {
  loadState.value = 'loading'
  try {
    arenas.value = await getMyArenas(auth.token ?? '')
    loadState.value = 'ready'
  } catch (error) {
    console.error('Failed to load arenas', error)
    loadState.value = 'error'
  }
}
onMounted(load)

// Local only, gone on unmount; cleared by every other action
const panel = ref<{ arenaId: string; arenaName: string; config: string } | null>(null)
function showCredentials(arena: ManagedArena, credentials: DeviceCredentials) {
  panel.value = {
    arenaId: arena.id,
    arenaName: arena.name,
    config: buildArenaConfig(arena.name, credentials),
  }
}

const busy = ref(false)
// Message for the last action that failed on a row (or on the create form)
const rowError = ref<{ id: string; message: string } | null>(null)

// Create
const creating = ref(false)
const newName = ref('')
const newNameError = ref('')
const createError = ref('')

function openCreate() {
  newName.value = ''
  newNameError.value = ''
  createError.value = ''
  creating.value = true
}

function closeCreate() {
  creating.value = false
}

async function create() {
  createError.value = ''
  const { name, error } = validateArenaName(newName.value)
  newNameError.value = error ?? ''
  if (error || busy.value) return
  busy.value = true
  try {
    const created = await addArena(name, auth.token ?? '')
    arenas.value = [...arenas.value, created.arena]
    showCredentials(created.arena, created.credentials)
    creating.value = false
  } catch (e) {
    const { kind, message } = describeArenaError(e)
    if (kind === 'name') newNameError.value = message
    else createError.value = message
  } finally {
    busy.value = false
  }
}

// Inline rename
const editingId = ref<string | null>(null)
const editName = ref('')
const editError = ref('')

function startRename(arena: ManagedArena) {
  rowError.value = null
  editingId.value = arena.id
  editName.value = arena.name
  editError.value = ''
}

function cancelRename() {
  editingId.value = null
}

async function saveRename(arena: ManagedArena) {
  rowError.value = null
  const { name, error } = validateArenaName(editName.value)
  editError.value = error ?? ''
  if (error || busy.value) return
  busy.value = true
  try {
    const updated = await renameArena(arena.id, name, auth.token ?? '')
    arenas.value = arenas.value.map((a) => (a.id === arena.id ? updated : a))
    // The config.h names the old arena name
    if (panel.value?.arenaId === arena.id) panel.value = null
    editingId.value = null
  } catch (e) {
    const { kind, message } = describeArenaError(e)
    if (kind === 'name') editError.value = message
    else rowError.value = { id: arena.id, message }
  } finally {
    busy.value = false
  }
}

async function rotate(arena: ManagedArena) {
  rowError.value = null
  if (
    !window.confirm(
      `Gerar um novo token para "${arena.name}"? A caixa que usa o token atual vai parar de conectar.`,
    )
  ) {
    return
  }
  busy.value = true
  try {
    const credentials = await newArenaToken(arena.id, auth.token ?? '')
    showCredentials(arena, credentials)
  } catch (e) {
    rowError.value = { id: arena.id, message: describeArenaError(e).message }
  } finally {
    busy.value = false
  }
}

async function remove(arena: ManagedArena) {
  rowError.value = null
  if (
    !window.confirm(
      `Remover a arena "${arena.name}"? A caixa dela vai parar de conectar e isso não pode ser desfeito.`,
    )
  ) {
    return
  }
  busy.value = true
  try {
    await removeArena(arena.id, auth.token ?? '')
    arenas.value = arenas.value.filter((a) => a.id !== arena.id)
    if (panel.value?.arenaId === arena.id) panel.value = null
  } catch (e) {
    rowError.value = { id: arena.id, message: describeArenaError(e).message }
  } finally {
    busy.value = false
  }
}

const rows = computed(() =>
  arenas.value.map((arena) => ({ arena, subtitle: arenaSubtitle(arena) })),
)
</script>

<template>
  <div class="arenas">
    <header class="arenas__header">
      <div class="arenas__titles">
        <h1 class="arenas__title text-display-page">Arenas</h1>
        <p class="arenas__muted text-body-m">
          Cada arena tem uma caixa (ESP32) com identificador e token próprios. As arenas valem para
          todos os campeonatos. Só você vê as suas arenas.
        </p>
      </div>
      <AppButton
        v-if="loadState === 'ready'"
        class="arenas__new"
        :disabled="creating"
        @click="openCreate"
      >
        Nova arena
      </AppButton>
    </header>

    <LoadStatePanel
      v-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando arenas…"
      error-text="Não foi possível carregar as arenas."
      not-found-text=""
      :back="{ label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } }"
      @retry="load"
    />

    <template v-else>
      <form v-if="creating" class="arenas__form" novalidate @submit.prevent="create">
        <h2 class="arenas__form-title text-heading-m">Nova arena</h2>
        <div class="arenas__form-row">
          <InputField
            v-model="newName"
            class="arenas__form-field"
            label="Nome da arena *"
            hint="Aparece para o operador e na caixa da arena."
            autocomplete="off"
            :error="newNameError"
          />
          <AppButton variant="ghost" @click="closeCreate">Cancelar</AppButton>
          <AppButton type="submit" :disabled="busy">Criar arena</AppButton>
        </div>
        <p v-if="createError" class="arenas__error text-body-s" role="alert">{{ createError }}</p>
      </form>

      <ArenaCredentialsPanel
        v-if="panel"
        :arena-name="panel.arenaName"
        :config="panel.config"
        @done="panel = null"
      />

      <p v-if="arenas.length === 0" class="arenas__muted text-body-m">
        Nenhuma arena ainda. Adicione uma para gerar o config.h da sua caixa.
      </p>
      <ul v-else class="arenas__list">
        <li v-for="{ arena, subtitle } in rows" :key="arena.id" class="arenas__row">
          <div class="arenas__row-main">
            <form
              v-if="editingId === arena.id"
              class="arenas__rename"
              novalidate
              @submit.prevent="saveRename(arena)"
            >
              <InputField
                v-model="editName"
                class="arenas__form-field"
                label="Novo nome"
                hide-label
                autocomplete="off"
                :error="editError"
              />
              <AppButton type="submit" :disabled="busy">Salvar</AppButton>
              <AppButton variant="ghost" @click="cancelRename">Cancelar</AppButton>
            </form>
            <template v-else>
              <div class="arenas__info">
                <h2 class="arenas__name text-heading-m">{{ arena.name }}</h2>
                <p class="arenas__muted text-body-s">{{ subtitle }}</p>
              </div>
              <div class="arenas__actions">
                <AppButton
                  variant="ghost"
                  :aria-label="`Renomear ${arena.name}`"
                  @click="startRename(arena)"
                >
                  Renomear
                </AppButton>
                <AppButton
                  variant="secondary"
                  :disabled="busy"
                  :aria-label="`Gerar novo token para ${arena.name}`"
                  @click="rotate(arena)"
                >
                  Gerar novo token
                </AppButton>
                <AppButton
                  variant="destructive"
                  :disabled="busy"
                  :aria-label="`Remover ${arena.name}`"
                  @click="remove(arena)"
                >
                  Remover
                </AppButton>
              </div>
            </template>
          </div>
          <p v-if="rowError?.id === arena.id" class="arenas__error text-body-s" role="alert">
            {{ rowError.message }}
          </p>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.arenas {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.arenas__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.arenas__titles {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.arenas__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.arenas__muted {
  color: var(--color-muted);
}

.arenas__new {
  min-height: var(--size-control-lg);
}

.arenas__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-orange);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.arenas__form-title {
  color: var(--color-text);
  text-transform: uppercase;
}

.arenas__form-row,
.arenas__rename {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-4);
}

.arenas__form-field {
  flex: 1 1 16rem;
}

.arenas__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.arenas__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.arenas__row-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-5);
}

.arenas__info {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-6px);
  min-width: 0;
}

.arenas__name {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.arenas__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.arenas__error {
  color: var(--color-red);
}
</style>
