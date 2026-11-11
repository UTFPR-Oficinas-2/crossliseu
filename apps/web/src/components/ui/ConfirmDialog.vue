<script setup lang="ts">
// Floating confirmation window. Not in Figma: built from the existing panel, text and button
// styles. Focus starts on the safe choice (cancel), Esc and a click outside also cancel.
import { nextTick, ref, useId, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'

const { open, title, message, confirmLabel, cancelLabel } = defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const titleId = useId()
const messageId = useId()
const dialog = ref<HTMLElement | null>(null)

watch(
  () => open,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    dialog.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  },
  { immediate: true },
)

// Keep Tab inside the window while it is open
function trapFocus(event: KeyboardEvent) {
  const buttons = dialog.value?.querySelectorAll<HTMLElement>('button')
  if (!buttons?.length) return
  const first = buttons[0]!
  const last = buttons[buttons.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div
    v-if="open"
    class="confirm-dialog"
    @click.self="emit('cancel')"
    @keydown.esc.stop="emit('cancel')"
    @keydown.tab="trapFocus"
  >
    <div
      ref="dialog"
      class="confirm-dialog__window"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="messageId"
    >
      <h2 :id="titleId" class="text-heading-m">{{ title }}</h2>
      <p :id="messageId" class="confirm-dialog__message text-body-m">{{ message }}</p>
      <div class="confirm-dialog__actions">
        <AppButton variant="secondary" data-autofocus @click="emit('cancel')">
          {{ cancelLabel }}
        </AppButton>
        <AppButton variant="destructive" @click="emit('confirm')">{{ confirmLabel }}</AppButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-dialog {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(0 0 0 / 0.6);
}

.confirm-dialog__window {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: min(100%, 440px);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.confirm-dialog__message {
  color: var(--color-muted);
}

.confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .confirm-dialog__actions :deep(.app-button) {
    flex: 1 1 100%;
    min-height: var(--size-control-lg);
  }
}
</style>
