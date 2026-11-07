<script setup lang="ts">
// Figma: `Navigation / Operator` (node 23:421, phone 153:1543). Top bar shown while the operator
// runs a fight: the fight context and the arena box connection on the left, the exit on the right.
// The arena status is shown, never used to block anything.
import AppButton from '@/components/ui/AppButton.vue'
import StatusPill from '@/components/ui/StatusPill.vue'

const { arena, championship, robotA, robotB, arenaConnected } = defineProps<{
  /** Arena name, e.g. "Arena 01" */
  arena: string
  /** Championship name, e.g. "Copa Crossliseu 2026" */
  championship: string
  robotA: string
  robotB: string
  /** The arena's ESP32 box is connected */
  arenaConnected: boolean
}>()

const emit = defineEmits<{
  exit: []
}>()
</script>

<template>
  <header class="operator-nav">
    <div class="operator-nav__left">
      <p class="operator-nav__brand text-heading-m">Crossliseu</p>
      <span class="operator-nav__mode text-mono-s">OPERAÇÃO</span>
      <p class="operator-nav__context text-body-m">
        {{ arena }} · {{ championship }} · {{ robotA }} × {{ robotB }}
      </p>
      <StatusPill
        :label="arenaConnected ? 'Arena conectada' : 'Arena não conectada'"
        :tone="arenaConnected ? 'success' : 'danger'"
      />
    </div>

    <div class="operator-nav__right">
      <AppButton variant="secondary" class="operator-nav__exit" @click="emit('exit')">
        Sair da operação
      </AppButton>
    </div>
  </header>
</template>

<style scoped>
.operator-nav {
  display: flex;
  flex-wrap: wrap;
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
  flex-wrap: wrap;
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

.operator-nav__exit {
  min-height: var(--size-control-compact);
}

/* Figma `Navigation / Operator · Mobile` (below 768px) */
@media (max-width: 767px) {
  .operator-nav {
    padding: var(--space-3) var(--space-page-x-mobile);
  }
}
</style>
