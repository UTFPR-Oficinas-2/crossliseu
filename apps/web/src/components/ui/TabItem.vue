<script setup lang="ts">
// Figma: Tab / Item (State = Ativo | Inativo)
const { active = false, label = '' } = defineProps<{
  active?: boolean
  label?: string
}>()
</script>

<template>
  <button
    type="button"
    role="tab"
    class="tab-item text-label-m"
    :class="{ 'tab-item--active': active }"
    :aria-selected="active"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<style scoped>
.tab-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--size-control);
  min-width: var(--size-tab-min);
  padding: 0 var(--space-22px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
  color: var(--color-muted);
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}

.tab-item--active {
  /* Figma has no stroke on Ativo; keep the 1px border transparent so both states share a size */
  border-color: transparent;
  background: var(--color-orange);
  color: var(--color-bg);
}

.tab-item:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-text);
  outline-offset: var(--focus-ring-offset);
}
</style>
