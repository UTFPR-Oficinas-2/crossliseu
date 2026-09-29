<!-- src/features/matches/components/FightRow.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import StatusPill from '@/shared/ui/StatusPill.vue'

type FightStatus = 'waiting' | 'running' | 'paused' | 'done' | 'cancelled'

const { fightNumber, robotA, robotB, status } = defineProps<{
  fightNumber: number
  robotA: string
  robotB: string
  status: FightStatus
}>()

// Status code → what StatusPill needs
const pill = computed(() => {
  switch (status) {
    case 'running':
      return { label: 'Ao vivo', tone: 'live' as const }
    case 'paused':
      return { label: 'Pausada', tone: 'warning' as const }
    case 'done':
      return { label: 'Encerrada', tone: 'success' as const }
    case 'cancelled':
      return { label: 'Cancelada', tone: 'danger' as const }
    default:
      return { label: 'Aguardando', tone: 'neutral' as const }
  }
})

const number = computed(() => `#${String(fightNumber).padStart(2, '0')}`) // 4 → "#04"
</script>

<template>
  <article class="fight-row">
    <span class="fight-row__number">{{ number }}</span>

    <p class="fight-row__competitors">
      <strong class="fight-row__robot fight-row__robot--a">{{ robotA }}</strong>
      <span class="fight-row__vs">x</span>
      <strong class="fight-row__robot fight-row__robot--b">{{ robotB }}</strong>
    </p>

    <StatusPill :label="pill.label" :tone="pill.tone" />

    <div class="fight-row__actions">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.fight-row {
  display: grid;
  grid-template-columns: 48px 1fr auto auto; /* number | names | pill | action */
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}
.fight-row__number {
  font-family: var(--font-mono);
  color: var(--color-muted);
}
.fight-row__competitors {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.fight-row__robot--a {
  color: var(--color-blue);
}
.fight-row__robot--b {
  color: var(--color-pink);
}
.fight-row__vs {
  color: var(--color-muted);
  font-size: 0.75rem;
}
</style>
