<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import CompetitorTile from '@/components/ui/CompetitorTile.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { StatusTone } from '@/components/ui/status-pill'
import { matchChampionshipId } from '@/data'
import { useAuthStore } from '@/stores/auth'
import type { MatchEndReason, MatchState } from '@/types'
import { formatElapsed } from '@/utils/recording'
import FightRecorderPanel, { type FightPhase } from './components/FightRecorderPanel.vue'
import RefereeLinkPanel from './components/RefereeLinkPanel.vue'
import ResultConfirmation from './components/ResultConfirmation.vue'
import { useFightControl } from './use-fight-control'

const { matchId } = defineProps<{ matchId: string }>()
const emit = defineEmits<{
  fightStatus: [matchId: string, status: MatchState, hasSelectedArena: boolean]
}>()
const auth = useAuthStore()
// "Back to the operation" is the picker of the match's championship; /manage if it can't be told
const championshipId = ref<string | null>(null)
const operatorHome = computed<RouteLocationRaw>(() =>
  championshipId.value
    ? { name: 'championship-operation', params: { championshipId: championshipId.value } }
    : { name: 'my-championships' },
)
watch(
  () => matchId,
  async (id) => {
    championshipId.value = null
    try {
      const resolved = await matchChampionshipId(id)
      if (id === matchId) championshipId.value = resolved
    } catch (error) {
      console.error('Could not resolve the match championship', error)
    }
  },
  { immediate: true },
)
const {
  state,
  loadState,
  remainingMs,
  busy,
  error,
  uncertainCommand,
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

// The side that gave up, from the server; kept after Close, even when closed as a draw (#50)
const loserSide = computed(() =>
  state.value?.endReason === 'surrender' ? state.value.surrenderedSide : null,
)
const reasonText = computed(() => {
  const reason = state.value?.endReason
  if (!reason) return ''
  return reason === 'surrender' && loserSide.value
    ? `Desistência do lado ${loserSide.value}`
    : reasonLabel[reason]
})

const status = computed(() => state.value?.status ?? 'scheduled')
const display = computed(() => displayByStatus[status.value])
const arenaLabel = computed(() =>
  state.value?.hasSelectedArena
    ? 'Arena selecionada'
    : state.value?.closed
      ? 'Arena liberada'
      : 'Sem arena',
)
const clock = computed(() => formatElapsed(Math.ceil(remainingMs.value / 1000)))
// An arena can only be attached before the fight starts
const canSelectArena = computed(
  () => status.value === 'scheduled' && !state.value?.closed && !state.value?.hasSelectedArena,
)
const disabled = computed(
  () => busy.value || !!uncertainCommand.value || loadState.value !== 'ready' || !auth.token,
)

watch(state, (snapshot) => {
  if (snapshot) emit('fightStatus', snapshot.matchId, snapshot.status, snapshot.hasSelectedArena)
})

// A confirmed Close stays on this view so the operator sees the official result (#50); they
// leave with "Voltar à operação", where the route guard still protects an unsent recording.

function confirmFinish() {
  if (window.confirm('Encerrar a luta agora?')) void command('finish')
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

  <!-- The recorder outlives a vanished match so an unsent recording isn't lost -->
  <div v-if="state" class="fight-operation">
    <div v-if="loadState !== 'not-found'" class="fight-main">
      <section class="fight-card" aria-label="Controle da luta">
        <div class="fight-card__status" role="status">
          <StatusPill :label="state.closed ? 'Luta fechada' : display.label" :tone="display.tone" />
          <StatusPill :label="arenaLabel" :tone="state.hasSelectedArena ? 'success' : 'neutral'" />
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
          <template v-else-if="state.status === 'scheduled'">
            <AppButton :disabled="disabled" @click="command('start')">Iniciar luta</AppButton>
            <AppButton v-if="canSelectArena" :to="operatorHome" variant="secondary">
              Selecionar arena
            </AppButton>
          </template>
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
        </div>

        <ResultConfirmation
          v-if="state.status === 'finished'"
          :state="state"
          :disabled="disabled"
          @confirm="command('close')"
          @draw="command('close', { draw: true })"
        />

        <p v-if="state.status === 'ongoing'" class="fight-card__note text-body-s">
          A luta termina quando o tempo acaba. A desistência só vale pelos botões da arena.
        </p>
        <p v-else-if="state.status === 'paused'" class="fight-card__note text-body-s">
          Com a luta pausada, os botões de desistência da arena não valem.
        </p>
        <p
          v-else-if="state.status === 'scheduled' && state.hasSelectedArena"
          class="fight-card__note text-body-s"
        >
          A caixa da arena mostra o cronômetro e recebe as desistências pelos botões de cada lado.
        </p>
        <p
          v-else-if="state.status === 'finished' && !state.closed && state.hasSelectedArena"
          class="fight-card__note text-body-s"
        >
          Fechar libera a arena para a próxima luta. Até lá, a arena mostra o resultado.
        </p>
      </section>

      <RefereeLinkPanel class="fight-main__referees" :match-id="matchId" :state="state" />
    </div>

    <FightRecorderPanel
      :key="matchId"
      class="fight-operation__recorder"
      :match-id="matchId"
      :fight-phase="phaseByStatus[state.status]"
    />
  </div>
</template>

<style scoped>
/* One console: fight + referees on the left, recording on the right, filling the screen */
.fight-operation {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  align-items: stretch;
  gap: var(--space-5);
  min-height: 0;
}

.fight-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
}

.fight-main__referees {
  flex: 1 1 auto;
}

.fight-operation__recorder {
  grid-column: 2;
}

.fight-card,
.fight-feedback {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-5);
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
  padding-block: var(--space-4);
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
  gap: var(--space-2);
  padding: var(--space-4) var(--space-2);
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

.fight-feedback {
  gap: var(--space-3);
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

  .fight-operation__recorder {
    grid-column: auto;
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
