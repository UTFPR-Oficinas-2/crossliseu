<script setup lang="ts">
// Figma: `Score / <robot>` in ARB-02 (node 26:557). One side: the robot, the total of the three
// referees, and this referee's +1 / −1 buttons. Lado A is blue, Lado B pink, always labelled.
const { side, robot, total, plusDisabled, minusDisabled } = defineProps<{
  side: 'A' | 'B'
  robot: string
  /** Points of this side summed over the three referees */
  total: number
  plusDisabled: boolean
  minusDisabled: boolean
}>()

const emit = defineEmits<{ plus: []; minus: [] }>()
</script>

<template>
  <section class="score-card" :class="`score-card--${side.toLowerCase()}`">
    <div class="score-card__head">
      <div class="score-card__info">
        <p class="score-card__side text-overline">LADO {{ side }}</p>
        <h2 class="score-card__robot text-heading-xl">{{ robot }}</h2>
      </div>
      <div class="score-card__score">
        <p class="score-card__total text-numeric-xl">{{ total }}</p>
        <p class="score-card__caption text-mono-s">TOTAL</p>
      </div>
    </div>
    <div class="score-card__buttons">
      <button
        type="button"
        class="score-card__button score-card__plus text-heading-m"
        :disabled="plusDisabled"
        :aria-label="`Mais 1 ponto para ${robot}, lado ${side}`"
        @click="emit('plus')"
      >
        + 1 PONTO
      </button>
      <button
        type="button"
        class="score-card__button score-card__minus text-heading-m"
        :disabled="minusDisabled"
        :aria-label="`Tirar 1 ponto seu de ${robot}, lado ${side}`"
        @click="emit('minus')"
      >
        − 1
      </button>
    </div>
  </section>
</template>

<style scoped>
.score-card {
  --side-color: var(--color-blue);

  display: flex;
  flex-direction: column;
  gap: var(--space-14px);
  width: 100%;
  padding: var(--space-18px);
  border: 1px solid var(--side-color);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.score-card--b {
  --side-color: var(--color-pink);
}

.score-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.score-card__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2px);
  min-width: 0;
}

.score-card__side {
  color: var(--side-color);
}

.score-card__robot {
  overflow-wrap: anywhere;
  color: var(--color-text);
  text-transform: uppercase;
}

.score-card__score {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  align-items: center;
  padding: var(--space-2) var(--space-18px);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
}

.score-card__total {
  color: var(--side-color);
}

.score-card__caption {
  color: var(--color-muted);
}

.score-card__buttons {
  display: flex;
  gap: var(--space-3);
}

.score-card__button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--size-referee-score-button-height);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
}

.score-card__button:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}

.score-card__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.score-card__plus {
  width: var(--size-referee-plus-width);
  background: var(--color-orange);
  color: var(--color-bg);
}

.score-card__minus {
  width: var(--size-referee-minus-width);
  border-color: var(--color-border);
  background: var(--color-raised);
  color: var(--color-muted);
}
</style>
