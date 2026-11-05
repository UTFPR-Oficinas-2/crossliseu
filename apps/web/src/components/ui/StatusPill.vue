<script setup lang="ts">
// Figma: `Status / Pill` (node 9:39). Six tones, listed in `status-pill.ts`. The label is always
// visible, so status never relies on color alone.
import type { StatusTone } from './status-pill'

const { label, tone = 'neutral' } = defineProps<{
  label: string
  tone?: StatusTone
}>()
</script>

<template>
  <span class="status-pill" :class="`status-pill--${tone}`">
    <span class="status-pill__dot" aria-hidden="true" />
    <span class="text-overline">{{ label }}</span>
  </span>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-7px) var(--space-14px) var(--space-7px) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-raised);
  color: var(--color-muted);
  white-space: nowrap;
}

.status-pill__dot {
  flex-shrink: 0;
  width: var(--space-2);
  height: var(--space-2);
  border-radius: var(--radius-pill);
  background: currentColor;
}

.status-pill--success {
  color: var(--color-green);
}

.status-pill--warning {
  color: var(--color-amber);
}

.status-pill--danger {
  color: var(--color-red);
}

.status-pill--accent {
  color: var(--color-orange);
}

.status-pill--info {
  color: var(--color-blue);
}
</style>
