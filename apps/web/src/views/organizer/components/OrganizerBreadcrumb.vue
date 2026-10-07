<script setup lang="ts">
// Breadcrumb of the per-championship organizer pages (Figma 09, 09b, 10, 10b). Earlier items
// with `to` are links; the last item is the current page.
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ items: { label: string; to?: RouteLocationRaw }[] }>()
</script>

<template>
  <nav aria-label="Navegação estrutural">
    <ol class="organizer-breadcrumb text-mono-s">
      <template v-for="(item, index) in items" :key="index">
        <li v-if="index > 0" aria-hidden="true">/</li>
        <li :aria-current="index === items.length - 1 ? 'page' : undefined">
          <RouterLink
            v-if="item.to && index < items.length - 1"
            class="organizer-breadcrumb__link"
            :to="item.to"
          >
            {{ item.label }}
          </RouterLink>
          <template v-else>{{ item.label }}</template>
        </li>
      </template>
    </ol>
  </nav>
</template>

<style scoped>
.organizer-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--color-muted);
  text-transform: uppercase;
}

.organizer-breadcrumb__link {
  color: inherit;
  text-decoration: none;
}

.organizer-breadcrumb__link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-xs);
}
</style>
