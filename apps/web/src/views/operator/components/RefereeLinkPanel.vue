<script setup lang="ts">
// The link the operator shares with the match's three referees. Requesting it creates the
// match's referee token the first time; it is the same on every later visit.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import AppButton from '@/components/ui/AppButton.vue'
import { getRefereeToken } from '@/data'
import { useAuthStore } from '@/stores/auth'

const { matchId, closed } = defineProps<{ matchId: string; closed: boolean }>()
const auth = useAuthStore()
const router = useRouter()

const accessToken = ref<string | null>(null)
const failed = ref(false)
const copied = ref(false)
const copyFailed = ref(false)

const link = computed(() =>
  accessToken.value
    ? // By path, so the app's base URL is applied (the `referee-session` route)
      `${window.location.origin}${router.resolve(`/referee/${encodeURIComponent(accessToken.value)}`).href}`
    : null,
)

// The token stops working once the fight is closed: nothing to share then
watch(
  () => [matchId, closed] as const,
  async ([id, isClosed]) => {
    accessToken.value = null
    failed.value = false
    copied.value = false
    copyFailed.value = false
    if (isClosed || !auth.token) return
    try {
      const { token } = await getRefereeToken(id, auth.token)
      if (id === matchId) accessToken.value = token
    } catch (error) {
      if (id !== matchId) return
      // A fight closed meanwhile: the link is simply gone
      failed.value = !(error instanceof ApiError && error.status === 409)
    }
  },
  { immediate: true },
)

async function copy() {
  if (!link.value) return
  copied.value = false
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
  } catch {
    copyFailed.value = true
  }
}
</script>

<template>
  <section v-if="link || failed" class="referee-link" aria-labelledby="referee-link-title">
    <h2 id="referee-link-title" class="text-heading-m">Link dos árbitros</h2>
    <template v-if="link">
      <p class="referee-link__note text-body-s">
        Envie este link aos três árbitros. Cada um entra com o próprio nome.
      </p>
      <code class="referee-link__url text-mono-m">{{ link }}</code>
      <div class="referee-link__actions">
        <AppButton variant="secondary" @click="copy">Copiar link</AppButton>
        <span v-if="copied" class="text-body-s" aria-live="polite">Copiado.</span>
        <span v-if="copyFailed" class="text-body-s" role="alert">
          Não foi possível copiar. Selecione o link e copie manualmente.
        </span>
      </div>
    </template>
    <p v-else class="text-body-s" role="alert">
      Não foi possível carregar o link dos árbitros. Recarregue a página.
    </p>
  </section>
</template>

<style scoped>
.referee-link {
  display: flex;
  flex-direction: column;
  gap: var(--space-14px);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.referee-link__note {
  color: var(--color-muted);
}

.referee-link__url {
  overflow-wrap: anywhere;
  color: var(--color-text);
}

.referee-link__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
</style>
