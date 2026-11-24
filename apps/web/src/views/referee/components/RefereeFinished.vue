<script setup lang="ts">
// Figma: ARB-04 `Luta encerrada` (node 27:515). Final totals and the end reason with its fixed
// label (apps/web/CLAUDE.md). The elapsed fight time in the frame is not in the referee's data.
// The link keeps working until the operator confirms the result; then the socket is closed and the
// page moves to ARB-05.
import { computed } from 'vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { MatchEndReason } from '@/types'

const { robots, score, endReason, winnerSide } = defineProps<{
  robots: { A: string; B: string }
  score: { A: number; B: number }
  endReason: MatchEndReason | null
  /** Only known after a surrender; undefined while unknown */
  winnerSide: 'A' | 'B' | null | undefined
}>()

const reasonLabel = computed(() => {
  // No EMPATE here: before the operator confirms the result (#50) only a surrender has a winner,
  // and once it is confirmed this link stops working.
  switch (endReason) {
    case 'time_out':
      return 'TEMPO ESGOTADO'
    case 'manual':
      return 'ENCERRADA PELO OPERADOR'
    case 'surrender':
      // The side that gave up is the one opposite the winner
      if (!winnerSide) return 'DESISTÊNCIA'
      return `DESISTÊNCIA DO LADO ${winnerSide === 'A' ? 'B' : 'A'}`
  }
  return null
})

const sides = ['A', 'B'] as const
</script>

<template>
  <section class="finished" aria-labelledby="finished-title">
    <StatusPill label="LUTA ENCERRADA" tone="success" />
    <h1 id="finished-title" class="finished__title text-display-page">
      {{ robots.A }} × {{ robots.B }}
    </h1>
    <p v-if="reasonLabel" class="finished__reason text-body-s">{{ reasonLabel }}</p>

    <div class="finished__card">
      <h2 class="finished__heading text-heading-s">Pontuação final</h2>
      <div
        v-for="side in sides"
        :key="side"
        class="finished__row"
        :class="`finished__row--${side.toLowerCase()}`"
      >
        <div class="finished__info">
          <p class="finished__side text-overline">LADO {{ side }}</p>
          <p class="finished__robot text-heading-m">{{ robots[side] }}</p>
        </div>
        <p class="finished__value text-numeric-l">{{ score[side] }}</p>
      </div>
      <p class="finished__note text-body-s">
        Placar total dos 3 árbitros. O operador confirma o resultado oficial; quando a luta for
        fechada, este link deixa de funcionar.
      </p>
    </div>
  </section>
</template>

<style scoped>
.finished {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-14px);
}

.finished__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.finished__reason {
  color: var(--color-muted);
}

.finished__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-14px);
  width: 100%;
  padding: var(--space-18px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.finished__heading {
  color: var(--color-text);
  text-transform: uppercase;
}

.finished__row {
  --side-color: var(--color-blue);

  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--side-color);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
}

.finished__row--b {
  --side-color: var(--color-pink);
}

.finished__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2px);
  min-width: 0;
}

.finished__side {
  color: var(--side-color);
}

.finished__robot {
  overflow-wrap: anywhere;
  color: var(--color-text);
  text-transform: uppercase;
}

.finished__value {
  flex-shrink: 0;
  color: var(--side-color);
}

.finished__note {
  color: var(--color-muted);
}
</style>
