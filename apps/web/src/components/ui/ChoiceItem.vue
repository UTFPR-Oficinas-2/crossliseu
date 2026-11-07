<script setup lang="ts">
// Figma: `Choice / Item` (node 152:584), used by OPE-01 (#37). A single-choice card: a native
// radio, so a group of them sharing `name` inside a <fieldset> behaves as a radio group. Disabled
// cards stay visible and say why in `meta`.
import { useId } from 'vue'

const {
  modelValue,
  value,
  name,
  title,
  meta,
  disabled = false,
} = defineProps<{
  modelValue: string | null
  value: string
  /** Shared by every card of one group */
  name: string
  /** "ARENA 01", "MARTE × COBALTO" */
  title: string
  meta: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// The radio is named by the title alone and described by the meta and status, so a screen reader
// doesn't read the whole card as its label
const id = useId()
const titleId = `${id}-title`
const metaId = `${id}-meta`
const statusId = `${id}-status`
</script>

<template>
  <label
    class="choice-item"
    :class="{
      'choice-item--selected': modelValue === value,
      'choice-item--disabled': disabled,
    }"
  >
    <input
      class="visually-hidden"
      type="radio"
      :name="name"
      :value="value"
      :checked="modelValue === value"
      :disabled="disabled"
      :aria-labelledby="titleId"
      :aria-describedby="`${metaId} ${statusId}`"
      @change="emit('update:modelValue', value)"
    />
    <svg
      class="choice-item__radio"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="8" stroke-width="2" />
    </svg>
    <!-- Wraps on narrow cards: the status drops under the text instead of squeezing it -->
    <span class="choice-item__body">
      <span class="choice-item__text">
        <span :id="titleId" class="choice-item__title text-heading-s">{{ title }}</span>
        <span :id="metaId" class="choice-item__meta text-body-s">{{ meta }}</span>
      </span>
      <span :id="statusId" class="choice-item__status"><slot name="status" /></span>
    </span>
  </label>
</template>

<style scoped>
.choice-item {
  display: flex;
  align-items: center;
  gap: var(--space-14px);
  width: 100%;
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
  cursor: pointer;
}

.choice-item:has(input:focus-visible) {
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
}

.choice-item--selected {
  border-color: var(--color-orange);
  background: var(--color-orange-dim);
}

.choice-item--disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.choice-item__radio {
  flex-shrink: 0;
  stroke: var(--color-muted);
}

.choice-item--selected .choice-item__radio {
  fill: var(--color-orange);
  stroke: var(--color-orange);
}

.choice-item__body {
  display: flex;
  flex: 1 1 0;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-14px);
  min-width: 0;
}

.choice-item__text {
  display: flex;
  flex: 1 1 var(--size-choice-text-min);
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.choice-item__status {
  display: flex;
  flex: 0 0 auto;
}

.choice-item__title {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: break-word;
}

.choice-item__meta {
  color: var(--color-muted);
  overflow-wrap: break-word;
}
</style>
