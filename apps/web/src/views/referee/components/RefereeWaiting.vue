<script setup lang="ts">
// Figma: ARB-01 `Entrada · aguardando início` (node 26:507). The fight hasn't started; the screen
// changes to scoring by itself. The championship and team names in the frame are not in the
// referee's data and are left out.
import StatusPill from '@/components/ui/StatusPill.vue'

const { robots } = defineProps<{ robots: { A: string; B: string } }>()

const sides = [
  { side: 'A', label: 'LADO A' },
  { side: 'B', label: 'LADO B' },
] as const
</script>

<template>
  <section class="waiting" aria-labelledby="waiting-title">
    <StatusPill label="ACESSO VALIDADO" tone="success" />
    <h1 id="waiting-title" class="waiting__title text-display-page">
      {{ robots.A }} × {{ robots.B }}
    </h1>

    <div
      v-for="{ side, label } in sides"
      :key="side"
      class="waiting__side"
      :class="`waiting__side--${side.toLowerCase()}`"
    >
      <span class="waiting__bar" aria-hidden="true" />
      <div class="waiting__info">
        <p class="waiting__label text-overline">{{ label }}</p>
        <p class="waiting__robot text-heading-l">{{ robots[side] }}</p>
      </div>
    </div>

    <div class="waiting__card">
      <p class="waiting__head text-heading-s">
        <span class="waiting__dot" aria-hidden="true" />
        Aguardando o operador iniciar
      </p>
      <p class="waiting__note text-body-s">
        Esta tela muda sozinha quando a luta começar. Mantenha o celular desbloqueado.
      </p>
    </div>
  </section>
</template>

<style scoped>
.waiting {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}

.waiting__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.waiting__side {
  --side-color: var(--color-blue);

  display: flex;
  align-items: center;
  gap: var(--space-14px);
  width: 100%;
  padding: var(--space-14px) var(--space-4);
  border: 1px solid var(--side-color);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
}

.waiting__side--b {
  --side-color: var(--color-pink);
}

.waiting__bar {
  flex-shrink: 0;
  width: var(--size-referee-side-bar-width);
  height: var(--size-referee-side-bar-height);
  border-radius: var(--radius-xs);
  background: var(--side-color);
}

.waiting__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.waiting__label {
  color: var(--side-color);
}

.waiting__robot {
  overflow-wrap: anywhere;
  color: var(--color-text);
  text-transform: uppercase;
}

.waiting__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-18px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.waiting__head {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  color: var(--color-text);
  text-transform: uppercase;
}

.waiting__dot {
  flex-shrink: 0;
  width: var(--size-dot-lg);
  height: var(--size-dot-lg);
  border-radius: var(--radius-pill);
  background: var(--color-amber);
}

.waiting__note {
  color: var(--color-muted);
}
</style>
