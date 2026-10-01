<script setup lang="ts">
import { computed } from 'vue'

const { value, label } = defineProps<{
  value: number | string
  label: string
}>()

const numberFormat = new Intl.NumberFormat('pt-BR')

const formattedValue = computed(() =>
  typeof value === 'number' ? numberFormat.format(value) : value,
)
</script>

<template>
  <div class="overview-metric">
    <p class="overview-metric__value text-numeric-l">{{ formattedValue }}</p>
    <p class="overview-metric__label text-body-m">{{ label }}</p>
  </div>
</template>

<style scoped>
.overview-metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-6);
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow-wrap: break-word;
}

.overview-metric__value {
  margin: 0;
  color: var(--color-text);
}

.overview-metric__label {
  margin: 0;
  color: var(--color-muted);
}
</style>
