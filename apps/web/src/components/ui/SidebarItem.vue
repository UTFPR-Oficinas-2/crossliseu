<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const { to, active = false } = defineProps<{
  to: RouteLocationRaw
  active?: boolean
}>()
</script>

<template>
  <RouterLink
    :to="to"
    class="sidebar-item text-label-m"
    :class="{ 'sidebar-item--active': active }"
    :aria-current="active ? 'page' : undefined"
  >
    <span class="sidebar-item__indicator" aria-hidden="true" />
    <span class="sidebar-item__label"><slot /></span>
  </RouterLink>
</template>

<style scoped>
.sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  /* Figma height is 44px: 12px vertical padding + 20px label line height */
  padding: var(--space-3) var(--space-14px);
  border-radius: var(--radius-sm);
  color: var(--color-muted);
  text-decoration: none;
}

.sidebar-item:hover {
  color: var(--color-text);
}

.sidebar-item:focus-visible {
  /* Figma has no focus state; ring in the primary action color */
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-item--active,
.sidebar-item--active:hover {
  background: var(--color-orange-dim);
  color: var(--color-orange);
}

.sidebar-item__indicator {
  flex-shrink: 0;
  width: var(--size-indicator-width);
  height: var(--size-indicator-height);
  border-radius: var(--radius-xs);
}

.sidebar-item--active .sidebar-item__indicator {
  background: var(--color-orange);
}

.sidebar-item__label {
  flex: 1 1 0;
  min-width: 0;
  overflow-wrap: break-word;
}
</style>
