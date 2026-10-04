<script setup lang="ts">
// Figma: `Navigation / Operator` (node 23:421). Top bar shown while the operator runs a fight.
import { computed } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'

const { championship, fightNumber, arena } = defineProps<{
  /** Championship name, e.g. "Copa Crossliseu 2026" */
  championship: string
  /** Fight number, shown zero-padded: 8 → "Luta 08" */
  fightNumber: number
  /** Arena label, e.g. "ARENA 01" */
  arena: string
}>()

const emit = defineEmits<{
  exit: []
}>()

const fightLabel = computed(() => `Luta ${String(fightNumber).padStart(2, '0')}`)
</script>

<template>
  <header class="operator-nav">
    <div class="operator-nav__left">
      <p class="operator-nav__brand text-heading-m">Crossliseu</p>
      <span class="operator-nav__mode text-mono-s">OPERAÇÃO</span>
      <p class="operator-nav__context text-body-m">
        <span>{{ championship }}</span>
        <span class="operator-nav__separator" aria-hidden="true">·</span>
        <span>{{ fightLabel }}</span>
      </p>
    </div>

    <div class="operator-nav__right">
      <p class="operator-nav__arena text-mono-m">{{ arena }}</p>
      <AppButton variant="secondary" @click="emit('exit')">Sair da operação</AppButton>
    </div>
  </header>
</template>

<style scoped>
.operator-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: var(--size-nav-operator-height);
  padding: 0 var(--space-8);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-panel);
}

.operator-nav__left {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: var(--space-14px);
  min-width: 0;
}

.operator-nav__brand {
  flex-shrink: 0;
  margin: 0;
  color: var(--color-text);
  text-transform: uppercase;
  white-space: nowrap;
}

.operator-nav__mode {
  flex-shrink: 0;
  padding: var(--space-5px) var(--space-10px);
  border: 1px solid var(--color-orange);
  border-radius: var(--radius-3px);
  background: var(--color-orange-dim);
  color: var(--color-orange);
  white-space: nowrap;
}

.operator-nav__context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  margin: 0;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}

.operator-nav__right {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--space-4);
}

.operator-nav__arena {
  margin: 0;
  color: var(--color-text);
  white-space: nowrap;
}
</style>
