<script setup lang="ts">
// The link the operator shares with the match's three referees, and who holds each seat.
// Requesting the link creates the match's referee token the first time; it is the same on every
// later visit. Before Start the operator can free a seat (a misspelled duplicate, a stranger).
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import AppButton from '@/components/ui/AppButton.vue'
import {
  freeRefereeSeat,
  getRefereeSeats,
  getRefereeToken,
  type OperatorFightState,
  type RefereeSeat,
} from '@/data'
import { useAuthStore } from '@/stores/auth'

const { matchId, state } = defineProps<{ matchId: string; state: OperatorFightState }>()
const auth = useAuthStore()
const router = useRouter()

const SEATS = [1, 2, 3] as const

const accessToken = ref<string | null>(null)
const failed = ref(false)
const copied = ref(false)
const copyFailed = ref(false)
const seats = ref<RefereeSeat[]>([])
const freeing = ref(false)
const freeFailed = ref(false)

const closed = computed(() => state.closed)
const canFree = computed(() => state.status === 'scheduled' && !state.closed)
const rows = computed(() =>
  SEATS.map((seat) => ({ seat, name: seats.value.find((s) => s.seat === seat)?.name ?? null })),
)

const link = computed(() =>
  accessToken.value
    ? // By path, so the app's base URL is applied (the `referee-session` route)
      `${window.location.origin}${router.resolve(`/referee/${encodeURIComponent(accessToken.value)}`).href}`
    : null,
)

// The token stops working once the fight is closed: nothing to share then
watch(
  () => [matchId, closed.value] as const,
  async ([id, isClosed]) => {
    accessToken.value = null
    failed.value = false
    copied.value = false
    copyFailed.value = false
    if (isClosed || !auth.token) return
    try {
      const { token } = await getRefereeToken(id, auth.token)
      if (id === matchId) accessToken.value = token
    } catch (error) {
      if (id !== matchId) return
      // A fight closed meanwhile: the link is simply gone
      failed.value = !(error instanceof ApiError && error.status === 409)
    }
  },
  { immediate: true },
)

// Only the newest request may set the list: replies can arrive out of order
let seatsRequest = 0

async function loadSeats() {
  const request = ++seatsRequest
  if (closed.value || !auth.token) {
    seats.value = []
    return
  }
  try {
    const list = await getRefereeSeats(matchId, auth.token)
    if (request === seatsRequest) seats.value = list
  } catch {
    // Keep the last list; the next pushed state tries again
  }
}

// Every pushed state is a new object: a referee joined, a seat was freed, or the fight moved on
watch(() => [matchId, state] as const, loadSeats, { immediate: true })

async function free(seat: RefereeSeat) {
  if (!auth.token || !window.confirm(`Liberar o lugar de ${seat.name}?`)) return
  freeing.value = true
  freeFailed.value = false
  try {
    await freeRefereeSeat(matchId, seat.seat, auth.token)
  } catch (error) {
    // 409: the fight started meanwhile; the refreshed list hides the buttons
    freeFailed.value = !(error instanceof ApiError && error.status === 409)
  } finally {
    freeing.value = false
  }
  await loadSeats()
}

async function copy() {
  if (!link.value) return
  copied.value = false
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
  } catch {
    copyFailed.value = true
  }
}
</script>

<template>
  <section v-if="link || failed" class="referee-link" aria-labelledby="referee-link-title">
    <header class="referee-link__header">
      <h2 id="referee-link-title" class="text-heading-m">Link dos árbitros</h2>
      <p v-if="link" class="referee-link__note text-body-s">
        Envie este link aos três árbitros. Cada um entra com o próprio nome.
      </p>
    </header>
    <template v-if="link">
      <div class="referee-link__actions">
        <code class="referee-link__url text-mono-m" :title="link">{{ link }}</code>
        <AppButton variant="secondary" @click="copy">Copiar link</AppButton>
        <span v-if="copied" class="text-body-s" aria-live="polite">Copiado.</span>
        <span v-if="copyFailed" class="text-body-s" role="alert">
          Não foi possível copiar. Selecione o link e copie manualmente.
        </span>
      </div>

      <ul class="referee-link__seats" aria-label="Árbitros">
        <li v-for="row in rows" :key="row.seat" class="referee-link__seat">
          <span class="text-overline">Árbitro {{ row.seat }}</span>
          <span
            class="referee-link__name text-body-m"
            :class="{ 'referee-link__name--free': !row.name }"
          >
            {{ row.name ?? 'Livre' }}
          </span>
          <AppButton
            v-if="row.name && canFree"
            variant="ghost"
            :disabled="freeing"
            @click="free({ seat: row.seat, name: row.name })"
          >
            Liberar
          </AppButton>
        </li>
      </ul>
      <p v-if="freeFailed" class="text-body-s" role="alert">Não foi possível liberar o lugar.</p>
    </template>
    <p v-else class="text-body-s" role="alert">
      Não foi possível carregar o link dos árbitros. Recarregue a página.
    </p>
  </section>
</template>

<style scoped>
.referee-link {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.referee-link__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2) var(--space-4);
}

.referee-link__note {
  color: var(--color-muted);
}

/* One line; the full link is in the title and is what Copiar link copies */
.referee-link__url {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.referee-link__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.referee-link__seats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-6);
  margin: 0;
  padding: 0;
  list-style: none;
}

.referee-link__seat {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.referee-link__name {
  min-width: 0;
  max-width: 20ch;
  overflow-wrap: anywhere;
  color: var(--color-text);
}

.referee-link__name--free {
  color: var(--color-muted);
}
</style>
