<script setup lang="ts">
// Loading, failure and not-found states shared by the per-championship organizer pages
import type { RouteLocationRaw } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'

defineProps<{
  state: 'loading' | 'error' | 'not-found'
  loadingText: string
  errorText: string
  notFoundText: string
  /** Where "not found" sends the user */
  back: { label: string; to: RouteLocationRaw }
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <p v-if="state === 'loading'" class="load-state__muted text-body-m" aria-live="polite">
    {{ loadingText }}
  </p>
  <div v-else-if="state === 'error'" class="load-state__error" role="alert">
    <p class="text-body-m">{{ errorText }}</p>
    <AppButton variant="secondary" @click="$emit('retry')">Tentar novamente</AppButton>
  </div>
  <div v-else class="load-state__not-found">
    <p class="load-state__muted text-body-m">{{ notFoundText }}</p>
    <AppButton variant="secondary" :to="back.to">{{ back.label }}</AppButton>
  </div>
</template>

<style scoped>
.load-state__muted {
  color: var(--color-muted);
}

.load-state__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
  color: var(--color-text);
}

.load-state__not-found {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}
</style>
