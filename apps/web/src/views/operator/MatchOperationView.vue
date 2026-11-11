<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import CompetitorTile from '@/components/ui/CompetitorTile.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { StatusTone } from '@/components/ui/status-pill'
import { useAuthStore } from '@/stores/auth'
import type { MatchEndReason, MatchState } from '@/types'
import { formatElapsed } from '@/utils/recording'
import FightRecorderPanel, { type FightPhase } from './components/FightRecorderPanel.vue'
import { useFightControl } from './use-fight-control'

const { matchId } = defineProps<{ matchId: string }>()
const emit = defineEmits<{
  fightStatus: [matchId: string, status: MatchState, hasSelectedArena: boolean]
}>()
const auth = useAuthStore()
const router = useRouter()
const operatorHome = { name: 'operator' } as const
const {
  state,
  loadState,
  remainingMs,
  busy,
  error,
  uncertainCommand,
  confirmedCloseMatchId,
  refresh,
  resumeControls,
  command,
} = useFightControl(
  () => matchId,
  () => auth.token ?? '',
)

const phaseByStatus: Record<MatchState, FightPhase> = {
  scheduled: 'before',
  ongoing: 'running',
  paused: 'running',
  finished: 'ended',
}
const displayByStatus: Record<MatchState, { label: string; tone: StatusTone; timer: string }> = {
  scheduled: { label: 'Pronta para iniciar', tone: 'warning', timer: 'Tempo da luta' },
  ongoing: { label: 'Em andamento', tone: 'accent', timer: 'Tempo restante' },
  paused: { label: 'Pausada', tone: 'warning', timer: 'Cronômetro parado' },
  finished: { label: 'Luta encerrada', tone: 'success', timer: 'Tempo restante' },
}
const reasonLabel: Record<MatchEndReason, string> = {
  time_out: 'Tempo esgotado',
  manual: 'Encerrada pelo operador',
  surrender: 'Desistência',
}

const loserSide = computed(() => {
  const { winnerSide, endReason } = state.value ?? {}
  return endReason === 'surrender' && winnerSide ? (winnerSide === 'A' ? 'B' : 'A') : null
})
const reasonText = computed(() => {
  const reason = state.value?.endReason
  if (!reason) return ''
  return reason === 'surrender' && loserSide.value
    ? `Desistência do lado ${loserSide.value}`
    : reasonLabel[reason]
})

const status = computed(() => state.value?.status ?? 'scheduled')
const display = computed(() => displayByStatus[status.value])
const clock = computed(() => formatElapsed(Math.ceil(remainingMs.value / 1000)))
const needsArena = computed(() => status.value === 'scheduled' && !state.value?.hasSelectedArena)
const disabled = computed(
  () => busy.value || !!uncertainCommand.value || loadState.value !== 'ready' || !auth.token,
)

watch(state, (snapshot) => {
  if (snapshot) emit('fightStatus', snapshot.matchId, snapshot.status, snapshot.hasSelectedArena)
})

// The route guard may keep this view open so the operator can save the recording.
watch(
  confirmedCloseMatchId,
  async (closedId) => {
    if (closedId === matchId) await router.push(operatorHome)
  },
  { flush: 'post' },
)

function confirmFinish() {
  if (window.confirm('Encerrar a luta agora?')) void command('finish')
}

function confirmClose() {
  if (window.confirm('Fechar a luta e liberar a arena?')) void command('close')
}

function confirmResumeControls() {
  if (
    window.confirm('O comando anterior ainda pode ser aplicado. Voltar aos controles mesmo assim?')
  ) {
    void resumeControls()
  }
}
</script>

<template>
  <h1 class="visually-hidden">Operação da luta</h1>
  <p v-if="loadState === 'loading'" class="text-body-m" role="status">Carregando a luta…</p>
  <div v-else-if="loadState === 'not-found'" class="fight-feedback">
    <p class="text-heading-m">Luta não encontrada</p>
    <AppButton :to="operatorHome" variant="secondary">Voltar à operação</AppButton>
  </div>

  <div v-if="state" class="fight-operation">
    <section class="fight-card" aria-label="Controle da luta">
      <div class="fight-card__status" role="status">
        <StatusPill :label="state.closed ? 'Luta fechada' : display.label" :tone="display.tone" />
        <span v-if="state.endReason" class="text-overline">{{ reasonText }}</span>
      </div>

      <div class="fight-card__scoreboard">
        <CompetitorTile
          class="fight-card__side fight-card__side--a"
          :class="{ 'fight-card__side--surrendered': loserSide === 'A' }"
          side="A"
          :robot="state.robots.A.name"
        >
          <StatusPill v-if="loserSide === 'A'" label="Desistiu" tone="danger" />
        </CompetitorTile>
        <div class="fight-card__clock" :class="`fight-card__clock--${state.status}`">
          <span class="text-overline">{{ display.timer }}</span>
          <span class="fight-card__time text-timer-l" role="timer" :aria-label="display.timer">{{
            clock
          }}</span>
        </div>
        <CompetitorTile
          class="fight-card__side fight-card__side--b"
          :class="{ 'fight-card__side--surrendered': loserSide === 'B' }"
          side="B"
          :robot="state.robots.B.name"
        >
          <StatusPill v-if="loserSide === 'B'" label="Desistiu" tone="danger" />
        </CompetitorTile>
      </div>

      <div class="fight-card__controls">
        <AppButton v-if="state.closed" :to="operatorHome" variant="secondary">
          Voltar à operação
        </AppButton>
        <AppButton v-else-if="needsArena" :to="operatorHome">Selecionar arena</AppButton>
        <AppButton
          v-else-if="state.status === 'scheduled'"
          :disabled="disabled"
          @click="command('start')"
        >
          Iniciar luta
        </AppButton>
        <template v-else-if="state.status === 'ongoing' || state.status === 'paused'">
          <AppButton
            v-if="state.status === 'ongoing'"
            variant="secondary"
            :disabled="disabled"
            @click="command('pause')"
          >
            Pausar
          </AppButton>
          <AppButton v-else :disabled="disabled" @click="command('resume')">Retomar</AppButton>
          <AppButton variant="destructive" :disabled="disabled" @click="confirmFinish">
            Encerrar luta
          </AppButton>
        </template>
        <AppButton v-else :disabled="disabled" @click="confirmClose">Fechar luta</AppButton>
      </div>

      <p v-if="state.status === 'ongoing'" class="fight-card__note text-body-s">
        A luta termina quando o tempo acaba. A desistência só vale pelos botões da arena.
      </p>
      <p v-else-if="state.status === 'paused'" class="fight-card__note text-body-s">
        Com a luta pausada, os botões de desistência da arena não valem.
      </p>
      <p
        v-else-if="state.status === 'finished' && !state.closed && state.hasSelectedArena"
        class="fight-card__note text-body-s"
      >
        Fechar libera a arena para a próxima luta. Até lá, a arena mostra o resultado.
      </p>
    </section>

    <aside class="fight-arena" aria-labelledby="fight-arena-title">
      <h2 id="fight-arena-title" class="text-heading-m">Arena</h2>
      <StatusPill
        :label="
          state.hasSelectedArena
            ? 'Selecionada'
            : state.closed
              ? 'Liberada'
              : 'Sem arena selecionada'
        "
        :tone="state.hasSelectedArena ? 'success' : 'neutral'"
      />
      <p v-if="state.hasSelectedArena" class="fight-card__note text-body-s">
        A caixa da arena mostra o cronômetro e recebe as desistências pelos botões de cada lado.
      </p>
    </aside>
  </div>

  <div v-if="error || uncertainCommand" class="fight-feedback">
    <p class="text-body-m" role="alert">{{ error }}</p>
    <div v-if="loadState === 'error' || uncertainCommand" class="fight-card__controls">
      <AppButton variant="secondary" :disabled="busy" @click="refresh">Tentar atualizar</AppButton>
      <AppButton
        v-if="uncertainCommand"
        variant="ghost"
        :disabled="busy"
        @click="confirmResumeControls"
      >
        Voltar aos controles
      </AppButton>
    </div>
  </div>

  <FightRecorderPanel
    v-if="state"
    :key="matchId"
    :match-id="matchId"
    :fight-phase="phaseByStatus[state.status]"
  />
</template>

<style scoped>
.fight-operation {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 2fr);
  align-items: start;
  gap: var(--space-6);
}

.fight-card,
.fight-arena,
.fight-feedback {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-6);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.fight-card {
  border-color: var(--color-orange);
}

.fight-card__status,
.fight-card__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.fight-card__controls {
  align-self: center;
  justify-content: center;
}

.fight-card__scoreboard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr);
  align-self: stretch;
  gap: var(--space-5);
}

.fight-card__side {
  padding-inline: var(--space-3);
  border: 1px solid;
  background: var(--color-raised);
}

.fight-card__side :deep(.text-display-page) {
  font-size: clamp(var(--text-heading-l-size), 3.34vw, var(--text-display-page-size));
}

.fight-card__side--surrendered {
  opacity: 0.7;
}

.fight-card__side--a {
  border-color: var(--color-blue);
}

.fight-card__side--b {
  border-color: var(--color-pink);
}

.fight-card__clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-2);
  border: 1px solid var(--color-orange);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  text-align: center;
  color: var(--color-muted);
}

.fight-card__time {
  color: var(--color-text);
  font-size: clamp(var(--text-timer-l-size), 4.45vw, var(--text-timer-xl-size));
  font-variant-numeric: tabular-nums;
}

.fight-card__clock--ongoing .fight-card__time {
  color: var(--color-orange);
}

.fight-card__clock--finished .fight-card__time {
  color: var(--color-muted);
}

.fight-card__note {
  color: var(--color-muted);
}

.fight-card > .fight-card__note {
  align-self: center;
  text-align: center;
}

.fight-arena,
.fight-feedback {
  gap: var(--space-3);
}

.fight-arena h2 {
  text-transform: uppercase;
}

.fight-feedback [role='alert'] {
  color: var(--color-red);
}

.fight-feedback .fight-card__controls {
  align-self: flex-start;
  justify-content: flex-start;
}

@media (max-width: 767px) {
  .fight-operation {
    grid-template-columns: minmax(0, 1fr);
  }

  .fight-card__scoreboard {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .fight-card__clock {
    grid-area: 1 / 1 / 2 / -1;
  }

  .fight-card__controls :is(button, a) {
    min-height: var(--size-control-lg);
  }
}
</style>
