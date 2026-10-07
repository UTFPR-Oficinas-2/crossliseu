<script setup lang="ts">
// Figma: `Select / Menu` (126:663) and `Select / Option` (126:666), used by frame 10b. A
// select-only combobox (WAI-ARIA APG): focus stays on the trigger, which points at the active
// option with aria-activedescendant. No hover styles: the active option gets an inset ring for
// keyboard users, and the selected one gets the orange-dim background and a check.
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { firstEnabled, stepEnabled, type SelectOption } from './select-field'

const {
  label,
  options,
  groupLabel,
  placeholder = 'Selecione',
  hint,
  error,
  disabled = false,
  required = false,
} = defineProps<{
  label: string
  options: readonly SelectOption[]
  /** Overline above the options, e.g. "Participantes · Peso leve" */
  groupLabel?: string
  placeholder?: string
  hint?: string
  error?: string
  disabled?: boolean
  required?: boolean
}>()

const model = defineModel<string>({ default: '' })

const id = useId()
const labelId = `${id}-label`
const listboxId = `${id}-listbox`
const groupId = `${id}-group`
const hintId = `${id}-hint`
const errorId = `${id}-error`
const optionId = (index: number) => `${id}-option-${index}`

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)

const selectedIndex = computed(() => options.findIndex((option) => option.value === model.value))
const selected = computed(() => options[selectedIndex.value])
const describedBy = computed(() => (error ? errorId : hint ? hintId : undefined))
const listboxLabelledBy = computed(() => (groupLabel ? `${labelId} ${groupId}` : labelId))
const metaOf = (option: SelectOption) =>
  option.disabled ? (option.disabledReason ?? option.meta) : option.meta

function openMenu() {
  if (disabled) return
  open.value = true
  const current = selectedIndex.value
  activeIndex.value = current >= 0 && !options[current]!.disabled ? current : firstEnabled(options)
}

function close() {
  open.value = false
  activeIndex.value = -1
}

function choose(index: number) {
  const option = options[index]
  if (!option || option.disabled) return
  model.value = option.value
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (disabled) return
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openMenu()
    }
    return
  }
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      activeIndex.value = stepEnabled(options, activeIndex.value, 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      activeIndex.value = stepEnabled(options, activeIndex.value, -1)
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = firstEnabled(options)
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = firstEnabled(options, true)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      choose(activeIndex.value)
      break
    case 'Escape':
      event.preventDefault()
      close()
      break
    case 'Tab':
      close()
      break
  }
}

// The menu stops growing at --size-menu-max and scrolls, so the active option (also the selected
// one when the menu opens) can sit below the fold. Wait for the DOM update first: while the menu
// is still display: none there is nothing to scroll. jsdom has no scrollIntoView, hence `?.()`.
watch(activeIndex, async (index) => {
  if (index < 0) return
  await nextTick()
  document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' })
})

// Pressing anywhere outside the field closes the menu
function onDocumentPointerDown(event: Event) {
  if (!root.value?.contains(event.target as Node)) close()
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocumentPointerDown)
  else document.removeEventListener('pointerdown', onDocumentPointerDown)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) close()
}
</script>

<template>
  <div
    ref="root"
    class="select-field"
    :class="{
      'select-field--open': open,
      'select-field--error': error,
      'select-field--disabled': disabled,
    }"
    @focusout="onFocusOut"
  >
    <span :id="labelId" class="select-field__label text-label-s" @click="trigger?.focus()">
      {{ label }}
    </span>
    <div class="select-field__control">
      <div
        ref="trigger"
        class="select-field__trigger text-body-m"
        role="combobox"
        :tabindex="disabled ? -1 : 0"
        aria-haspopup="listbox"
        :aria-labelledby="labelId"
        :aria-controls="listboxId"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
        :aria-required="required ? 'true' : undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-describedby="describedBy"
        @click="open ? close() : openMenu()"
        @keydown="onKeydown"
      >
        <span
          class="select-field__value"
          :class="{ 'select-field__value--placeholder': !selected }"
        >
          {{ selected?.label ?? placeholder }}
        </span>
        <svg
          class="select-field__icon select-field__chevron"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>

      <!-- Any press inside the menu (rows, group label, padding, scrollbar) keeps focus on the trigger -->
      <div v-show="open" class="select-field__menu" @mousedown.prevent>
        <p v-if="groupLabel" :id="groupId" class="select-field__group text-overline">
          {{ groupLabel }}
        </p>
        <ul
          :id="listboxId"
          class="select-field__list"
          role="listbox"
          :aria-labelledby="listboxLabelledBy"
        >
          <li
            v-for="(option, index) in options"
            :id="optionId(index)"
            :key="option.value"
            class="select-field__option"
            :class="{ 'select-field__option--active': index === activeIndex }"
            role="option"
            :aria-selected="option.value === model ? 'true' : 'false'"
            :aria-disabled="option.disabled ? 'true' : undefined"
            @click="choose(index)"
          >
            <span class="select-field__option-label text-heading-s">{{ option.label }}</span>
            <span v-if="metaOf(option)" class="select-field__option-meta text-body-s">
              {{ metaOf(option) }}
            </span>
            <svg
              v-if="option.value === model"
              class="select-field__icon select-field__check"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="M13.3333 4L6 11.3333L2.66667 8"
                fill="none"
                stroke="currentColor"
                stroke-width="1.66667"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </li>
        </ul>
      </div>
    </div>
    <p v-if="error" :id="errorId" class="select-field__message select-field__error text-body-s">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="hintId" class="select-field__message text-body-s">{{ hint }}</p>
  </div>
</template>

<style scoped>
.select-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
}

.select-field__label {
  color: var(--color-muted);
}

.select-field__control {
  position: relative;
}

.select-field__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: var(--size-field);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
  color: var(--color-text);
  cursor: pointer;
}

.select-field__trigger:focus {
  outline: none;
}

.select-field__trigger:focus-visible {
  /* TODO design: Figma has no focus state; using orange (primary), like InputField */
  border-color: var(--color-orange);
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
}

.select-field--open .select-field__trigger {
  border-color: var(--color-orange);
}

.select-field__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-field__value--placeholder {
  color: var(--color-muted);
}

.select-field__icon {
  flex-shrink: 0;
  width: var(--space-4);
  height: var(--space-4);
}

.select-field__chevron {
  /* TODO design: Figma has no trigger or chevron; muted, like the input placeholder */
  color: var(--color-muted);
}

.select-field--open .select-field__chevron {
  transform: rotate(180deg);
}

/* Figma shows the menu in flow; it floats here so opening it doesn't push the form around.
   TODO design: Figma gives the menu a drop shadow (0 8px 24px, black at 35%) and a 2px gap
   between rows; neither has a token, so both are left out */
.select-field__menu {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  z-index: var(--z-menu);
  max-height: var(--size-menu-max);
  margin-top: var(--space-2);
  padding: var(--space-6px);
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
}

.select-field__group {
  padding: var(--space-2) var(--space-3) var(--space-6px);
  color: var(--color-muted);
}

.select-field__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.select-field__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--size-control);
  padding: var(--space-10px) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  cursor: pointer;
}

.select-field__option-label {
  flex: 1 1 auto;
  min-width: 0;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.select-field__option-meta {
  flex-shrink: 0;
  color: var(--color-muted);
  text-align: right;
}

/* Keyboard position (not in Figma): inset ring, so it never changes the row size */
.select-field__option--active {
  outline: var(--focus-ring-width) solid var(--color-text);
  outline-offset: calc(-1 * var(--focus-ring-width));
}

.select-field__option[aria-selected='true'] {
  background: var(--color-orange-dim);
}

.select-field__check {
  color: var(--color-orange);
}

/* TODO design: Figma dims a disabled option to 40%; the shared disabled opacity token is 50% */
.select-field__option[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: var(--opacity-disabled);
}

.select-field__message {
  color: var(--color-muted);
}

.select-field--error .select-field__trigger {
  /* TODO design: Figma has no error variant; using red, like InputField */
  border-color: var(--color-red);
}

.select-field--error .select-field__trigger:focus-visible {
  outline-color: var(--color-red);
}

.select-field__error {
  color: var(--color-red);
}

.select-field--disabled .select-field__trigger {
  /* TODO design: Figma has no disabled variant; using panel + muted, like InputField */
  background: var(--color-panel);
  color: var(--color-muted);
  cursor: not-allowed;
}
</style>
