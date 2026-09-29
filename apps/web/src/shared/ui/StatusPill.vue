<script setup lang="ts">
import { computed } from 'vue'
type Tone = 'neutral' | 'live' | 'success' | 'danger' | 'warning'

const { label, tone = 'neutral' } = defineProps<{
  label: string
  tone?: Tone
}>()

const toneClass = computed(() => `status-pill--${tone}`)
</script>

<template>
  <span class="status-pill" :class="toneClass">{{ label }}</span>
</template>

<style scoped>
.status-pill {
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font: 500 0.75rem/1.5 var(--font-mono);
  text-transform: uppercase;
}
.status-pill--live {
  color: var(--color-orange);
  background: var(--color-orange-dim);
}
</style>
