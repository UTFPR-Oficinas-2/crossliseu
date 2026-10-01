<script setup lang="ts">
import StatusPill from '@/components/ui/StatusPill.vue'
import FightRow from '@/components/ui/FightRow.vue'

const statusTones = ['neutral', 'live', 'success', 'danger', 'warning'] as const
</script>

<template>
  <div class="preview">
    <header class="preview__header">
      <p class="text-overline preview__kicker">Dev</p>
      <h1 class="text-display-page">Componentes</h1>
      <p class="text-body-m preview__sub">
        Catálogo vivo dos componentes de `src/components/ui/` com suas variantes.
      </p>
    </header>

    <section class="preview__section">
      <h2 class="text-heading-m">Tipografia</h2>
      <div class="preview__swatches">
        <p class="text-display-page">Display / Page</p>
        <p class="text-heading-l">Heading / L</p>
        <p class="text-heading-m">Heading / M</p>
        <p class="text-heading-s">Heading / S</p>
        <p class="text-body-m">Body / M</p>
        <p class="text-body-s">Body / S</p>
        <p class="text-label-m">Label / M</p>
        <p class="text-label-s">Label / S</p>
        <p class="text-overline">Overline</p>
        <p class="text-mono-m">Mono / M</p>
        <p class="text-mono-s">Mono / S</p>
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Cores</h2>
      <div class="preview__colors">
        <div
          v-for="color in [
            'bg',
            'panel',
            'raised',
            'border',
            'border-soft',
            'text',
            'muted',
            'orange',
            'orange-dim',
            'green',
            'blue',
            'pink',
            'red',
            'red-dim',
            'amber',
          ]"
          :key="color"
          class="preview__color"
        >
          <span class="preview__swatch" :style="{ background: `var(--color-${color})` }" />
          <span class="text-mono-s">--color-{{ color }}</span>
        </div>
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Status / Pill</h2>
      <div class="preview__row">
        <StatusPill v-for="tone in statusTones" :key="tone" :label="tone" :tone="tone" />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Row / Fight</h2>
      <div class="preview__fights">
        <FightRow :fight-number="1" robot-a="Claudio" robot-b="Gepeto" status="running">
          <button type="button">Ver luta</button>
        </FightRow>
        <FightRow :fight-number="2" robot-a="Ses" robot-b="Braz" status="waiting">
          <button type="button">Ver luta</button>
        </FightRow>
      </div>
    </section>
  </div>
</template>

<style scoped>
.preview {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-7) var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

.preview__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.preview__kicker {
  color: var(--color-muted);
}

.preview__sub {
  color: var(--color-muted);
}

.preview__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.preview__swatches {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.preview__colors {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-4);
}

.preview__color {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.preview__swatch {
  display: inline-block;
  width: var(--space-6);
  height: var(--space-6);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.preview__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.preview__fights {
  display: flex;
  flex-direction: column;
}
</style>
