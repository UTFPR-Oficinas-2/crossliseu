<script setup lang="ts">
// The referee's join form. Figma has no frame for it (the design assumed one link per referee):
// it follows the ARB-01 layout (node 26:507). With one shared link per match, the name tells the
// referees apart; the same name gets the same seat back.
import { ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import InputField from '@/components/ui/InputField.vue'

const { initialName = '', error, busy = false } = defineProps<{
  initialName?: string
  error?: string
  busy?: boolean
}>()

const emit = defineEmits<{ submit: [name: string] }>()

const name = ref(initialName)
</script>

<template>
  <form class="name-form" novalidate @submit.prevent="emit('submit', name)">
    <h1 class="name-form__title text-display-page">Entrar na luta</h1>
    <p class="name-form__text text-body-m">
      Digite seu nome para arbitrar esta luta. Se o celular recarregar, use o mesmo nome para
      voltar ao seu lugar.
    </p>
    <InputField
      v-model="name"
      label="Seu nome"
      name="referee-name"
      autocomplete="name"
      hint="Até 40 caracteres."
      :error="error"
      :disabled="busy"
    />
    <AppButton type="submit" class="name-form__submit" :disabled="busy">Entrar</AppButton>
  </form>
</template>

<style scoped>
.name-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.name-form__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.name-form__text {
  color: var(--color-muted);
}

/* Full-width touch target, at least 48 px on the phone */
.name-form__submit {
  width: 100%;
  min-height: var(--size-control-lg);
}
</style>
