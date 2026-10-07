<script setup lang="ts">
// Figma 09 empty state (node 22:487): dashed panel with a title, one line of help and an
// optional action. Its "ESTADO VAZIO" overline is a design annotation, not interface text.
defineProps<{ title: string; text: string }>()
</script>

<template>
  <section class="empty-state">
    <h2 class="empty-state__title text-heading-m">{{ title }}</h2>
    <p class="empty-state__text text-body-s">{{ text }}</p>
    <slot />
  </section>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-6);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  text-align: center;
}

.empty-state__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.empty-state__text {
  color: var(--color-muted);
}
</style>
