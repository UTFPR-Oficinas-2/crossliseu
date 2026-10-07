<script setup lang="ts">
import { computed, useId } from 'vue'

type InputType = 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'number' | 'date'

const {
  label,
  placeholder,
  type = 'text',
  hint,
  error,
  disabled = false,
  required = false,
  name,
  autocomplete,
  hideLabel = false,
} = defineProps<{
  label: string
  placeholder?: string
  type?: InputType
  hint?: string
  error?: string
  disabled?: boolean
  required?: boolean
  name?: string
  autocomplete?: string
  /** Keeps the label for screen readers only */
  hideLabel?: boolean
}>()

const model = defineModel<string>({ default: '' })

const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`

const describedBy = computed(() => {
  if (error) return errorId
  if (hint) return hintId
  return undefined
})
</script>

<template>
  <div
    class="input-field"
    :class="{ 'input-field--error': error, 'input-field--disabled': disabled }"
  >
    <label
      class="input-field__label text-label-s"
      :class="{ 'visually-hidden': hideLabel }"
      :for="id"
    >
      {{ label }}
    </label>
    <input
      :id="id"
      v-model="model"
      class="input-field__control text-body-m"
      :type="type"
      :name="name"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :disabled="disabled"
      :required="required"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
    />
    <p v-if="error" :id="errorId" class="input-field__message input-field__error text-body-s">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="hintId" class="input-field__message text-body-s">{{ hint }}</p>
  </div>
</template>

<style scoped>
.input-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.input-field__label {
  color: var(--color-muted);
}

.input-field__control {
  width: 100%;
  min-width: 0;
  height: var(--size-field);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
  color: var(--color-text);
}

.input-field__control::placeholder {
  /* TODO design: Figma has no placeholder color; using muted */
  color: var(--color-muted);
  opacity: 1;
}

.input-field__control:focus {
  outline: none;
}

.input-field__control:focus-visible {
  /* TODO design: Figma has no focus state; using orange (primary) */
  border-color: var(--color-orange);
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
}

.input-field__message {
  color: var(--color-muted);
}

.input-field--error .input-field__control {
  /* TODO design: Figma has no error variant; using red */
  border-color: var(--color-red);
}

.input-field--error .input-field__control:focus-visible {
  outline-color: var(--color-red);
}

.input-field__error {
  color: var(--color-red);
}

.input-field--disabled .input-field__control {
  /* TODO design: Figma has no disabled variant; using panel + muted */
  background: var(--color-panel);
  color: var(--color-muted);
  cursor: not-allowed;
}
</style>
