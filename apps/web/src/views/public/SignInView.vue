<script setup lang="ts">
// Figma: `04 / Público · Entrar` (node 19:219) — `Sign in / Card` (19:227) and the page footer
// (19:250). Navigation comes from PublicLayout. The hidden "Esqueci minha senha" layer (19:247)
// is intentionally not built: there is no password reset for now.
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import InputField from '@/components/ui/InputField.vue'
import { ApiError, isApiEnabled } from '@/api/client'
import { safeRedirect } from '@/router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const errorMessage = ref<string | null>(null)
const submitting = ref(false)

// The banner describes the last attempt: editing a field starts a new one
watch([username, password], () => {
  errorMessage.value = null
})

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Usuário ou senha incorretos. Verifique e tente novamente.'
    if (error.status === 0) return 'Não foi possível conectar ao servidor. Tente novamente.'
  }
  return 'Não foi possível entrar agora. Tente novamente.'
}

async function onSubmit() {
  if (submitting.value) return
  submitting.value = true
  errorMessage.value = null
  try {
    await auth.signIn(username.value, password.value)
    await router.replace(safeRedirect(route.query.redirect))
  } catch (error) {
    errorMessage.value = messageFor(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="sign-in">
    <form class="sign-in__card" @submit.prevent="onSubmit">
      <header class="sign-in__header">
        <p class="sign-in__kicker text-overline">Área restrita</p>
        <h1 class="sign-in__title text-display-page">Entrar</h1>
        <p class="sign-in__subtitle text-body-m">
          Acesso para organizadores, operadores e árbitros autorizados.
        </p>
      </header>

      <InputField
        v-model="username"
        label="Usuário"
        name="username"
        autocomplete="username"
        required
      />
      <InputField
        v-model="password"
        label="Senha"
        type="password"
        name="password"
        autocomplete="current-password"
        required
      />

      <!-- Figma `Error` (19:242): a block of its own, not InputField's `error` prop -->
      <div v-if="errorMessage" class="sign-in__error" role="alert">
        <span class="sign-in__error-dot" aria-hidden="true" />
        <p class="sign-in__error-text text-body-s">{{ errorMessage }}</p>
      </div>

      <AppButton
        type="submit"
        class="sign-in__submit"
        :disabled="submitting"
        :aria-busy="submitting"
      >
        Entrar
      </AppButton>

      <hr class="sign-in__divider" />
      <p class="sign-in__note text-body-s">
        Não há cadastro público. Para receber acesso, fale com o organizador do campeonato.
      </p>
    </form>

    <footer class="sign-in__footer text-mono-s">
      <p>CROSSLISEU · UTFPR</p>
      <p v-if="!isApiEnabled">Conceito visual · dados demonstrativos</p>
    </footer>
  </div>
</template>

<style scoped>
.sign-in {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: var(--space-9);
}

.sign-in__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  width: 100%;
  max-width: var(--size-form-card);
  padding: var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.sign-in__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-10px);
}

.sign-in__kicker {
  color: var(--color-orange);
}

.sign-in__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.sign-in__subtitle {
  color: var(--color-muted);
}

.sign-in__error {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
}

.sign-in__error-dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--color-red);
}

.sign-in__error-text {
  min-width: 0;
  color: var(--color-red);
}

.sign-in__submit {
  width: 100%;
  min-height: var(--size-control-lg);
}

.sign-in__divider {
  width: 100%;
  height: 0;
  margin: 0;
  border: 0;
  border-top: 1px solid var(--color-border-soft);
}

.sign-in__note {
  color: var(--color-muted);
  text-align: center;
}

.sign-in__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  /* Pinned to the bottom of the page, like the Figma frame */
  margin-top: auto;
  align-self: stretch;
  padding-top: var(--space-2);
  color: var(--color-muted);
}
</style>
