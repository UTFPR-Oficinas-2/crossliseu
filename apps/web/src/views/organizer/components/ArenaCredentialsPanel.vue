<script setup lang="ts">
// Figma ORG-22: the arena's config.h, shown once. The text lives only in the parent's local state.
import { ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import { ARENA_CONFIG_FILENAME } from '@/utils/arena-config'

const { arenaName, config } = defineProps<{ arenaName: string; config: string }>()

defineEmits<{ done: [] }>()

const copied = ref(false)
const copyFailed = ref(false)

function download() {
  const url = URL.createObjectURL(new Blob([config], { type: 'text/x-chdr' }))
  const link = document.createElement('a')
  link.href = url
  link.download = ARENA_CONFIG_FILENAME
  link.click()
  // Safari can cancel the download if the URL is revoked right away
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function copy() {
  copied.value = false
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(config)
    copied.value = true
  } catch {
    copyFailed.value = true
  }
}
</script>

<template>
  <section class="credentials" aria-labelledby="credentials-title">
    <h2 id="credentials-title" class="credentials__title text-heading-m">
      Token da {{ arenaName }}
    </h2>
    <p class="credentials__warning text-body-s" role="status">
      Copie agora e grave no firmware da caixa. Este arquivo não aparece de novo; se perder, gere um
      novo token (a caixa antiga deixa de conectar).
    </p>
    <pre class="credentials__code text-mono-m">{{ config }}</pre>
    <div class="credentials__actions">
      <AppButton @click="download">Baixar {{ ARENA_CONFIG_FILENAME }}</AppButton>
      <AppButton variant="secondary" @click="copy">Copiar</AppButton>
      <AppButton variant="ghost" @click="$emit('done')">Pronto</AppButton>
      <span v-if="copied" class="credentials__feedback text-body-s" aria-live="polite">
        Copiado.
      </span>
      <span v-if="copyFailed" class="credentials__feedback text-body-s" role="alert">
        Não foi possível copiar. Selecione o texto e copie manualmente.
      </span>
    </div>
  </section>
</template>

<style scoped>
.credentials {
  display: flex;
  flex-direction: column;
  gap: var(--space-14px);
  padding: var(--space-6);
  border: 1px solid var(--color-orange);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.credentials__title {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.credentials__warning {
  color: var(--color-muted);
}

.credentials__code {
  margin: 0;
  padding: var(--space-4);
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-orange);
  user-select: all;
}

.credentials__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.credentials__feedback {
  color: var(--color-muted);
}
</style>
