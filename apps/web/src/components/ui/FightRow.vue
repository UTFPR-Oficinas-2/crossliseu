<script setup lang="ts">
// Figma: `Row / Fight` (node 11:51). The row shows the pairing, the match state and the actions.
// Figma has no visible fight number, so it is only exposed to assistive tech via `aria-label`.
import { computed } from 'vue'
import StatusPill from '@/components/ui/StatusPill.vue'

type FightStatus = 'waiting' | 'running' | 'paused' | 'done' | 'cancelled'

const { fightNumber, robotA, robotB, status } = defineProps<{
  fightNumber: number
  robotA: string
  robotB: string
  status: FightStatus
}>()

// Match state only; recording/upload/analysis state is a separate concern and never shown here
const pill = computed(() => {
  switch (status) {
    case 'running':
      return { label: 'Em andamento', tone: 'live' as const }
    case 'paused':
      return { label: 'Pausada', tone: 'warning' as const }
    case 'done':
      return { label: 'Encerrada', tone: 'success' as const }
    case 'cancelled':
      // Not red: red is reserved for errors and destructive actions
      return { label: 'Cancelada', tone: 'neutral' as const }
    default:
      return { label: 'Aguardando', tone: 'neutral' as const }
  }
})

const accessibleLabel = computed(
  () => `Luta ${new Intl.NumberFormat('pt-BR').format(fightNumber)}: ${robotA} contra ${robotB}`,
)
</script>

<template>
  <article class="fight-row" :aria-label="accessibleLabel">
    <p class="fight-row__competitors text-heading-s">
      <span>{{ robotA }}</span>
      <span aria-hidden="true">×</span>
      <span>{{ robotB }}</span>
    </p>

    <StatusPill class="fight-row__status" :label="pill.label" :tone="pill.tone" />

    <div v-if="$slots.default" class="fight-row__actions">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.fight-row {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.fight-row__competitors {
  display: flex;
  flex: 1 1 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: anywhere;
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
