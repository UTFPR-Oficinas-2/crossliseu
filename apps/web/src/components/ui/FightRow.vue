<script setup lang="ts">
// Figma: `Row / Fight` (node 11:51). The row shows the pairing, the match state and one optional
// action. Figma has no visible fight number, so it is only exposed to assistive tech via
// `aria-label`. A finished fight reads "A venceu B" with the winner first, or "A × B" + EMPATE.
import { computed } from 'vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { MatchState, Side } from '@/types'
import { matchStatePill } from '@/utils/match'

const {
  fightNumber,
  robotA,
  robotB,
  state,
  winner = null,
} = defineProps<{
  fightNumber: number
  robotA: string
  robotB: string
  /** Match state only; recording/upload/analysis state is separate and never shown here */
  state: MatchState
  /** Finished fights: the winning side, or `null` for a draw */
  winner?: Side | null
}>()

const pill = computed(() => matchStatePill[state])

const hasWinner = computed(() => state === 'finished' && winner !== null)
const isDraw = computed(() => state === 'finished' && winner === null)

const pair = computed(() =>
  hasWinner.value && winner === 'B'
    ? { first: robotB, joiner: 'venceu', second: robotA }
    : { first: robotA, joiner: hasWinner.value ? 'venceu' : '×', second: robotB },
)

const accessibleLabel = computed(
  () => `Luta ${new Intl.NumberFormat('pt-BR').format(fightNumber)}: ${robotA} contra ${robotB}`,
)
</script>

<template>
  <article class="fight-row" :aria-label="accessibleLabel">
    <p class="fight-row__competitors">
      <span class="text-heading-s">{{ pair.first }}</span>
      {{ ' ' }}
      <span
        class="fight-row__joiner"
        :class="hasWinner ? 'text-body-s' : 'text-heading-s'"
        :aria-hidden="!hasWinner"
        >{{ pair.joiner }}</span
      >
      {{ ' ' }}
      <span class="text-heading-s">{{ pair.second }}</span>
    </p>

    <p v-if="isDraw" class="fight-row__draw text-overline">Empate</p>

    <StatusPill class="fight-row__status" :label="pill.label" :tone="pill.tone" />

    <div v-if="$slots.default" class="fight-row__actions">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.fight-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-10px) var(--space-6);
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.fight-row__competitors {
  display: flex;
  flex: 1 1 var(--size-fight-pair-min);
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  min-width: var(--size-fight-pair-min);
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.fight-row__joiner {
  color: var(--color-muted);
}

.fight-row__joiner.text-body-s {
  text-transform: none;
}

.fight-row__draw {
  color: var(--color-muted);
}

.fight-row__status,
.fight-row__actions {
  flex-shrink: 0;
}

.fight-row__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
