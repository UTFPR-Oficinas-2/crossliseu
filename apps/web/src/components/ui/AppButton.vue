<script setup lang="ts">
import { computed } from 'vue'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonType = 'button' | 'submit' | 'reset'

const {
  variant = 'primary',
  type = 'button',
  disabled = false,
} = defineProps<{
  variant?: ButtonVariant
  type?: ButtonType
  disabled?: boolean
}>()

const variantClass = computed(() => `app-button--${variant}`)
</script>

<template>
  <button :type="type" :disabled="disabled" class="app-button text-label-m" :class="variantClass">
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--size-control);
  min-width: var(--size-button-min);
  padding: 0 var(--space-5);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}

.app-button:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: var(--opacity-disabled);
}

.app-button--primary {
  background: var(--color-orange);
  color: var(--color-bg);
}

.app-button--secondary {
  background: var(--color-raised);
  border-color: var(--color-border);
  color: var(--color-text);
}

.app-button--ghost {
  border-color: var(--color-border);
  color: var(--color-muted);
}

.app-button--destructive {
  background: var(--color-red-dim);
  border-color: var(--color-red);
  color: var(--color-red);
}

/* Destructive buttons keep the focus ring red so orange stays reserved for primary actions */
.app-button--destructive:focus-visible {
  outline-color: var(--color-red);
}
</style>
