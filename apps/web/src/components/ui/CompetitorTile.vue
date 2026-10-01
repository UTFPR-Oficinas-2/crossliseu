<script setup lang="ts">
import { computed } from 'vue'

type Side = 'A' | 'B'

const { side, team, robot, details } = defineProps<{
  side: Side
  /** Team name, shown after the side label: "Lado A · Equipe Volt" */
  team: string
  /** Robot name, shown large */
  robot: string
  /** Secondary line, e.g. "Peso 3 kg · Arrasto" */
  details?: string
}>()

// Side color is always paired with this visible text label
const sideLabel = computed(() => `Lado ${side}`)
</script>

<template>
  <article class="competitor-tile" :class="`competitor-tile--${side.toLowerCase()}`">
    <span class="competitor-tile__bar" aria-hidden="true" />
    <p class="competitor-tile__overline text-overline">{{ sideLabel }} · {{ team }}</p>
    <p class="competitor-tile__robot text-display-page">{{ robot }}</p>
    <p v-if="details || $slots.default" class="competitor-tile__details text-body-s">
      <slot>{{ details }}</slot>
    </p>
  </article>
</template>

<style scoped>
.competitor-tile {
  --side-color: var(--color-blue);

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-5);
  border-radius: var(--radius-sm);
  text-align: center;
}
.competitor-tile--b {
  --side-color: var(--color-pink);
}

.competitor-tile__bar {
  width: var(--size-side-bar);
  height: var(--space-1);
  border-radius: var(--radius-xs);
  background: var(--side-color);
}

.competitor-tile__overline {
  color: var(--side-color);
  overflow-wrap: anywhere;
}

.competitor-tile__robot {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.competitor-tile__details {
  color: var(--color-muted);
}
</style>
