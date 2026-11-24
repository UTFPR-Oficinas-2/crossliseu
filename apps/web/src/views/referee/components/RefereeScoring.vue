<script setup lang="ts">
// Figma: ARB-02 running (node 26:544), ARB-03 paused (153:946), ARB-06 reconnecting (153:991).
// Timer and totals come from the live channel; the buttons send this referee's presses. −1 only
// undoes this referee's own points, so it is off while their own count for the side is 0.
import { computed } from 'vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { StatusTone } from '@/components/ui/status-pill'
import { useRefereeStore } from '@/stores/referee'
import { formatElapsed } from '@/utils/recording'
import RefereeScoreCard from './RefereeScoreCard.vue'

const referee = useRefereeStore()

const clock = computed(() => formatElapsed(Math.ceil(referee.remainingMs / 1000)))
const reconnecting = computed(() => referee.connection === 'reconnecting')
const paused = computed(() => referee.fight?.status === 'paused')

const pill = computed<{ label: string; tone: StatusTone }>(() => {
  if (reconnecting.value) return { label: 'SEM CONEXÃO', tone: 'danger' }
  if (paused.value) return { label: 'PAUSADA', tone: 'warning' }
  return { label: 'EM ANDAMENTO', tone: 'accent' }
})

/** The state line wins over the last press's feedback */
const message = computed(() => {
  if (reconnecting.value) {
    return {
      tone: 'danger',
      text: 'Reconectando… seus pontos não são enviados até a conexão voltar.',
    }
  }
  if (paused.value) {
    return { tone: 'warning', text: 'Luta pausada. A pontuação volta quando o operador retomar.' }
  }
  return referee.feedback
})

const sides = ['A', 'B'] as const
</script>

<template>
  <section v-if="referee.fight" class="scoring" aria-label="Pontuação">
    <div class="scoring__timer">
      <div class="scoring__clock">
        <p class="scoring__caption text-mono-s">TEMPO RESTANTE</p>
        <p class="scoring__time text-timer-m">{{ clock }}</p>
      </div>
      <StatusPill :label="pill.label" :tone="pill.tone" />
    </div>

    <RefereeScoreCard
      v-for="side in sides"
      :key="side"
      :side="side"
      :robot="referee.fight.robots[side].name"
      :total="referee.fight.score[side]"
      :plus-disabled="!referee.canScore"
      :minus-disabled="!referee.canScore || referee.ownCounts[side] === 0"
      @plus="referee.score(side, 1)"
      @minus="referee.score(side, -1)"
    />

    <p
      v-if="message"
      class="scoring__message text-body-s"
      :class="`scoring__message--${message.tone}`"
      role="status"
    >
      <span class="scoring__dot" aria-hidden="true" />
      {{ message.text }}
    </p>

    <p class="scoring__note text-body-s">
      Placar total dos 3 árbitros. Cada toque soma ou tira 1 ponto do lado escolhido.
    </p>
  </section>
</template>

<style scoped>
.scoring {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.scoring__timer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-14px) var(--space-18px);
  border: 1px solid var(--color-orange);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.scoring__clock {
  display: flex;
  flex-direction: column;
  gap: var(--space-2px);
  min-width: 0;
}

.scoring__caption {
  color: var(--color-muted);
}

.scoring__time {
  color: var(--color-orange);
  font-variant-numeric: tabular-nums;
}

.scoring__message {
  --message-color: var(--color-green);

  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--message-color);
  border-radius: var(--radius-sm);
  background: var(--color-green-dim);
  color: var(--message-color);
}

.scoring__message--warning {
  --message-color: var(--color-amber);

  background: var(--color-raised);
}

.scoring__message--danger {
  --message-color: var(--color-red);

  background: var(--color-red-dim);
}

.scoring__dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--message-color);
}

.scoring__note {
  color: var(--color-muted);
  text-align: center;
}
</style>
